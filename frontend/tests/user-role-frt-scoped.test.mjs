import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UserRoleManagementClient,renderUserRoleManagement} from '../user-role-management.js';
import {planUserRoleBatch} from '../user-role-batch.js';

const workspace='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const target='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const updatedAt='2026-11-18T04:00:00Z';
const user={id:target,name:'Member',email:'member@example.invalid',protected:false,activeWorkspaceCount:2,platformRole:'employee'};
const data={workspaceId:workspace,users:[user],modules:[],moduleAssignments:[],
 boards:[],boardAssignments:[],crmPlatformRoles:[],adminVerified:true};

const action=(html)=>html.match(/<button[^>]*data-action="user-role-edit-module"[^>]*data-resource="fund-released-tracker"[^>]*>/)?.[0];

test('Fund Tracker remains enabled for multi-workspace member when its authoritative scope is available',()=>{
 const scoped={...data,frtWorkspaceAvailable:true};
 for(const section of ['applications','boards','applications']){
  const html=renderUserRoleManagement({verified:true,data:scoped,selectedUserId:target,actorUserId:actor,accessSection:section});
  assert.ok(action(html));
  assert.doesNotMatch(action(html),/disabled/);
 }
 assert.match(action(renderUserRoleManagement({verified:true,data:{...scoped,frtWorkspaceAvailable:false},selectedUserId:target,actorUserId:actor})),/disabled/);
 assert.match(action(renderUserRoleManagement({verified:true,data:scoped,selectedUserId:target,actorUserId:actor,busy:true})),/disabled/);
});

test('FRT workspace source overrides legacy global role and preserves other modules',async()=>{
 let revision=0;
 const client=new UserRoleManagementClient({rpc:async(name)=>{
  if(name==='apsyntra_role_user_management_snapshot')return {...data,moduleAssignments:[
   {userId:target,moduleId:'fund-released-tracker',role:'GENERAL_MANAGER',enabled:true,updatedAt},
   {userId:target,moduleId:'tradelink',role:'User',enabled:true}]};
  if(name==='apsyntra_crm_platform_role_snapshot')return {workspaceId:workspace,adminVerified:true,roles:[]};
  if(name==='apsyntra_role_frt_workspace_snapshot')return {
   contract:'cp-urm-frt-workspace-v1',workspaceId:workspace,
   assignments:[{userId:target,moduleId:'fund-released-tracker',role:revision++?'FINANCE_APPROVER':'REQUESTOR',enabled:true,updatedAt}]};
  throw Object.assign(Error('missing RPC'),{status:404,code:'PGRST202'});
 }});
 for(const expected of ['REQUESTOR','FINANCE_APPROVER']){
  const snapshot=await client.snapshot(workspace,{includeFundTracker:true});
  assert.equal(snapshot.frtWorkspaceAvailable,true);
  const frt=snapshot.moduleAssignments.filter(a=>a.moduleId==='fund-released-tracker');
  assert.equal(frt.length,1);
  assert.equal(frt[0].role,expected);
  assert.equal(frt[0].scopedSource,true);
  assert.ok(snapshot.moduleAssignments.some(a=>a.moduleId==='tradelink'));
 }
});

test('FRT assignment and revision guard flow through workspace RPC',async()=>{
 const calls=[];
 const client=new UserRoleManagementClient({rpc:async(name,args)=>{
  calls.push({name,args});
  return {effective:true,workspaceId:workspace,targetUserId:target,
   moduleId:'fund-released-tracker',role:'REQUESTOR',enabled:true};
 }});
 await client.setFrtWorkspaceRole({workspaceId:workspace,userId:target,role:'REQUESTOR',enabled:true,expectedUpdatedAt:updatedAt});
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'apsyntra_role_frt_workspace_set');
 assert.equal(calls[0].args.p_expected_updated_at,updatedAt);
 await assert.rejects(()=>client.setFrtWorkspaceRole({workspaceId:workspace,userId:target,
  role:'not-valid',enabled:true}),/Invalid Fund Tracker/);
});

test('FRT batch planning permits multi-workspace target only with verified workspace contract',()=>{
 const scoped={...data,frtWorkspaceAvailable:true};
 const plan=planUserRoleBatch(scoped,{userIds:[target],actorUserId:actor,
  scope:'module',resourceId:'fund-released-tracker',role:'FINANCE_MANAGER',enabled:true});
 assert.equal(plan.operations.length,1);
 assert.throws(()=>planUserRoleBatch({...scoped,frtWorkspaceAvailable:false},{userIds:[target],
  actorUserId:actor,scope:'module',resourceId:'fund-released-tracker',
  role:'FINANCE_MANAGER',enabled:true}),/unavailable/);
});

test('migration derives signed operational FRT role from workspace membership with legacy fallback',()=>{
 const migration=readFileSync('supabase/migrations/20261118052000_cp_urm_scoped02a_frt_roles.sql','utf8');
 assert.match(migration,/CREATE OR REPLACE FUNCTION private\.frt_current_role/);
 assert.match(migration,/LEFT JOIN public\.frt_memberships m ON m\.workspace_id=p_workspace_id/);
 assert.match(migration,/ELSE a\.role END AS role/);
 assert.match(migration,/frt\.workspace_id = v_workspace/);
 assert.match(migration,/public\.apsyntra_role_require_scope\(p_workspace_id\)/);
 assert.match(migration,/EXISTS\(SELECT 1 FROM public\.apsyntra_role_bootstrap_identities/);
 assert.doesNotMatch(migration,/DROP POLICY|ALTER TABLE.*DISABLE ROW LEVEL SECURITY|TRUNCATE /i);
});
