import test from "node:test";
import assert from "node:assert/strict";
import { fm1Store } from "../fm1/state.js";

test("FM1 store provides immutable snapshots and immediate subscriptions", () => {
  const initial = fm1Store.get();
  assert.equal(initial.view, "overview");
  assert.equal(initial.busy, false);
  assert.deepEqual(initial.notifications, []);
  assert.equal(initial.notificationUnreadTotal, 0);
  assert.equal(Object.isFrozen(initial), true);

  const received = [];
  const unsubscribe = fm1Store.subscribe((state) => received.push(state));
  assert.equal(received.length, 1);
  assert.equal(received[0], initial);

  fm1Store.setKey("busy", true);
  assert.equal(fm1Store.get().busy, true);
  assert.equal(received.length, 2);
  assert.equal(received[1].busy, true);
  assert.equal(received[1].scopeKey, initial.scopeKey);
  assert.equal(Object.isFrozen(received[1]), true);

  unsubscribe();
  fm1Store.setKey("busy", false);
  assert.equal(received.length, 2);
  fm1Store.set(initial);
});
