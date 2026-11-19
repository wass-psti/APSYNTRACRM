import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOARD_MODULES } from "../board/services/manifest.js";
import {
  BOARD_LINKED_MODULES,
  pseudonym,
  signedText,
  validateAssignedBoards,
  classifySignedBoardRead,
} from "../../scripts/cp-crm-native-access-final04-board-linked.mjs";
const script = readFileSync(
  new URL(
    "../../scripts/cp-crm-native-access-final04-board-linked.mjs",
    import.meta.url,
  ),
  "utf8",
);
const sql = readFileSync(
  new URL(
    "../../scripts/cp-crm-native-access-final04-board-inventory.sql",
    import.meta.url,
  ),
  "utf8",
);
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const base = {
  assigned: true,
  roleMatched: true,
  body: "Secure session Sign out",
  boardId: id,
  shell: {
    status: 200,
    board: {
      id,
      name: "Order Intake",
      status: "active",
      archived_at: null,
      trashed_at: null,
    },
  },
  errorResponses: [],
  pageErrors: [],
};
test("all eight Board-linked applications have grounded names and module registry entries", () => {
  assert.equal(Object.keys(BOARD_LINKED_MODULES).length, 8);
  for (const contract of Object.values(BOARD_LINKED_MODULES))
    assert.equal(
      BOARD_MODULES.find((m) => m.key === contract.boardKey)?.name,
      contract.boardName,
    );
});
test("the signed Board read cannot certify native workflow completeness", () => {
  assert.equal(classifySignedBoardRead(base), "BOARD_READ_VERIFIED");
  assert.equal(
    classifySignedBoardRead({
      ...base,
      body: "Sign in with your existing work account",
    }),
    "BLOCKED",
  );
  assert.equal(
    classifySignedBoardRead({ ...base, roleMatched: false }),
    "FAILED",
  );
  assert.equal(
    classifySignedBoardRead({
      ...base,
      shell: { ...base.shell, board: { ...base.shell.board, id: "wrong" } },
    }),
    "FAILED",
  );
  assert.equal(
    classifySignedBoardRead({ ...base, errorResponses: [{ status: 403 }] }),
    "FAILED",
  );
  assert.equal(
    classifySignedBoardRead({ ...base, assigned: false }),
    "NOT_APPLICABLE",
  );
  assert.equal(
    signedText(
      "Secure session Sign out Sign in with your existing work account",
    ),
    false,
  );
});
test("signed expected account and assigned Board IDs are validated before navigation", () => {
  assert.deepEqual(
    validateAssignedBoards([{ moduleId: "order-intake", boardId: id }]),
    [{ moduleId: "order-intake", boardId: id }],
  );
  for (const value of [
    [],
    [{ moduleId: "order-intake", boardId: "not-uuid" }],
    [{ moduleId: "invalid", boardId: id }],
    [
      { moduleId: "order-intake", boardId: id },
      { moduleId: "order-intake", boardId: id },
    ],
  ])
    assert.throws(() => validateAssignedBoards(value));
  assert.equal(pseudonym("account"), pseudonym("account"));
  assert.equal(pseudonym("account").length, 16);
  assert.match(script, /pseudonym\(userId\),\s*expectedKey/);
});
test("uses existing signed Board shell without reading credentials or mutating data", () => {
  for (const token of [
    "wm_get_board_shell",
    "wm_auth_access_context",
    "connectOverCDP",
    "BOARD_READ_VERIFIED",
  ])
    assert.ok(script.includes(token));
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "service_role",
    "setSession",
    "signIn(",
    ".click(",
    ".fill(",
  ])
    assert.ok(!script.includes(forbidden), forbidden);
  assert.match(script, /businessWrites: 0|businessWrites:0/);
  assert.match(script, /permissionWrites: 0|permissionWrites:0/);
});
test("authoritative SQL enumerates eight current Board rows in the same signed workspace with read-only operations", () => {
  assert.equal(
    (
      sql.match(
        /\('(?:fueltrans|tool-traceability|toolbox-issues|material-request-hub|employee-eval|charter-navigator|order-intake|aps-aims)'/g,
      ) || []
    ).length,
    8,
  );
  assert.match(sql, /b\.workspace_id=e\.workspace_id/);
  assert.match(sql, /public\.has_module_access/);
  assert.match(sql, /public\.module_role_for/);
  assert.match(sql, /missing_canonical_boards/);
  const executable = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const pattern of [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bGRANT\s+\w+\b/i,
    /\bREVOKE\s+\w+\b/i,
  ])
    assert.doesNotMatch(executable, pattern);
});
