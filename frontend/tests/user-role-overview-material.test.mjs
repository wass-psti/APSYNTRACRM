import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderUserRoleManagement} from '../user-role-management.js';
const css=readFileSync('frontend/user-role-experience.css','utf8');
const userId='11111111-1111-4111-8111-111111111111';
const data={
 users:[{id:userId,name:'Member',email:'member@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1}],
 modules:[],moduleAssignments:[],boards:[{id:'22222222-2222-4222-8222-222222222222',name:'Board'}],
 boardAssignments:[],crmPlatformRoles:[{userId,effectiveRole:'employee',assignedRole:null}],
 workspaceScopedMrhAvailable:true,crmPlatformUnavailable:false
};
test('User Role Management uses Overview tokens without cross-route overrides',()=>{
 const part=css.slice(css.indexOf('CP-URM-MATERIAL-03'));
 assert.match(part,/CP-URM-MATERIAL-03/);
 for(const token of ['--sm-bg','--sm-surface','--sm-ink','--sm-text','--sm-sub','--sm-accent',
  '--sm-border','--sm-surface-raised','--sm-shadow-sm','--sm-radius-card']){
  assert.ok(part.includes('var('+token+')'),token);
 }
 for(const selector of ['.user-role-hero','.user-role-stat-card','.user-role-mode-nav',
  '.user-role-account-select','.user-role-platform-panel','.user-role-batch-heading',
  '.user-role-batch-summary','.user-role-table']){
  assert.ok(part.includes(selector),selector);
 }
 assert.match(part,/@media\(max-width:650px\)/);
 assert.match(part,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(part,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(part,/@import|url\(\s*https?:|animation:.*infinite/);
});
test('individual and batch still expose original actions and deny unverifiable role changes',()=>{
 const denied=renderUserRoleManagement({verified:false,data});
 assert.doesNotMatch(denied,/member@example.invalid|data-action="user-role-batch-review"/);
 const individual=renderUserRoleManagement({verified:true,data,selectedUserId:userId,accessSection:'boards'});
 assert.match(individual,/data-action="user-role-mode" data-mode="batch"/);
 assert.match(individual,/data-action="user-role-select"/);
 assert.match(individual,/data-action="user-role-edit-board"/);
 assert.match(individual,/data-action="user-role-refresh"/);
 const batch=renderUserRoleManagement({verified:true,data,batchMode:true,batchSelected:[userId],batchScope:'board',
  batchResource:data.boards[0].id,batchRole:'editor'});
 for(const action of ['user-role-mode','user-role-batch-review','user-role-batch-clear',
  'user-role-batch-select-eligible'])
  assert.ok(batch.includes('data-action="'+action+'"'),action);
 assert.match(batch,/user-role-batch-summary/);
 assert.match(batch,/Verified CRM Administrators can manage roles/);
 assert.match(batch,/The two designated bootstrap identities remain protected/);
 const protectedData={...data,users:data.users.map(user=>({...user,protected:true}))};
 const protectedBatch=renderUserRoleManagement({verified:true,data:protectedData,batchMode:true});
 assert.doesNotMatch(protectedBatch,/data-user-role-batch-member value=/);
 assert.match(protectedBatch,/data-action="user-role-batch-review" disabled/);
});
