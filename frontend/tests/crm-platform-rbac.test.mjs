import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 UserRoleManagementClient,renderUserRoleManagement,APSYNTRA_CRM_PLATFORM_ROLES
} from '../user-role-management.js';
import {renderRoleConfiguration} from '../role-configuration-ui.js';

const workspace='00000000-0000-4000-8000-000000000001';
const target='11111111-1111-4111-8111-111111111111';
const result=(role='viewer')=>({
 workspaceId:workspace,bootstrapVerified:true,
 users:[{id:target,name:'Existing Account',email:'member@example.org',platformRole:'employee',protected:false}],
 modules:[],moduleAssignments:[],boards:[],boardAssignments:[],
 crmPlatformRoles:[{userId:target,inheritedRole:'employee',effectiveRole:role,
  assignedRole:role,updatedAt:'2026-10-30T00:00:00Z'}]
});

test('CRM platform hierarchy is distinct from module and board assignments',()=>{
 assert.deepEqual(APSYNTRA_CRM_PLATFORM_ROLES,['admin','supervisor','employee','viewer']);
 const html=renderUserRoleManagement({verified:true,data:result(),selectedUserId:target});
 assert.match(html,/APSYNTRA CRM Platform Role/);
 assert.match(html,/Viewer/);
 assert.match(html,/user-role-edit-crm-platform/);
 assert.match(html,/user-role-revert-crm-platform/);
 assert.match(html,/Application-specific assignments/);
 assert.match(html,/Individual board access/);
 assert.match(renderRoleConfiguration({verified:true,data:{users:[],boards:[],roles:[],proposals:[],audit:[]}}),
  /APSYNTRA CRM platform authorization/);
});

test('bootstrap account cannot be modified and unauthorized panel hides target',()=>{
 const data=result();data.users[0].protected=true;data.users[0].platformRole='admin_general_manager';
 const html=renderUserRoleManagement({verified:true,data});
 assert.match(html,/Protected administrator/);
 assert.match(html,/user-role-edit-crm-platform[^>]+disabled/);
 assert.doesNotMatch(renderUserRoleManagement({verified:false,data}),/member@example.org/);
});

test('single central signed client queries authoritative platform and existing role snapshots',async()=>{
 const rpc=[];
 const client=new UserRoleManagementClient({rpc:async(name)=>{
  rpc.push(name);
  if(name==='apsyntra_crm_platform_role_snapshot')return {
   workspaceId:workspace,bootstrapVerified:true,roles:result().crmPlatformRoles};
  return {workspaceId:workspace,bootstrapVerified:true,users:result().users,modules:[],
   moduleAssignments:[],boards:[],boardAssignments:[]};
 }});
 const snapshot=await client.snapshot(workspace);
 assert.equal(snapshot.crmPlatformRoles[0].assignedRole,'viewer');
 assert.deepEqual(rpc.sort(),['apsyntra_crm_platform_role_snapshot',
  'apsyntra_role_user_management_snapshot']);
});

test('invalid or untrusted CRM role snapshots reject before use',async()=>{
 const client=new UserRoleManagementClient({rpc:async(name)=>{
  if(name==='apsyntra_crm_platform_role_snapshot')
   return {workspaceId:workspace,bootstrapVerified:false,roles:[]};
  return {workspaceId:workspace,bootstrapVerified:true,users:[],modules:[],
   moduleAssignments:[],boards:[],boardAssignments:[]};
 }});
 await assert.rejects(()=>client.snapshot(workspace),/Invalid server-authorized/);
});

