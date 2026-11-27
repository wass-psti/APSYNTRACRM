import test from "node:test";
import assert from "node:assert/strict";
import { classifyAuthFailure } from "../auth/failure-classification.js";
const failure = (status, code, name, message = "Synthetic Auth failure") =>
  Object.assign(new Error(message), { status, code, name });

test("identity verification rejects definitive invalid or forbidden Auth identities", () => {
  for (const error of [failure(401, "", "ApiError"), failure(403, "", "ApiError"),
    failure(400, "invalid_jwt", "AuthApiError"),
    failure(400, "session_not_found", "AuthApiError")]) {
    const result = classifyAuthFailure(error, { operation: "identity" });
    assert.equal(result.category, "AUTH_SESSION_INVALID");
    assert.equal(result.invalidateSession, true);
    assert.equal(result.preserveSession, false);
  }
});

test("refresh classification requires a definitive token failure, not every HTTP 400", () => {
  for (const code of ["invalid_grant", "refresh_token_not_found",
    "refresh_token_already_used", "session_expired"]) {
    const result = classifyAuthFailure(failure(400, code, "AuthApiError"),
      { operation: "refresh" });
    assert.equal(result.category, "REFRESH_TOKEN_INVALID");
    assert.equal(result.invalidateSession, true);
  }
  const malformed = classifyAuthFailure(
    failure(400, "", "AuthApiError", "Malformed request"), { operation: "refresh" });
  assert.equal(malformed.category, "AUTH_PROVIDER_ERROR");
  assert.equal(malformed.invalidateSession, false);
});

test("Supabase provider error classes retain their distinct meanings", () => {
  const network = classifyAuthFailure(failure(0, "", "AuthRetryableFetchError"),
    { operation: "session-read" });
  assert.equal(network.category, "NETWORK_UNAVAILABLE");
  assert.equal(network.retryable, true);
  assert.equal(network.preserveSession, true);
  const missing = classifyAuthFailure(failure(400, "", "AuthSessionMissingError"),
    { operation: "session-read" });
  assert.equal(missing.category, "REFRESH_TOKEN_INVALID");
  assert.equal(missing.invalidateSession, true);
  const invalidResponse = classifyAuthFailure(failure(500, "", "AuthInvalidTokenResponseError"),
    { operation: "session-read" });
  assert.equal(invalidResponse.category, "AUTH_RESPONSE_INVALID");
  assert.equal(invalidResponse.invalidateSession, false);
  const discarded = classifyAuthFailure(failure(409, "", "AuthRefreshDiscardedError"),
    { operation: "refresh" });
  assert.equal(discarded.category, "SESSION_CHANGED");
  assert.equal(discarded.invalidateSession, false);
});

test("transport, rate-limit, timeout and service failures preserve usable sessions", () => {
  const cases = [
    [failure(0, "NETWORK_UNAVAILABLE", "ApiError"), "NETWORK_UNAVAILABLE"],
    [failure(408, "", "ApiError"), "AUTH_REQUEST_TIMEOUT"],
    [failure(429, "", "ApiError"), "AUTH_RATE_LIMITED"],
    [failure(503, "", "ApiError"), "AUTH_SERVICE_UNAVAILABLE"],
  ];
  for (const [error, category] of cases) {
    const result = classifyAuthFailure(error, { operation: "session-read" });
    assert.equal(result.category, category);
    assert.equal(result.preserveSession, true);
    assert.equal(result.invalidateSession, false);
    assert.equal(result.retryable, true);
  }
});

test("browser storage and malformed responses do not falsely expire a session", () => {
  const storage = classifyAuthFailure(failure(0, "", "SecurityError"),
    { operation: "session-read" });
  assert.equal(storage.category, "AUTH_STORAGE_UNAVAILABLE");
  assert.equal(storage.preserveSession, true);
  assert.equal(storage.invalidateSession, false);
  const malformed = classifyAuthFailure(failure(200, "INVALID_JSON_RESPONSE", "ApiError"),
    { operation: "identity" });
  assert.equal(malformed.category, "AUTH_RESPONSE_INVALID");
  assert.equal(malformed.invalidateSession, false);
});

test("workspace-context failures preserve Auth without changing access decisions", () => {
  for (const error of [failure(401, "", "ApiError"), failure(403, "", "ApiError"),
    failure(0, "42501", "ApiError")]) {
    const result = classifyAuthFailure(error, { operation: "workspace-context" });
    assert.equal(result.category, "WORKSPACE_CONTEXT_UNAVAILABLE");
    assert.equal(result.preserveSession, true);
    assert.equal(result.invalidateSession, false);
  }
  const unavailable = classifyAuthFailure(failure(503, "", "ApiError"),
    { operation: "workspace-context" });
  assert.equal(unavailable.category, "AUTH_SERVICE_UNAVAILABLE");
});

test("sign-in credential rejection and cancellation do not invalidate an existing session", () => {
  const credentials = classifyAuthFailure(failure(400, "invalid_credentials", "AuthApiError"),
    { operation: "sign-in" });
  assert.equal(credentials.category, "AUTH_CREDENTIALS_REJECTED");
  assert.equal(credentials.invalidateSession, false);
  const cancelled = classifyAuthFailure(failure(0, "REQUEST_ABORTED", "ApiError"),
    { operation: "session-read" });
  assert.equal(cancelled.category, "REQUEST_CANCELLED");
  assert.equal(cancelled.retryable, false);
});

test("unknown provider failures remain non-destructive and expose no response body", () => {
  const result = classifyAuthFailure(
    failure(400, "unknown_provider_code", "AuthApiError", "Bearer private-token"),
    { operation: "refresh" });
  assert.equal(result.category, "AUTH_PROVIDER_ERROR");
  assert.equal(result.preserveSession, true);
  assert.equal(result.invalidateSession, false);
  assert.equal(JSON.stringify(result).includes("private-token"), false);
});
