import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync('sql/tests/cp-db-cpu-11-attribution-readonly.sql', 'utf8');
const report = readFileSync('docs/CP-DB-CPU-11-CPU-ATTRIBUTION-FEASIBILITY-AND-IMPORT-CONTENTION.md', 'utf8');
const executable = sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');
const statements = executable.split(';').map(statement => statement.trim()).filter(Boolean);

test('CP-DB-CPU-11 SQL diagnostics are strictly read-only SELECT statements', () => {
  assert.equal(statements.length, 5);
  for (const statement of statements) {
    assert.match(statement, /^SELECT\b/i);
  }
  assert.doesNotMatch(executable, /\b(?:INSERT\s+INTO|UPDATE\s+[a-z_][a-z0-9_.]*\s+SET|DELETE\s+FROM|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|RESET|VACUUM|CALL|DO)\b/i);
  assert.doesNotMatch(executable, /pg_stat_statements_reset|set_config\s*\(|\bSET\s+(?:LOCAL\s+)?(?:ROLE|SESSION|CONFIGURATION)/i);
  assert.doesNotMatch(executable, /\bEXPLAIN\s*\([^)]*ANALYZE/i);
});

test('CP-DB-CPU-11 records the current instrumentation and statistics reset context', () => {
  assert.match(sql, /pg_stat_statements\.track/);
  assert.match(sql, /track_functions/);
  assert.match(sql, /track_io_timing/);
  assert.match(sql, /shared_preload_libraries/);
  assert.match(sql, /pg_stat_statements_info/);
  assert.match(sql, /pg_stat_monitor/);
  assert.match(sql, /pg_stat_kcache/);
});

test('CP-DB-CPU-11 separates elapsed time, function counters, and active contention', () => {
  assert.match(sql, /total_exec_time/);
  assert.match(sql, /pg_stat_user_functions/);
  assert.match(sql, /pg_blocking_pids/);
  assert.match(sql, /state = 'active'/);
  assert.match(sql, /temp_bytes/);
});

test('CP-DB-CPU-11 documents the absence of a shared Edge-to-Postgres request key', () => {
  assert.match(report, /request_id/);
  assert.match(report, /trace_id/);
  assert.match(report, /parsed\.session_id/);
  assert.match(report, /cannot reliably join/i);
});

test('CP-DB-CPU-11 does not recommend installing extensions or changing importer locks', () => {
  assert.match(report, /Do not install it for this increment/);
  assert.match(report, /No importer lock narrowing/);
  assert.match(report, /No production instrumentation or importer optimization is warranted/);
  assert.match(report, /No production data was inserted/);
});
