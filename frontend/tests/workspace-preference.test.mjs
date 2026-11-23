import test from "node:test";
import assert from "node:assert/strict";
import {
  readWorkspacePreference,
  writeWorkspacePreference,
  workspacePreferenceKey,
  watchWorkspacePreference,
  restoreWorkspacePreference,
} from "../workspace-preference.js";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const workspaceA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test("workspace preference is stored independently for each authenticated user", () => {
  const storage = memoryStorage();
  assert.equal(writeWorkspacePreference(userA, workspaceA, storage), true);
  assert.equal(writeWorkspacePreference(userB, workspaceB, storage), true);
  assert.equal(readWorkspacePreference(userA, storage), workspaceA);
  assert.equal(readWorkspacePreference(userB, storage), workspaceB);
  assert.equal(
    workspacePreferenceKey(userA),
    "apsyntra.crm.workspace.preference.v1:" + userA,
  );
});

test("workspace preference rejects invalid identities and workspace identifiers", () => {
  const storage = memoryStorage();
  assert.equal(workspacePreferenceKey("not-a-user"), null);
  assert.equal(
    writeWorkspacePreference(userA, "not-a-workspace", storage),
    false,
  );
  assert.equal(readWorkspacePreference(userA, storage), null);
  storage.setItem(workspacePreferenceKey(userA), "not-a-workspace");
  assert.equal(readWorkspacePreference(userA, storage), null);
});

test("workspace preference storage failures are optional and do not throw", () => {
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  assert.equal(readWorkspacePreference(userA, blocked), null);
  assert.equal(writeWorkspacePreference(userA, workspaceA, blocked), false);
});

test("storage events identify the account and workspace without trusting the event as state", () => {
  const listeners = new Map();
  const fakeWindow = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const changes = [];
  const stop = watchWorkspacePreference({
    window: fakeWindow,
    onChange: (value) => changes.push(value),
  });
  const handler = listeners.get("storage");
  handler({ key: workspacePreferenceKey(userA), newValue: workspaceA });
  handler({ key: workspacePreferenceKey(userB), newValue: workspaceB });
  handler({ key: workspacePreferenceKey(userA), newValue: null });
  handler({ key: "unrelated", newValue: workspaceA });
  handler({ key: workspacePreferenceKey(userA), newValue: "invalid" });
  assert.deepEqual(changes, [
    { userId: userA, workspaceId: workspaceA },
    { userId: userB, workspaceId: workspaceB },
  ]);
  stop();
  assert.equal(listeners.has("storage"), false);
});

const signedCatalog = (activeId = workspaceA, targetId = workspaceB) => ({
  status: "SIGNED_MEMBER_DISCOVERY",
  rows: [
    { id: activeId, active: true, verifiedScope: "SIGNED_MEMBER_RPC" },
    { id: targetId, active: false, verifiedScope: "SIGNED_MEMBER_RPC" },
  ],
});

test("startup does not discover or select when the account has no saved preference", async () => {
  const auth = { userId: userA, isSignedIn: true };
  let discoveryCalls = 0;
  const result = await restoreWorkspacePreference({
    auth,
    storage: memoryStorage(),
    lifecycle: {
      discover: async () => {
        discoveryCalls++;
        return signedCatalog();
      },
    },
  });
  assert.equal(result.status, "NO_PREFERENCE");
  assert.equal(discoveryCalls, 0);
});

test("startup leaves an already active saved workspace unchanged", async () => {
  const storage = memoryStorage();
  writeWorkspacePreference(userA, workspaceA, storage);
  let selectionCalls = 0;
  const result = await restoreWorkspacePreference({
    auth: { userId: userA, isSignedIn: true },
    storage,
    lifecycle: {
      discover: async () => signedCatalog(),
      select: async () => {
        selectionCalls++;
      },
    },
  });
  assert.equal(result.status, "ALREADY_ACTIVE");
  assert.equal(selectionCalls, 0);
});

test("startup restores a saved workspace through the signed compare-and-swap lifecycle", async () => {
  const storage = memoryStorage();
  writeWorkspacePreference(userA, workspaceB, storage);
  const calls = [];
  const result = await restoreWorkspacePreference({
    auth: { userId: userA, isSignedIn: true },
    storage,
    lifecycle: {
      discover: async () => signedCatalog(),
      select: async (...args) => {
        calls.push(args);
        return {
          workspaceId: workspaceB,
          previousWorkspaceId: workspaceA,
          switched: true,
        };
      },
    },
  });
  assert.equal(result.status, "RESTORED");
  assert.deepEqual(calls, [[workspaceB, workspaceA]]);
  assert.equal(readWorkspacePreference(userA, storage), workspaceB);
});

test("unavailable saved workspaces are retained without attempting a selection", async () => {
  const storage = memoryStorage();
  writeWorkspacePreference(userA, workspaceB, storage);
  let selectionCalls = 0;
  const result = await restoreWorkspacePreference({
    auth: { userId: userA, isSignedIn: true },
    storage,
    lifecycle: {
      discover: async () => signedCatalog(workspaceA, workspaceA),
      select: async () => {
        selectionCalls++;
      },
    },
  });
  assert.equal(result.status, "PREFERENCE_UNAVAILABLE");
  assert.equal(selectionCalls, 0);
  assert.equal(readWorkspacePreference(userA, storage), workspaceB);
});

test("ambiguous selection is read back once and is never automatically retried", async () => {
  const storage = memoryStorage();
  writeWorkspacePreference(userA, workspaceB, storage);
  let selectionCalls = 0,
    readbackCalls = 0;
  const result = await restoreWorkspacePreference({
    auth: { userId: userA, isSignedIn: true },
    storage,
    lifecycle: {
      discover: async () => signedCatalog(),
      select: async () => {
        selectionCalls++;
        throw Error("connection interrupted after commit");
      },
    },
    api: {
      context: async () => {
        readbackCalls++;
        return { user_id: userA, workspace_id: workspaceB };
      },
    },
  });
  assert.equal(result.status, "RESTORED_AFTER_READBACK");
  assert.equal(selectionCalls, 1);
  assert.equal(readbackCalls, 1);
});

test("unconfirmed selection falls back without overwriting the saved preference", async () => {
  const storage = memoryStorage();
  writeWorkspacePreference(userA, workspaceB, storage);
  let selectionCalls = 0;
  const result = await restoreWorkspacePreference({
    auth: { userId: userA, isSignedIn: true },
    storage,
    lifecycle: {
      discover: async () => signedCatalog(),
      select: async () => {
        selectionCalls++;
        throw Error("selection not confirmed");
      },
    },
    api: {
      context: async () => ({ user_id: userA, workspace_id: workspaceA }),
    },
  });
  assert.equal(result.status, "FALLBACK");
  assert.equal(selectionCalls, 1);
  assert.equal(readWorkspacePreference(userA, storage), workspaceB);
});

test("account changes during discovery prevent selection under the previous identity", async () => {
  const storage = memoryStorage();
  writeWorkspacePreference(userA, workspaceB, storage);
  const auth = { userId: userA, isSignedIn: true };
  let selectionCalls = 0;
  const result = await restoreWorkspacePreference({
    auth,
    storage,
    lifecycle: {
      discover: async () => {
        auth.userId = userB;
        return signedCatalog();
      },
      select: async () => {
        selectionCalls++;
      },
    },
  });
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(selectionCalls, 0);
});
