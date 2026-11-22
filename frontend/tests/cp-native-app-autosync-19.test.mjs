import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 assessStagingAuthOwnerFidelity
} from '../../scripts/cp-native-app-autosync-19-ownership.mjs';
import {
 uiRoleMatrix,canonicalWriterRoleMatrix,compareModuleContracts
} from '../../scripts/cp-native-app-autosync-19-contract-parity.mjs';

const ownerSql=readFileSync('sql/acceptance/cp-native-app-autosync-19-auth-ownership.sql','utf8');
const runner=readFileSync('scripts/cp-native-app-autosync-15-staging-clone.sh','utf8');
const ownerScript=readFileSync('scripts/cp-native-app-autosync-19-ownership.mjs','utf8');

const matching={
 auth_schema_owner:'supabase_admin',
 auth_table_count:27,
 auth_tables_owned_by_auth_admin:27,
 auth_sequence_count:1,
 auth_sequences_owned_by_auth_admin:1,
 postgres_can_assume_auth_admin:false,
 auth_admin_can_create_auth_objects:true
};

test('matching actual staging Auth owners qualify for schema-owner fidelity only',()=>{
 assert.deepEqual(assessStagingAuthOwnerFidelity(matching),
  {status:'OWNER_TOPOLOGY_MATCH',issues:[],tableCount:27});
});

test('ownership-neutral clone cannot claim GoTrue compatibility',()=>{
 const output=assessStagingAuthOwnerFidelity({
  ...matching,auth_schema_owner:'postgres',
  auth_tables_owned_by_auth_admin:0,
  auth_sequences_owned_by_auth_admin:0
 });
 assert.equal(output.status,'BLOCKED');
 assert.equal(output.issues.length,3);
});

test('missing owner evidence is always blocked',()=>{
 assert.equal(assessStagingAuthOwnerFidelity(null).status,'BLOCKED');
 assert.equal(assessStagingAuthOwnerFidelity({}).status,'BLOCKED');
 assert.equal(assessStagingAuthOwnerFidelity({
  ...matching,auth_table_count:26
 }).status,'BLOCKED');
});

test('ownership probe reads only approved disposable clone, never applies GRANT or ROLE changes',()=>{
 assert.match(ownerSql,/current_database\(\)<>'cp_native15_staging_clone'/);
 assert.match(ownerSql,/pg_get_userbyid/);
 assert.match(ownerSql,/pg_has_role/);
 assert.match(ownerSql,/has_schema_privilege/);
 assert.match(ownerScript,/CP19_AUTH_OWNER_FIDELITY/);
 assert.match(runner,/cp-native-app-autosync-19-ownership\.mjs/);
 assert.doesNotMatch(ownerSql,/^\s*(?:ALTER|GRANT|REVOKE|UPDATE|INSERT|DELETE|DROP|CREATE TABLE)\b/im);
 assert.doesNotMatch(ownerScript,/supabase db push|supabase migration|apply_migration/);
});

test('UI and canonical writer role vocabularies can be compared without mutation',()=>{
 const ui=uiRoleMatrix("export const MODULE_ROLE_OPTIONS=Object.freeze({'alpha':['User','Viewer'],'beta':['Admin']});");
 const writer=canonicalWriterRoleMatrix(
  "allowed:=CASE p_module_id WHEN 'alpha' THEN ARRAY['User','Viewer'] WHEN 'beta' THEN ARRAY['Admin'] ELSE NULL END;");
 assert.deepEqual(compareModuleContracts(ui,writer),
  {status:'MATCH',matched:2,issues:[]});
});

test('missing module contract or conflicting role vocabulary is explicitly detected',()=>{
 const compared=compareModuleContracts({
  alpha:['Employee'], beta:['admin'], extra:['Viewer']
 },{
  alpha:['Employee'],beta:['team_leader'],other:['User']
 });
 assert.equal(compared.status,'CONTRACT_RECONCILIATION_REQUIRED');
 assert.deepEqual(compared.issues,[
  {moduleId:'beta',reason:'role-vocabulary-differs'},
  {moduleId:'extra',reason:'missing-module-contract'},
  {moduleId:'other',reason:'missing-module-contract'}
 ]);
});

test('existing toolbox role discrepancy is reported without automatically changing permissions',()=>{
 const ui=uiRoleMatrix(readFileSync('frontend/user-role-management.js','utf8'));
 const writer=canonicalWriterRoleMatrix(
  "allowed:=CASE p_module_id WHEN 'toolbox-issues' THEN ARRAY['team_leader','secretary','standard'] ELSE NULL END;");
 const output=compareModuleContracts(
  {'toolbox-issues':ui['toolbox-issues']},
  {'toolbox-issues':writer['toolbox-issues']}
 );
 assert.deepEqual(output.issues,[
  {moduleId:'toolbox-issues',reason:'role-vocabulary-differs'}
 ]);
 assert.deepEqual(ui['toolbox-issues'],['admin','supervisor','employee','viewer']);
});

test('read-only role contract audit has no remote role writes or new default assignments',()=>{
 const source=readFileSync('scripts/cp-native-app-autosync-19-contract-parity.mjs','utf8');
 assert.match(source,/CONTRACT_RECONCILIATION_REQUIRED/);
 assert.match(source,/NOT VERIFIED: any newly registered board-backed module/);
 assert.doesNotMatch(source,/supabase db push|DELETE FROM|INSERT INTO|CREATE TABLE|GRANT EXECUTE/);
});
