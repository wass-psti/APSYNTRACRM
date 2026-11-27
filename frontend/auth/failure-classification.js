const INVALID_SESSION_CODES = new Set([
  "auth_session_invalid", "bad_jwt", "invalid_jwt", "invalid_token",
  "jwt_expired", "session_expired", "session_missing", "session_not_found",
  "user_banned", "user_not_found",
]);
const INVALID_REFRESH_CODES = new Set([
  "bad_jwt", "invalid_grant", "invalid_jwt", "invalid_refresh_token",
  "invalid_token", "refresh_token_already_used", "refresh_token_expired",
  "refresh_token_not_found", "session_expired", "session_missing",
  "session_not_found",
]);
const STORAGE_ERROR_NAMES = new Set([
  "InvalidStateError", "QuotaExceededError", "SecurityError", "StorageError",
]);
function normalizedCode(error) {
  const value = error?.code ?? error?.error_code ?? error?.errorCode ?? "";
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function errorName(error) {
  return String(error?.providerErrorName || error?.name || "");
}
function isStorageFailure(error) {
  const cause = error?.cause || error?.originalError;
  return normalizedCode(error) === "auth_storage_unavailable" ||
    STORAGE_ERROR_NAMES.has(errorName(error)) ||
    STORAGE_ERROR_NAMES.has(errorName(cause));
}
function isInvalidRefreshMessage(message) {
  return message.includes("refresh token not found") ||
    message.includes("refresh token is invalid") ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token already used") ||
    message.includes("invalid grant") || message.includes("session expired");
}
/** Classify an Auth failure using its provider response and operation. */
export function classifyAuthFailure(error, { operation = "request" } = {}) {
  const statusValue = Number(error?.status);
  const status = Number.isInteger(statusValue) ? statusValue : 0;
  const code = normalizedCode(error);
  const name = errorName(error);
  const message = String(error?.message || "").toLowerCase();
  const retryAfterValue = Number(error?.retryAfterMs);
  const retryAfterMs = Number.isFinite(retryAfterValue) && retryAfterValue >= 0
    ? Math.min(300000, retryAfterValue) : null;
  const result = (category, resultCode, options = {}) => ({
    category, code: resultCode, status,
    recoverable: options.recoverable === true,
    preserveSession: options.preserveSession !== false,
    invalidateSession: options.invalidateSession === true,
    retryable: options.retryable === true,
    action: options.action || "SURFACE",
    retryAfterMs,
  });
  if (code === "request_aborted" || code === "request_cancelled" || name === "AbortError")
    return result("REQUEST_CANCELLED", "REQUEST_ABORTED", { action: "NONE" });
  if (code === "session_changed" || name === "AuthRefreshDiscardedError")
    return result("SESSION_CHANGED", "SESSION_CHANGED", {
      recoverable: true, preserveSession: true, action: "RECONCILE",
    });
  if (isStorageFailure(error))
    return result("AUTH_STORAGE_UNAVAILABLE", "AUTH_STORAGE_UNAVAILABLE", {
      recoverable: true, preserveSession: true, action: "RETRY",
    });
  if (code === "auth_response_invalid" || code === "invalid_json_response" ||
      name === "AuthInvalidTokenResponseError")
    return result("AUTH_RESPONSE_INVALID", "AUTH_RESPONSE_INVALID", {
      recoverable: true, preserveSession: true, action: "RETRY",
    });
  if (code === "network_unavailable" || name === "AuthRetryableFetchError" ||
      (name === "TypeError" && (message.includes("failed to fetch") ||
       message.includes("networkerror") || message.includes("load failed") ||
       message.includes("network request failed"))))
    return result("NETWORK_UNAVAILABLE", "NETWORK_UNAVAILABLE", {
      recoverable: true, preserveSession: true, retryable: true, action: "RETRY",
    });
  if (code === "request_timeout" || code === "auth_request_timeout" ||
      name === "TimeoutError" || status === 408)
    return result("AUTH_REQUEST_TIMEOUT", "REQUEST_TIMEOUT", {
      recoverable: true, preserveSession: true, retryable: true, action: "RETRY",
    });
  if (status === 429)
    return result("AUTH_RATE_LIMITED", "AUTH_RATE_LIMITED", {
      recoverable: true, preserveSession: true, retryable: true, action: "RETRY_AFTER",
    });
  if (operation === "workspace-context" &&
      (status === 401 || status === 403 || code === "42501"))
    return result("WORKSPACE_CONTEXT_UNAVAILABLE", "WORKSPACE_CONTEXT_UNAVAILABLE", {
      recoverable: true, preserveSession: true, action: "RETRY_WORKSPACE",
    });
  if (operation === "sign-in" &&
      (status === 400 || status === 401 || status === 403 || code === "invalid_credentials"))
    return result("AUTH_CREDENTIALS_REJECTED", "INVALID_CREDENTIALS", {
      preserveSession: true, action: "CHECK_CREDENTIALS",
    });
  const invalidRefreshMessage = isInvalidRefreshMessage(message);
  const invalidSessionCode = INVALID_SESSION_CODES.has(code);
  const invalidRefreshCode = INVALID_REFRESH_CODES.has(code);
  const missingProviderSession = name === "AuthSessionMissingError";
  if (code === "auth_session_invalid" || code === "refresh_token_invalid" ||
      (operation === "identity" && (invalidSessionCode || status === 401 || status === 403)))
    return result("AUTH_SESSION_INVALID", "AUTH_SESSION_INVALID", {
      invalidateSession: true, preserveSession: false, action: "SIGN_IN",
    });
  if (operation === "refresh" &&
      (invalidRefreshCode || missingProviderSession || status === 401 || status === 403 ||
       (status === 400 && invalidRefreshMessage)))
    return result("REFRESH_TOKEN_INVALID", "REFRESH_TOKEN_INVALID", {
      invalidateSession: true, preserveSession: false, action: "SIGN_IN",
    });
  if (operation === "session-read" &&
      (invalidRefreshCode || invalidSessionCode || missingProviderSession ||
       status === 401 || status === 403 || (status === 400 && invalidRefreshMessage)))
    return result("REFRESH_TOKEN_INVALID", "REFRESH_TOKEN_INVALID", {
      invalidateSession: true, preserveSession: false, action: "SIGN_IN",
    });
  if (operation === "legacy-import" &&
      (invalidRefreshCode || invalidSessionCode || status === 401 || status === 403 ||
       (status === 400 && invalidRefreshMessage)))
    return result("REFRESH_TOKEN_INVALID", "REFRESH_TOKEN_INVALID", {
      invalidateSession: true, preserveSession: false, action: "SIGN_IN",
    });
  if (status >= 500 && status <= 599)
    return result("AUTH_SERVICE_UNAVAILABLE", "AUTH_SERVICE_UNAVAILABLE", {
      recoverable: true, preserveSession: true, retryable: true, action: "RETRY",
    });
  return result("AUTH_PROVIDER_ERROR", "AUTH_PROVIDER_ERROR", {
    preserveSession: true, action: "SURFACE",
  });
}
