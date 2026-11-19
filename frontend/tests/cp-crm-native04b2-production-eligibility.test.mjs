import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const query = readFileSync(
  new URL(
    "../../sql/tests/cp-crm-native04b2-production-eligibility-readonly.sql",
    import.meta.url,
  ),
  "utf8",
);

test("production eligibility audit remains a single read-only statement", () => {
  assert.match(query, /^-- CP-CRM-NATIVE-04B2/m);
  assert.match(query, /^WITH\s*$/m);
  assert.match(query, /SELECT gate,eligible AS potentially_eligible_accounts/);
  assert.equal((query.match(/;\s*$/gm) || []).length, 1);
  assert.doesNotMatch(
    query.replace(/^--.*$/gm, ""),
    /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|CALL|EXECUTE|DO|COPY|PERFORM|SET|RESET)\b/i,
  );
});

test("existing project, active workspace and non-identifying output are required", () => {
  assert.match(query, /00000000-0000-4000-8000-000000000001/);
  assert.match(query, /name='Work Management'/);
  assert.match(query, /wm\.active=true/);
  assert.match(query, /p\.status='active'/);
  assert.doesNotMatch(
    query,
    /SELECT\s+(?:\*|email|id|user_id)\s+FROM\s+gates\b/i,
  );
  assert.match(query, /POTENTIAL_ACTORS_NOT_QA_APPROVED/);
});

test("all four domains and missing dedicated finance reviewer roles are measured", () => {
  const names = [
    "attendance_employee",
    "frt_module_requestor",
    "frt_domain_requestor",
    "frt_domain_finance_manager",
    "frt_domain_finance_approver",
    "frt_domain_general_manager",
    "fueltrack_requestor",
    "fueltrack_approver",
    "tradelink_document_author",
    "tradelink_distinct_reviewer_candidates",
    "named_qa_accounts",
    "qa_workspace_active_members",
  ];
  for (const name of names)
    assert.match(query, new RegExp(`'\\b${name}\\b'`), name);
  assert.match(query, /FRT-ACCEPTANCE-QA-v0\.5\.0/);
  assert.match(query, /fm\.status='active'/);
  assert.match(query, /m\.enabled/);
});
