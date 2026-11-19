import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APPS } from "../../scripts/cp-crm-native-access-final02-signed-matrix.mjs";
import {
  eligibleSignedPage,
  keyFor,
  verifyNativeReply,
  signedInvalidation,
} from "../../scripts/cp-crm-native-core-02b-crosswindow.mjs";
const source = readFileSync(
  new URL(
    "../../scripts/cp-crm-native-core-02b-crosswindow.mjs",
    import.meta.url,
  ),
  "utf8",
);
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspace = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const app = APPS.find((a) => a.moduleId === "tradelink");
const response = {
  status: 200,
  expectedUserKey: keyFor(id),
  expectedBoardId: app.boardId,
  moduleId: app.moduleId,
  workspaceId: workspace,
  payload: {
    userId: id,
    workspaceId: workspace,
    moduleId: app.moduleId,
    board: { id: app.boardId },
  },
};
test("real signed CRM UI required and a cached startup indicator is never accepted", () => {
  assert.equal(
    eligibleSignedPage(
      "AUTHENTICATED Sign in with your existing work account",
      "https://wass-psti.github.io/APSYNTRACRM/",
    ),
    false,
  );
  assert.equal(
    eligibleSignedPage(
      "Secure session Sign out",
      "https://wass-psti.github.io/APSYNTRACRM/#/tradelink",
    ),
    true,
  );
  assert.equal(
    eligibleSignedPage(
      "Secure session Sign out",
      "https://another.example.com/",
    ),
    false,
  );
});
test("signed native responses must match exact user, workspace, Board and module", () => {
  assert.equal(verifyNativeReply(response), true);
  assert.equal(verifyNativeReply({ ...response, status: 403 }), false);
  assert.equal(
    verifyNativeReply({ ...response, expectedUserKey: keyFor("someone-else") }),
    false,
  );
  assert.equal(
    verifyNativeReply({ ...response, expectedBoardId: "wrong" }),
    false,
  );
  assert.equal(
    verifyNativeReply({ ...response, moduleId: "time-tracker" }),
    false,
  );
  assert.equal(verifyNativeReply({ ...response, workspaceId: id }), false);
  assert.equal(
    verifyNativeReply({
      ...response,
      payload: { ...response.payload, userId: "aaaaaaaa-bbbb-cdef" },
    }),
    false,
  );
  assert.equal(
    verifyNativeReply({
      ...response,
      payload: { ...response.payload, workspaceId: "not-a-uuid" },
    }),
    false,
  );
});
test("nonpersistent invalidation sends scope and identifiers only, never application content", () => {
  const signal = signedInvalidation(id, workspace, app.boardId);
  assert.deepEqual(
    Object.keys(signal).sort(),
    [
      "at",
      "boardId",
      "revision",
      "sender",
      "sequence",
      "type",
      "userId",
      "version",
      "workspaceId",
    ].sort(),
  );
  assert.equal(signal.revision, null);
  assert.equal(signal.boardId, app.boardId);
  assert.doesNotMatch(
    JSON.stringify(signal),
    /token|email|document|items|content|password/i,
  );
});
test("two-window test performs read-only signed app navigation and observes real server reconciliation", () => {
  for (const contract of [
    "connectOverCDP",
    "native_application_board_context",
    "waitForResponse",
    "page.reload(",
    "peer?.close()",
    "BroadcastChannel",
    "crossWindow",
  ])
    assert.ok(source.includes(contract), contract);
  assert.match(source, /businessWrites:\s*0,\s*permissionWrites:\s*0/);
  assert.doesNotMatch(source, /context\(\)\.newPage\(\)/);
  assert.match(source, /waitForEvent\("popup"/);
  assert.match(source, /window\.open\(url, "_blank"\)/);
  assert.match(source, /second tab requires its own genuine signed session/);
  assert.match(source, /candidate === page/);
  assert.match(source, /peerCreated/);
  assert.match(source, /peerOriginal/);
  for (const text of [
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "service_role",
    "signIn(",
    ".fill(",
    ".click(",
    ".submit(",
    "setSession(",
  ])
    assert.ok(!source.includes(text), text);
  for (const app of APPS) assert.ok(app.selector && app.route && app.boardId);
});
