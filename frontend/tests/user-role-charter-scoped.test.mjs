import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODULE_ROLE_OPTIONS,UserRoleManagementClient,renderUserRoleManagement,effectiveModuleRoleLabel,defaultModuleRoleForAssignment} from '../user-role-management.js';
import {planUserRoleBatch} from '../user-role-batch.js';

const workspace='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const updatedAt='2026-11-18T05:00:00Z';
const user={id:member,name:'Member',email:'member@example.invalid',protected:false,activeWorkspaceCount:2};
const base={workspaceId:workspace,users:[user],modules:[],moduleAssignments:[],
 boards:[],boardAssignments:[],crmPlatformRoles:[],adminVerified:true};
const button=(html)=>html.match(/<button[^>]*data-action="user-role-edit-module"[^>]*data-resource="charter-navigator"[^>]*>/)?.[0];
test('Charter selector uses real operational roles, never fictitious Viewer or Supervisor',()=>{
 assert.deepEqual(MODULE_ROLE_OPTIONS['charter-navigator'],['admin','user']);
});
test('Charter remains enabled for multi-workspace member only with matching source contract',()=>{
 const html=renderUserRoleManagement({verified:true,data:{...base,charterWorkspaceAvailable:true},
  selectedUserId:member,actorUserId:actor});
 assert.ok(button(html));
 assert.doesNotMatch(button(html),/disabled/);
 const blocked=renderUserRoleManagement({verified:true,data:{...base,charterWorkspaceAvailable:false},
  selectedUserId:member,actorUserId:actor});
 assert.match(button(blocked),/disabled/);
});
test('signed Charter source takes precedence over stale global role and is refreshed',async()=>{
 let i=0;
 const api={rpc:async(name)=>{
  if(name==='apsyntra_role_user_management_snapshot')return {...base,moduleAssignments:[
   {userId:member,moduleId:'charter-navigator',role:'Employee',enabled:true,updatedAt}]};
  if(name==='apsyntra_crm_platform_role_snapshot')return {workspaceId:workspace,adminVerified:true,roles:[]};
  if(name==='apsyntra_role_charter_workspace_snapshot')return {
   contract:'cp-urm-charter-workspace-v1',workspaceId:workspace,
   assignments:[{userId:member,moduleId:'charter-navigator',role:i++?'user':'admin',
    enabled:true,updatedAt}]};
  throw Object.assign(Error('missing RPC'),{status:404,code:'PGRST202'});
 }};
 const client=new UserRoleManagementClient(api);
 for(const role of ['admin','user']){
  const snapshot=await client.snapshot(workspace,{includeCharter:true});
  assert.equal(snapshot.charterWorkspaceAvailable,true);
  assert.deepEqual(snapshot.moduleAssignments.filter(a=>a.moduleId==='charter-navigator').map(a=>a.role),[role]);
  assert.equal(snapshot.moduleAssignments.find(a=>a.moduleId==='charter-navigator').scopedSource,true);
 }
});
test('Charter setter passes revision and rejects unsupported role before hitting backend',async()=>{
 const calls=[];
 const client=new UserRoleManagementClient({rpc:async(name,args)=>{
  calls.push({name,args});
  return {effective:true,workspaceId:workspace,targetUserId:member,moduleId:'charter-navigator',
   role:'user',enabled:true};
 }});
 await client.setCharterWorkspaceRole({workspaceId:workspace,userId:member,
  role:'user',enabled:true,expectedUpdatedAt:updatedAt});
 assert.equal(calls[0].name,'apsyntra_role_charter_workspace_set');
 assert.equal(calls[0].args.p_expected_updated_at,updatedAt);
 await assert.rejects(()=>client.setCharterWorkspaceRole({workspaceId:workspace,userId:member,
  role:'Viewer',enabled:true}),/Invalid Charter/);
 assert.equal(calls.length,1);
});
test('multi-workspace Charter batch planning uses actual role source',()=>{
 const scoped={...base,charterWorkspaceAvailable:true};
 const plan=planUserRoleBatch(scoped,{scope:'module',resourceId:'charter-navigator',
  role:'user',enabled:true,userIds:[member],actorUserId:actor});
 assert.equal(plan.operations.length,1);
 assert.throws(()=>planUserRoleBatch({...scoped,charterWorkspaceAvailable:false},{
  scope:'module',resourceId:'charter-navigator',role:'user',enabled:true,
  userIds:[member],actorUserId:actor}),/unavailable/);
});
test('migration preserves domain and bootstrap checks, and syncs TimeTracker directory',()=>{
 const source=readFileSync('supabase/migrations/20261118063000_cp_urm_scoped02c_charter_timetracker.sql','utf8');
 assert.match(source,/apsyntra_charter_current_role/);
 assert.match(source,/charter_dispatch/);
 assert.match(source,/timetracker_team_directory_snapshot/);
 assert.match(source,/apsyntra_role_require_bootstrap_scope/);
 assert.match(source,/apsyntra_crm_my_effective_access/);
 assert.match(source,/wm_auth_access_context/);
 assert.doesNotMatch(source,/DISABLE ROW LEVEL SECURITY|TRUNCATE|DROP POLICY/i);
});

test('unsupported legacy Charter role is shown as ineffective and never offered for revoke',()=>{
 const legacy={userId:member,moduleId:'charter-navigator',role:'Employee',enabled:true,updatedAt};
 const html=renderUserRoleManagement({verified:true,
  data:{...base,charterWorkspaceAvailable:true,moduleAssignments:[legacy]},
  selectedUserId:member,actorUserId:actor});
 const row=html.match(/<tr><td><strong>Charter Navigator<\/strong><\/td>[\s\S]*?<\/tr>/)?.[0]||'';
 assert.match(row,/Unsupported legacy role: Employee \(not effective\)/);
 assert.match(row,/data-action="user-role-edit-module"[^>]*data-resource="charter-navigator"/);
 assert.doesNotMatch(row,/data-action="user-role-revoke-module"/);
 assert.equal(effectiveModuleRoleLabel(legacy,MODULE_ROLE_OPTIONS['charter-navigator']),
  'Unsupported legacy role: Employee (not effective)');
 assert.equal(defaultModuleRoleForAssignment('charter-navigator',legacy,
  MODULE_ROLE_OPTIONS['charter-navigator']),'user');
 assert.equal(defaultModuleRoleForAssignment('charter-navigator',
  {...legacy,role:'admin'},MODULE_ROLE_OPTIONS['charter-navigator']),'admin');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/defaultModuleRoleForAssignment\(resourceId,record,options\)/);
});
