import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planUserRoleBatch,unverifiedBatchRoleAssignments} from '../user-role-batch.js';
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
  {...args,userIds:[b]}),/not workspace-isolated|workspace-scoped application role management is unavailable/i);
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
 assert.match(block,/userRoleManager\.snapshot\(ctx\.workspace_id,\{includeFuelTrans:resourceId==='fueltrans',includeFundTracker:resourceId==='fund-released-tracker',includeScopedSix:SCOPED_SIX_MODULE_IDS\.includes\(resourceId\),includeCharter:resourceId==='charter-navigator'\}\)/);
 assert.match(block,/userRoleManager\.mutate\(\{workspaceId:ctx\.workspace_id,\.\.\.op\}\)/);
 assert.match(block,/expectedUpdatedAt/);
 assert.match(block,/if\(failed\)/);
 assert.match(block,/hideModal\(\)/);
 assert.doesNotMatch(block,/fd\.get\('ack'\)|Type APPLY/);
 const css=readFileSync('frontend/user-role-experience.css','utf8');
 assert.match(css,/CP-URM-BATCH-01/);
 assert.match(css,/\.user-role-batch-user-list/);
});

test('Toolbox Issues first-time role assignment is valid for workspace-scoped multi-workspace member',()=>{
 const multi={...data,users:data.users.map(u=>u.id===b?{...u,activeWorkspaceCount:2}:u)};
 const plan=planUserRoleBatch(multi,{userIds:[b],scope:'module',
  resourceId:'toolbox-issues',role:'employee',enabled:true});
 assert.equal(plan.operations.length,1);
 assert.equal(plan.operations[0].expectedUpdatedAt,null);
});
test('batch must verify refreshed assignments before announcing success',()=>{
 const ops=[
  {userId:a,scope:'module',resourceId:'tradelink',role:'User',enabled:true},
  {userId:b,scope:'board',resourceId:board,role:'viewer',enabled:true}
 ];
 assert.deepEqual(unverifiedBatchRoleAssignments(data,ops),[b]);
 const confirmed={...data,boardAssignments:[...data.boardAssignments,
  {userId:b,boardId:board,role:'viewer'}]};
 assert.deepEqual(unverifiedBatchRoleAssignments(confirmed,ops),[]);
 assert.deepEqual(unverifiedBatchRoleAssignments(confirmed,[
  {userId:a,scope:'board',resourceId:board,role:'viewer',enabled:false}
 ]),[a]);
 assert.throws(()=>unverifiedBatchRoleAssignments(null,ops),/unavailable/);
 const app=readFileSync('frontend/app.js','utf8');
 const block=app.slice(app.indexOf("case 'user-role-batch-review':"),app.indexOf("case 'user-role-section':"));
 assert.match(block,/unverifiedBatchRoleAssignments\(state\.userRoleData,plan\.operations\)/);
 assert.match(block,/verifiedReadback=true/);
});

test('partial batch reports verified persisted prefix, not raw RPC acknowledgement counts',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const block=app.slice(app.indexOf("case 'user-role-batch-review':"),app.indexOf("case 'user-role-section':"));
 assert.ok(block.includes('unverifiedBatchRoleAssignments(state.userRoleData,plan.operations.slice(0,completed)).length'));
 assert.ok(block.includes('const persisted=completed-unverified'));
 assert.ok(block.includes('write acknowledgement(s) remain unverified'));
 assert.ok(!block.includes('changes applied. Stopped on failure'));
 assert.ok(block.includes('verified in authoritative assignment readback'));
});

test('native application batch plans multiple apps across multiple users and records per-pair outcomes',async()=>{
 const {planNativeApplicationBatch}=await import('../user-role-batch.js');
 const expanded={...data,
  users:data.users.map(user=>user.id===owner?user:{...user,activeWorkspaceCount:1}),
  moduleAssignments:[
   ...data.moduleAssignments,
   {userId:b,moduleId:'time-tracker',role:'Employee',enabled:true,updatedAt:'2026-11-13T02:00:00Z'}
  ]};
 const plan=planNativeApplicationBatch(expanded,{
  userIds:[a,b],actorUserId:owner,enabled:true,
  applications:[
   {moduleId:'tradelink',role:'User'},
   {moduleId:'time-tracker',role:'Supervisor'}
  ]
 });
 assert.equal(plan.selectedCount,2);
 assert.equal(plan.applicationCount,2);
 assert.equal(plan.operations.length,3);
 assert.deepEqual(plan.unchanged,[{userId:a,moduleId:'tradelink'}]);
 assert.deepEqual(plan.skipped,[]);
 assert.ok(plan.operations.some(op=>op.userId===b&&op.resourceId==='tradelink'));
 assert.ok(plan.operations.some(op=>op.userId===a&&op.resourceId==='time-tracker'));
 assert.ok(plan.operations.some(op=>op.userId===b&&op.resourceId==='time-tracker'&&op.role==='Supervisor'));
});

test('native application batch isolates unsupported workspace scopes and preserves valid app operations',async()=>{
 const {planNativeApplicationBatch}=await import('../user-role-batch.js');
 const expanded={...data,
  users:data.users.map(user=>user.id===b?{...user,activeWorkspaceCount:2}:user),
  moduleAssignments:[],
  scopedSixAvailable:false,frtWorkspaceAvailable:false,
  toolTraceabilityWorkspaceAvailable:false,charterWorkspaceAvailable:false,
  workspaceScopedMrhAvailable:false
 };
 const plan=planNativeApplicationBatch(expanded,{
  userIds:[a,b],actorUserId:owner,enabled:true,
  applications:[
   {moduleId:'tradelink',role:'User'},
   {moduleId:'toolbox-issues',role:'employee'}
  ]
 });
 assert.equal(plan.operations.length,3);
 assert.equal(plan.skipped.length,1);
 assert.equal(plan.skipped[0].userId,b);
 assert.equal(plan.skipped[0].moduleId,'tradelink');
 assert.match(plan.skipped[0].reason,/Workspace-scoped application role management is unavailable/);
 assert.ok(plan.operations.some(op=>op.userId===b&&op.resourceId==='toolbox-issues'));
});

test('native application batch supports multi-app revocation and rejects duplicate or missing app selections',async()=>{
 const {planNativeApplicationBatch}=await import('../user-role-batch.js');
 const expanded={...data,moduleAssignments:[
  ...data.moduleAssignments,
  {userId:b,moduleId:'time-tracker',role:'Employee',enabled:true,updatedAt:null}
 ]};
 const plan=planNativeApplicationBatch(expanded,{
  userIds:[a,b],actorUserId:owner,enabled:false,
  applications:[
   {moduleId:'tradelink',role:'User'},
   {moduleId:'time-tracker',role:'Employee'}
  ]
 });
 assert.equal(plan.operations.length,2);
 assert.equal(plan.unchanged.length,2);
 assert.ok(plan.operations.every(op=>op.enabled===false));
 assert.throws(()=>planNativeApplicationBatch(expanded,{userIds:[a],applications:[]}),/Select at least one native application/);
 assert.throws(()=>planNativeApplicationBatch(expanded,{userIds:[a],applications:[
  {moduleId:'tradelink',role:'User'},{moduleId:'tradelink',role:'User'}
 ]}),/only once/);
});
