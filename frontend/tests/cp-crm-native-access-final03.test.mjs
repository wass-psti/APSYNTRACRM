import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregateNativeAcceptance } from "../../scripts/cp-crm-native-access-final03-aggregate.mjs";
const source = readFileSync(
  new URL(
    "../../scripts/cp-crm-native-access-final03-review.sql",
    import.meta.url,
  ),
  "utf8",
);
const k = "0123456789abcdef";
const module = "tradelink";
const boardId = "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88";
const expected = { assignments: [{ accountKey: k, moduleId: module }] };
const app = {
  moduleId: module,
  boardId,
  status: "VERIFIED",
  signed: true,
  uiReady: true,
  native: { status: 200, moduleId: module, boardId },
  domainRpcs: [{ rpc: "tl03_assigned_documents", status: 200 }],
  httpErrors: [],
  pageErrors: [],
};
const report = {
  milestone: "CP-CRM-NATIVE-ACCESS-FINAL-02",
  mode: "genuine-employee-read-only",
  accountKey: k,
  expectedUserKey: k,
  applications: [app],
  businessWrites: 0,
  permissionWrites: 0,
};
test("no runtime proof means zero certified assignments, not a pass", () => {
  const result = aggregateNativeAcceptance(expected, []);
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.counts, {
    total: 1,
    verified: 0,
    pending: 1,
    blocked: 0,
    failed: 0,
  });
});
test("exact signed user/module/native board/domain evidence yields one acceptance", () => {
  const result = aggregateNativeAcceptance(expected, [report]);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.counts.verified, 1);
});
test("denies fake, mismatched or partial runtime reports", () => {
  const altered = [
    {
      ...report,
      applications: [{ ...app, native: { ...app.native, boardId: "wrong" } }],
    },
    { ...report, applications: [{ ...app, signed: false }] },
    { ...report, applications: [{ ...app, domainRpcs: [] }] },
    { ...report, applications: [{ ...app, moduleId: "charter-navigator" }] },
    { ...report, businessWrites: 1 },
    { ...report, accountKey: "wrong" },
    { ...report, blocker: "sign-in required" },
  ];
  for (const r of altered)
    assert.throws(() => aggregateNativeAcceptance(expected, [r]));
});
test("does not double count repeated proofs, or unexpected assigned modules", () => {
  assert.throws(
    () => aggregateNativeAcceptance(expected, [report, report]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      aggregateNativeAcceptance(
        {
          ...expected,
          assignments: [...expected.assignments, ...expected.assignments],
        },
        [],
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      aggregateNativeAcceptance(expected, [
        { ...report, applications: [{ ...app, moduleId: "time-tracker" }] },
      ]),
    /Unexpected/,
  );
});
test("supports explicit failed/blocker and does not silently certify unsupported modules", () => {
  const block = aggregateNativeAcceptance(expected, [
    { ...report, applications: [{ ...app, status: "BLOCKED" }] },
  ]);
  assert.equal(block.counts.blocked, 1);
  const other = {
    assignments: [{ accountKey: k, moduleId: "charter-navigator" }],
  };
  assert.equal(aggregateNativeAcceptance(other, []).status, "INCOMPLETE");
  assert.throws(
    () =>
      aggregateNativeAcceptance(other, [
        {
          ...report,
          applications: [{ ...app, moduleId: "charter-navigator" }],
        },
      ]),
    /No signed browser contract/,
  );
});
test("Charter review SQL produces no changes or automatic role recommendation", () => {
  for (const expected of [
    "INTENT_NOT_CONFIRMED",
    "NOT_APPROVED",
    "proposed_scoped_role",
    "apsyntra_charter_workspace_roles",
    "apsyntra_role_change_audit",
  ])
    assert.ok(source.includes(expected));
  assert.match(source, /NULL::text AS proposed_scoped_role/);
  const executable = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const term of [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bGRANT\s+\w+\b/i,
    /\bREVOKE\s+\w+\b/i,
    /\bALTER\s+TABLE\b/i,
  ])
    assert.doesNotMatch(executable, term);
});
