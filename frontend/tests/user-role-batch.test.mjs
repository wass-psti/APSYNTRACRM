import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planUserRoleBatch} from '../user-role-batch.js';
import {renderUserRoleManagement} from '../user-role-management.js';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const owner='33333333-3333-4333-8333-333333333333';
const board='44444444-4444-4444-8444-444444444444';
const data={
 users:[{id:a,name:'Example A',email:'a@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1},
  {id:b,name:'Example B',email:'b@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1},
  {id:owner,name:'Protected admin',email:'protected@example.invalid',protected:true,activeWorkspaceCount:1}],
 boards:[{id:board,name:'Shared board'}],
 moduleAssignments:[{userId:a,moduleId:'tradelink',role:'User',enabled:true,updatedAt:'2026-11-13T01:00:00Z'}],
 boardAssignments:[{userId:a,boardId:board,role:'viewer',updatedAt:'2026-11-13T01:30:00Z'}],
 crmPlatformRoles:[],workspaceScopedMrhAvailable:true,crmPlatformUnavailable:false
};
test('batch plan deduplicates accounts and skips unchanged roles without inventing writes',()=>{
 const plan=planUserRoleBatch(data,{userIds:[a,a,b],scope:'module',resourceId:'tradelink',role:'User',enabled:true});
 assert.equal(plan.selectedCount,2);
 assert.deepEqual(plan.unchanged,[a]);
 assert.equal(plan.operations.length,1);
 assert.deepEqual(plan.operations[0],{userId:b,scope:'module',resourceId:'tradelink',role:'User',enabled:true,expectedUpdatedAt:null});
});
test('board batch revocation recognizes real board memberships without an enabled flag',()=>{
 const plan=planUserRoleBatch(data,{userIds:[a,b],scope:'board',resourceId:board,role:'viewer',enabled:false});
 assert.deepEqual(plan.unchanged,[b]);
 assert.deepEqual(plan.operations,[{userId:a,scope:'board',resourceId:board,role:'viewer',enabled:false,
  expectedUpdatedAt:'2026-11-13T01:30:00Z'}]);
});
test('rejects protected, self, unknown, owner and unsafe workspace targets before writes',()=>{
 const args={scope:'module',resourceId:'tradelink',role:'User',enabled:true};
 for(const userId of [owner,'no-such-user'])
  assert.throws(()=>planUserRoleBatch(data,{...args,userIds:[a,userId]}),/protected, self, or unavailable/);
 assert.throws(()=>planUserRoleBatch(data,{...args,userIds:[a],actorUserId:a}),/protected, self/);
 assert.throws(()=>planUserRoleBatch({...data,users:data.users.map(u=>u.id===b?{...u,activeWorkspaceCount:2}:u)},
  {...args,userIds:[b]}),/not workspace-isolated/);
 assert.throws(()=>planUserRoleBatch(data,{...args,userIds:[a],resourceId:'toolbox-issues',role:'employee'}),
  /Toolbox Issues source membership/);
 assert.throws(()=>planUserRoleBatch({...data,boardAssignments:[...data.boardAssignments,
  {userId:b,boardId:board,role:'owner'}]},{scope:'board',userIds:[b],resourceId:board,role:'editor'}),
  /Protected board owner/);
 assert.throws(()=>planUserRoleBatch(data,{...args,userIds:[]}),/Select at least one/);
});
test('MRH requires scoped contract and accepts mult-workspace target only when verified',()=>{
 const multi={...data,users:data.users.map(u=>u.id===b?{...u,activeWorkspaceCount:2}:u)};
 const args={scope:'module',userIds:[b],resourceId:'material-request-hub',role:'REQUESTOR'};
 assert.equal(planUserRoleBatch(multi,args).operations.length,1);
 assert.throws(()=>planUserRoleBatch({...multi,workspaceScopedMrhAvailable:false},args),/unavailable/);
});
test('batch and individual workflows are distinct; no role controls offered to protected members',()=>{
 const individual=renderUserRoleManagement({verified:true,data,selectedUserId:a});
 assert.match(individual,/data-action="user-role-mode" data-mode="batch"/);
 assert.match(individual,/data-action="user-role-edit-board"/);
 assert.doesNotMatch(individual,/data-action="user-role-batch-review"/);
 const batch=renderUserRoleManagement({verified:true,data,selectedUserId:a,batchMode:true,
   batchSelected:[b],batchScope:'board',batchResource:board,batchRole:'editor'});
 assert.match(batch,/data-action="user-role-mode" data-mode="individual"/);
 assert.match(batch,/1 selected of 2 available workspace members/);
 assert.match(batch,/data-action="user-role-batch-review"/);
 assert.match(batch,/value="editor" selected/);
 assert.doesNotMatch(batch,/protected@example\.invalid/);
 assert.doesNotMatch(batch,/data-action="user-role-edit-board"/);
 assert.match(batch,/value="22222222-2222-4222-8222-222222222222" checked/);
 const denied=renderUserRoleManagement({verified:false,data,batchMode:true});
 assert.doesNotMatch(denied,/a@example.invalid|data-action="user-role-batch-review"/);
});
test('batch writes are directed through existing checked RPC; no new privileges or typed confirmation',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const block=app.slice(app.indexOf("case 'user-role-batch-review':"),app.indexOf("case 'user-role-section':"));
 assert.match(block,/planUserRoleBatch\(snapshot/);
 assert.match(block,/auth\.getVerifiedUser\(\)/);
 assert.match(block,/roleConfig\.adminVerified\(\)/);
 assert.match(block,/userRoleManager\.snapshot\(ctx\.workspace_id\)/);
 assert.match(block,/userRoleManager\.mutate\(\{workspaceId:ctx\.workspace_id,\.\.\.op\}\)/);
 assert.match(block,/expectedUpdatedAt/);
 assert.match(block,/if\(failed\)/);
 assert.match(block,/hideModal\(\)/);
 assert.doesNotMatch(block,/fd\.get\('ack'\)|Type APPLY/);
 const css=readFileSync('frontend/user-role-experience.css','utf8');
 assert.match(css,/CP-URM-BATCH-01/);
 assert.match(css,/\.user-role-batch-user-list/);
});
