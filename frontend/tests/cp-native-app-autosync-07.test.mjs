import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODULE_ROLE_OPTIONS,renderUserRoleManagement} from '../user-role-management.js';
import {nativeApplicationOptions} from '../native-application-catalog.js';

const actor='20000000-0000-4000-8000-000000000002';
const user='30000000-0000-4000-8000-000000000003';
const snapshot={
  users:[{id:user,name:'QA member',email:'qa@example.invalid',activeWorkspaceCount:1,protected:false}],
  modules:[
    {moduleId:'time-tracker',name:'TimeTracker Attendance'},
    {moduleId:'qa-new-app',name:'New Registered Application'}
  ],
  moduleAssignments:[],boards:[],boardAssignments:[],crmPlatformRoles:[]
};

test('a newly registered app is discoverable with an explicit missing-assignment-contract notice',()=>{
 const html=renderUserRoleManagement({verified:true,data:snapshot,selectedUserId:user,
  actorUserId:actor,applicationAccessOnly:true});
 assert.deepEqual(nativeApplicationOptions(snapshot).map(m=>m[0]),['time-tracker','qa-new-app']);
 assert.match(html,/New Registered Application/);
 assert.match(html,/Registered — assignment contract unavailable/);
 assert.match(html,/data-resource="qa-new-app" disabled/);
 assert.equal(Object.hasOwn(MODULE_ROLE_OPTIONS,'qa-new-app'),false);
});

test('registered modules do not alter existing role vocabularies or backend assignment constraints',()=>{
 const sql=readFileSync('supabase/migrations/20261030080046_cp_rc02_bootstrap_user_role_management.sql','utf8');
 assert.match(sql,/Unregistered application/);
 assert.match(sql,/valid_module_role CHECK/);
 assert.doesNotMatch(sql,/qa-new-app/);
 const stored=Object.keys(MODULE_ROLE_OPTIONS);
 assert.equal(stored.length,12);
 assert.ok(stored.includes('time-tracker'));
});
