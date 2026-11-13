import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRoleConfiguration,PERMISSION_ACTIONS} from '../role-configuration-ui.js';

const ui=readFileSync('frontend/role-configuration-ui.js','utf8');
const css=readFileSync('frontend/role-configuration-experience.css','utf8');
const overview=readFileSync('frontend/overview-experience.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const data={
 workspaceId:'11111111-1111-4111-8111-111111111111',
 roles:[{roleKey:'admin',displayName:'Admin',kind:'system_reference',state:'reference',revision:1},
 {roleKey:'custom',displayName:'Custom',kind:'draft',state:'draft',revision:2}],
 users:[{id:'22222222-2222-4222-8222-222222222222',displayName:'Member',
 email:'member@example.invalid',platformRole:'employee',bootstrapProtected:false}],
 boards:[{id:'33333333-3333-4333-8333-333333333333',name:'Example board'}],
 assignments:[],proposals:[],audit:[]
};
test('five role sections share Overview-aligned workspace hierarchy without new authority',()=>{
 const names={roles:'Role catalog',users:'Assignments',matrix:'Permission matrix',
 workspace:'Workspace access',audit:'Change history'};
 for(const [tab,name] of Object.entries(names)){
  const markup=renderRoleConfiguration({verified:true,data,tab});
  assert.match(markup,/class="role-content-workspace" aria-labelledby="role-content-heading"/);
  assert.match(markup,new RegExp('<h2 id="role-content-heading">'+name+'</h2>'));
  assert.match(markup,/class="role-content-mode" aria-label="Proposal-only mode"/);
  assert.match(markup,/class="role-content-body"/);
  assert.equal((markup.match(/data-action="role-tab"/g)||[]).length,5);
  assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1);
  assert.match(markup,/Change control: STAGED ONLY/);
  assert.match(markup,/production roles, permissions, board access and memberships cannot be altered/);
  assert.ok(markup.endsWith('</div></section></div>'));
 }
});
test('accessible table regions are individually named and keyboard-scrollable',()=>{
 const expected={
  roles:['CRM platform role reference','Central role catalog'],
  users:['Workspace member role assignments'],
  matrix:['Module permission proposal matrix'],
  workspace:[],
  audit:['Staged role change proposals','Append-only role audit history']
 };
 for(const [tab,names] of Object.entries(expected)){
  const markup=renderRoleConfiguration({verified:true,data,tab});
  for(const label of names){
   assert.ok(markup.includes('aria-label="'+label+', scroll horizontally for more columns"'),label);
   assert.ok(markup.includes('aria-label="'+label+'"><thead>'),label);
  }
  assert.equal((markup.match(/tabindex="0" role="region"/g)||[]).length,names.length);
 }
});
test('all pre-existing proposal controls, data sources and native search inputs remain intact',()=>{
 const actions=[
  ['roles','role-propose-create'],['roles','role-propose-activation'],
  ['roles','role-propose-edit'],['users','role-propose-assign'],
  ['matrix','role-propose-permission'],['workspace','role-propose-workspace']];
 for(const [tab,action] of actions){
  assert.match(renderRoleConfiguration({verified:true,data,tab}),
   new RegExp('data-action="'+action+'"'));
  assert.ok(app.includes("case '"+action+"'"),action);
 }
 assert.equal((renderRoleConfiguration({verified:true,data,tab:'matrix'})
  .match(/data-action="role-propose-permission"/g)||[]).length,12*PERMISSION_ACTIONS.length);
 for(const [tab,id] of [['roles','search-system-roles'],['users','search-workspace-members'],
  ['matrix','filter-role-permission-modules'],['audit','search-role-proposals']]){
  const markup=renderRoleConfiguration({verified:true,data,tab});
  assert.match(markup,new RegExp('id="'+id+'"[^>]*type="search"|type="search"[^>]*id="'+id+'"'));
 }
 const denied=renderRoleConfiguration({verified:false,data:{...data,users:[{email:'secret@example.invalid'}]}});
 assert.doesNotMatch(denied,/secret@example.invalid|role-content-workspace/);
 assert.match(renderRoleConfiguration({verified:true,loading:true,data:null}),/role="status" aria-live="polite"/);
});
test('Overview reference colors, densities, radii and motion limits are reused',()=>{
 for(const literal of ['#1e2a47','#73819e','#e6eaf4','#5b5de7','#f6f8fd']){
  assert.ok(overview.includes(literal),'Overview source color '+literal);
  assert.ok(css.includes(literal),'Role design must reuse Overview color '+literal);
 }
 for(const selector of ['.role-content-workspace','.role-content-heading',
  '.role-content-body','.role-content-mode','.role-table-scroll:focus-visible'])
  assert.ok(css.includes(selector),selector);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(ui,/fetch\(|localStorage|new Worker|setInterval|style="/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
});
