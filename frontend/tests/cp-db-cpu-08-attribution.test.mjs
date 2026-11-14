import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync('sql/tests/cp-db-cpu-08-performance-attribution-readonly.sql', 'utf8');
const executable = sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');
const statements = executable.split(';').map(statement => statement.trim()).filter(Boolean);

test('CP-DB-CPU-08 production diagnostic contains SELECT statements only', () => {
  assert.ok(statements.length >= 4, 'expected multiple diagnostic SELECT statements');
  for (const statement of statements) {
    assert.match(statement, /^SELECT\b/i, 'diagnostic statement must be a SELECT');
  }
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|RESET)\b/i);
  assert.doesNotMatch(executable, /pg_stat_statements_reset|set_config\s*\(/i);
});

test('CP-DB-CPU-08 diagnostic preserves cumulative stats and the exact QA fixture scope', () => {
  assert.match(sql, /extensions\.pg_stat_statements/);
  assert.match(sql, /pg_stat_database/);
  assert.match(sql, /work_board_items_active_board_count_idx|work_board_items/);
  assert.match(sql, /e1071df3-1b0d-43c0-8aa0-732c09032df4/);
  assert.match(sql, /events_last_hour/);
  assert.match(sql, /cell_updates_last_hour/);
});


test('CP-DB-CPU-08 runtime evidence records one signed update and the bounded CPU window', () => {
  const report = readFileSync('docs/CP-DB-CPU-08-SIGNED-IMPORT-AND-CPU-ATTRIBUTION.md', 'utf8');
  assert.match(report, /items\.imported\.wizard/);
  assert.match(report, /298 ms/);
  assert.match(report, /Flag=true/);
  assert.match(report, /3\.82%/);
  assert.match(report, /Last 60 minutes/);
  assert.match(report, /per-query CPU attribution/);
  assert.match(report, /No duplicate import/);
});
