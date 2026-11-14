import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20261114153218_cp_db_cpu_13_stable_rls_helper_initplan_optimization.sql',
  'utf8'
);
const executable = migration.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
const statements = executable.match(/ALTER POLICY[\s\S]*?;/g) || [];
const identities = [
  'huly_documents_insert ON huly_rewrite.documents',
  'huly_documents_read ON huly_rewrite.documents',
  'huly_documents_update ON huly_rewrite.documents',
  'huly_sb06_events_insert ON huly_rewrite.transaction_events',
  'huly_sb06_events_read ON huly_rewrite.transaction_events',
  'aps_aims_entities_create ON public.aps_aims_entities',
  'aps_aims_entities_read ON public.aps_aims_entities',
  'aps_aims_entities_update ON public.aps_aims_entities',
  'aps_aims_events_read ON public.aps_aims_events',
  'assignments_self_or_admin_select ON public.module_role_assignments',
  'profiles_self_or_admin_select ON public.profiles',
  'order_intake_activity_select ON public.order_intake_activity',
  'order_intake_orders_select ON public.order_intake_orders'
];

test('CP-DB-CPU-13 alters exactly the 13 inspected stable-helper policies', () => {
  assert.equal(statements.length, 13);
  for (const identity of identities) {
    assert.equal(statements.filter(statement => statement.includes(identity)).length, 1, identity);
  }
});

test('CP-DB-CPU-13 hoists all stable workspace lookups', () => {
  const matches = executable.match(/\(SELECT current_workspace_id\(/g) || [];
  assert.equal(matches.length, 13);
  assert.doesNotMatch(executable.replace(/\(SELECT current_workspace_id\(/g, ''), /current_workspace_id\s*\(/i);
});

test('CP-DB-CPU-13 hoists all stable module and platform access helpers', () => {
  assert.equal((executable.match(/\(SELECT has_module_access\(/g) || []).length, 7);
  assert.equal((executable.match(/\(SELECT is_platform_admin\(/g) || []).length, 6);
  assert.doesNotMatch(executable.replace(/\(SELECT has_module_access\(/g, ''), /has_module_access\s*\(/i);
  assert.doesNotMatch(executable.replace(/\(SELECT is_platform_admin\(/g, ''), /is_platform_admin\s*\(/i);
});

test('CP-DB-CPU-13 retains row-dependent board access checks', () => {
  assert.equal((executable.match(/work_board_access\(board_id,/g) || []).length, 6);
  assert.doesNotMatch(executable, /\(SELECT work_board_access\(/i);
});

test('CP-DB-CPU-13 changes no policy authority, role, grant, RLS state, or data', () => {
  assert.doesNotMatch(executable, /\b(?:CREATE|DROP)\s+POLICY\b/i);
  assert.doesNotMatch(statements.join('\n'), /\b(?:TO|RENAME TO)\s+/i);
  assert.doesNotMatch(executable, /\b(?:GRANT|REVOKE|CREATE|ALTER|DROP)\s+(?:ROLE|USER)\b/i);
  assert.doesNotMatch(executable, /\b(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+)?(?:public|private|watchdog_board|huly_rewrite)\./i);
  assert.match(migration, /SET LOCAL lock_timeout = '2s'/);
  assert.match(migration, /SET LOCAL statement_timeout = '20s'/);
});
