import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APPS,
  isSignedText,
  safeUserKey,
  classifyApp,
  validateExpectedModules,
} from "../../scripts/cp-crm-native-access-final02-signed-matrix.mjs";
const sql = readFileSync(
  new URL(
    "../../scripts/cp-crm-native-access-final02-matrix.sql",
    import.meta.url,
  ),
  "utf8",
);
const script = readFileSync(
  new URL(
    "../../scripts/cp-crm-native-access-final02-signed-matrix.mjs",
    import.meta.url,
  ),
  "utf8",
);

test("all four canonical native applications and distinct cold-start readiness markers are registered", () => {
  assert.deepEqual(
    APPS.map((a) => a.moduleId),
    ["time-tracker", "fund-released-tracker", "fueltrack-plus", "tradelink"],
  );
  assert.equal(new Set(APPS.map((a) => a.boardId)).size, 4);
  assert.equal(new Set(APPS.map((a) => a.route)).size, 4);
  assert.ok(APPS.every((a) => a.ready && a.domain.length));
});
test("stale in-memory startup state is never sufficient to certify a signed session", () => {
  assert.equal(
    isSignedText("AUTHENTICATED Sign in with your existing work account"),
    false,
  );
  assert.equal(isSignedText("Secure session Sign out"), true);
  assert.equal(
    isSignedText(
      "Secure session Sign out Sign in with your existing work account",
    ),
    false,
  );
});
test("browser acceptance is genuine signed RPC and native interface readiness, not sidebar-only", () => {
  const app = APPS[0];
  const base = {
    state: "PENDING",
    signed: true,
    uiReady: true,
    moduleId: app.moduleId,
    boardId: app.boardId,
    native: { status: 200, moduleId: app.moduleId, boardId: app.boardId },
    domainRpcs: [{ rpc: "timetracker_ot_snapshot", status: 200 }],
    httpErrors: [],
    pageErrors: [],
  };
  assert.equal(classifyApp(base), "VERIFIED");
  assert.equal(classifyApp({ ...base, signed: false }), "BLOCKED");
  assert.equal(classifyApp({ ...base, uiReady: false }), "BLOCKED");
  assert.equal(
    classifyApp({ ...base, native: { ...base.native, status: 403 } }),
    "FAILED",
  );
  assert.equal(
    classifyApp({ ...base, native: { ...base.native, boardId: "wrong" } }),
    "FAILED",
  );
  assert.equal(classifyApp({ ...base, domainRpcs: [] }), "FAILED");
  assert.equal(
    classifyApp({ ...base, httpErrors: [{ rpc: "x", status: 500 }] }),
    "FAILED",
  );
  assert.equal(
    classifyApp({ ...base, state: "NOT_ASSIGNED_BY_VERIFIED_INVENTORY" }),
    "NOT_APPLICABLE",
  );
});
test("QA account pseudonyms are stable but distinct and raw user IDs are never logged", () => {
  assert.equal(safeUserKey("user1"), safeUserKey("user1"));
  assert.notEqual(safeUserKey("user1"), safeUserKey("user2"));
  assert.equal(safeUserKey("user1").length, 16);
  assert.equal(safeUserKey("cp-native-matrix-hash-test"), "dae97060d135bb6e");
  assert.match(script, /report\.accountKey\s*=\s*safeUserKey\(identity\)/);
});
test("signed matrix has no login, storage access, impersonation, business writes or production access mutation", () => {
  assert.match(script, /connectOverCDP/);
  assert.match(script, /no genuinely signed CRM tab/);
  assert.match(script, /businessWrites:\s*0,\s*permissionWrites:\s*0/);
  for (const value of [
    ".signIn(",
    ".fill(",
    ".click(",
    ".type(",
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "service_role",
    "setAuth",
    "setSession",
    "submit(",
  ])
    assert.ok(!script.includes(value), "forbidden behavior: " + value);
  assert.doesNotMatch(script, /page\.route\(/);
});
test("pseudonymous SQL matrix flags every account as not runtime tested and distinguishes Charter scoped conflicts", () => {
  assert.match(sql, /substr\(encode\(sha256\(convert_to\(user_id::text/);
  assert.match(sql, /CHARTER_SCOPED_ROLE_UNRESOLVED/);
  assert.match(sql, /ELIGIBLE_NOT_RUNTIME_TESTED/);
  assert.match(sql, /'NOT_TESTED'::text AS signed_startup/);
  assert.match(sql, /apsyntra_charter_workspace_roles/);
  const executable = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const forbidden of [
    /\bINSERT\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bGRANT\b/i,
    /\bREVOKE\b/i,
    /\bALTER\s+TABLE\b/i,
    /\bCREATE\s+FUNCTION\b/i,
  ])
    assert.doesNotMatch(executable, forbidden);
});

test("only authoritative expected assignment lists permit skipping unassigned routes", () => {
  assert.deepEqual(validateExpectedModules("time-tracker,tradelink"), [
    "time-tracker",
    "tradelink",
  ]);
  assert.equal(validateExpectedModules(""), null);
  assert.equal(validateExpectedModules("charter-navigator"), null);
  assert.equal(validateExpectedModules("time-tracker,time-tracker"), null);
  assert.match(script, /ASSIGNED_NAVIGATION_MISSING/);
  assert.match(script, /--expected-modules=/);
  assert.match(script, /--expected-user-key=/);
  assert.match(
    script,
    /Signed user does not match authoritative expected account key/,
  );
});
