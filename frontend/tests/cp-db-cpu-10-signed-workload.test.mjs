import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync('sql/tests/cp-db-cpu-10-signed-workload-readonly.sql', 'utf8');
const report = readFileSync('docs/CP-DB-CPU-10-SIGNED-WORKLOAD-AND-IMPORT-PERFORMANCE-ACCEPTANCE.md', 'utf8');
const executable = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
const statements = executable.split(';').map(statement => statement.trim()).filter(Boolean);

test('CP-DB-CPU-10 verification SQL is read-only and never resets statistics', () => {
  assert.equal(statements.length, 6);
  for (const statement of statements) assert.match(statement, /^SELECT\b/i);
  assert.doesNotMatch(executable, /\b(?:INSERT\s+INTO|UPDATE\s+[a-z_][a-z0-9_.]*\s+SET|DELETE\s+FROM|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|RESET|VACUUM|CALL|DO)\b/i);
  assert.doesNotMatch(executable, /pg_stat_statements_reset|set_config\s*\(|\bSET\s+(?:LOCAL\s+)?(?:ROLE|SESSION|CONFIGURATION)/i);
});

test('CP-DB-CPU-10 diagnostic pins the existing project QA board and target statement IDs', () => {
  assert.match(sql, /e1071df3-1b0d-43c0-8aa0-732c09032df4/);
  assert.match(sql, /-8551254353028248045/);
  assert.match(sql, /5962890455400465064/);
  assert.match(sql, /3194171109028220051/);
  assert.match(sql, /CP-DB-CPU-10 Signed Import %/);
  assert.match(sql, /CP-DB-CPU-10 Bulk %/);
});

test('CP-DB-CPU-10 report records genuine signed access and both bounded import receipts', () => {
  assert.match(report, /Genuine signed effective-access acceptance/);
  assert.match(report, /5 \| 5 \| 0 \| 265 ms \| 279\.8 ms \| 280 ms/);
  assert.match(report, /3-row importer execution/);
  assert.match(report, /25-row importer execution/);
  assert.match(report, /55\.531 ms/);
  assert.match(report, /115\.099 ms/);
  assert.match(report, /Verified 25 of 25 rows across 1 of 1 batches/);
  assert.match(report, /75 `item\.cell_updated` audit events/);
  assert.match(report, /41 active items/);
});

test('CP-DB-CPU-10 does not mislabel elapsed time or database-wide CPU as per-query CPU', () => {
  assert.match(report, /not CPU time/i);
  assert.match(report, /database-wide rolling metric/i);
  assert.match(report, /Direct per-query CPU attribution is \*\*BLOCKED/);
  assert.match(report, /No importer lock narrowing or index changes are justified/);
  assert.match(report, /No global tracking change, extension installation, database restart/);
});
