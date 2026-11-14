import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20261114040731_cp_db_cpu_07_effective_access_read_path.sql',
  'utf8'
);
const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.apsyntra_crm_my_effective_access()');
const end = migration.indexOf('NOTIFY pgrst', start);
assert.notEqual(start, -1, 'CP-07 must replace the existing self-access function');
assert.notEqual(end, -1, 'CP-07 must delimit the function body');
const fn = migration.slice(start, end);

test('signed self-only function contract and existing workspace resolver remain unchanged', () => {
  assert.match(fn, /RETURNS jsonb[\s\S]*LANGUAGE plpgsql[\s\S]*STABLE[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(fn, /v_actor uuid := auth\.uid\(\)/);
  assert.match(fn, /public\.current_workspace_id\(v_actor\)/);
  assert.match(fn, /IF v_actor IS NULL[\s\S]*42501/);
  assert.match(fn, /Active workspace membership required[\s\S]*42501/);
  assert.match(fn, /public\.apsyntra_role_is_bootstrap\(\)/);
  assert.match(fn, /Effective authorization unavailable[\s\S]*42501/);
});

test('profile, active membership, explicit role and inherited role are resolved in one query', () => {
  assert.equal((fn.match(/JOIN public\.workspace_members/g) || []).length, 1);
  assert.equal((fn.match(/LEFT JOIN public\.apsyntra_crm_platform_roles/g) || []).length, 1);
  assert.equal((fn.match(/\n\s+JOIN public\.apsyntra_crm_platform_roles/g) || []).length, 0);
  assert.match(fn, /membership\.workspace_id = v_workspace/);
  assert.match(fn, /membership\.active IS TRUE/);
  assert.match(fn, /p\.status = 'active'/);
  assert.match(fn, /assignment\.user_id = p\.id[\s\S]*assignment\.workspace_id = v_workspace/);
  assert.match(fn, /private\.ws02_personal_workspaces[\s\S]*private\.ws01_member_roles[\s\S]*lower\(btrim\(owner_role\.relation\)\) = 'owner'/);
  assert.match(fn, /WHEN 'admin_general_manager' THEN 'admin'[\s\S]*WHEN 'hr' THEN 'supervisor'[\s\S]*WHEN 'supervisor' THEN 'supervisor'[\s\S]*ELSE 'employee'/);
  assert.doesNotMatch(fn, /public\.apsyntra_crm_effective_role\(/);
  assert.doesNotMatch(fn, /public\.apsyntra_crm_explicit_role\(/);
});

test('module-role ceiling is unchanged and rank work is performed once per module', () => {
  const expected = [
    'aps-aims', 'charter-navigator', 'employee-eval', 'fueltrack-plus',
    'fueltrans', 'fund-released-tracker', 'material-request-hub',
    'order-intake', 'time-tracker', 'tool-traceability', 'toolbox-issues', 'tradelink'
  ];
  for (const id of expected) assert.ok(fn.includes(`'${id}'`), `missing module ${id}`);
  assert.match(fn, /v_effective_rank := public\.apsyntra_crm_role_rank\(v_effective_role\)/);
  assert.equal((fn.match(/public\.apsyntra_crm_module_role_rank\(/g) || []).length, 1);
  assert.match(fn, /module_rank\.role_rank IS NULL[\s\S]*module_rank\.role_rank > v_effective_rank/);
  assert.match(fn, /CROSS JOIN LATERAL/);
  assert.match(fn, /v_explicit_role IS NOT NULL/);
  assert.match(fn, /WHEN 'time-tracker' THEN 'System Admin'[\s\S]*WHEN 'fueltrack-plus' THEN 'Admin'[\s\S]*WHEN 'tradelink' THEN 'General Manager'/);
});

test('board visibility/edit/manage rules and JSON schema version remain unchanged', () => {
  assert.match(fn, /board\.workspace_id = v_workspace[\s\S]*board\.status = 'active'/);
  assert.match(fn, /v_is_admin OR board_member\.role IN \('owner', 'editor', 'viewer'\)/);
  assert.match(fn, /v_explicit_role IS DISTINCT FROM 'viewer'[\s\S]*board_member\.role IN \('owner', 'editor'\)/);
  assert.match(fn, /v_explicit_role IS DISTINCT FROM 'employee'[\s\S]*v_explicit_role IS DISTINCT FROM 'supervisor'[\s\S]*board_member\.role = 'owner'/);
  assert.match(fn, /'schemaVersion', 1/);
  for (const key of ['workspaceId', 'platformRole', 'effectivePlatformRole', 'explicitPlatformRole', 'bootstrap', 'modules', 'boards']) {
    assert.ok(fn.includes(`'${key}'`), `missing response key ${key}`);
  }
  assert.match(fn, /ORDER BY board\.name, board\.id/);
  assert.match(fn, /ORDER BY id/);
});

test('migration changes only the function body and PostgREST cache; no authority or policy changes', () => {
  assert.match(migration, /SET LOCAL lock_timeout = '2s'/);
  assert.match(migration, /SET LOCAL statement_timeout = '20s'/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(migration, /\b(?:CREATE|ALTER|DROP)\s+(?:POLICY|ROLE|USER|TABLE|SCHEMA)\b/i);
  assert.doesNotMatch(migration, /\b(?:GRANT|REVOKE)\b/i);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+)?public\./i);
  assert.doesNotMatch(migration, /pg_stat_statements_reset|track_functions|pg_stat_statements\.track/);
});
