import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../sql/tests/cp-ws-activate04-disjoint-role-denial-canary.sql',import.meta.url),'utf8');
const runner=readFileSync(new URL('./ws01-activate04-owner-source-signed-replay.sh',import.meta.url),'utf8');

test('disjoint signed principal canary fails closed on foreign enabled module roles',()=>{
 assert.match(sql,/current_database\(\)<>'workspace_disposable'/);
 assert.match(sql,/current_setting\('server_version_num'\)::int<170000/);
 assert.match(sql,/^BEGIN;$/m);
 assert.match(sql,/^ROLLBACK;$/m);
 assert.match(sql,/^SET LOCAL ROLE authenticated;$/m);
 assert.match(sql,/ORIGINAL_DOMAIN_DISJOINT_FOREIGN_ROLE_EXPOSED/);
 assert.match(sql,/DISJOINT_ACTOR_SCOPE_INVALID/);
 assert.match(sql,/DISJOINT_TARGET_SCOPE_INVALID/);
 assert.match(sql,/ORIGINAL_DOMAIN_SAME_PRINCIPAL_DISABLED_ROLE_ALLOWED/);
 assert.match(sql,/ORIGINAL_DOMAIN_ABSENT_ROLE_ALLOWED/);
 assert.match(sql,/material-request-hub/);
 assert.doesNotMatch(sql,/\bCOMMIT;/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION|DROP FUNCTION|ALTER ROLE/);
});

test('owner host runner always separates known-good smoke from opt-in red canary',()=>{
 assert.match(runner,/--check-disjoint-roles/);
 assert.match(runner,/WS01_RUN_DISJOINT_CANARY/);
 assert.match(runner,/cp-ws-activate04-disjoint-role-denial-canary\.sql/);
 assert.match(runner,/CP_WS_ACTIVATE04_DISJOINT_ROLE_CANARY_STARTED/);
 assert.match(runner,/CP_WS_ACTIVATE04_DISJOINT_ROLE_DENIAL_PASS/);
 assert.match(runner,/--network none --read-only/);
 assert.match(runner,/--mount "type=bind,source=\$SOURCE_DIR,target=\/protected,readonly"/);
});
