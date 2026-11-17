import test from "node:test";
import assert from "node:assert/strict";
import { PlatformSyncLease, SYNC_LEADER_RETRY_MS } from "../platform-sync.js";

const uid = "20000000-0000-4000-8000-000000000001";
const wid = "10000000-0000-4000-8000-000000000001";

class FakeLocks {
  constructor() {
    this.held = new Map();
  }
  request(name, options, callback) {
    assert.equal(options.mode, "exclusive");
    assert.equal(options.ifAvailable, true);
    return new Promise((resolve, reject) => {
      if (this.held.has(name)) {
        Promise.resolve()
          .then(() => callback(null))
          .then(resolve, reject);
        return;
      }
      const lock = { name };
      this.held.set(name, lock);
      Promise.resolve()
        .then(() => callback(lock))
        .then(() => {
          if (this.held.get(name) === lock) this.held.delete(name);
          resolve();
        }, reject);
    });
  }
}
function timers() {
  let next = 0;
  const pending = new Map();
  return {
    pending,
    setTimeoutFn(fn, ms) {
      const id = ++next;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeoutFn(id) {
      pending.delete(id);
    },
    async run(ms) {
      for (const [id, item] of [...pending])
        if (item.ms === ms) {
          pending.delete(id);
          item.fn();
        }
      for (let i = 0; i < 12; i++) await Promise.resolve();
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};

test("one visible tab owns the scope lock and a follower takes over after release", async () => {
  const locks = new FakeLocks(),
    clock = timers();
  let firstVisible = true,
    secondVisible = true;
  const firstChanges = [],
    secondChanges = [];
  const first = new PlatformSyncLease({
    locks,
    visible: () => firstVisible,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    onChange: (value) => firstChanges.push(value),
  });
  const second = new PlatformSyncLease({
    locks,
    visible: () => secondVisible,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    onChange: (value) => secondChanges.push(value),
  });
  first.start({ userId: uid, workspaceId: wid });
  await flush();
  second.start({ userId: uid, workspaceId: wid });
  await flush();
  assert.equal(first.leader, true);
  assert.equal(second.leader, false);
  assert.equal(clock.pending.size, 1);
  assert.equal([...clock.pending.values()][0].ms, SYNC_LEADER_RETRY_MS);
  firstVisible = false;
  first.visibilityChanged();
  await flush();
  await clock.run(SYNC_LEADER_RETRY_MS);
  assert.equal(first.leader, false);
  assert.equal(second.leader, true);
  assert.deepEqual(firstChanges, [true, false]);
  assert.deepEqual(secondChanges, [true]);
  first.stop();
  second.stop();
});

test("Web Locks absence preserves the original independent per-tab fallback", () => {
  const changes = [];
  const lease = new PlatformSyncLease({
    locks: null,
    onChange: (value) => changes.push(value),
  });
  assert.equal(lease.start({ userId: uid, workspaceId: wid }), true);
  assert.equal(lease.leader, true);
  assert.deepEqual(changes, [true]);
  lease.stop();
  assert.deepEqual(changes, [true, false]);
});

test("lease ownership is isolated by user and workspace scope", async () => {
  const locks = new FakeLocks(),
    clock = timers();
  const first = new PlatformSyncLease({
    locks,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });
  const other = new PlatformSyncLease({
    locks,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });
  first.start({ userId: uid, workspaceId: wid });
  other.start({
    userId: "20000000-0000-4000-8000-000000000002",
    workspaceId: wid,
  });
  await flush();
  assert.equal(first.leader, true);
  assert.equal(other.leader, true);
  first.stop();
  other.stop();
});

test("leader election is disabled when cross-tab invalidation transport is unavailable", () => {
  const locks = new FakeLocks(),
    changes = [];
  const lease = new PlatformSyncLease({
    locks,
    onChange: (value) => changes.push(value),
  });
  assert.equal(
    lease.start({ userId: uid, workspaceId: wid, enabled: false }),
    true,
  );
  assert.equal(lease.leader, true);
  assert.equal(lease.fallback, true);
  assert.deepEqual(changes, [true]);
  lease.stop();
});

test("a stale released lease cannot override a newer scope election", async () => {
  const locks = new FakeLocks();
  const clock = timers();
  const changes = [];
  const lease = new PlatformSyncLease({
    locks,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    onChange: (value) => changes.push(value),
  });
  lease.start({ userId: uid, workspaceId: wid });
  await flush();
  assert.equal(lease.leader, true);
  lease.start({
    userId: uid,
    workspaceId: "10000000-0000-4000-8000-000000000002",
  });
  await flush();
  assert.equal(lease.leader, true);
  assert.deepEqual(changes, [true, false, true]);
  lease.stop();
});
