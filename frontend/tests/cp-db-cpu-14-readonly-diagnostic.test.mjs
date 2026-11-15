import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('CP-DB-CPU-14 database diagnostic is explicitly read-only and bounded',()=>{
 const sql=readFileSync('sql/tests/cp-db-cpu-14-readonly-workload-baseline.sql','utf8');
 assert.match(sql,/BEGIN TRANSACTION READ ONLY/i);
 assert.match(sql,/ROLLBACK\s*;/i);
 assert.match(sql,/pg_stat_activity/);
 assert.match(sql,/pg_stat_statements/);
 assert.match(sql,/pg_stat_user_tables/);
 assert.match(sql,/pg_constraint/);
 assert.match(sql,/LIMIT 50/i);
 assert.doesNotMatch(sql,/\b(?:INSERT\s+INTO|UPDATE\s+[a-z_]|DELETE\s+FROM|CREATE\s+(?:INDEX|TABLE|FUNCTION)|ALTER\s+TABLE|DROP\s+(?:INDEX|TABLE)|TRUNCATE|VACUUM|ANALYZE\s+[a-z_]|GRANT\s|REVOKE\s|pg_stat_reset)\b/i);
});
