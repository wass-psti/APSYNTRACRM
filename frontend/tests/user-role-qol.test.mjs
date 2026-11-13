import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderUserRoleManagement} from '../user-role-management.js';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const boards=[{id:'33333333-3333-4333-8333-333333333333',name:'Accounts'},
{id:'44444444-4444-4444-8444-444444444444',name:'Accounts'}];
const data={
 users:[{id:a,name:'Ordinary Member',email:'member@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1}],
 crmPlatformRoles:[{userId:a,effectiveRole:'employee',assignedRole:null}],
 modules:[],moduleAssignments:[{userId:a,moduleId:'tradelink',enabled:true,role:'User'}],
 boards,boardAssignments:[{userId:a,boardId:boards[0].id,role:'viewer'}],
 workspaceScopedMrhAvailable:true,crmPlatformUnavailable:false
};
test('action labels identify application and board context without changing action hooks',()=>{
 const result=renderUserRoleManagement({verified:true,data,selectedUserId:a});
 assert.equal((result.match(/data-action="user-role-edit-module"/g)||[]).length,12);
 assert.match(result,/aria-label="Assign or change TradeLink application role"/);
 assert.match(result,/aria-label="Revoke TradeLink application role"/);
 assert.match(result,/aria-label="Set access for Accounts \(board 33333333\)"/);
 assert.match(result,/aria-label="Set access for Accounts \(board 44444444\)"/);
 assert.match(result,/aria-label="Revoke access for Accounts \(board 33333333\)"/);
 assert.equal((result.match(/data-action="user-role-edit-board"/g)||[]).length,2);
});
test('verified tables expose keyboard-scrolling regions and protected identities stay locked',()=>{
 const result=renderUserRoleManagement({verified:true,data,selectedUserId:a});
 assert.match(result,/aria-label="Application assignments, scroll horizontally for more columns" tabindex="0"/);
 assert.match(result,/aria-label="Board access, scroll horizontally for more columns" tabindex="0"/);
 const protectedData={...data,users:data.users.map(u=>({...u,protected:true}))};
 const locked=renderUserRoleManagement({verified:true,data:protectedData,selectedUserId:a});
 assert.match(locked,/Protected administrator — role modifications are intentionally disabled/);
 assert.equal((locked.match(/data-action="user-role-edit-module"[^>]*disabled/g)||[]).length,12);
 const denied=renderUserRoleManagement({verified:false,data});
 assert.doesNotMatch(denied,/member@example.invalid|role-table-scroll/);
});
test('styles are scoped and give touch actions focus-visible keyboard scroll',()=>{
 const css=readFileSync('frontend/user-role-experience.css','utf8');
 assert.match(css,/CP-URM-QOL-01/);
 assert.match(css,/\.user-role-table-scroll:focus-visible/);
 assert.match(css,/\.user-role-table td button\{\s*min-height:44px/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:/);
});
