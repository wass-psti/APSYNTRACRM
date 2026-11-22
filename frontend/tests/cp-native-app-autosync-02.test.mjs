import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeApplicationOptions } from '../native-application-catalog.js';
import { renderUserRoleManagement } from '../user-role-management.js';

const user = {id:'22222222-2222-4222-8222-222222222222',name:'QA',email:'qa@example.invalid',activeWorkspaceCount:1,protected:false};
const base = {users:[user],boards:[],boardAssignments:[],moduleAssignments:[],crmPlatformRoles:[],
 fueltransWorkspaceAvailable:true,frtWorkspaceAvailable:true,scopedSixAvailable:true,
 charterWorkspaceAvailable:true,toolTraceabilityWorkspaceAvailable:true,workspaceScopedMrhAvailable:true};
const options = {verified:true,selectedUserId:user.id,actorUserId:'77777777-7777-4777-8777-777777777777',applicationAccessOnly:true};

test('signed snapshot is authoritative for discovery and prevents duplicate application IDs',()=>{
 const modules=['time-tracker','new-portal','new-portal',null,'INVALID ID',{'moduleId':'another-app','name':'Another application'}];
 assert.deepEqual(nativeApplicationOptions({modules}),[
  ['time-tracker','TimeTracker Attendance'],['new-portal','new-portal'],['another-app','Another application']]);
 assert.equal(nativeApplicationOptions({modules:[]}).length,0);
});

test('new application appears in individual and bulk but cannot acquire an unsupported role',()=>{
 const data={...base,modules:['time-tracker','new-portal']};
 const individual=renderUserRoleManagement({...options,data});
 assert.match(individual,/new-portal/);
 assert.match(individual,/data-resource="new-portal" disabled/);
 const bulk=renderUserRoleManagement({...options,data,batchMode:true});
 assert.match(bulk,/data-native-app-row="new-portal"/);
 assert.match(bulk,/data-user-role-batch-app value="new-portal" disabled/);
 assert.match(bulk,/2 selected of 2 available|0 selected of 1 available|0 selected of 2 available/);
});

test('registry rename retains module identity and existing assignments remain intact',()=>{
 const data={...base,modules:[{moduleId:'new-portal',name:'Renamed portal'}],
  moduleAssignments:[{userId:user.id,moduleId:'new-portal',role:'User',enabled:true}]};
 const individual=renderUserRoleManagement({...options,data});
 assert.match(individual,/Renamed portal/);
 assert.match(individual,/Active: User|Unsupported legacy role: User/);
 assert.equal((individual.match(/data-resource="new-portal"/g)||[]).length,1);
 assert.equal(data.moduleAssignments[0].role,'User');
});
