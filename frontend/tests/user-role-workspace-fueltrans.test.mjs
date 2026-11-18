import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 UserRoleManagementClient,renderUserRoleManagement,FUELTRANS_WORKSPACE_ROLES
} from '../user-role-management.js';

const workspace='10000000-0000-4000-8000-000000000001';
const target='20000000-0000-4000-8000-000000000002';
const crm={userId:target,effectiveRole:'admin',assignedRole:'admin',
 inheritedRole:'employee',updatedAt:'2026-11-17T01:00:00Z'};
const membership={userId:target,moduleId:'fueltrans',role:'viewer',
 enabled:true,status:'active',clientManaged:false,updatedAt:'2026-11-17T02:00:00Z'};
const central={adminVerified:true,workspaceId:workspace,
 users:[{id:target,name:'Workspace employee',email:'employee@example.invalid',
 platformRole:'employee',activeWorkspaceCount:2,protected:false}],
 modules:['fueltrans'],moduleAssignments:[],boards:[],boardAssignments:[],
 roleManagementContract:'cp-rc03-workspace-scoped-mrh-v1'};
const rpcName='apsyntra_role_fueltrans_workspace_snapshot';
function client({missing=false,overrides={}}={}){
 return new UserRoleManagementClient({rpc:async(name)=>{
  if(name==='apsyntra_role_user_management_snapshot')return central;
  if(name==='apsyntra_crm_platform_role_snapshot')
   return {adminVerified:true,workspaceId:workspace,roles:[crm]};
  if(name===rpcName){
   if(missing)throw Object.assign(Error('Missing RPC'),{status:404,code:'PGRST202'});
   return {contract:'cp-urm-fueltrans-workspace-v1',workspaceId:workspace,
    assignments:[{...membership,...overrides}]};
  }
  if(name==='apsyntra_role_tooltrace_workspace_snapshot')throw Object.assign(Error('Missing'),{status:404,code:'PGRST202'});
  throw Error('Unexpected RPC '+name);
 }});
}
test('workspace role is the actual signed CRM role, not inherited identity',()=>{
 const html=renderUserRoleManagement({verified:true,data:{...central,
  crmPlatformRoles:[crm],fueltransWorkspaceAvailable:true,moduleAssignments:[membership]},
 selectedUserId:target,actorUserId:'30000000-0000-4000-8000-000000000003'});
 assert.match(html,/<label>Assigned workspace role<\/label><strong>admin \(explicit\)<\/strong>/);
 assert.match(html,/<label>WatchdogWorkspace identity \(not an assignment\)<\/label><strong>employee<\/strong>/);
 assert.match(html,/Active: viewer/);
 assert.match(html,/Workspace FuelTrans membership/);
 assert.match(html,/data-resource="fueltrans" >/);
});
test('signed workspace-scoped FuelTrans source replaces a legacy global projection',async()=>{
 const result=await client().snapshot(workspace,{includeFuelTrans:true});
 assert.equal(result.fueltransWorkspaceAvailable,true);
 assert.equal(result.moduleAssignments[0].role,'viewer');
 assert.equal(result.moduleAssignments[0].enabled,true);
 assert.equal(result.crmPlatformRoles[0].assignedRole,'admin');
});
test('new backend unavailable does not enable unsafe global FuelTrans assignment',async()=>{
 const result=await client({missing:true}).snapshot(workspace,{includeFuelTrans:true});
 const html=renderUserRoleManagement({verified:true,data:result,selectedUserId:target});
 assert.equal(result.fueltransWorkspaceAvailable,false);
 assert.match(html,/data-resource="fueltrans" disabled title="FuelTrans workspace membership backend is not activated/);
});
test('client-managed FuelTrans membership is preserved by specialized domain editor',async()=>{
 const result=await client({overrides:{clientManaged:true,role:'unioil'}}).snapshot(workspace,{includeFuelTrans:true});
 const html=renderUserRoleManagement({verified:true,data:result,selectedUserId:target});
 assert.match(html,/data-resource="fueltrans" disabled title="Client-specific FuelTrans membership/);
});
test('FuelTrans assignment and reassignment require exact workspace receipt',async()=>{
 const calls=[];
 const subject=new UserRoleManagementClient({rpc:async(name,args)=>{
  calls.push([name,args]);
  return {effective:true,workspaceId:workspace,targetUserId:target,
   scope:'module',resourceId:'fueltrans',after:{role:args.p_role,enabled:args.p_enabled}};
 }});
 await subject.setFueltransWorkspaceRole({workspaceId:workspace,userId:target,
  role:'viewer',enabled:true});
 await subject.setFueltransWorkspaceRole({workspaceId:workspace,userId:target,
  role:'global_l1_support',enabled:true,expectedUpdatedAt:membership.updatedAt});
 await subject.setFueltransWorkspaceRole({workspaceId:workspace,userId:target,
  role:'global_l1_support',enabled:false,expectedUpdatedAt:membership.updatedAt});
 assert.equal(calls.length,3);
 assert.ok(calls.every(([name])=>name==='apsyntra_role_fueltrans_workspace_set'));
 assert.deepEqual(calls.map(([,args])=>args.p_role),
  ['viewer','global_l1_support','global_l1_support']);
 assert.equal(calls[1][1].p_expected_updated_at,membership.updatedAt);
 assert.equal(calls[2][1].p_enabled,false);
});
test('invalid roles and mismatched receipts cannot be represented as success',async()=>{
 const denied=new UserRoleManagementClient({rpc:async()=>{throw Error('Should not call');}});
 for(const role of ['Admin','User','superuser','unioil',''])await assert.rejects(
  denied.setFueltransWorkspaceRole({workspaceId:workspace,userId:target,
   role,enabled:true}),/Invalid FuelTrans/);
 const mismatch=new UserRoleManagementClient({rpc:async()=>({
  effective:true,workspaceId:workspace,targetUserId:target,scope:'module',
  resourceId:'fueltrans',after:{role:'viewer',enabled:false}})});
 await assert.rejects(mismatch.setFueltransWorkspaceRole({
  workspaceId:workspace,userId:target,role:'viewer',enabled:true}),
  /acknowledgement invalid/);
 assert.ok(FUELTRANS_WORKSPACE_ROLES.includes('viewer'));
});
test('candidate backend is workspace-keyed, audited and never mirrors to global module roles',()=>{
 const sql=readFileSync('sql/cp-urm-fueltrans-workspace-role-candidate.sql','utf8');
 assert.match(sql,/CANDIDATE ONLY/);
 assert.match(sql,/PERFORM public\.apsyntra_role_require_scope\(p_workspace_id\)/);
 assert.match(sql,/FROM public\.fueltrans_memberships/);
 assert.match(sql,/ON CONFLICT\(workspace_id,user_id\)/);
 assert.match(sql,/Stale FuelTrans workspace role assignment/);
 assert.match(sql,/apsyntra_role_change_audit/);
 assert.doesNotMatch(sql,/INSERT INTO public\.module_role_assignments|UPDATE public\.module_role_assignments/);
});
