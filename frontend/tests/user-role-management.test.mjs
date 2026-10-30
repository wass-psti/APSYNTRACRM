import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ROLE_OPTIONS,renderUserRoleManagement,UserRoleManagementClient} from '../user-role-management.js';
const w='00000000-0000-4000-8000-000000000001',u='11111111-1111-4111-8111-111111111111';
test('catalog permits all twelve distinct modules without overriding specialized role values',()=>{
 assert.equal(Object.keys(MODULE_ROLE_OPTIONS).length,12);
 assert.ok(MODULE_ROLE_OPTIONS['time-tracker'].includes('OJT'));
 assert.ok(MODULE_ROLE_OPTIONS['tool-traceability'].includes('LOGISTICS'));
});
test('all user rows are escaped and bootstrap users are protected',()=>{
 const data={workspaceId:w,bootstrapVerified:true,
 users:[{id:u,name:'<script>X</script>',email:'x@example.com',platformRole:'admin_general_manager',protected:true}],
 modules:[],moduleAssignments:[],boardAssignments:[],boards:[{id:w,name:'Board'}]};
 const h=renderUserRoleManagement({verified:true,data,selectedUserId:u});
 assert.doesNotMatch(h,/<script>/);
 assert.match(h,/Protected administrator/);
 assert.match(h,/disabled/);
 assert.doesNotMatch(renderUserRoleManagement({verified:false,data}),/x@example.com/);
});
test('client rejects unsupported privilege escalation and toolbox unverified mapping',async()=>{
 const c=new UserRoleManagementClient({rpc:async()=>{throw Error('should not call');}});
 await assert.rejects(()=>c.mutate({workspaceId:w,userId:u,scope:'module',resourceId:'time-tracker',role:'bootstrap',enabled:true}));
 await assert.rejects(()=>c.mutate({workspaceId:w,userId:u,scope:'board',resourceId:w,role:'owner',enabled:true}));
 await assert.rejects(()=>c.mutate({workspaceId:w,userId:u,scope:'module',resourceId:'toolbox-issues',role:'employee',enabled:true}));
});
test('client delegates role operations to one authoritative RPC and verifies response shape',async()=>{
 const calls=[];
 const c=new UserRoleManagementClient({rpc:async(name,body)=>{
  calls.push([name,body]);return{effective:true,workspaceId:w,targetUserId:u,scope:'module',resourceId:'time-tracker'};
 }});
 await c.mutate({workspaceId:w,userId:u,scope:'module',resourceId:'time-tracker',role:'Employee',enabled:false});
 assert.deepEqual(calls.map(x=>x[0]),['apsyntra_role_manage_user_access']);
 assert.equal(calls[0][1].p_enabled,false);
});
