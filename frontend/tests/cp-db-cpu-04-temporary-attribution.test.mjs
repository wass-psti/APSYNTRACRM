import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261114021600_cp_db_cpu_04_temporary_stale_attribution.sql',import.meta.url),'utf8');
test('temporary attribution emits hashes only and no direct identifiers or tokens',()=>{
 assert.match(sql,/CP_DB_CPU_04_STALE_LIFECYCLE actor_hash=% session_hash=% board_hash=% action=%/);
 assert.match(sql,/pg_catalog\.md5\(auth\.uid\(\)::text\)/);
 assert.match(sql,/pg_catalog\.md5\(coalesce/);
 assert.match(sql,/auth\.jwt\(\)->>''session_id''/);
 assert.match(sql,/pg_catalog\.md5\(p_board_id::text\)/);
 const logDefinition=sql.slice(sql.indexOf('replacement constant text'),sql.indexOf('occurrences integer'));
 assert.doesNotMatch(logDefinition,/email|access_token|refresh_token/);
});
test('diagnostic is inserted only in the non-locking preflight stale branch',()=>{
 assert.match(sql,/v_observed_updated_at IS DISTINCT FROM p_expected_updated_at THEN/);
 assert.match(sql,/RAISE LOG/);
 assert.match(sql,/occurrences <> 1/);
 assert.doesNotMatch(sql,/CREATE TABLE|INSERT INTO|CREATE POLICY|GRANT|REVOKE/i);
});
test('diagnostic is temporary and does not create a persistent telemetry store',()=>{
 assert.match(sql,/TEMPORARY CP-DB-CPU-04 diagnostic/);
 assert.match(sql,/No table writes or persistent counters/);
 assert.doesNotMatch(sql,/CREATE TABLE|CREATE MATERIALIZED VIEW|pg_cron/i);
});
