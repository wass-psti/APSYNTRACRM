import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSignedCrmRole,currentSignedCrmRole,signedCrmRoleLabel,
 signedCrmIdentityLabel} from '../crm-role-context.js';
const actor='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const otherWorkspace='33333333-3333-4333-8333-333333333333';
const context={user_id:actor,workspace_id:workspace,profile:{platform_role:'employee'}};
const raw={schemaVersion:1,workspaceId:workspace,platformRole:'employee',
 effectivePlatformRole:'admin',explicitPlatformRole:'admin',bootstrap:false,modules:[],boards:[]};
test('CP-URM-02 uses the existing verified self-only CRM tier, separate from identity',()=>{
 const snapshot=parseSignedCrmRole(raw,{userId:actor,workspaceId:workspace,identityRole:'employee'});
 assert.equal(signedCrmRoleLabel(snapshot,context),'CRM admin');
 assert.equal(signedCrmIdentityLabel(context),'Identity: employee');
 assert.equal(snapshot.explicitRole,'admin');
});
test('CP-URM-02 switching workspaces or users prevents showing the previous role',()=>{
 const snapshot=parseSignedCrmRole(raw,{userId:actor,workspaceId:workspace,identityRole:'employee'});
 for(const changed of [{...context,workspace_id:otherWorkspace},
  {...context,user_id:'44444444-4444-4444-8444-444444444444'},
  {...context,profile:{platform_role:'hr'}},null]){
  assert.equal(currentSignedCrmRole(snapshot,changed),null);
  assert.equal(signedCrmRoleLabel(snapshot,changed),'CRM role unverified');
 }
});
test('CP-URM-02 invalid, swapped or divergent RPC records are not rendered as Admin',()=>{
 const args={userId:actor,workspaceId:workspace,identityRole:'employee'};
 for(const invalid of [{...raw,workspaceId:otherWorkspace},{...raw,platformRole:'hr'},
  {...raw,effectivePlatformRole:'admin_general_manager'},
  {...raw,explicitPlatformRole:'viewer'},
  {...raw,schemaVersion:2}])assert.throws(()=>parseSignedCrmRole(invalid,args));
 assert.equal(signedCrmRoleLabel(null,context),'CRM role unverified');
});
test('CP-URM-02 inherited CRM role displays correctly without changing identity',()=>{
 const inherited=parseSignedCrmRole({...raw,effectivePlatformRole:'employee',
  explicitPlatformRole:null},{userId:actor,workspaceId:workspace,identityRole:'employee'});
 assert.equal(signedCrmRoleLabel(inherited,context),'CRM employee');
 assert.equal(signedCrmIdentityLabel(context),'Identity: employee');
});
test('CP-URM-02 app displays CRM role on all three surfaces without modifying permission guards',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const data=readFileSync('frontend/data.js','utf8');
 assert.match(app,/sidebar-profile-text[\s\S]*?signedCrmRoleLabel\(state.crmRoleSnapshot,state.context\)/);
 assert.match(app,/Verified CRM tier in the active workspace/);
 assert.match(app,/settings-profile-copy[\s\S]*?signedCrmRoleLabel\(state.crmRoleSnapshot,state.context\)/);
 assert.match(app,/Inherited identity role/);
 assert.match(app,/auth\.accessToken!==token/);
 assert.match(app,/generation!==crmRoleReadGeneration/);
 assert.match(app,/state\.context\?\.workspace_id!==workspace/);
 assert.match(data,/'apsyntra_crm_my_effective_access'/);
 assert.match(app,/state\.context\?\.profile\?\.platform_role==='admin_general_manager'/);
});
