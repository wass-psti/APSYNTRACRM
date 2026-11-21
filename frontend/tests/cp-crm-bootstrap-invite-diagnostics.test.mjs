import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WorkspaceInvitationManagementClient} from '../workspace-invitation-management.js';
import {workspaceRelationFromCatalog,workspaceRelationLabel} from '../workspace-relation-context.js';
import {parseSignedCrmRole,signedCrmRoleLabel,signedCrmIdentityLabel} from '../crm-role-context.js';
const actor='10000000-0000-4000-8000-000000000001';
const work='20000000-0000-4000-8000-000000000001';
const main='20000000-0000-4000-8000-000000000002';
const context={user_id:actor,workspace_id:work,
 profile:{platform_role:'admin_general_manager',status:'active'}};
test('verified admin identity and CRM admin capability coexist with a separate workspace member relation',()=>{
 const signed={schemaVersion:1,workspaceId:work,platformRole:'admin_general_manager',
  effectivePlatformRole:'admin',explicitPlatformRole:null};
 const role=parseSignedCrmRole(signed,{userId:actor,workspaceId:work,identityRole:'admin_general_manager'});
 const member=workspaceRelationFromCatalog({status:'SIGNED_MEMBER_DISCOVERY',rows:[
  {id:work,relation:'member',active:true,verifiedScope:'SIGNED_MEMBER_RPC'},
  {id:main,relation:'owner',active:true,verifiedScope:'SIGNED_MEMBER_RPC'}
 ]},{userId:actor,workspaceId:work});
 assert.equal(signedCrmRoleLabel(role,context),'CRM admin');
 assert.equal(signedCrmIdentityLabel(context),'Identity: admin_general_manager');
 assert.equal(workspaceRelationLabel(member,context),'Workspace member');
 assert.equal(workspaceRelationLabel(member,{...context,workspace_id:main}),'Workspace relationship unverified');
});
test('missing production manager route reports service deployment blocker, not denied bootstrap access',async()=>{
 let requests=0;
 const client=new WorkspaceInvitationManagementClient({enabled:true,
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor}),
   authorized:async(path,{body})=>{requests++;assert.equal(path,'/functions/v1/ws02d-manage');
    assert.deepEqual(body,{operation:'readiness',workspaceId:work});
    throw {status:404};}},
  api:{context:async()=>context}
 });
 await assert.rejects(client.readiness(work),e=>{
  assert.equal(e.status,503);
  assert.equal(e.code,'INVITATION_BACKEND_NOT_DEPLOYED');
  assert.match(e.message,/not deployed/);
  return true;
 });
 assert.equal(requests,1);
});
test('workspace denial stays a distinct existing authorization result',async()=>{
 const client=new WorkspaceInvitationManagementClient({enabled:true,
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor}),
   authorized:async()=>{throw{status:403}}},api:{context:async()=>context}});
 await assert.rejects(client.readiness(work),{status:403});
});
test('UI does not attribute missing backend to lost account authority',()=>{
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 assert.match(ui,/error\?\.code==='INVITATION_BACKEND_NOT_DEPLOYED'/);
 assert.match(ui,/Workspace Invitation backend is not deployed/);
 assert.match(ui,/invitation service is unavailable/i);
 assert.match(ui,/No email was sent/);
 assert.doesNotMatch(ui,/Your account role has not changed/);
});
