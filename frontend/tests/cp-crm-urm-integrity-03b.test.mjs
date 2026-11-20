import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("native effective-access projection candidate relies only on existing backend module authority", () => {
  const s = readFileSync(
    "sql/cp-crm-urm-integrity-03b-projection-candidate.sql",
    "utf8",
  );
  assert.match(
    s,
    /pg_catalog\.pg_get_functiondef\('public\.apsyntra_crm_my_effective_access/,
  );
  assert.match(s, /public\.has_module_access\(id,v_actor\)/);
  assert.match(s, /public\.module_role_for\(id,v_actor\)/);
  assert.match(s, /old_fragment/);
  assert.match(s, /source drift/);
  assert.match(s, /fund-released-tracker/);
  assert.doesNotMatch(
    s,
    /GRANT EXECUTE|CREATE ROLE|INSERT INTO|UPDATE public\.|DELETE FROM|ALTER TABLE|DROP TABLE|SECURITY DEFINER\s+SET/,
  );
});
test("disposable regression reproduces workspace-owner false positive before evaluating parity afterwards", () => {
  const s = readFileSync(
    "sql/tests/cp-crm-urm-integrity-03b-projection-disposable.sql",
    "utf8",
  );
  for (const p of [
    "ws02_personal_workspaces",
    "ws01_member_roles",
    "effectivePlatformRole",
    "public.has_module_access",
    "public.module_role_for",
    "BEFORE",
    "Native four projection",
    "CP_CRM_URM_INTEGRITY_03B_PROJECTION_PARITY_PASS",
  ]) {
    assert.ok(s.toLowerCase().includes(p.toLowerCase()), p);
  }
  assert.doesNotMatch(
    s,
    /production\.supabase\.co|service_role|supabase db push|supabase link/,
  );
});
