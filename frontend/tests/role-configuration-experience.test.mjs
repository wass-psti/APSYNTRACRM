import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRoleConfiguration,PERMISSION_ACTIONS,ROLE_MODULE_OPTIONS} from '../role-configuration-ui.js';
import {roleConfigurationIcon,mountRoleConfigurationMotion,stopRoleConfigurationMotion} from '../role-configuration-visuals.js';
import {renderUserRoleManagement} from '../user-role-management.js';

const app=readFileSync('frontend/app.js','utf8');
const ui=readFileSync('frontend/role-configuration-ui.js','utf8');
const css=readFileSync('frontend/role-configuration-experience.css','utf8');
const userRoleCss=readFileSync('frontend/user-role-experience.css','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const data={
 workspaceId:'11111111-1111-4111-8111-111111111111',
 roles:[{roleKey:'admin',displayName:'Admin',kind:'system_reference',state:'reference',revision:1},
  {roleKey:'worker_draft',displayName:'Worker draft',kind:'custom_draft',state:'proposal',revision:2}],
 users:[{id:'22222222-2222-4222-8222-222222222222',email:'user@example.invalid',displayName:'Example user',platformRole:'employee',bootstrapProtected:false}],
 boards:[{id:'33333333-3333-4333-8333-333333333333',name:'QA'}],
 proposals:[{id:'44444444-4444-4444-8444-444444444444',operation:'role.create',status:'pending',createdAt:'2026-11-03'}],
 assignments:[],audit:[]
};

test('verified role configuration is route scoped and unavailable without CRM Admin verification',()=>{
 const denied=renderRoleConfiguration({verified:false,data:{...data,users:[{email:'secret@example.invalid'}]}});
 assert.match(denied,/Access unavailable/);
 assert.doesNotMatch(denied,/aps-role-configuration|secret@example.invalid|role-propose-create/);
 const approved=renderRoleConfiguration({verified:true,data,tab:'roles'});
 assert.ok(approved.startsWith('<div class="aps-role-configuration">'));
 assert.ok(approved.endsWith('</div>'));
 assert.match(approved,/class="page-head role-config-hero role-entrance" aria-labelledby="role-config-title"/);
 assert.match(approved,/class="note security-note role-staged-note role-entrance"/);
 assert.match(approved,/class="stat-grid role-stat-grid role-entrance"/);
 assert.match(approved,/class="role-config-layout"><nav class="role-config-tabs role-entrance"/);
 assert.match(app,/classList\.toggle\('aps-role-config-shell',state\.view==='role-configuration'\)/);
 assert.match(app,/mountRoleConfigurationMotion\(root\.querySelector\('\.aps-role-configuration'\),state\.view\)/);
 assert.match(app,/stopRoleConfigurationMotion\(\)/);
 assert.match(html,/frontend\/role-configuration-experience\.css/);
 assert.match(smoke,/'frontend\/role-configuration-experience\.css'/);
 assert.match(smoke,/'frontend\/role-configuration-visuals\.js'/);
});

test('staged-only banner and CRM permission ceiling remain intact',()=>{
 const result=renderRoleConfiguration({verified:true,data,tab:'roles'});
 assert.match(result,/Role proposals: STAGED ONLY/);
 assert.match(result,/Native Application Access uses the existing application assignment services/);
 assert.match(result,/Board Access remains in its existing Teams module/);
 assert.match(result,/The CRM role tier is separate from WatchdogWorkspace identity/);
 assert.match(result,/never grants an application membership, board ownership or unrelated application access/);
 for(const role of ['Admin','Supervisor','Employee','Viewer']){
  assert.ok(result.includes('<td><strong>'+role+'</strong></td>'),role);
 }
 assert.match(result,/Maximum CRM operational tier; existing module and board grants remain required/);
 assert.match(result,/View-only where the domain defines a read role; blocks edit\/manage/);
 assert.match(result,/Default role hierarchy:/);
 assert.match(result,/immutable reference definitions/);
 assert.match(result,/Protected default role/);
 assert.doesNotMatch(result,/data-role-key="admin"/);
 assert.match(result,/data-action="role-propose-create"/);
 assert.match(result,/data-action="role-propose-activation"/);
});

