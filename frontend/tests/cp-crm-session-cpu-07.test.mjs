import test from "node:test";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { analyzeDashboardHar } from "../../scripts/cp07/analyze-dashboard-har.mjs";
import {
  isValidSecretApiKey,
  readSecretFromTerminal,
} from "../../scripts/cp07/run-metrics-capture.mjs";

function createHarEntry({
  url,
  status = 200,
  statusText = "OK",
  headers = [],
  responseText = "",
  mimeType = "application/json",
  error,
}) {
  return {
    startedDateTime: "2026-11-24T03:10:00.000Z",
    time: 125.5,
    request: {
      method: "GET",
      url,
      headers: [
        { name: "Authorization", value: "Bearer request-secret" },
        { name: "Cookie", value: "session=request-cookie" },
      ],
      cookies: [{ name: "session", value: "private-cookie" }],
    },
    response: {
      status,
      statusText,
      headers,
      cookies: [{ name: "session", value: "response-cookie" }],
      content: {
        mimeType,
        size: responseText.length,
        text: responseText,
      },
    },
    _error: error,
  };
}

test("extracts report status and allowlisted trace IDs from a Supabase HAR", () => {
  const har = {
    log: {
      entries: [
        createHarEntry({
          url: "https://api.supabase.com/platform/projects/abcdefghijklmnopqrst/observability/reports?token=query-secret",
          status: 503,
          statusText: "Service Unavailable",
          headers: [
            { name: "x-request-id", value: "request-trace-123" },
            { name: "set-cookie", value: "secret=response-cookie" },
          ],
          responseText: JSON.stringify({
            code: "REPORTS_UNAVAILABLE",
            message: "private response message",
          }),
        }),
      ],
    },
  };

  const result = analyzeDashboardHar(har);
  assert.equal(result.capturedEntries, 1);
  assert.equal(result.supabaseRequests, 1);
  assert.equal(result.reportRequestsFound, 1);
  assert.equal(result.failedSupabaseRequests, 1);
  assert.equal(result.reportRequests[0].status, 503);
  assert.equal(result.reportRequests[0].errorCode, "REPORTS_UNAVAILABLE");
  assert.equal(
    result.reportRequests[0].traceHeaders["x-request-id"],
    "request-trace-123",
  );
  assert.equal(
    result.reportRequests[0].path.includes("abcdefghijklmnopqrst"),
    false,
  );
});

