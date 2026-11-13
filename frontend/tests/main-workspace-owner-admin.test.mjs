import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UserRoleManagementClient,renderUserRoleManagement} from '../user-role-management.js';
import {workspaceRelationFromCatalog,workspaceRelationLabel} from '../workspace-relation-context.js';

const migration=readFileSync('supabase/migrations/20261113110000_main_workspace_owner_crm_admin_20261113.sql','utf8');
const effectiveRoleSource=readFileSync('sql/cp-frt-sec06-crm-platform-role-cap.sql','utf8');
const adminMigration=readFileSync('supabase/migrations/20261112121235_cp_urm04b_crm_admin_capability_parity_20261112.sql','utf8');
const workspaceUi=readFileSync('frontend/workspace-ui.js','utf8');
const owner='10000000-0000-4000-8000-000000000001';
const main='20000000-0000-4000-8000-000000000001';
const workManagement='20000000-0000-4000-8000-000000000002';

test('Main Workspace CRM Admin is derived only from the signed personal-workspace mapping and owner relation',()=>{
 assert.match(migration,/private\.ws02_personal_workspaces personal/);
 assert.match(migration,/private\.ws01_member_roles owner_role/);
 assert.match(migration,/personal\.user_id=p_user/);
 assert.match(migration,/personal\.workspace_id=p_workspace/);
 assert.match(migration,/lower\(btrim\(owner_role\.relation\)\)='owner'/);
 assert.match(migration,/\) THEN 'admin'/);
 assert.match(migration,/public\.workspace_members wm ON wm\.user_id=p\.id/);
 assert.match(migration,/wm\.workspace_id=p_workspace/);
 assert.match(migration,/wm\.active/);
 assert.match(migration,/p\.status='active'/);
 const ownerBranch=migration.slice(migration.indexOf('WHEN EXISTS'),migration.indexOf("THEN 'admin'"));
 assert.doesNotMatch(ownerBranch,/email|bootstrap|platform_role|workspaces\.name/i);
});

test('owner precedence does not rewrite explicit role assignments or inherited identity',()=>{
 assert.match(migration,/ELSE coalesce\(/);
 assert.match(migration,/a\.role/);
 assert.match(migration,/CASE p\.platform_role/);
 assert.match(effectiveRoleSource,/CREATE OR REPLACE FUNCTION public\.apsyntra_crm_platform_role_snapshot/);
 assert.match(effectiveRoleSource,/public\.apsyntra_crm_effective_role\(p\.id,p_workspace_id\)/);
 assert.match(adminMigration,/public\.apsyntra_crm_effective_role\(p\.id,wm\.workspace_id\)='admin'/);
 assert.doesNotMatch(migration,/INSERT INTO public\.apsyntra_crm_platform_roles|UPDATE public\.profiles|UPDATE public\.workspace_members|INSERT INTO private\.ws02_personal_workspaces/i);
});

test('User Role Management requests and validates one exact workspace snapshot',async()=>{
 const calls=[];
 const api={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='apsyntra_role_user_management_snapshot')return {
   workspaceId:main,adminVerified:true,bootstrapVerified:false,
   roleManagementContract:'cp-rc03-workspace-scoped-mrh-v1',
   users:[
    {id:owner,name:'Main Workspace owner',email:'owner-main@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:2},
    {id:'10000000-0000-4000-8000-000000000002',name:'Invited member',email:'invited-main@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1}
   ],modules:[],moduleAssignments:[],boards:[],boardAssignments:[]
  };
  if(name==='apsyntra_crm_platform_role_snapshot')return {
   workspaceId:main,adminVerified:true,bootstrapVerified:false,roles:[
    {userId:owner,effectiveRole:'admin',assignedRole:null,inheritedRole:'employee'}
   ]
  };
  throw Error('Unexpected RPC '+name);
 }};
 const snapshot=await new UserRoleManagementClient(api).snapshot(main);
 assert.equal(snapshot.workspaceId,main);
 assert.deepEqual(snapshot.users.map(u=>u.email),['owner-main@example.invalid','invited-main@example.invalid']);
 assert.deepEqual(calls.map(c=>c[0]),['apsyntra_role_user_management_snapshot','apsyntra_crm_platform_role_snapshot']);
 assert.equal(calls[0][1].p_workspace_id,main);
 const html=renderUserRoleManagement({verified:true,data:snapshot,selectedUserId:owner});
 assert.match(html,/owner-main@example\.invalid/);
 assert.match(html,/invited-main@example\.invalid/);
 assert.doesNotMatch(html,/work-management-only@example\.invalid/);
 assert.doesNotMatch(html,/<option[^>]*>[^<]*(Main Workspace owner|Invited member)/);
});

test('a response for Work Management cannot be reused as the Main Workspace directory',async()=>{
 const api={rpc:async(name)=>name==='apsyntra_role_user_management_snapshot'?{
  workspaceId:workManagement,adminVerified:true,bootstrapVerified:false,
  users:[],modules:[],moduleAssignments:[],boards:[],boardAssignments:[]
 }:{workspaceId:workManagement,adminVerified:true,bootstrapVerified:false,roles:[]}};
 await assert.rejects(()=>new UserRoleManagementClient(api).snapshot(main),/Invalid server-authorized role management result/);
});

test('workspace invitation history is rendered only for its exact signed workspace',()=>{
 assert.match(workspaceUi,/listing\.workspaceId!==row\.id/);
 assert.match(workspaceUi,/No invitations are recorded for this workspace/);
});

test('Main Workspace owner relation remains distinct from Work Management membership labels',()=>{
 const catalog={status:'SIGNED_MEMBER_DISCOVERY',rows:[
  {id:main,active:true,relation:'owner',verifiedScope:'SIGNED_MEMBER_RPC'},
  {id:workManagement,active:false,relation:'member',verifiedScope:'SIGNED_MEMBER_RPC'}
 ]};
 const context={user_id:owner,workspace_id:main,profile:{platform_role:'employee'}};
 const relation=workspaceRelationFromCatalog(catalog,{userId:owner,workspaceId:main});
 assert.equal(relation.relation,'owner');
 assert.equal(workspaceRelationLabel(relation,context),'Workspace owner');
 assert.equal(workspaceRelationLabel(relation,{...context,workspace_id:workManagement}),'Workspace relationship unverified');
});
