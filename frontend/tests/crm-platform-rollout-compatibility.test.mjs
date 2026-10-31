import test from 'node:test';
import assert from 'node:assert/strict';
import {UserRoleManagementClient,renderUserRoleManagement} from '../user-role-management.js';

const W='00000000-0000-4000-8000-000000000001';
const U='11111111-1111-4111-8111-111111111111';
const legacy=()=>({
 workspaceId:W,bootstrapVerified:true,
 users:[{id:U,name:'Existing member',email:'member@example.invalid',platformRole:'employee',protected:false}],
 modules:[],moduleAssignments:[],boards:[{id:W,name:'Existing board'}],boardAssignments:[]
});
const error=(status,code)=>Object.assign(new Error('Request denied'),{status,code});

test('only exact PGRST202 missing RPC preserves central module and board administrator screen',async()=>{
 const calls=[];
 const api={rpc:async(name)=>{
  calls.push(name);
  if(name==='apsyntra_role_user_management_snapshot')return legacy();
  if(name==='apsyntra_crm_platform_role_snapshot')throw error(404,'PGRST202');
  throw Error('Unexpected RPC: '+name);
 }};
 const data=await new UserRoleManagementClient(api).snapshot(W);
 assert.equal(data.crmPlatformUnavailable,true);
 assert.deepEqual(data.crmPlatformRoles,[]);
 const html=renderUserRoleManagement({verified:true,data,selectedUserId:U});
 assert.match(html,/backend migration is not installed/);
 assert.match(html,/Unavailable — backend migration pending/);
 assert.match(html,/data-action="user-role-edit-crm-platform"[^>]* disabled/);
 assert.match(html,/Application-specific assignments/);
 assert.match(html,/Individual board access/);
 assert.deepEqual(calls,['apsyntra_role_user_management_snapshot','apsyntra_crm_platform_role_snapshot']);
});

test('unauthorized legacy bootstrap snapshot cannot call or fall back to CRM snapshot',async()=>{
 const calls=[];
 const c=new UserRoleManagementClient({rpc:async(name)=>{
  calls.push(name);throw error(403,'42501');
 }});
 await assert.rejects(()=>c.snapshot(W),e=>e.status===403);
 assert.deepEqual(calls,['apsyntra_role_user_management_snapshot']);
});

test('a PGRST202 error is not an authorization fallback when legacy snapshot is invalid',async()=>{
 const c=new UserRoleManagementClient({rpc:async(name)=>{
  if(name==='apsyntra_role_user_management_snapshot')return {...legacy(),bootstrapVerified:false};
  return {workspaceId:W,bootstrapVerified:true,roles:[]};
 }});
 await assert.rejects(()=>c.snapshot(W),/Invalid server-authorized/);
});

test('non-missing backend failure is not reported as a disabled CRM feature',async()=>{
 for(const [status,code] of [[401,'JWT'],[403,'42501'],[404,'PGRST205'],[500,'PGRST500'],[0,'']]){
  const c=new UserRoleManagementClient({rpc:async(name)=>{
   if(name==='apsyntra_role_user_management_snapshot')return legacy();
   throw error(status,code);
  }});
  await assert.rejects(()=>c.snapshot(W),e=>e.status===status&&e.code===code);
 }
});

test('valid signed CRM data remains strict, no phantom role or privilege assignment',async()=>{
 const c=new UserRoleManagementClient({rpc:async(name)=>{
  if(name==='apsyntra_role_user_management_snapshot')return legacy();
  return {workspaceId:W,bootstrapVerified:true,roles:[{
   userId:U,inheritedRole:'employee',effectiveRole:'viewer',
   assignedRole:'viewer',updatedAt:'2026-10-31T00:00:00Z'
  }]};
 }});
 const data=await c.snapshot(W);
 assert.equal(data.crmPlatformUnavailable,false);
 assert.equal(data.crmPlatformRoles[0].assignedRole,'viewer');
 const html=renderUserRoleManagement({verified:true,data,selectedUserId:U});
 assert.doesNotMatch(html,/backend migration is not installed/);
 assert.match(html,/data-action="user-role-edit-crm-platform"/);
});

test('a missing RPC does not allow a local mutation to be represented as successful',async()=>{
 const calls=[];
 const c=new UserRoleManagementClient({rpc:async(name)=>{
  calls.push(name);throw error(404,'PGRST202');
 }});
 await assert.rejects(()=>c.setCrmPlatformRole({
  workspaceId:W,userId:U,role:'admin'
 }),e=>e.status===404);
 assert.deepEqual(calls,['apsyntra_crm_platform_role_set']);
});