test('summary metrics are derived strictly from provided server snapshot',()=>{
 const result=renderRoleConfiguration({verified:true,data,tab:'roles'});
 for(const [label,count] of [
  ['Reference / draft roles','2'],['Workspace users','1'],['Accessible boards','1'],['Pending proposals','1']]){
  assert.ok(result.includes('>'+label+'</div><div class="stat-value">'+count+'</div>'),label);
 }
 assert.equal((result.match(/class="stat-card role-stat-card/g)||[]).length,4);
 assert.match(ui,/const roles=d\.roles\|\|\[\],users=d\.users\|\|\[\],proposals=d\.proposals\|\|\[\],boards=d\.boards\|\|\[\]/);
 assert.doesNotMatch(ui,/fabricated|mockRoles|fakeCount|localStorage/);
 const loading=renderRoleConfiguration({verified:true,data:null,loading:true});
 assert.ok(loading.endsWith('</div>'));
 assert.match(loading,/Loading verified workspace configuration/);
 assert.doesNotMatch(loading,/role-config-tabs/);
});

test('six tabs preserve server data and original action handlers, selection and search',()=>{
 const keys=['roles','users','matrix','application-access','workspace','audit'];
 for(const key of keys){
  const result=renderRoleConfiguration({verified:true,data,tab:key});
  assert.equal((result.match(/data-action="role-tab"/g)||[]).length,6);
  assert.equal((result.match(/aria-pressed="true"/g)||[]).length,1);
  assert.equal((result.match(/aria-pressed="false"/g)||[]).length,5);
  assert.match(result,new RegExp('data-tab="'+key+'" aria-pressed="true"'));
  assert.ok(result.endsWith('</div>'));
 }
 const roles=renderRoleConfiguration({verified:true,data,tab:'roles'});
 assert.match(roles,/id="search-system-roles"/);
 assert.match(roles,/type="search"/);
 assert.match(roles,/role="status"|role-data-table/);
 assert.match(roles,/data-action="role-propose-edit"/);
 assert.match(roles,/data-action="role-propose-activation"/);
 assert.match(roles,/class="board-table role-data-table"/);
 assert.match(roles,/scope="col"/);
 const matrix=renderRoleConfiguration({verified:true,data,tab:'matrix'});
 assert.equal((matrix.match(/data-action="role-propose-permission"/g)||[]).length,12*PERMISSION_ACTIONS.length);
 assert.match(matrix,/not effective grants/);
 const assignments=renderRoleConfiguration({verified:true,data,tab:'users'});
 assert.match(assignments,/data-action="role-propose-assign"/);
 assert.match(assignments,/pending proposals do not grant access/);
 const workspace=renderRoleConfiguration({verified:true,data,tab:'workspace'});
 assert.match(workspace,/data-action="role-propose-workspace"/);
 const nativeTab=renderRoleConfiguration({verified:true,data,tab:'application-access',
  nativeApplicationAccess:'<div class="aps-user-role-management">Native application workflow</div>'});
 assert.match(nativeTab,/<h2 id="role-content-heading">Native Application Access<\/h2>/);
 assert.match(nativeTab,/aria-label="Live application access mode">Live assignments/);
 assert.match(nativeTab,/Native application workflow/);
 assert.doesNotMatch(nativeTab,/data-tab="board-access"/);
 assert.match(app,/renderUserRoleManagement\(\{[\s\S]*?applicationAccessOnly:true/);
 assert.match(app,/await loadUserRoleManagement\(\);[\s\S]*?roleConfig\.snapshot\(context\.workspace_id\)/);
 assert.match(app,/case 'user-role-native-batch-review':/);
 assert.match(app,/planNativeApplicationBatch/);
 assert.match(app,/userRoleManager\.snapshot\(ctx\.workspace_id,[\s\S]*?includeScopedSix:true/);
 assert.match(app,/Saved & verified/);
 assert.match(app,/data-user-role-batch-app/);
 assert.match(app,/data-user-role-batch-app-role/);
 assert.match(app,/case 'user-role-edit-module':/);
 assert.match(app,/case 'user-role-revoke-module':/);
 assert.match(userRoleCss,/CP-ROLE-NATIVE-APPLICATION-ACCESS-01/);
 assert.match(userRoleCss,/user-role-native-app-picker/);
 assert.match(userRoleCss,/user-role-native-results/);
 assert.match(app,/async function applyUserRoleChange\(/);
 const audit=renderRoleConfiguration({verified:true,data,tab:'audit'});
 assert.match(audit,/Every staged proposal produces a server-side append-only event/);
 for(const action of ['role-refresh','role-tab','role-propose-create','role-propose-edit','role-propose-activation','role-propose-permission','role-propose-assign','role-propose-workspace'])
  assert.ok(app.includes("case '"+action+"'"),action);
});

test('Native Application Access supports individual assignments and multi-app bulk configuration',()=>{
 const userId='22222222-2222-4222-8222-222222222222';
 const actorId='77777777-7777-4777-8777-777777777777';
 const accessData={
  users:[{id:userId,name:'Example user',email:'user@example.invalid',protected:false,activeWorkspaceCount:1}],
  modules:[],boards:[],boardAssignments:[],
  moduleAssignments:[{userId,moduleId:'time-tracker',role:'Employee',enabled:true,updatedAt:'2026-11-20T10:00:00Z'}],
  fueltransWorkspaceAvailable:true,frtWorkspaceAvailable:true,scopedSixAvailable:true,
  charterWorkspaceAvailable:true,toolTraceabilityWorkspaceAvailable:true,
  workspaceScopedMrhAvailable:true,crmPlatformRoles:[],crmPlatformUnavailable:false
 };
 const individual=renderUserRoleManagement({verified:true,data:accessData,
  selectedUserId:userId,actorUserId:actorId,applicationAccessOnly:true});
 assert.match(individual,/Native Application Access/);
 assert.match(individual,/id="managed-user"/);
 assert.match(individual,/Native Application Assignments/);
 assert.equal((individual.match(/data-action="user-role-edit-module"/g)||[]).length,ROLE_MODULE_OPTIONS.length);
 assert.match(individual,/data-action="user-role-revoke-module"/);
 assert.doesNotMatch(individual,/data-action="user-role-edit-board"|Board access \(/);
 const bulk=renderUserRoleManagement({verified:true,data:accessData,actorUserId:actorId,
  applicationAccessOnly:true,batchMode:true,batchSelected:[userId],
  batchModulesSelected:['time-tracker','tradelink'],batchModuleRoles:{},batchAction:'assign',
  nativeBatchResults:[{userId,email:'user@example.invalid',moduleId:'time-tracker',
   status:'Saved & verified',detail:'Persisted application role confirmed by refreshed readback.'}]});
 assert.match(bulk,/Configure multiple applications/);
 assert.equal((bulk.match(/data-user-role-batch-app value=/g)||[]).length,ROLE_MODULE_OPTIONS.length);
 assert.equal((bulk.match(/data-user-role-batch-app-role/g)||[]).length,ROLE_MODULE_OPTIONS.length);
 assert.match(bulk,/data-action="user-role-native-batch-review"/);
 assert.match(bulk,/2 selected/);
 assert.match(bulk,/Latest bulk operation results/);
 assert.match(bulk,/Saved &amp; verified|Saved & verified/);
 assert.match(bulk,/Persisted application role confirmed by refreshed readback/);
 assert.doesNotMatch(bulk,/user-role-batch-scope|Board access/);
 const unavailable=renderUserRoleManagement({verified:true,data:{...accessData,
  fueltransWorkspaceAvailable:false,frtWorkspaceAvailable:false,scopedSixAvailable:false,
  charterWorkspaceAvailable:false,toolTraceabilityWorkspaceAvailable:false,
  workspaceScopedMrhAvailable:false},actorUserId:actorId,applicationAccessOnly:true,batchMode:true});
 for(const moduleId of ['fueltrans','fund-released-tracker','charter-navigator','tool-traceability','material-request-hub'])
  assert.match(unavailable,new RegExp('id="user-role-batch-app-'+moduleId+'"[^>]*disabled'));
 assert.match(app,/case 'user-role-native-batch-review':/);
 assert.match(app,/planNativeApplicationBatch/);
 assert.match(app,/Saved & verified/);
});

test('Assignments rows render four intact cells, including correct staged-only account actions',()=>{
 const nonbootstrap=renderRoleConfiguration({verified:true,data,tab:'users'});
 assert.match(nonbootstrap,/No existing module assignment<\/span><\/td><td><button class="secondary" data-action="role-propose-assign"/);
 const assigned=renderRoleConfiguration({verified:true,data:{...data,
  assignments:[{userId:data.users[0].id,moduleId:'time-tracker',role:'viewer',enabled:true}]},tab:'users'});
 assert.match(assigned,/time-tracker: viewer<\/span><\/td><td><button class="secondary" data-action="role-propose-assign"/);
 const protectedUser=renderRoleConfiguration({verified:true,data:{...data,
  users:[{...data.users[0],bootstrapProtected:true}]},tab:'users'});
 assert.match(protectedUser,/Protected bootstrap identity<\/span><\/td><\/tr>/);
 assert.doesNotMatch(protectedUser,/data-action="role-propose-assign"/);
});

test('untrusted names and errors are escaped and native controls remain CSP compatible',()=>{
 const result=renderRoleConfiguration({verified:true,data:{...data,
  roles:[{roleKey:'<svg onload=alert(1)>',displayName:'<script>x</script>',kind:'custom_draft',state:'proposal'}]},
  error:'<img src=x onerror=alert(1)>'});
 assert.doesNotMatch(result,/<script>|<img src=x|<svg onload=/);
 assert.match(result,/&lt;script&gt;x&lt;\/script&gt;/);
 assert.match(result,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(result,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(result,/\sstyle="|\sonclick=|\soninput=/);
 for(const kind of ['roles','users','boards','proposals','refresh','shield','lock']){
  const icon=roleConfigurationIcon(kind);
  assert.match(icon,/^<svg class="role-icon"/);
  assert.match(icon,/aria-hidden="true"/);
  assert.doesNotMatch(icon,/<script|\sonload=|\sstyle=/);
 }
 assert.equal(roleConfigurationIcon('bad'),roleConfigurationIcon('shield'));
});

test('responsive scoped CSS preserves keyboard focus, no infinite GPU loop and small-screen scrolling',()=>{
 for(const selector of [
  '#app .aps-role-config-shell','#app .aps-role-configuration',
  '.role-refresh-button:focus-visible','.role-tab-button:focus-visible',
  '.role-proposal-button:focus-visible','.role-activation-button:focus-visible',
  '.role-search:focus-visible','.role-table-scroll',
  '@media(max-width:1250px)','@media(max-width:820px)',
  '@media(max-width:650px)','@media(max-width:395px)',
  '@media(prefers-reduced-motion:reduce)','@media(prefers-contrast:more)'])
  assert.ok(css.includes(selector),selector);
 assert.match(css,/overflow-x:auto/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
 const visuals=readFileSync('frontend/role-configuration-visuals.js','utf8');
 assert.doesNotMatch(visuals,/WebGL|requestAnimationFrame|setInterval|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(visuals,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
});

test('mounted role-configuration components remain stationary on entry and refresh',()=>{
 let queries=0,animations=0;
 const node={isConnected:true,querySelectorAll(){queries++;return [{animate(){animations++;}}]},
  animate(){animations++;}};
 stopRoleConfigurationMotion();
 mountRoleConfigurationMotion(node,'role-configuration');
 mountRoleConfigurationMotion(node,'role-configuration');
 mountRoleConfigurationMotion(null,'overview');
 mountRoleConfigurationMotion(node,'role-configuration');
 stopRoleConfigurationMotion();
 assert.equal(queries,0,'no entrance element traversal');
 assert.equal(animations,0,'no mount-time animations');
 const source=readFileSync('frontend/role-configuration-visuals.js','utf8');
 assert.doesNotMatch(source,/\.animate\s*\(|translate3d\(|requestAnimationFrame\s*\(/);
});
