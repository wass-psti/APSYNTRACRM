import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UserRoleManagementClient,renderUserRoleManagement,SCOPED_SIX_MODULE_IDS,MODULE_ROLE_OPTIONS} from '../user-role-management.js';
import {planUserRoleBatch} from '../user-role-batch.js';

const workspace='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const target='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const updated='2026-11-18T05:00:00Z';
const member={id:target,name:'Member',email:'member@example.invalid',platformRole:'employee',
 protected:false,activeWorkspaceCount:2};
const base={workspaceId:workspace,users:[member],modules:[],moduleAssignments:[],
 boards:[],boardAssignments:[],crmPlatformRoles:[],adminVerified:true};
const button=(html,id)=>{
 const text=html.match(new RegExp('<button[^>]*data-action="user-role-edit-module"[^>]*data-resource="'+id+'"[^>]*>'))?.[0];
 assert.ok(text,id+' action exists');
 return text;
};

test('all six shared-source applications enable Assign/Change for a verified multi-workspace member',()=>{
 const scoped={...base,scopedSixAvailable:true};
 for(const id of SCOPED_SIX_MODULE_IDS){
  const a=button(renderUserRoleManagement({verified:true,data:scoped,
   selectedUserId:target,actorUserId:actor}),id);
  assert.doesNotMatch(a,/\bdisabled\b/,id);
  const denied=button(renderUserRoleManagement({verified:true,
   data:{...scoped,scopedSixAvailable:false},
   selectedUserId:target,actorUserId:actor}),id);
  assert.match(denied,/\bdisabled\b/,id);
 }
 assert.equal(SCOPED_SIX_MODULE_IDS.length,6);
});
test('workspace role snapshot takes precedence over legacy global rows and survives reread',async()=>{
 let revision=0;
 const api={rpc:async(name)=>{
  if(name==='apsyntra_role_user_management_snapshot')return {...base,moduleAssignments:[
   {userId:target,moduleId:'tradelink',role:'General Manager',enabled:true,updatedAt:updated},
   {userId:target,moduleId:'charter-navigator',role:'Employee',enabled:true}]};
  if(name==='apsyntra_crm_platform_role_snapshot')return {
   workspaceId:workspace,adminVerified:true,roles:[]};
  if(name==='apsyntra_role_scoped_six_snapshot')return {
   contract:'cp-urm-scoped-six-v1',workspaceId:workspace,
   assignments:[{userId:target,moduleId:'tradelink',role:revision++?'Sales Supervisor':'User',
    enabled:true,updatedAt:updated}]};
  throw Object.assign(Error('not installed'),{status:404,code:'PGRST202'});
 }};
 const client=new UserRoleManagementClient(api);
 for(const role of ['User','Sales Supervisor']){
  const snap=await client.snapshot(workspace,{includeScopedSix:true});
  assert.equal(snap.scopedSixAvailable,true);
  assert.deepEqual(snap.moduleAssignments.filter(a=>a.moduleId==='tradelink').map(a=>a.role),[role]);
  assert.equal(snap.moduleAssignments.find(a=>a.moduleId==='tradelink').scopedSource,true);
  assert.equal(snap.moduleAssignments.find(a=>a.moduleId==='charter-navigator').role,'Employee');
 }
});
test('workspace role setter forwards signed context with optimistic revision',async()=>{
 const seen=[];
 const client=new UserRoleManagementClient({rpc:async(name,args)=>{
  seen.push({name,args});
  return {effective:true,workspaceId:workspace,targetUserId:target,
   moduleId:'order-intake',role:'User',enabled:true};
 }});
 await client.setScopedSixRole({workspaceId:workspace,userId:target,
  moduleId:'order-intake',role:'User',enabled:true,expectedUpdatedAt:updated});
 assert.equal(seen[0].name,'apsyntra_role_scoped_six_set');
 assert.equal(seen[0].args.p_expected_updated_at,updated);
 await assert.rejects(()=>client.setScopedSixRole({workspaceId:workspace,userId:target,
  moduleId:'charter-navigator',role:'Employee',enabled:true}),/Invalid workspace application role/);
 await assert.rejects(()=>client.setScopedSixRole({workspaceId:workspace,userId:target,
  moduleId:'order-intake',role:'not-real',enabled:true}),/Invalid workspace application role/);
});
test('batch role planner accepts six verified scoped applications without relaxing Charter',()=>{
 const scoped={...base,scopedSixAvailable:true};
 for(const id of SCOPED_SIX_MODULE_IDS){
  const p=planUserRoleBatch(scoped,{userIds:[target],actorUserId:actor,
   scope:'module',resourceId:id,role:MODULE_ROLE_OPTIONS[id][0],enabled:true});
  assert.equal(p.operations.length,1,id);
  assert.throws(()=>planUserRoleBatch({...scoped,scopedSixAvailable:false},
   {userIds:[target],actorUserId:actor,scope:'module',resourceId:id,
    role:MODULE_ROLE_OPTIONS[id][0],enabled:true}),/unavailable/);
 }
 assert.throws(()=>planUserRoleBatch(scoped,{userIds:[target],actorUserId:actor,
  scope:'module',resourceId:'charter-navigator',role:'Employee',enabled:true}),/Global application role/);
});
test('server scope contract retains cross-workspace, bootstrap, role whitelist, and stale-write checks',()=>{
 const sql=readFileSync('supabase/migrations/20261118062000_cp_urm_scoped02b_six_modules.sql','utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.apsyntra_workspace_module_roles/);
 assert.match(sql,/public\.apsyntra_role_require_scope\(p_workspace_id\)/);
 assert.match(sql,/public\.apsyntra_role_bootstrap_identities/);
 assert.match(sql,/p_expected_updated_at/);
 assert.match(sql,/current_workspace_id\(p_user_id\)/);
 assert.match(sql,/apsyntra_crm_my_effective_access/);
 assert.doesNotMatch(sql,/charter-navigator','.*'|DROP POLICY|DISABLE ROW LEVEL SECURITY/i);
});
