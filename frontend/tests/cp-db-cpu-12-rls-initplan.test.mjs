import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20261114151934_cp_db_cpu_12_rls_initplan_optimization.sql',
  'utf8'
);
const executable = migration.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
const statements = executable.match(/ALTER POLICY[\s\S]*?;/g) || [];
const identities = [
  'profiles_self_or_admin_select ON public.profiles',
  'assignments_self_or_admin_select ON public.module_role_assignments',
  'order_intake_activity_select ON public.order_intake_activity',
  'order_intake_orders_select ON public.order_intake_orders',
  'frt_membership_self_or_gm_select ON public.frt_memberships',
  'cp1612ab_source_read_ws ON public.tool_traceability_activity',
  'cp1612ab_source_read_ws ON public.tool_traceability_request_tools',
  'cp1612ab_source_read_ws ON public.tool_traceability_requests',
  'cp1612ab_source_read_ws ON public.tool_traceability_tools',
  'cp161_files_ws ON watchdog_board.attachments',
  'cp161_audit_ws ON watchdog_board.audit_events',
  'cp161_loans_ws ON watchdog_board.inventory_loans',
  'cp161_tools_ws ON watchdog_board.inventory_tools',
  'cp161_items_ws ON watchdog_board.items',
  'cp1612d_objects_ws ON watchdog_board.objects',
  'cp1612b_cutover_ws ON watchdog_board.pilot_cutovers',
  'cp1612e_relations_ws ON watchdog_board.toolbox_legacy_relations',
  'cp1612f_subitems_ws ON watchdog_board.toolbox_subitems',
  'cp1612f_updates_ws ON watchdog_board.toolbox_updates',
  'huly_sb06_events_insert ON huly_rewrite.transaction_events'
];

test('CP-DB-CPU-12 alters exactly the 20 advisor-identified policies', () => {
  assert.equal(statements.length, 20);
  for (const identity of identities) {
    assert.equal(statements.filter(statement => statement.includes(identity)).length, 1, identity);
  }
});

test('CP-DB-CPU-12 moves auth.uid() into scalar statement-level subqueries', () => {
  const matches = executable.match(/\(SELECT auth\.uid\(\)\)/g) || [];
  assert.equal(matches.length, 10);
  const remainder = executable.replace(/\(SELECT auth\.uid\(\)\)/g, '');
  assert.doesNotMatch(remainder, /auth\.uid\s*\(/i);
});

test('CP-DB-CPU-12 moves watchdog.workspace_id current_setting lookups into initplans', () => {
  const matches = executable.match(/\(SELECT current_setting\('watchdog\.workspace_id'::text, true\)\)/g) || [];
  assert.equal(matches.length, 23);
  const remainder = executable.replace(/\(SELECT current_setting\('watchdog\.workspace_id'::text, true\)\)/g, '');
  assert.doesNotMatch(remainder, /current_setting\s*\(/i);
});

test('CP-DB-CPU-12 preserves existing policy targets and does not add or remove authority', () => {
  assert.doesNotMatch(executable, /\b(?:CREATE|DROP)\s+POLICY\b/i);
  assert.doesNotMatch(statements.join('\n'), /\b(?:TO|RENAME TO)\s+/i);
  assert.doesNotMatch(executable, /\b(?:GRANT|REVOKE|CREATE|ALTER|DROP)\s+(?:ROLE|USER)\b/i);
  assert.doesNotMatch(executable, /\b(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+)?(?:public|private|watchdog_board|huly_rewrite)\./i);
  assert.doesNotMatch(executable, /pg_stat_statements_reset|track_functions|shared_preload_libraries/i);
});

test('CP-DB-CPU-12 changes only USING/WITH CHECK expressions and bounds migration locks', () => {
  for (const statement of statements) {
    assert.match(statement, /^ALTER POLICY\s+[a-z0-9_]+\s+ON\s+[a-z0-9_.]+/i);
    assert.match(statement, /\b(?:USING|WITH CHECK)\s*\(/i);
    assert.doesNotMatch(statement, /\b(?:TO|RENAME TO)\s+/i);
  }
  assert.match(migration, /SET LOCAL lock_timeout = '2s'/);
  assert.match(migration, /SET LOCAL statement_timeout = '20s'/);
});
