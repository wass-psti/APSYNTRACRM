import test from "node:test";
import assert from "node:assert/strict";
import { AuthClient } from "../session.js";
import { DomainApi } from "../data.js";

const userId = "11111111-1111-4111-8111-111111111111";
const boardId = "33333333-3333-4333-8333-333333333333";
const response = (status = 200, value = { ok: true }) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function fixture(fetchImpl, options = {}) {
  const values = new Map();
  const auth = new AuthClient({
    fetchImpl,
    ...options,
    storage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  auth.save({
    access_token: "signed-access",
    refresh_token: "signed-refresh",
    expires_in: 3600,
    user: { id: userId },
  });
  return auth;
}

test("only allowlisted read-only REST RPC POSTs reuse browser CORS preflight cache", async () => {
  const calls = [];
  const auth = fixture(async (url, options) => {
    calls.push({ url, options });
    return response(200, true);
  });
  const api = new DomainApi(auth);
  await api.rpc("work_board_access", {
    p_board_id: boardId,
    p_required: "view",
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/work_board_access$/);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.cache, "default");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_board_id: boardId,
    p_required: "view",
  });
});

test("authenticated GETs and mutating or non-RPC POSTs remain no-store", async () => {
  const calls = [];
  const auth = fixture(async (url, options) => {
    calls.push({ url, options });
    return response();
  });
  await auth.call("/auth/v1/user", {
    accessToken: "signed-access",
    requestKind: "read",
  });
  await auth.authorized("/rest/v1/rpc/wm_update_board_item", {
    method: "POST",
    body: { p_item_id: boardId },
    requestKind: "mutation",
  });
  await auth.call("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: "signed-refresh" },
  });
  await auth.call("/functions/v1/apsyntra-native-issues", {
    method: "POST",
    body: {},
    requestKind: "read",
  });
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.options.cache === "no-store"));
});

test("startup read recovery remains bounded and preserves a valid session after transient verification failure", async () => {
  const { startupVerifiedRead } = await import("../startup-recovery-policy.js");
  const calls = [];
  const auth = fixture(async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1)
      throw new TypeError("transient network interruption");
    return response(200, { id: userId, email: "verified@example.invalid" });
  });
  const restored = await startupVerifiedRead(() => auth.restore(), {
    wait: async () => {},
  });
  assert.equal(restored, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url.endsWith("/auth/v1/user")));
  assert.ok(calls.every((call) => call.options.cache === "no-store"));
  assert.equal(auth.isSignedIn, true);
  assert.equal(auth.userId, userId);
});

test("workspace startup read retries a transient failure without repeating CORS preflight work", async () => {
  const calls = [];
  const auth = fixture(
    async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1)
        throw new TypeError("transient network interruption");
      return response(200, {
        user_id: userId,
        workspace_id: "22222222-2222-4222-8222-222222222222",
        profile: { status: "active" },
      });
    },
    { wait: async () => {} },
  );
  const api = new DomainApi(auth);
  const context = await api.context();
  assert.equal(context.user_id, userId);
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every((call) =>
      call.url.endsWith("/rest/v1/rpc/wm_auth_access_context"),
    ),
  );
  assert.ok(
    calls.every(
      (call) =>
        call.options.method === "POST" && call.options.cache === "default",
    ),
  );
});
