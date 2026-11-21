import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRoleConfiguration,PERMISSION_ACTIONS} from '../role-configuration-ui.js';

const css=readFileSync('frontend/role-configuration-experience.css','utf8');
const source=readFileSync('frontend/role-configuration-ui.js','utf8');
const data={
 workspaceId:'11111111-1111-4111-8111-111111111111',
 roles:[{roleKey:'admin',displayName:'Admin',kind:'system_reference',state:'reference',revision:1}],
 users:[{id:'22222222-2222-4222-8222-222222222222',email:'member@example.invalid',
  displayName:'Example Member',platformRole:'employee',bootstrapProtected:false}],
 boards:[],assignments:[],proposals:[],audit:[]
};
test('Role Configuration styling is Overview-token aligned, scoped, responsive and motion safe',()=>{
 assert.match(css,/CP-ROLE-MATERIAL-02/);
 for(const token of ['--sm-ink','--sm-bg','--sm-surface','--sm-border','--sm-accent',
  '--sm-accent-hover','--sm-surface-raised','--sm-shadow-card','--sm-radius-card']){
  assert.ok(css.slice(css.indexOf('CP-ROLE-MATERIAL-02')).includes('var('+token+')'),token);
 }
 const part=css.slice(css.indexOf('CP-ROLE-MATERIAL-02'));
 assert.match(part,/#app \.aps-role-configuration \.role-config-hero\{/);
 assert.match(part,/background:var\(--sm-surface\)/);
 assert.match(part,/\.role-config-tabs \.role-tab-button\.primary/);
 assert.match(part,/\.role-table-panel/);
 assert.match(part,/@media\(max-width:650px\)/);
 assert.match(part,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(part,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(part,/@import|url\(\s*https?:|animation:.*infinite/);
});
test('all role screens retain staged-only authority and action contracts',()=>{
 const denied=renderRoleConfiguration({verified:false,data});
 assert.doesNotMatch(denied,/role-stat-grid|member@example.invalid/);
 for(const tab of ['roles','users','matrix','board-access','workspace','audit']){
  const html=renderRoleConfiguration({verified:true,data,tab});
  assert.match(html,/Role proposals: STAGED ONLY/);
  assert.match(html,/data-action="role-refresh"/);
  assert.equal((html.match(/data-action="role-tab"/g)||[]).length,6);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  assert.match(html,/role-stat-grid/);
  assert.match(html,/role-config-hero/);
 }
 const matrix=renderRoleConfiguration({verified:true,data,tab:'matrix'});
 assert.equal((matrix.match(/data-action="role-propose-permission"/g)||[]).length,12*PERMISSION_ACTIONS.length);
 assert.match(matrix,/not effective grants/);
 assert.match(source,/bootstrapProtected/);
 assert.match(source,/Protected bootstrap identity/);
});

test('Board Access tab exposes the existing live board assignment controls and preserves owner/read-only states',()=>{
 const actor='77777777-7777-4777-8777-777777777777';
 const member='22222222-2222-4222-8222-222222222222';
 const protectedUser='44444444-4444-4444-8444-444444444444';
 const board='33333333-3333-4333-8333-333333333333';
 const boardData={users:[
  {id:member,name:'Member',email:'member@example.invalid',protected:false},
  {id:actor,name:'Current admin',email:'admin@example.invalid',protected:false},
  {id:protectedUser,name:'Protected admin',email:'protected@example.invalid',protected:true}
 ],boards:[{id:board,name:'Operations board'},
  {id:'55555555-5555-4555-8555-555555555555',name:'Owner board'}],
  boardAssignments:[
   {userId:member,boardId:board,role:'viewer'},
   {userId:member,boardId:'55555555-5555-4555-8555-555555555555',role:'owner'}
  ]};
 const output=renderRoleConfiguration({verified:true,data,tab:'board-access',boardAccessData:boardData,
  selectedBoardUserId:member,actorUserId:actor});
 assert.match(output,/viewer<\/span>/);
 assert.match(output,/owner<\/span>/);
 assert.match(output,/data-action="user-role-edit-board"/);
 assert.match(output,/data-action="user-role-revoke-board"/);
 assert.match(output,/Owner is protected/);
 const protectedOutput=renderRoleConfiguration({verified:true,data,tab:'board-access',boardAccessData:boardData,
  selectedBoardUserId:protectedUser,actorUserId:actor});
 assert.match(protectedOutput,/protected administrator is read-only/);
 assert.match(protectedOutput,/data-action="user-role-edit-board"[^>]*disabled/);
 const selfOutput=renderRoleConfiguration({verified:true,data,tab:'board-access',boardAccessData:boardData,
  selectedBoardUserId:actor,actorUserId:actor});
 assert.match(selfOutput,/Your own board access cannot be assigned or revoked/);
 assert.match(selfOutput,/data-action="user-role-edit-board"[^>]*disabled/);
 const filtered=renderRoleConfiguration({verified:true,data,tab:'board-access',boardAccessData:boardData,
  selectedBoardUserId:member,actorUserId:actor,boardSearch:'owner'});
 assert.match(filtered,/data-role-board-access-row[^>]*hidden/);
 assert.match(filtered,/id="role-board-access-count"/);
 const missing=renderRoleConfiguration({verified:true,data,tab:'board-access'});
 assert.match(missing,/Loading verified board access assignments/);
});
