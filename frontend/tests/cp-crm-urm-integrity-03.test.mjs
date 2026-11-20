import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assessSignedPair,
  assessAdminEmployeePair,
} from "../../scripts/cp-crm-urm-integrity-03-signed-native.mjs";
const a = "1111111111111111",
  b = "2222222222222222";
const ws = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const primary = {
  tab: 1,
  signed: true,
  active: true,
  accountKey: a,
  workspaceId: ws,
};
const peer = {
  tab: 2,
  signed: true,
  active: true,
  accountKey: b,
  workspaceId: ws,
};
test("same-workspace two separately signed accounts are eligible, never automatically accepted", () => {
  assert.deepEqual(assessSignedPair([primary, peer], [a, b]), {
    status: "ELIGIBLE",
    reason: "Genuine same-workspace signed accounts verified",
  });
});
test("different workspaces, different user expectations or missing tabs block cross-user claim", () => {
  assert.equal(
    assessSignedPair([primary, { ...peer, workspaceId: other }], [a, b]).status,
    "BLOCKED",
  );
  assert.equal(assessSignedPair([primary, peer], [a, a]).status, "BLOCKED");
  assert.equal(
    assessSignedPair([primary, peer], [a, "ffffffffffffffff"]).status,
    "BLOCKED",
  );
  assert.equal(
    assessSignedPair([primary, { ...peer, active: false }], [a, b]).status,
    "BLOCKED",
  );
  assert.equal(
    assessSignedPair([primary, { ...peer, signed: false }], [a, b]).status,
    "BLOCKED",
  );
  assert.equal(
    assessSignedPair([primary, { ...peer, tab: 1 }], [a, b]).status,
    "BLOCKED",
  );
});
test("read-only signed probing only visits positively authorized modules and restores each tab", () => {
  const s = readFileSync(
    "scripts/cp-crm-urm-integrity-03-signed-native.mjs",
    "utf8",
  );
  assert.match(s, /if\s*\(module\.allowed\s*!==\s*true\)/);
  assert.match(s, /\.goto\(original,/);
  assert.ok(s.includes("native_application_board_context"));
  assert.match(s, /access\.modules\.find/);
  assert.match(s, /hash\(obj\.userId\)\s*===\s*key/);
  assert.doesNotMatch(
    s,
    /sessionStorage|localStorage|document.cookie|setSession\(|signIn\(|service_role|\.fill\(|\.click\(|\.submit\(/,
  );
});
test("scoped-role matrix runs five isolated canonical SQL setter acceptance contracts", () => {
  const script = readFileSync(
    "scripts/cp-crm-urm-integrity-03-scoped-matrix.sh",
    "utf8",
  );
  const workflow = readFileSync(
    ".github/workflows/cp-crm-urm-integrity-03-scoped-matrix.yml",
    "utf8",
  );
  for (const domain of [
    "fund-tracker",
    "six-apps",
    "charter",
    "fueltrans",
    "tooltrace",
  ]) {
    assert.ok(script.includes(`${domain})`), domain);
    assert.ok(workflow.includes(domain));
  }
  assert.ok(script.includes('case "$PGHOST" in 127.0.0.1|localhost'));
  assert.match(workflow, /image: postgres:17/);
  assert.doesNotMatch(
    script,
    /supabase db push|supabase link|service_role|production\.supabase\.co/,
  );
});

test("TimeTracker unavailable view distinguishes denied native assignment from missing Board", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const start = app.indexOf("function renderTimeTrackerRouteUnavailable(){");
  const end = app.indexOf("\nfunction boardPage()", start);
  assert.ok(start > 0 && end > start);
  const render = app.slice(start, end);
  assert.match(render, /const message=state\.ttError/);
  assert.match(render, /native application assignment is not active/);
  assert.match(render, /TimeTracker access unavailable/);
  assert.match(render, /e\(message\)/);
  assert.match(
    render,
    /No application board or attendance records were changed/,
  );
  const runner = readFileSync(
    "scripts/cp-crm-urm-integrity-03-signed-native.mjs",
    "utf8",
  );
  assert.match(runner, /FAILED_PROJECTION_NATIVE_MISMATCH/);
  assert.match(
    runner,
    /native_application_board_context["']\s*&&\s*r\.status\s*===\s*403/,
  );
});

test("two signed employees in one workspace do not qualify as administrator-to-employee mutation acceptance", () => {
  const first = { ...primary, access: { effectivePlatformRole: "employee" } };
  const second = { ...peer, access: { effectivePlatformRole: "employee" } };
  assert.equal(assessSignedPair([first, second], [a, b]).status, "ELIGIBLE");
  assert.deepEqual(assessAdminEmployeePair([first, second], [a, b]), {
    status: "BLOCKED",
    reason:
      "Same-workspace pair has no signed administrator and non-admin target",
  });
});
test("admin-to-employee pair is only eligible when role and workspace are independently verified", () => {
  const first = { ...primary, access: { effectivePlatformRole: "admin" } };
  const second = { ...peer, access: { effectivePlatformRole: "employee" } };
  assert.equal(
    assessAdminEmployeePair([first, second], [a, b]).status,
    "ELIGIBLE",
  );
  assert.equal(
    assessAdminEmployeePair([first, { ...second, workspaceId: other }], [a, b])
      .status,
    "BLOCKED",
  );
  assert.equal(
    assessAdminEmployeePair(
      [first, { ...second, access: { effectivePlatformRole: "admin" } }],
      [a, b],
    ).status,
    "BLOCKED",
  );
  assert.equal(
    assessAdminEmployeePair([{ ...first, active: false }, second], [a, b])
      .status,
    "BLOCKED",
  );
});
