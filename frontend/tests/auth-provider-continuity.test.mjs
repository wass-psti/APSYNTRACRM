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
  clock = () => Date.now(),
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
    auth: new AuthClient({
      provider,
      storage: store,
      legacyStorage,
      fetchImpl,
      clock,
    }),
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

test("provider identity verification is reused for 30 seconds and can be forced fresh", async () => {
  const store = storage();
  let now = Date.now();
  let userReads = 0;
  const { auth } = createAuth({
    store,
    clock: () => now,
    fetchImpl: async (url) => {
      if (url.endsWith("/user")) {
        userReads++;
        return response(200, user(userId));
      }
      throw Error("Unexpected auth request: " + url);
    },
  });
  await auth.provider.setSession({
    access_token: jwtFor(userId),
    refresh_token: "refresh-one",
  });
  assert.equal(await auth.restore(), true);
  userReads = 0;

  for (let index = 0; index < 100; index++)
    assert.equal((await auth.getVerifiedUser()).id, userId);
  assert.equal(userReads, 0);

  now += 30001;
  await auth.getVerifiedUser();
  assert.equal(userReads, 1);
  await auth.getVerifiedUser({ fresh: true });
  assert.equal(userReads, 2);
  await auth.signOut({ scope: "local" });
});

test("provider token reads reuse a valid in-memory session without repeated storage reads", async () => {
  const { auth } = createAuth({
    fetchImpl: async (url) => {
      if (url.endsWith("/user")) return response(200, user(userId));
      throw Error(
        "A valid in-memory token must not trigger another Auth request.",
      );
    },
  });
  const accessToken = jwtFor(userId);
  await auth.provider.setSession({
    access_token: accessToken,
    refresh_token: "refresh-one",
  });
  assert.equal(await auth.restore(), true);
  const originalGetSession = auth.provider.getSession.bind(auth.provider);
  let sessionReads = 0;
  auth.provider.getSession = async () => {
    sessionReads++;
    return originalGetSession();
  };

  for (let index = 0; index < 1000; index++)
    assert.equal(await auth.token(), accessToken);
  assert.equal(sessionReads, 0);

  await auth.signOut({ scope: "local" });
});

test("provider token reads reconcile with Supabase when the session nears expiry", async () => {
  const { auth } = createAuth({
    fetchImpl: async () => {
      throw Error("The controlled provider session read must not fetch Auth.");
    },
  });
  const now = Date.now();
  auth.receiveProviderEvent("SIGNED_IN", {
    ...session(userId, "old-access", "old-refresh"),
    expires_at: Math.floor((now + 60000) / 1000),
  });
  const renewed = {
    ...session(userId, "new-access", "new-refresh"),
    expires_at: Math.floor((now + 3600000) / 1000),
  };
  let sessionReads = 0;
  auth.provider.getSession = async () => {
    sessionReads++;
    return { data: { session: renewed }, error: null };
  };

  assert.equal(await auth.token(), "new-access");
  assert.equal(sessionReads, 1);
  assert.equal(auth.accessToken, "new-access");
  await auth.signOut({ scope: "local" });
});

test("a newer BroadcastChannel session wins over an older in-flight provider read", async () => {
  const { auth } = createAuth({
    fetchImpl: async () => {
      throw Error("The controlled provider session read must not fetch Auth.");
    },
  });
  const current = session(userId, "old-access", "old-refresh");
  current.expires_at = Math.floor((Date.now() + 60000) / 1000);
  auth.receiveProviderEvent("SIGNED_IN", current);
  let finishRead;
  auth.provider.getSession = () =>
    new Promise((resolve) => {
      finishRead = resolve;
    });

  const pendingToken = auth.token();
  await Promise.resolve();
  await Promise.resolve();
  const newer = session(userId, "broadcast-access", "broadcast-refresh");
  auth.receiveProviderEvent("TOKEN_REFRESHED", newer);
  finishRead({ data: { session: current }, error: null });

  assert.equal(await pendingToken, "broadcast-access");
  assert.equal(auth.accessToken, "broadcast-access");
  await auth.signOut({ scope: "local" });
});

