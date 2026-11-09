import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const sql=readFileSync(new URL('../sql/tests/cp-ws-activate04-disposable-actor-boundary-candidate.sql',import.meta.url),'utf8');
const runner=readFileSync(new URL('./ws01-activate04-owner-source-signed-replay.sh',import.meta.url),'utf8');
const delegation=readFileSync(new URL('../sql/tests/cp-ws-activate04-private-delegation-boundary.sql',import.meta.url),'utf8');

test('experimental actor boundary is fail-closed to disposable PG17 and exact original source',()=>{
 assert.match(sql,/current_database\(\)<>'workspace_disposable'/);
 assert.match(sql,/server_version_num/);
 assert.match(sql,/58d5af1ddbb54db20a80522335e2ac14bae4e175639cfa4b5da5ad1072f69beb/);
 assert.match(sql,/ORIGINAL_DOMAIN_SOURCE_FINGERPRINT_MISMATCH/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.has_module_access/);
 assert.match(sql,/SET SCHEMA private/);
 assert.match(sql,/RENAME TO ws01_legacy_has_module_access/);
 assert.match(sql,/p_user_id IS DISTINCT FROM auth\.uid\(\)/);
 assert.match(sql,/current_workspace_id\(auth\.uid\(\)\) IS NULL/);
 assert.match(sql,/private\.ws01_legacy_has_module_access\(p_module_id,p_user_id\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.has_module_access\(text,uuid\)/);
 assert.match(sql,/ACTOR_BOUNDARY_PERMISSIONS_UNSAFE/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE TABLE)\b/i);
});

test('owner runner separates original red canary and candidate regression mode',()=>{
 assert.match(runner,/--check-disjoint-roles/);
 assert.match(runner,/--candidate-actor-boundary/);
 assert.match(runner,/WS01_ACTOR_BOUNDARY/);
 assert.match(runner,/CP_WS_ACTIVATE04_DISPOSABLE_ACTOR_BOUNDARY_INSTALLED/);
 assert.match(runner,/CP_WS_ACTIVATE04_DISJOINT_ROLE_DENIAL_PASS/);
 assert.match(runner,/--network none --read-only/);
 const result=spawnSync('bash',['-n',new URL('./ws01-activate04-owner-source-signed-replay.sh',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('private delegated original remains available only to trusted roles',()=>{
 assert.match(delegation,/current_database\(\)<>'workspace_disposable'/);
 assert.match(delegation,/private\.ws01_legacy_has_module_access\('material-request-hub'/);
 assert.match(delegation,/public\.has_module_access\('material-request-hub'/);
 assert.match(delegation,/PUBLIC_FOREIGN_ROLE_LOOKUP_STILL_EXPOSED/);
 assert.match(delegation,/AUTHENTICATED_CAN_DIRECTLY_EXECUTE_LEGACY_LOOKUP/);
 assert.match(delegation,/^ROLLBACK;$/m);
 assert.doesNotMatch(delegation,/\bCOMMIT;/);
 assert.match(runner,/cp-ws-activate04-private-delegation-boundary\.sql/);
});
