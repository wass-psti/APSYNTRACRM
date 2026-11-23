import test from "node:test";
import assert from "node:assert/strict";
import { GoTrueClient } from "../vendor/supabase-auth.js";
import { AuthClient } from "../session.js";

const userId = "11111111-1111-4111-8111-111111111111";
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
};
const user = (id) => ({
  id,
  email: "continuity@example.invalid",
  app_metadata: {},
  user_metadata: {},
});
const session = (
  id = userId,
  access = "access-one",
  refresh = "refresh-one",
) => ({
  access_token: access,
  refresh_token: refresh,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: user(id),
});
const jwtFor = (id) => {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "authenticated",
    }),
  ).toString("base64url");
  return (
    header +
    "." +
    payload +
    "." +
    Buffer.from("signature").toString("base64url")
  );
};
const response = (status, body) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function createAuth({
  store = storage(),
  fetchImpl,
  legacyStorage = null,
} = {}) {
  const provider = new GoTrueClient({
    url: "https://example.invalid/auth/v1",
    headers: { apikey: "test-publishable-key" },
    storageKey: "apsyntra.crm.auth.test.v1",
    storage: store,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: fetchImpl,
  });
  return {
    auth: new AuthClient({ provider, storage: store, legacyStorage }),
    store,
    provider,
  };
}

test("provider-backed sign-in persists a Supabase session and a new client restores it", async () => {
  const store = storage();
  let userReads = 0;
  const fetchImpl = async (url, init) => {
    if (url.includes("/token?grant_type=password"))
      return response(200, session());
    if (url.endsWith("/user")) {
      userReads++;
      return response(200, user(userId));
    }
    throw Error("Unexpected auth request: " + url + " " + init.method);
  };
  const first = createAuth({ store, fetchImpl });
  const signedIn = await first.auth.signIn(
    "continuity@example.invalid",
    "synthetic-password",
  );
  assert.equal(signedIn.id, userId);
  assert.equal(first.auth.userId, userId);
  assert.ok(store.getItem("apsyntra.crm.auth.test.v1"));
  const second = createAuth({ store, fetchImpl });
  assert.equal(await second.auth.restore(), true);
  assert.equal(second.auth.userId, userId);
  assert.equal(userReads, 1);
  await first.auth.provider.signOut({ scope: "local" });
  await second.auth.provider.signOut({ scope: "local" });
});

test("provider refresh rotates tokens without changing the authenticated identity", async () => {
  const store = storage();
  let refreshCalls = 0;
  const fetchImpl = async (url) => {
    if (url.includes("/token?grant_type=refresh_token")) {
      refreshCalls++;
      return response(200, session(userId, "access-two", "refresh-two"));
    }
    if (url.endsWith("/user")) return response(200, user(userId));
    throw Error("Unexpected auth request: " + url);
  };
  const { auth } = createAuth({ store, fetchImpl });
  const initial = await auth.provider.setSession({
    access_token: jwtFor(userId),
    refresh_token: "refresh-one",
  });
  assert.equal(initial.error, null);
  const token = await auth.refresh();
  assert.equal(token, "access-two");
  assert.equal(auth.userId, userId);
  assert.equal(refreshCalls, 1);
  await auth.signOut({ scope: "local" });
});

test("legacy sessionStorage session is migrated only after server user verification", async () => {
  const store = storage();
  const legacyStorage = storage();
  const migratedToken = jwtFor(userId);
  legacyStorage.setItem(
    "apsyntra.crm.auth.v1",
    JSON.stringify({
      access_token: migratedToken,
      refresh_token: "legacy-refresh",
      expires_at: Date.now() + 3600000,
      user: user(userId),
    }),
  );
  let userReads = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith("/user")) {
      userReads++;
      return response(200, user(userId));
    }
    throw Error("Unexpected auth request: " + url);
  };
  const { auth } = createAuth({ store, fetchImpl, legacyStorage });
  assert.equal(await auth.restore(), true);
  assert.equal(auth.userId, userId);
  assert.equal(legacyStorage.getItem("apsyntra.crm.auth.v1"), null);
  assert.ok(store.getItem("apsyntra.crm.auth.test.v1"));
  assert.equal(userReads, 1);
  await auth.signOut({ scope: "local" });
});

test("legacy session remains available when server verification is temporarily offline", async () => {
  const store = storage();
  const legacyStorage = storage();
  const migratedToken = jwtFor(userId);
  legacyStorage.setItem(
    "apsyntra.crm.auth.v1",
    JSON.stringify({
      access_token: migratedToken,
      refresh_token: "legacy-refresh",
      expires_at: Date.now() + 3600000,
      user: user(userId),
    }),
  );
  const { auth } = createAuth({
    store,
    legacyStorage,
    fetchImpl: async () => {
      throw Error("offline");
    },
  });
  await assert.rejects(
    () => auth.restore(),
    (error) => error.code === "NETWORK_UNAVAILABLE",
  );
  assert.ok(legacyStorage.getItem("apsyntra.crm.auth.v1"));
  assert.equal(store.getItem("apsyntra.crm.auth.test.v1"), null);
  await auth.provider.signOut({ scope: "local" });
});

test("a successful token refresh event wakes a recoverable application startup", () => {
  const { auth } = createAuth({
    fetchImpl: async () => response(200, user(userId)),
  });
  const events = [];
  auth.onSessionChange = (event, value) =>
    events.push({ event, userId: value?.user?.id || null });
  auth.receiveProviderEvent(
    "TOKEN_REFRESHED",
    session(userId, "access-restored", "refresh-restored"),
  );
  assert.equal(auth.isSignedIn, true);
  assert.deepEqual(events, [{ event: "TOKEN_REFRESHED", userId }]);
});

test("provider-backed sign-out clears persistent session state", async () => {
  const store = storage();
  const fetchImpl = async (url) => {
    if (url.endsWith("/user")) return response(200, user(userId));
    if (url.includes("/logout")) return response(204, null);
    throw Error("Unexpected auth request: " + url);
  };
  const { auth } = createAuth({ store, fetchImpl });
  await auth.provider.setSession({
    access_token: jwtFor(userId),
    refresh_token: "refresh-one",
  });
  const acknowledged = await auth.signOut({ scope: "global" });
  assert.equal(acknowledged, true);
  assert.equal(auth.isSignedIn, false);
  assert.equal(store.getItem("apsyntra.crm.auth.test.v1"), null);
});

test("explicit sign-out retires legacy tab sessions and prevents session resurrection", async () => {
  const store = storage();
  const legacyStorage = storage();
  legacyStorage.setItem(
    "apsyntra.crm.auth.v1",
    JSON.stringify({
      access_token: jwtFor(userId),
      refresh_token: "legacy-refresh",
      expires_at: Date.now() + 3600000,
      user: user(userId),
    }),
  );
  const { auth } = createAuth({
    store,
    legacyStorage,
    fetchImpl: async () => response(204, null),
  });
  assert.equal(await auth.signOut({ scope: "local" }), true);
  assert.equal(legacyStorage.getItem("apsyntra.crm.auth.v1"), null);
  assert.equal(store.getItem("apsyntra.crm.auth.migration.v1"), "1");
  assert.equal(await auth.restore(), false);
});