test('CRM platform role create/change/revert uses only guarded RPC and CAS revision',async()=>{
 const calls=[];
 const client=new UserRoleManagementClient({rpc:async(name,args)=>{
  calls.push([name,args]);
  return {effective:true,workspaceId:workspace,targetUserId:target,
   scope:'crm-platform',effectiveRole:'viewer'};
 }});
 await client.setCrmPlatformRole({workspaceId:workspace,userId:target,role:'viewer'});
 await client.setCrmPlatformRole({workspaceId:workspace,userId:target,role:null,
   expectedUpdatedAt:'2026-10-30T00:00:00Z'});
 assert.deepEqual(calls.map(([name])=>name),
  ['apsyntra_crm_platform_role_set','apsyntra_crm_platform_role_set']);
 assert.deepEqual(calls.map(([,args])=>args.p_role),['viewer',null]);
 assert.equal(calls[1][1].p_expected_updated_at,'2026-10-30T00:00:00Z');
});

test('invalid role, invalid user, stale clock and role escalation text never reach backend',async()=>{
 const client=new UserRoleManagementClient({rpc:async()=>{throw Error('should not call');}});
 await assert.rejects(()=>client.setCrmPlatformRole({
  workspaceId:workspace,userId:target,role:'bootstrap'}),/Invalid CRM/);
 await assert.rejects(()=>client.setCrmPlatformRole({
  workspaceId:workspace,userId:target,role:'admin_general_manager'}),/Invalid CRM/);
 await assert.rejects(()=>client.setCrmPlatformRole({
  workspaceId:workspace,userId:'not-uuid',role:'viewer'}),/Invalid CRM/);
 await assert.rejects(()=>client.setCrmPlatformRole({
  workspaceId:workspace,userId:target,role:'viewer',expectedUpdatedAt:'not-date'}),/Invalid CRM/);
});

test('authoritative backend reuses Auth bootstrap guard, role audit and workspace-scoped table',()=>{
 const migration=readFileSync('sql/cp-frt-sec06-crm-platform-role-cap.sql','utf8');
 const frt=readFileSync('sql/cp-frt-sec06-domain-role-ceiling.sql','utf8');
 for(const required of ['public.apsyntra_role_require_scope(p_workspace_id)',
  'FORCE ROW LEVEL SECURITY','REVOKE ALL ON TABLE public.apsyntra_crm_platform_roles',
  'public.apsyntra_role_bootstrap_identities',
  'public.apsyntra_role_change_requests',
  'public.apsyntra_role_change_audit',
  "p_role NOT IN ('admin','supervisor','employee','viewer')",
  'Stale CRM platform role assignment',
  'public.work_board_access','public.has_module_access','public.module_role_for']){
  assert.ok(migration.includes(required),'missing contract: '+required);
 }
 assert.match(frt,/CREATE OR REPLACE FUNCTION private\.frt_current_role/);
 assert.match(frt,/apsyntra_crm_explicit_role/);
 assert.match(frt,/apsyntra_crm_module_role_rank/);
 assert.doesNotMatch(migration,/UPDATE public\.profiles|DELETE FROM auth\.users|TRUNCATE/i);
 assert.doesNotMatch(frt,/UPDATE public\.frt_requests|DELETE FROM public\.frt_requests/);
});

test('CRM platform tier is an effective ceiling only for explicit overrides; legacy owner remains unchanged',()=>{
 const sql=readFileSync('sql/cp-frt-sec06-crm-platform-role-cap.sql','utf8');
 assert.match(sql,/A missing override preserves existing legacy/);
 assert.match(sql,/IF cap='viewer' AND p_required IN \('edit','manage'\) THEN RETURN false/);
 assert.match(sql,/IF cap IN \('employee','supervisor'\) AND p_required='manage'/);
 assert.match(sql,/public\.apsyntra_crm_module_role_rank/);
 assert.match(sql,/CURRENT_WORKSPACE_ID/i);
});

test('frontend writes only after verified Auth/bootstrap context and explicit confirmation',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'user-role-edit-crm-platform'/);
 assert.match(app,/case 'user-role-revert-crm-platform'/);
 assert.match(app,/APPLY CRM ROLE/);
 assert.match(app,/await roleConfig\.bootstrapVerified\(\)/);
 assert.match(app,/await auth\.getVerifiedUser\(\)/);
 assert.match(app,/await userRoleManager\.setCrmPlatformRole/);
});
