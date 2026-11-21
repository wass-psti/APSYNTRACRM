import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderUserRoleManagement,UserRoleManagementClient} from '../user-role-management.js';
import {planUserRoleBatch} from '../user-role-batch.js';
const workspace='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const version='2026-11-18T00:00:00Z';
const profile={id:user,name:'Workspace Member',email:'member@example.invalid',protected:false,platformRole:'employee',activeWorkspaceCount:2};
const base={workspaceId:workspace,users:[profile],modules:[],moduleAssignments:[],
 boards:[],boardAssignments:[],crmPlatformRoles:[],adminVerified:true};
function button(html){
 const match=html.match(/<button[^>]*data-action="user-role-edit-module"[^>]*data-resource="tool-traceability"[^>]*>/);
 assert.ok(match,'Tool Traceability action is rendered');
 return match[0];
}
test('Tool Traceability stays enabled across repeated render and navigation when domain scope is available',()=>{
 const data={...base,toolTraceabilityWorkspaceAvailable:true};
 for(let i=0;i<3;i++){
  for(const accessSection of ['applications','boards','applications']){
   const html=renderUserRoleManagement({verified:true,data,selectedUserId:user,actorUserId:actor,accessSection});
   assert.doesNotMatch(button(html),/\bdisabled\b/);
  }
 }
 assert.match(renderUserRoleManagement({verified:true,data,selectedUserId:user,actorUserId:actor,busy:true}),
  /data-resource="tool-traceability"[^>]*disabled/);
 assert.match(button(renderUserRoleManagement({verified:true,data:{...data,toolTraceabilityWorkspaceAvailable:false},selectedUserId:user,actorUserId:actor})),/disabled/);
});
test('snapshot switches stale legacy global role to workspace authoritative role and repeats on refresh',async()=>{
 let count=0;
 const rpc=async(name)=>{
  if(name==='apsyntra_role_user_management_snapshot')return {...base,moduleAssignments:[{
   userId:user,moduleId:'tool-traceability',role:'ADMIN',enabled:true}]};
  if(name==='apsyntra_crm_platform_role_snapshot')return {workspaceId:workspace,adminVerified:true,roles:[]};
  if(name==='apsyntra_role_tooltrace_workspace_snapshot')return {
   contract:'cp-urm-tooltrace-workspace-v1',workspaceId:workspace,
   assignments:[{userId:user,moduleId:'tool-traceability',
    role:count++?'LOGISTICS':'VIEWER',enabled:true,updatedAt:version}]};
  throw Error('unexpected '+name);
 };
 const client=new UserRoleManagementClient({rpc});
 for(const expected of ['VIEWER','LOGISTICS']){
  const d=await client.snapshot(workspace);
  assert.equal(d.toolTraceabilityWorkspaceAvailable,true);
  assert.equal(d.moduleAssignments.find(a=>a.moduleId==='tool-traceability').role,expected);
  assert.doesNotMatch(button(renderUserRoleManagement({verified:true,data:d,
   selectedUserId:user,actorUserId:actor})),/disabled/);
 }
});
test('dedicated Tool Traceability mutation uses signed workspace RPC with optimistic version',async()=>{
 const calls=[];
 const client=new UserRoleManagementClient({rpc:async(name,params)=>{
  calls.push({name,params});
  return {effective:true,workspaceId:workspace,targetUserId:user,
   moduleId:'tool-traceability',role:'USER',enabled:true};
 }});
 await client.setToolTraceabilityWorkspaceRole({workspaceId:workspace,userId:user,
  role:'USER',enabled:true,expectedUpdatedAt:version});
 assert.equal(calls[0].name,'apsyntra_role_tooltrace_workspace_set');
 assert.equal(calls[0].params.p_expected_updated_at,version);
 await assert.rejects(()=>client.setToolTraceabilityWorkspaceRole({
  workspaceId:workspace,userId:user,role:'invalid',enabled:true}));
});
test('Tool Traceability multi-workspace batch uses scoped source and rejects missing contract',()=>{
 const d={...base,toolTraceabilityWorkspaceAvailable:true};
 const plan=planUserRoleBatch(d,{userIds:[user],actorUserId:actor,
  scope:'module',resourceId:'tool-traceability',role:'USER',enabled:true});
 assert.equal(plan.operations.length,1);
 assert.throws(()=>planUserRoleBatch({...d,toolTraceabilityWorkspaceAvailable:false},
  {userIds:[user],actorUserId:actor,scope:'module',
   resourceId:'tool-traceability',role:'USER',enabled:true}),/unavailable/);
});
test('role handler and effective access read path both use the same scoped Tool Traceability domain source',()=>{
 const sql=readFileSync('supabase/migrations/20261118032000_cp_urm_tooltrace_workspace_role_sync.sql','utf8');
 const effective=readFileSync('supabase/migrations/20261118020130_cp_urm_effective_access_source_parity_20261118.sql','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(sql,/FROM public\.tool_traceability_memberships/);
 assert.match(sql,/INSERT INTO public\.tool_traceability_memberships/);
 assert.match(sql,/p_expected_updated_at/);
 assert.match(effective,/traceability\.workspace_id = v_workspace/);
 assert.match(app,/writeNativeApplicationRoleAssignment/);
 const assignment=readFileSync('frontend/native-application-role-assignment.js','utf8');
 assert.match(assignment,/manager\.setToolTraceabilityWorkspaceRole/);
});
