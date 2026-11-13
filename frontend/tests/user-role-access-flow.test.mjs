import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderUserRoleManagement} from '../user-role-management.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/user-role-experience.css','utf8');
const target='11111111-1111-4111-8111-111111111111';
const board='33333333-3333-4333-8333-333333333333';
const data={
 users:[{id:target,name:'Member',email:'member@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1}],
 modules:[],moduleAssignments:[],boards:[{id:board,name:'Example board'}],boardAssignments:[],
 crmPlatformRoles:[{userId:target,effectiveRole:'employee',assignedRole:null}],
 workspaceScopedMrhAvailable:true,crmPlatformUnavailable:false
};
test('a single per-user screen switches between separate applications and boards without losing the selected target',()=>{
 for(const accessSection of ['applications','boards']){
  const html=renderUserRoleManagement({verified:true,data,selectedUserId:target,accessSection});
  assert.equal((html.match(/data-action="user-role-section"/g)||[]).length,2);
  assert.equal((html.match(/data-action="user-role-section"[^>]*aria-pressed="true"/g)||[]).length,1);
  assert.match(html,/data-role-access-section="applications"/);
  assert.match(html,/data-role-access-section="boards"/);
  assert.match(html,/data-action="user-role-edit-crm-platform"/);
  assert.match(html,/data-action="user-role-edit-module"/);
  assert.match(html,/data-action="user-role-edit-board"/);
  assert.match(html,new RegExp('data-role-access-section="'+accessSection+'" aria-label="[^"]+"(?! hidden)'));
  const hidden=accessSection==='boards'?'applications':'boards';
  assert.match(html,new RegExp('data-role-access-section="'+hidden+'" aria-label="[^"]+" hidden'));
 }
 assert.match(app,/case 'user-role-section':/);
 assert.match(app,/state\.userRoleSection=section;/);
 assert.match(app,/accessSection:state\.userRoleSection/);
 assert.match(css,/user-role-access-section\[hidden\]\{display:none!important\}/);
});
test('role dialogs require an explicit submit button, not typed acknowledgement; server and subject authorization remain',()=>{
 const handler=app.slice(app.indexOf("case 'user-role-edit-crm-platform':"),app.indexOf("case 'role-tab':"));
 assert.doesNotMatch(handler,/input\('Type APPLY|fd\.get\('ack'\)|Confirm by typing/);
 assert.match(handler,/submitLabel:reverting\?'Confirm CRM role revert':'Apply CRM role'/);
 assert.match(handler,/submitLabel:enabled\?'Apply role change':'Confirm revoke access'/);
 assert.match(handler,/if\(!state\.adminVerified\|\|state\.userRoleBusy\|\|!state\.userRoleData\)return/);
 assert.match(handler,/!u\.protected|!user\.protected/);
 assert.match(handler,/userId===state\.context\?\.user_id/);
 assert.match(handler,/expectedUpdatedAt:record\.updatedAt\|\|null/);
 assert.match(handler,/applyUserRoleChange\(/);
 assert.match(handler,/applyCrmPlatformRole\(/);
});
test('role action errors and unverified access remain fail-closed',()=>{
 const denied=renderUserRoleManagement({verified:false,data});
 assert.doesNotMatch(denied,/data-action="user-role-section"|member@example.invalid/);
 const protectedData={...data,users:data.users.map(u=>({...u,protected:true}))};
 const html=renderUserRoleManagement({verified:true,data:protectedData,selectedUserId:target,accessSection:'boards'});
 assert.match(html,/data-action="user-role-edit-board"[^>]*disabled/);
});

test('board filter is local and preserves authorized board actions and empty results',()=>{
 const filtered=renderUserRoleManagement({verified:true,data,selectedUserId:target,accessSection:'boards',boardSearch:'missing'});
 assert.match(filtered,/id="user-role-board-filter"[^>]*value="missing"/);
 assert.match(filtered,/0 of 1 boards/);
 assert.match(filtered,/data-role-board-row data-board-name="example board" hidden/);
 assert.match(filtered,/data-action="user-role-edit-board"/);
 const matching=renderUserRoleManagement({verified:true,data,selectedUserId:target,accessSection:'boards',boardSearch:'EXAMPLE'});
 assert.match(matching,/1 of 1 boards/);
 assert.doesNotMatch(matching,/data-role-board-row data-board-name="example board" hidden/);
 assert.match(app,/event\.target\.id==='user-role-board-filter'/);
 assert.match(app,/state\.userRoleBoardSearch=query/);
});
