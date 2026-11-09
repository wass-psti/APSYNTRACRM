import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(
 new URL('../sql/tests/cp-ws-activate04-original-domain-role-subset.sql',import.meta.url),
 'utf8');

test('original domain role subset is restricted to disposable PG17',()=>{
 assert.match(sql,/current_database\(\)<>'workspace_disposable'/);
 assert.match(sql,/current_setting\('server_version_num'\)::int<170000/);
 assert.match(sql,/to_regprocedure\('public\.has_module_access\(text,uuid\)'\)/);
 assert.match(sql,/to_regprocedure\('public\.wm_auth_access_context\(\)'\)/);
 assert.match(sql,/^BEGIN;$/m);
 assert.match(sql,/^ROLLBACK;$/m);
 assert.doesNotMatch(sql,/COMMIT;/);
});

test('original source entrypoint checks assert enabled and disabled role outcomes',()=>{
 assert.match(sql,/public\.has_module_access\('order-intake',auth\.uid\(\)\) IS DISTINCT FROM TRUE/);
 assert.match(sql,/public\.has_module_access\('order-intake','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'\)/);
 assert.match(sql,/IS DISTINCT FROM FALSE/);
 assert.match(sql,/public\.wm_auth_access_context\(\)/);
 assert.match(sql,/ORIGINAL_ACCESS_CONTEXT_MISSING/);

 assert.match(sql,/DOMAIN_ROLE_TABLE_READ_LEAK/);
 assert.match(sql,/has_function_privilege\('anon'/);
 assert.match(sql,/has_function_privilege\('authenticated'/);
});

test('source domain subset does not create production functions, roles or persistent records',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION/);
 assert.doesNotMatch(sql,/CREATE ROLE|ALTER ROLE|CREATE USER|DROP ROLE|DROP TABLE/);
 assert.doesNotMatch(sql,/\\connect|\\i\s+|\\copy|COPY\s+.+PROGRAM/i);
 assert.match(sql,/SET LOCAL ROLE authenticated/);
 assert.match(sql,/RESET ROLE;/);
 assert.match(sql,/ROLLBACK;/);
});
