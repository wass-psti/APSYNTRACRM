import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL(
    "../../sql/tests/cp-crm-native04b3-finance-capability-readonly.sql",
    import.meta.url,
  ),
  "utf8",
);
const workflow = readFileSync(
  new URL(
    "../../supabase/migrations/20261117051021_frt_company_profile_metadata.sql",
    import.meta.url,
  ),
  "utf8",
);
const domain = readFileSync(
  new URL(
    "../../sql/tests/cp-frt-sec10-ci03-native-finance.sql",
    import.meta.url,
  ),
  "utf8",
);

test("capability inventory performs one read-only non-identifying SQL statement", () => {
  assert.match(source, /^WITH\s+eligible AS \(/m);
  assert.equal((source.match(/;\s*$/gm) || []).length, 1);
  assert.match(
    source,
    /SELECT gate,candidates AS existing_capability_candidates/,
  );
  assert.match(source, /POTENTIAL_CAPABILITY_NOT_QA_APPROVED/);
  assert.doesNotMatch(
    source.replace(/^--.*$/gm, ""),
    /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|CALL|EXECUTE|DO|COPY|PERFORM|SET|RESET)\b/i,
  );
});

test("existing active workspace/domain memberships determine potential actors", () => {
  assert.match(source, /fm\.status='active' AND fm\.enabled/);
  assert.match(source, /wm\.active/);
  assert.match(source, /p\.status='active'/);
  assert.match(source, /00000000-0000-4000-8000-000000000001/);
  for (const gate of [
    "frt_requestors",
    "frt_approval_capable",
    "frt_liquidation_approval_capable",
    "frt_closure_capable",
    "frt_transfer_confirmation_capable",
    "frt_distinct_requestor_and_approver_pairs",
    "frt_distinct_approver_and_transfer_actor_pairs",
    "frt_distinct_three_actor_workflow_sets",
  ])
    assert.ok(source.includes(`'${gate}'`), gate);
});

test("GENERAL_MANAGER already has finance approval, liquidation and closure in existing contracts", () => {
  const approve = /v_role IN \('FINANCE_APPROVER','GENERAL_MANAGER'\)/;
  const close =
    /v_role IN \('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'\)/;
  assert.match(workflow, approve);
  assert.match(workflow, close);
  assert.match(
    source,
    /role IN \('FINANCE_APPROVER','GENERAL_MANAGER'\) AS may_approve/,
  );
  assert.match(
    source,
    /role IN \('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'\) AS may_close/,
  );
  assert.match(
    domain,
    /frt_has_role\(p_workspace_id,'FINANCE_APPROVER','GENERAL_MANAGER'\)/,
  );
});

test("requester and approving roles are counted as distinct identities", () => {
  assert.match(source, /requester\.user_id<>approver\.user_id/);
  assert.match(source, /approver\.user_id<>transfer_actor\.user_id/);
  assert.match(source, /transfer_actor\.user_id<>requester\.user_id/);
});
