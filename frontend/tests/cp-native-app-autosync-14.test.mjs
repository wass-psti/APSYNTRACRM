import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('sql/acceptance/cp-native-app-autosync-14-staging-membership-fidelity.sql','utf8');
const runner=readFileSync('scripts/cp-native-app-autosync-10-disposable-clone.sh','utf8');

test('staging membership QA remains in temporary rollback-only database structures',()=>{
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^ROLLBACK;/m);
 for(const name of ['cp14_auth_users','cp14_profiles','cp14_workspaces','cp14_members',
  'cp14_member_roles','cp14_invite_member_access'])
  assert.match(sql,new RegExp('CREATE TEMP TABLE '+name+'\\b'));
 assert.doesNotMatch(sql,/\b(?:ALTER|DELETE FROM|UPDATE|INSERT INTO)\s+(?:auth\.|public\.|private\.)/i);
});
test('staging domain roles do not get confused with application roles',()=>{
 assert.match(sql,/relation IN \('owner','member','collaborator'\)/);
 assert.match(sql,/role IN \('admin','member','viewer'\)/);
 assert.match(sql,/relation='crm_admin'/);
 assert.match(sql,/role='platform_admin'/);
});
test('the original staging membership composite foreign keys cascade as observed',()=>{
 assert.match(sql,/FOREIGN KEY \(workspace_id,user_id\) REFERENCES cp14_members\(workspace_id,user_id\)\s+ON DELETE CASCADE/g);
 assert.match(sql,/DELETE FROM cp14_members;/);
 assert.match(sql,/Staging role cascade failed/);
});
test('clone invokes local temporary staging rehearsal and preserves existing SQL rollback',()=>{
 assert.match(runner,/cp-native-app-autosync-14-staging-membership-fidelity.sql/);
 assert.match(runner,/staging invitation and workspace membership FK\/role\/cascade fidelity/);
 assert.match(runner,/trap cleanup EXIT/);
 assert.match(runner,/pg_restore.+--exit-on-error/);
});
test('foreign keys between temporary and permanent Auth are not invented',()=>{
 assert.match(sql,/CREATE TEMP TABLE cp14_auth_users/);
 assert.match(sql,/REFERENCES cp14_auth_users\(id\)/);
 assert.doesNotMatch(sql,/REFERENCES auth\.users\(id\)/);
});
