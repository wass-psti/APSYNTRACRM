import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderUserRoleManagement} from '../user-role-management.js';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const data={
 users:[{id:a,name:'Alex Example',email:'alex@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1},
  {id:b,name:'Blair Example',email:'blair@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1}],
 boards:[{id:'33333333-3333-4333-8333-333333333333',name:'Example Board'}],
 crmPlatformRoles:[],moduleAssignments:[],boardAssignments:[],workspaceScopedMrhAvailable:true
};
test('redesigned batch interface has explicit stages, review summary, and preserves role actions',()=>{
 const html=renderUserRoleManagement({verified:true,data,batchMode:true,batchSelected:[b],
  batchScope:'board',batchRole:'editor',batchResource:data.boards[0].id});
 for(const label of ['Select members','Configure access','Review &amp; apply',
  'Application access','Board access','1 selected','Example Board'])
  assert.ok(html.includes(label),label);
 assert.match(html,/user-role-batch-layout/);
 assert.match(html,/class="user-role-batch-summary" aria-label="Batch review summary"/);
 assert.match(html,/<div class="user-role-batch-main">[\s\S]*?<\/div><aside class="user-role-batch-summary"/);
 assert.match(html,/data-action="user-role-batch-review"/);
 assert.match(html,/name="userRoleBatchMember"/);
 assert.match(html,/data-action="user-role-batch-select-eligible"/);
 assert.match(html,/data-action="user-role-batch-clear"/);
 assert.match(html,/aria-describedby="user-role-batch-search-count"/);
 assert.doesNotMatch(html,/data-action="user-role-edit-board"/);
});
test('search narrows presentation only and preserves selected accounts',()=>{
 const html=renderUserRoleManagement({verified:true,data,batchMode:true,batchSelected:[b],
  batchMemberSearch:' alex '});
 assert.match(html,/value=" alex "/);
 assert.match(html,/1 matching/);
 assert.match(html,/data-search-name="alex example alex@example.invalid"/);
 assert.match(html,/data-search-name="blair example blair@example.invalid" hidden/);
 assert.match(html,/value="22222222-2222-4222-8222-222222222222" checked/);
 assert.match(html,/1 selected of 2 available workspace members/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/event\.target\.id==='user-role-batch-member-search'/);
 assert.match(app,/state\.userRoleBatchMemberSearch=query/);
 assert.match(app,/row\.hidden=!row\.dataset\.searchName\.includes\(needle\)/);
});
test('redesign styles remain section scoped, responsive, accessible and low overhead',()=>{
 const css=readFileSync('frontend/user-role-experience.css','utf8');
 for(const selector of ['user-role-batch-heading','user-role-batch-layout','user-role-batch-main',
  'user-role-batch-summary','user-role-batch-toolbar','user-role-batch-user-list label:focus-within'])
  assert.ok(css.includes(selector),selector);
 assert.match(css,/@media\(max-width:1040px\)/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.match(css,/user-role-batch-user-list label\[hidden\]/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
});
