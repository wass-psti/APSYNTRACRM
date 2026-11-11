import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WS10_CREATOR_POLICY_ACTIVE,WS10_OWNERSHIP_TRANSFER_ACTIVE,
 creatorEligibilityFromSignedCatalog,workspaceCreatorUiAllowed,
 validateOwnershipTransfer,OwnershipTransferClient
} from '../ws10-ownership.js';
const actor='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const target='33333333-3333-4333-8333-333333333333';
const request='44444444-4444-4444-8444-444444444444';
const base={status:'SIGNED_MEMBER_DISCOVERY',rows:[
 {id:workspace,relation:'owner',active:true,verifiedScope:'SIGNED_MEMBER_RPC'}]};
test('creator is an owner only from verified signed active membership',()=>{
 const auth={workspaceId:workspace,userId:actor};
 assert.equal(creatorEligibilityFromSignedCatalog(base,auth).eligible,true);
 for(const wrong of [
  {status:'CURRENT_WORKSPACE_ONLY',rows:base.rows},
  {...base,rows:[{...base.rows[0],relation:'member'}]},
  {...base,rows:[{...base.rows[0],active:false}]},
  {...base,rows:[{...base.rows[0],verifiedScope:'CLIENT'}]},
  {...base,rows:[...base.rows,...base.rows]},
  {...base,rows:[{...base.rows[0],id:target}]}
 ])assert.equal(creatorEligibilityFromSignedCatalog(wrong,auth).eligible,false);
});
test('IT Admin requires signed exact actor/workspace role receipt, not generic CRM admin',()=>{
 const catalog={status:'SIGNED_MEMBER_DISCOVERY',rows:[
  {id:workspace,relation:'member',active:true,verifiedScope:'SIGNED_MEMBER_RPC'}]};
 const input={workspaceId:workspace,userId:actor};
 const receipt={schemaVersion:1,userId:actor,workspaceId:workspace,
  canCreateWorkspace:true,role:'it-admin',source:'SIGNED_CREATOR_POLICY'};
 assert.equal(creatorEligibilityFromSignedCatalog(catalog,{...input,adminReceipt:receipt}).eligible,true);
 for(const bad of [
  {...receipt,role:'admin'}, {...receipt,userId:target},
  {...receipt,source:'localStorage'}, {...receipt,canCreateWorkspace:false}
 ])assert.equal(creatorEligibilityFromSignedCatalog(catalog,{...input,adminReceipt:bad}).eligible,false);
});
test('owner and IT Admin are blocked until protected server policy is active',()=>{
 assert.equal(WS10_CREATOR_POLICY_ACTIVE,false);
 assert.equal(WS10_OWNERSHIP_TRANSFER_ACTIVE,false);
 assert.equal(workspaceCreatorUiAllowed({
  catalog:base,workspaceId:workspace,userId:actor
 }).allowed,false);
 assert.equal(workspaceCreatorUiAllowed({
  catalog:base,workspaceId:workspace,userId:actor,deployed:true
 }).allowed,true);
});
test('ownership transfers require exact signed target and resource kind',()=>{
 assert.deepEqual(validateOwnershipTransfer({
  kind:'workspace',workspaceId:workspace,targetUserId:target,requestId:request
 }),{kind:'workspace',workspaceId:workspace,targetUserId:target,requestId:request});
 assert.equal(validateOwnershipTransfer({
  kind:'workspace',resourceId:'time-tracker',workspaceId:workspace,
  targetUserId:target,requestId:request
 }),null);
 assert.deepEqual(validateOwnershipTransfer({
  kind:'application',resourceId:'time-tracker',workspaceId:workspace,
  targetUserId:target,requestId:request
 }),{kind:'application',resourceId:'time-tracker',workspaceId:workspace,
  targetUserId:target,requestId:request});
 assert.equal(validateOwnershipTransfer({
  kind:'application',resourceId:'../../private',workspaceId:workspace,
  targetUserId:target,requestId:request
 }),null);
});
test('dormant ownership transfer makes zero reads or writes',async()=>{
 let calls=0;
 const client=new OwnershipTransferClient({auth:{
  userId:actor,getVerifiedUser:async()=>{calls++;return{id:actor};}
 },api:{context:async()=>{calls++;return{};},rpc:async()=>{calls++;return{};}}});
 await assert.rejects(client.transfer({
  kind:'workspace',workspaceId:workspace,targetUserId:target,requestId:request
 }),/server activation/);
 assert.equal(calls,0);
});
test('signed owner-transfer transport checks exact actor and verified receipt',async()=>{
 let calls=0;
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>({
  user_id:actor,workspace_id:workspace,profile:{status:'active'}
 }),rpc:async(name,params)=>{
  calls++;
  assert.equal(name,'wm_ws10_transfer_workspace_owner');
  assert.equal(params.p_workspace_id,workspace);
  assert.equal(params.p_target_user_id,target);
  return {schemaVersion:1,workspaceId:workspace,resourceKind:'workspace',
   newOwnerId:target,requestId:request,changed:true};
 }};
 const client=new OwnershipTransferClient({auth,api,enabled:true});
 assert.equal((await client.transfer({kind:'workspace',workspaceId:workspace,
  targetUserId:target,requestId:request})).changed,true);
 assert.equal(calls,1);
 await assert.rejects(new OwnershipTransferClient({
  auth,api:{...api,context:async()=>({
   user_id:actor,workspace_id:target,profile:{status:'active'}
  })},enabled:true
 }).transfer({kind:'workspace',workspaceId:workspace,targetUserId:target,requestId:request}),
 /identity changed/);
 assert.equal(calls,1);
});
test('creation SQL preserves original owner-on-create but denies unapproved roles',()=>{
 const sql=readFileSync('sql/ws10-creator-owner-transfer-CANDIDATE-NOT-APPLIED.sql','utf8');
 assert.match(sql,/md5\(pg_get_functiondef\(p\.oid\)\)='63395e8cb451560b16fd2ccb07a8d20c'/);
 assert.match(sql,/IF NOT private\.ws10_workspace_creator_allowed\(v_actor\)/);
 assert.match(sql,/relation\).*VALUES\(v_id,v_actor,'owner'\)/s);
 assert.match(sql,/creator_enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/transfer_enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/private\.ws01_member_roles\(workspace_id\) WHERE relation='owner'/);
 assert.match(sql,/v_owner<>v_actor AND NOT EXISTS/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.wm_ws10_transfer_workspace_owner/);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public\.wm_ws10_transfer_workspace_owner/);
 assert.doesNotMatch(sql,/UPDATE public\.profiles SET platform_role/i);
});
test('creator UI uses verified catalog, offers signed open-workspace, never changes active workspace locally',()=>{
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 assert.match(ui,/workspaceCreatorUiAllowed/);
 assert.match(ui,/signedUserId/);
 assert.match(ui,/requestSignedWorkspaceSwitch/);
 assert.match(ui,/new workspace is never silently made active/i);
 assert.match(ui,/Transfer workspace ownership — pending activation/);
 assert.match(readFileSync('frontend/app.js','utf8'),/signedUserId:auth\.userId/);
});
