import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync('sql/tests/cp-db-cpu-09-workload-isolation-readonly.sql', 'utf8');
const executable = sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');
const statements = executable.split(';').map(statement => statement.trim()).filter(Boolean);

test('CP-DB-CPU-09 diagnostics contain only SELECT and non-executing EXPLAIN statements', () => {
  assert.ok(statements.length >= 9, 'expected baseline, counters, and plan statements');
  for (const statement of statements) {
    assert.match(statement, /^(?:SELECT|EXPLAIN)\b/i, 'only SELECT or EXPLAIN is permitted');
  }
  assert.doesNotMatch(executable, /\bEXPLAIN\s+\([^)]*ANALYZE/i);
  assert.doesNotMatch(executable, /\b(?:INSERT\s+INTO|UPDATE\s+[a-z_][a-z0-9_.]*\s+SET|DELETE\s+FROM|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|RESET|VACUUM|CALL|DO)\b/i);
  assert.doesNotMatch(executable, /pg_stat_statements_reset|set_config\s*\(|SET\s+(?:LOCAL\s+)?(?:ROLE|SESSION|CONFIGURATION)/i);
});

test('CP-DB-CPU-09 snapshots cumulative counters with their reset/configuration context', () => {
  assert.match(sql, /extensions\.pg_stat_statements_info/);
  assert.match(sql, /pg_stat_statements\.track/);
  assert.match(sql, /track_functions/);
  assert.match(sql, /pg_stat_kcache_installed/);
  assert.match(sql, /-8551254353028248045/);
  assert.match(sql, /5962890455400465064/);
  assert.match(sql, /3194171109028220051/);
});

test('CP-DB-CPU-09 profiles importer lock and match plans without executing writes or locks', () => {
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /FOR UPDATE OF value_row/);
  assert.match(sql, /work_board_items_active_board_count_idx|work_board_items/);
  assert.match(sql, /work_board_item_values/);
  assert.match(sql, /CP-BIMP-11 CSV Alpha/);
  assert.match(sql, /lower\(btrim\(item\.title\)\)/);
  assert.match(sql, /EXPLAIN \(COSTS, VERBOSE, FORMAT TEXT\)/);
  assert.match(sql, /ANALYZE is intentionally omitted/);
});

test('CP-DB-CPU-09 documents the runtime gate without credentials or impersonation', () => {
  const report = readFileSync('docs/CP-DB-CPU-09-WORKLOAD-ISOLATION-AND-IMPORT-PROFILING.md', 'utf8');
  assert.match(report, /manual CRM sign-in/);
  assert.match(report, /No credential/);
  assert.match(report, /another signed actor/);
  assert.match(report, /5\.55%/);
  assert.match(report, /query-level CPU attribution remains unavailable/i);
});