test("a temporary provider session-read failure preserves a still-valid in-memory token", async () => {
  const { auth } = createAuth({
    fetchImpl: async () => {
      throw Error("No Auth HTTP request is expected.");
    },
  });
  const current = session(userId, "still-valid-access", "still-valid-refresh");
  current.expires_at = Math.floor((Date.now() + 60000) / 1000);
  auth.receiveProviderEvent("SIGNED_IN", current);
  let sessionReads = 0;
  auth.provider.getSession = async () => {
    sessionReads++;
    const error = Error("temporary provider read failure");
    error.name = "AuthRetryableFetchError";
    return { data: { session: null }, error };
  };

  assert.equal(await auth.token(), "still-valid-access");
  assert.equal(await auth.token(), "still-valid-access");
  assert.equal(sessionReads, 1);
  await auth.signOut({ scope: "local" });
});

test("a sign-out during a failed provider session read cannot reuse the old token", async () => {
  const { auth } = createAuth({
    fetchImpl: async () => {
      throw Error("No Auth HTTP request is expected.");
    },
  });
  const current = session(userId, "signed-out-access", "signed-out-refresh");
  current.expires_at = Math.floor((Date.now() + 60000) / 1000);
  auth.receiveProviderEvent("SIGNED_IN", current);
  let rejectRead;
  auth.provider.getSession = () =>
    new Promise((resolve, reject) => {
      rejectRead = reject;
    });

  const pendingToken = auth.token();
  await Promise.resolve();
  await Promise.resolve();
  auth.receiveProviderEvent("SIGNED_OUT", null);
  const failure = Error("provider read interrupted during sign-out");
  failure.name = "AuthRetryableFetchError";
  rejectRead(failure);

  await assert.rejects(
    () => pendingToken,
    (error) =>
      error.code === "SESSION_MISSING" ||
      error.code === "NETWORK_UNAVAILABLE" ||
      error.name === "AuthRetryableFetchError",
  );
  assert.equal(auth.isSignedIn, false);
});

test("a refreshed cross-tab token is reused after a 401 without another refresh", async () => {
  let apiCalls = 0;
  let refreshCalls = 0;
  const { auth } = createAuth({
    fetchImpl: async (url, init) => {
      if (url.includes("/token?grant_type=refresh_token")) {
        refreshCalls++;
        return response(
          200,
          session(userId, "unneeded-access", "unneeded-refresh"),
        );
      }
      if (url.endsWith("/rpc/session-continuity-test")) {
        apiCalls++;
        if (apiCalls === 1) return response(401, { message: "Expired token" });
        assert.equal(init.headers.Authorization, "Bearer rotated-access");
        return response(200, { ok: true });
      }
      throw Error("Unexpected request: " + url);
    },
  });
  auth.receiveProviderEvent(
    "SIGNED_IN",
    session(userId, "rejected-access", "refresh-one"),
  );
  const rotated = session(userId, "rotated-access", "refresh-two");
  auth.provider.getSession = async () => ({
    data: { session: rotated },
    error: null,
  });
  auth.provider.refreshSession = async () => {
    refreshCalls++;
    throw Error("A newer tab session should be reused instead of refreshed.");
  };

  const result = await auth.authorized("/rest/v1/rpc/session-continuity-test", {
    method: "POST",
    body: {},
    requestKind: "read",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(apiCalls, 2);
  assert.equal(refreshCalls, 0);
  assert.equal(auth.accessToken, "rotated-access");
  await auth.signOut({ scope: "local" });
});

test("provider auth events invalidate a cached verified identity", async () => {
  let userReads = 0;
  const { auth } = createAuth({
    fetchImpl: async (url) => {
      if (url.endsWith("/user")) {
        userReads++;
        return response(200, user(userId));
      }
      throw Error("Unexpected auth request: " + url);
    },
  });
  await auth.provider.setSession({
    access_token: jwtFor(userId),
    refresh_token: "first-refresh",
  });
  assert.equal(await auth.restore(), true);
  userReads = 0;
  await auth.getVerifiedUser();
  await auth.getVerifiedUser();
  assert.equal(userReads, 0);

  auth.receiveProviderEvent(
    "TOKEN_REFRESHED",
    session(userId, "second-access", "second-refresh"),
  );
  await auth.getVerifiedUser();
  assert.equal(userReads, 1);
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
