import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRoleConfiguration,PERMISSION_ACTIONS} from '../role-configuration-ui.js';

const css=readFileSync('frontend/role-configuration-experience.css','utf8');
const source=readFileSync('frontend/role-configuration-ui.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const data={
 workspaceId:'11111111-1111-4111-8111-111111111111',
 roles:[{roleKey:'admin',displayName:'Admin',kind:'system_reference',state:'reference',revision:1},
  {roleKey:'custom_draft',displayName:'Custom draft',kind:'custom_draft',state:'proposal',revision:2}],
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

test('all six role sections retain their original proposal and display contracts',()=>{
 const names={roles:'Role catalog',users:'Assignments',matrix:'Permission matrix',
  'application-access':'Native Application Access',workspace:'Workspace access',audit:'Change history'};
 for(const [tab,name] of Object.entries(names)){
  const markup=renderRoleConfiguration({verified:true,data,tab});
  assert.match(markup,new RegExp('<h2 id="role-content-heading">'+name+'</h2>'));
  assert.equal((markup.match(/data-action="role-tab"/g)||[]).length,6);
  assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1);
  assert.match(markup,/Role proposals: STAGED ONLY/);
 }
 const matrix=renderRoleConfiguration({verified:true,data,tab:'matrix'});
 assert.equal((matrix.match(/data-action="role-propose-permission"/g)||[]).length,12*PERMISSION_ACTIONS.length);
 assert.match(matrix,/not effective grants/);
 assert.match(source,/Protected bootstrap identity/);
});

test('Native Application Access is live while Board Access remains in the existing Teams module',()=>{
 const native=renderRoleConfiguration({verified:true,data,tab:'application-access',
  nativeApplicationAccess:'<div class="aps-user-role-management">Native Application Access workflow</div>'});
 assert.match(native,/aria-label="Live application access mode">Live assignments/);
 assert.match(native,/Native Application Access workflow/);
 assert.doesNotMatch(native,/data-tab="board-access"/);
 assert.match(source,/Board Access remains in its existing Teams module/);
 assert.match(app,/renderUserRoleManagement\(\{[\s\S]*?applicationAccessOnly:true/);
 assert.match(app,/case 'user-role-native-batch-review':/);
 assert.match(app,/planNativeApplicationBatch/);
 assert.match(app,/data-user-role-batch-app/);
 assert.match(app,/data-user-role-batch-app-role/);
});

test('pre-existing proposal actions and search controls remain available',()=>{
 const actions=[['roles','role-propose-create'],['roles','role-propose-activation'],
  ['roles','role-propose-edit'],['users','role-propose-assign'],
  ['matrix','role-propose-permission'],['workspace','role-propose-workspace']];
 for(const [tab,action] of actions){
  assert.match(renderRoleConfiguration({verified:true,data,tab}),new RegExp('data-action="'+action+'"'));
  assert.ok(app.includes("case '"+action+"'"),action);
 }
 for(const [tab,id] of [['roles','search-system-roles'],['users','search-workspace-members'],
  ['matrix','filter-role-permission-modules'],['audit','search-role-proposals']]){
  const markup=renderRoleConfiguration({verified:true,data,tab});
  assert.match(markup,new RegExp('id="'+id+'"[^>]*type="search"|type="search"[^>]*id="'+id+'"'));
 }
});
