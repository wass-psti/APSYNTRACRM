import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeApplicationOptions} from '../native-application-catalog.js';
import {planNativeApplicationBatch} from '../user-role-batch.js';
import {writeNativeApplicationRoleAssignment,nativeApplicationRoleAssignmentPersisted} from '../native-application-role-assignment.js';
import {renderUserRoleManagement} from '../user-role-management.js';

const workspace='10000000-0000-4000-8000-000000000001';
const actor='20000000-0000-4000-8000-000000000002';
const members=[
 {id:'30000000-0000-4000-8000-000000000003',name:'QA One',email:'one@example.invalid',activeWorkspaceCount:1,protected:false},
 {id:'40000000-0000-4000-8000-000000000004',name:'QA Two',email:'two@example.invalid',activeWorkspaceCount:1,protected:false}
];
const data=()=>({workspaceId:workspace,users:members,modules:[
 {moduleId:'toolbox-issues',name:'Toolbox Issues',boardId:'50000000-0000-4000-8000-000000000005'},
 {moduleId:'new-portal',name:'New Portal',boardId:'60000000-0000-4000-8000-000000000006'}],
 moduleAssignments:[],boardAssignments:[],boards:[],crmPlatformRoles:[]});

test('two-profile synthetic batch persists and readbacks through existing assignment route',async()=>{
 const snapshot=data();
 const plan=planNativeApplicationBatch(snapshot,{
  userIds:members.map(member=>member.id),actorUserId:actor,
  applications:[{moduleId:'toolbox-issues',role:'employee'}],enabled:true
 });
 assert.equal(plan.operations.length,2);
 const received=[];
 const manager={mutate:async op=>{
  received.push(op);
  snapshot.moduleAssignments.push({userId:op.userId,moduleId:op.resourceId,
   role:op.role,enabled:op.enabled,updatedAt:'2026-11-22T10:00:00Z'});
  return {effective:true};
 }};
 for(const op of plan.operations){
  await writeNativeApplicationRoleAssignment(manager,{
   workspaceId:workspace,userId:op.userId,moduleId:op.resourceId,
   role:op.role,enabled:op.enabled,expectedUpdatedAt:op.expectedUpdatedAt,
   snapshot
  });
  assert.equal(nativeApplicationRoleAssignmentPersisted(snapshot,{
   userId:op.userId,moduleId:op.resourceId,role:'employee',enabled:true
  }),true);
 }
 assert.equal(received.length,2);
 assert.deepEqual(received.map(op=>op.resourceId),['toolbox-issues','toolbox-issues']);
 assert.equal(snapshot.moduleAssignments.length,2);
 assert.equal(planNativeApplicationBatch(snapshot,{
  userIds:members.map(member=>member.id),actorUserId:actor,
  applications:[{moduleId:'toolbox-issues',role:'employee'}],enabled:true
 }).unchanged.length,2);
});

test('unknown registered module is visible but has no inferred assignment writer',()=>{
 const snapshot=data();
 const ui=renderUserRoleManagement({verified:true,data:snapshot,applicationAccessOnly:true,
  selectedUserId:members[0].id,actorUserId:actor});
 assert.match(ui,/New Portal/);
 assert.match(ui,/data-resource="new-portal" disabled/);
 const bulk=renderUserRoleManagement({verified:true,data:snapshot,applicationAccessOnly:true,
  actorUserId:actor,batchMode:true});
 assert.match(bulk,/data-user-role-batch-app value="new-portal" disabled/);
 assert.throws(()=>planNativeApplicationBatch(snapshot,{
  userIds:[members[0].id],actorUserId:actor,
  applications:[{moduleId:'new-portal',role:'employee'}],enabled:true
 }),/supported native application/);
});

test('registration lifecycle uses stable module identity regardless of rename and deactivation',()=>{
 const snapshot=data();
 assert.equal(nativeApplicationOptions(snapshot).length,2);
 snapshot.modules[1].name='Renamed Portal';
 assert.deepEqual(nativeApplicationOptions(snapshot)[1],['new-portal','Renamed Portal']);
 snapshot.modules=snapshot.modules.filter(module=>module.moduleId!=='new-portal');
 assert.deepEqual(nativeApplicationOptions(snapshot),[['toolbox-issues','Toolbox Issues']]);
});

test('navigating into native access triggers fresh signed catalog instead of stale cached tab state',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 const start=source.indexOf("case 'role-tab':");
 const end=source.indexOf("case 'role-refresh':",start);
 assert.ok(start>=0&&end>start);
 const action=source.slice(start,end);
 assert.match(action,/if\(tab==='application-access'\)/);
 assert.match(action,/await loadUserRoleManagement\(\)/);
 assert.match(source,/includeNativeCatalog:state\.view==='role-configuration'&&state\.roleTab==='application-access'/);
});