test("does not retain cookies, authorization, query strings, or response bodies", () => {
  const har = {
    log: {
      entries: [
        createHarEntry({
          url: "https://api.supabase.com/platform/projects/abcdefghijklmnopqrst/reports?access_token=query-secret",
          status: 500,
          headers: [{ name: "x-request-id", value: "trace-456" }],
          responseText: JSON.stringify({
            code: "SAFE_CODE",
            message: "private response body must not be copied",
          }),
        }),
      ],
    },
  };

  const serialized = JSON.stringify(analyzeDashboardHar(har));
  for (const privateValue of [
    "request-secret",
    "request-cookie",
    "private-cookie",
    "response-cookie",
    "query-secret",
    "private response body",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(serialized.includes("SAFE_CODE"), true);
});

test("ignores non-Supabase hosts and unrelated successful requests", () => {
  const har = {
    log: {
      entries: [
        createHarEntry({
          url: "https://example.com/observability/reports",
          status: 200,
        }),
        createHarEntry({
          url: "https://evil.supabase.com.example.org/reports",
          status: 200,
        }),
        createHarEntry({
          url: "https://project.supabase.co/rest/v1/rpc/wm_list_boards",
          status: 200,
        }),
      ],
    },
  };

  const result = analyzeDashboardHar(har);
  assert.equal(result.supabaseRequests, 0);
  assert.equal(result.reportRequestsFound, 0);
});

test("redacts project references in Supabase project API hostnames", () => {
  const har = {
    log: {
      entries: [
        createHarEntry({
          url: "https://jtlusodorfnyzgyuewkz.supabase.co/rest/v1/rpc/metrics",
          status: 503,
        }),
      ],
    },
  };

  const result = analyzeDashboardHar(har);
  assert.equal(result.reportRequestsFound, 1);
  assert.equal(result.reportRequests[0].host, "[project].supabase.co");
  assert.equal(JSON.stringify(result).includes("jtlusodorfnyzgyuewkz"), false);
});

test("retains failed Supabase requests even when the path is not report-related", () => {
  const har = {
    log: {
      entries: [
        createHarEntry({
          url: "https://api.supabase.com/platform/profile",
          status: 401,
          statusText: "Unauthorized",
          error: "network error with private details",
        }),
      ],
    },
  };

  const result = analyzeDashboardHar(har);
  assert.equal(result.supabaseRequests, 1);
  assert.equal(result.reportRequestsFound, 0);
  assert.equal(result.failedSupabaseRequests, 1);
  assert.equal(result.failedRequests[0].transportError, true);
  assert.equal(JSON.stringify(result).includes("private details"), false);
});

test("rejects an invalid HAR structure", () => {
  assert.throws(() => analyzeDashboardHar({ log: {} }), /log.entries/);
});

function createTerminalInput() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.rawMode = false;
  input.paused = false;
  input.setRawMode = (enabled) => {
    input.rawMode = enabled;
  };
  input.resume = () => {
    input.paused = false;
  };
  input.pause = () => {
    input.paused = true;
  };
  return input;
}

test("reads the existing API key without echoing it and restores terminal mode", async () => {
  const input = createTerminalInput();
  let outputText = "";
  const output = {
    write: (value) => {
      outputText += value;
    },
  };
  const result = readSecretFromTerminal({ input, output });
  input.emit("data", Buffer.from("sb_secret_test123\r"));

  const secret = await result;
  assert.equal(secret, "sb_secret_test123");
  assert.equal(outputText.includes(secret), false);
  assert.equal(input.rawMode, false);
  assert.equal(input.paused, true);
});

test("supports backspace without echoing secret characters", async () => {
  const input = createTerminalInput();
  let outputText = "";
  const output = {
    write: (value) => {
      outputText += value;
    },
  };
  const result = readSecretFromTerminal({ input, output });
  input.emit("data", Buffer.from("sb_secret_wrong\u007f123\r"));

  const secret = await result;
  assert.equal(secret, "sb_secret_wron123");
  assert.equal(outputText.includes("sb_secret"), false);
  assert.equal(input.rawMode, false);
});

test("restores terminal mode when the user cancels the secret prompt", async () => {
  const input = createTerminalInput();
  const output = { write: () => {} };
  const result = readSecretFromTerminal({ input, output });
  input.emit("data", Buffer.from("\u0003"));

  await assert.rejects(result, /Cancelled/);
  assert.equal(input.rawMode, false);
  assert.equal(input.paused, true);
});

test("accepts only the existing Supabase Secret API key format", () => {
  assert.equal(isValidSecretApiKey("sb_secret_existingKey_123"), true);
  assert.equal(isValidSecretApiKey(""), false);
  assert.equal(isValidSecretApiKey("service_role"), false);
  assert.equal(isValidSecretApiKey("sb_secret_"), false);
});

test("an empty terminal entry fails key validation before capture", async () => {
  class FakeInput extends EventEmitter {
    isTTY = true;
    setRawMode() {}
    resume() {}
    pause() {}
  }

  const input = new FakeInput();
  const pendingSecret = readSecretFromTerminal({
    input,
    output: { write() {} },
  });
  input.emit("data", Buffer.from("\n"));

  const secret = await pendingSecret;
  assert.equal(secret, "");
  assert.equal(isValidSecretApiKey(secret), false);
});

test("rejects secret input when the process is not attached to a terminal", () => {
  assert.throws(
    () =>
      readSecretFromTerminal({
        input: { isTTY: false },
        output: { write() {} },
      }),
    /interactive Terminal window/,
  );
});
