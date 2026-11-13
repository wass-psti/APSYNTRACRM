import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderUserRoleManagement,APSYNTRA_CRM_PLATFORM_ROLES,MODULE_ROLE_OPTIONS} from '../user-role-management.js';
import {mountUserRoleMotion,stopUserRoleMotion} from '../user-role-visuals.js';

const app=readFileSync('frontend/app.js','utf8');
const ui=readFileSync('frontend/user-role-management.js','utf8');
const css=readFileSync('frontend/user-role-experience.css','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const target='11111111-1111-4111-8111-111111111111';
const protectedId='22222222-2222-4222-8222-222222222222';
const boardId='33333333-3333-4333-8333-333333333333';
const data={
 users:[{id:target,name:'Ordinary employee',email:'member@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1},
  {id:protectedId,name:'Protected administrator',email:'bootstrap@example.invalid',platformRole:'admin_general_manager',protected:true,activeWorkspaceCount:1}],
 modules:[],
 moduleAssignments:[{userId:target,moduleId:'time-tracker',role:'Employee',enabled:true}],
 boards:[{id:boardId,name:'QA board'}],
 boardAssignments:[{userId:target,boardId,role:'editor'}],
 crmPlatformRoles:[{userId:target,effectiveRole:'employee',assignedRole:null}],
 crmPlatformUnavailable:false,workspaceScopeCountsAvailable:true,workspaceScopedMrhAvailable:true
};

test('unverified and loading routes do not leak protected user data and close wrappers',()=>{
 const denied=renderUserRoleManagement({verified:false,data});
 assert.match(denied,/Role management unavailable/);
 assert.doesNotMatch(denied,/bootstrap@example.invalid|aps-user-role-management|user-role-edit-board/);
 const pending=renderUserRoleManagement({verified:true,data:null});
 assert.ok(pending.startsWith('<div class="aps-user-role-management">'));
 assert.ok(pending.endsWith('</div>'));
 assert.match(pending,/Loading authorized workspace members/);
 assert.doesNotMatch(pending,/user-role-selection-panel|data-action="user-role-edit-board"/);
 const none=renderUserRoleManagement({verified:true,data:{...data,users:[]},selectedUserId:null});
 assert.match(none,/No active members/);
 assert.ok(none.endsWith('</div>'));
});

test('redesign is scoped to role management only and preserves original signed session shell',()=>{
 const output=renderUserRoleManagement({verified:true,data,selectedUserId:target});
 assert.match(output,/^<div class="aps-user-role-management">/);
 assert.match(output,/class="page-head user-role-hero user-role-entrance"/);
 assert.match(output,/aria-labelledby="user-role-title"/);
 assert.match(output,/class="note security-note user-role-warning user-role-entrance"/);
 assert.match(output,/class="stat-grid user-role-stat-grid user-role-entrance"/);
 assert.match(output,/class="panel user-role-selection-panel user-role-entrance"/);
 assert.match(output,/class="panel user-role-selected-panel user-role-entrance"/);
 assert.match(output,/class="panel user-role-platform-panel"/);
 assert.equal((output.match(/class="panel user-role-table-panel"/g)||[]).length,2);
 assert.match(output,/class="muted user-role-boundary-note"/);
 assert.ok(output.endsWith('</div>'));
 assert.match(app,/classList\.toggle\('aps-user-roles-shell',state\.view==='user-role-management'\)/);
 assert.match(app,/mountUserRoleMotion\(root\.querySelector\('\.aps-user-role-management'\),state\.view\)/);
 assert.match(app,/stopUserRoleMotion\(\)/);
 assert.match(html,/frontend\/user-role-experience\.css/);
 for(const asset of ['frontend/user-role-experience.css','frontend/user-role-visuals.js'])
  assert.ok(smoke.includes("'"+asset+"'"),asset);
});

test('four server-sourced metrics and full twelve-module and board listings are preserved',()=>{
 const output=renderUserRoleManagement({verified:true,data,selectedUserId:target});
 for(const [label,count] of [
  ['Active workspace members',2],['Application assignments',1],
  ['Board memberships',1],['Available boards',1]
 ])assert.ok(output.includes('>'+label+'</span><strong class="stat-value">'+count+'</strong>'),label);
 assert.equal((output.match(/class="stat-card user-role-stat-card/g)||[]).length,4);
 assert.equal((output.match(/data-action="user-role-edit-module"/g)||[]).length,12);
 assert.equal((output.match(/data-action="user-role-edit-board"/g)||[]).length,1);
 assert.equal((output.match(/aria-label="Application-specific assignments"/g)||[]).length,1);
 assert.equal((output.match(/aria-label="Individual board access"/g)||[]).length,1);
 assert.equal(Object.keys(MODULE_ROLE_OPTIONS).length,12);
 assert.deepEqual(APSYNTRA_CRM_PLATFORM_ROLES,['admin','supervisor','employee','viewer']);
 assert.match(output,/data-action="user-role-refresh"/);
 assert.match(output,/data-action="user-role-select"/);
 assert.match(output,/id="managed-user"/);
 assert.match(output,/data-action="user-role-edit-crm-platform"/);
 for(const action of ['user-role-refresh','user-role-edit-crm-platform','user-role-revert-crm-platform',
  'user-role-edit-module','user-role-revoke-module','user-role-edit-board','user-role-revoke-board'])
  assert.ok(app.includes("case '"+action+"'"),action);
});

test('verified protected administrator remains immutable in all controls',()=>{
 const result=renderUserRoleManagement({verified:true,data,selectedUserId:protectedId});
 assert.match(result,/Protected administrator — role modifications are intentionally disabled/);
 assert.match(result,/admin_general_manager/);
 assert.match(result,/data-action="user-role-edit-crm-platform"[^>]*disabled/);
 assert.equal((result.match(/data-action="user-role-edit-module"[^>]*disabled/g)||[]).length,12);
 assert.match(result,/data-action="user-role-edit-board"[^>]*disabled/);
 assert.doesNotMatch(result,/data-action="user-role-revert-crm-platform"/);
 assert.match(result,/Verified CRM Administrators can manage roles in their active workspace/);
 assert.match(result,/backend rejects self-promotion, protected administrators, stale updates, and cross-workspace targets/);
});

test('non-bootstrap inherited platform admin is not locked solely by platform identity',()=>{
 const inheritedId='55555555-5555-4555-8555-555555555555';
 const inherited={id:inheritedId,name:'Non-bootstrap inherited admin',
  email:'inherited-admin@example.invalid',platformRole:'admin_general_manager',
  protected:false,activeWorkspaceCount:1};
 const expanded={...data,users:[...data.users,inherited],
  crmPlatformRoles:[...data.crmPlatformRoles,{userId:inheritedId,
   inheritedRole:'admin',effectiveRole:'admin',assignedRole:null}]};
 const result=renderUserRoleManagement({verified:true,data:expanded,selectedUserId:inheritedId});
 assert.doesNotMatch(result,/Protected administrator — role modifications are intentionally disabled/);
 assert.match(result,/CRM admin \(inherited\)/);
 assert.match(result,/data-action="user-role-edit-crm-platform" data-user-id="55555555-5555-4555-8555-555555555555" >/);
 assert.match(result,/data-action="user-role-edit-module" data-user-id="55555555-5555-4555-8555-555555555555" data-resource="time-tracker" >/);
 assert.match(result,/data-action="user-role-edit-board" data-user-id="55555555-5555-4555-8555-555555555555"/);
});

test('ordinary account keeps editable role actions, revocation and CRM ceiling messaging',()=>{
 const result=renderUserRoleManagement({verified:true,data,selectedUserId:target});
 assert.match(result,/id="managed-user"/);
 assert.match(result,/Ordinary employee/);
 assert.match(result,/data-action="user-role-edit-crm-platform" data-user-id="11111111-1111-4111-8111-111111111111" >/);
 assert.match(result,/data-action="user-role-edit-module" data-user-id="11111111-1111-4111-8111-111111111111" data-resource="time-tracker" >/);
 assert.match(result,/data-action="user-role-revoke-module"/);
 assert.match(result,/data-action="user-role-edit-board"/);
 assert.match(result,/data-action="user-role-revoke-board"/);
 assert.match(result,/This is the CRM-wide authorization ceiling/);
 assert.match(result,/Explicit Viewer blocks module write-level roles and board edit\/manage/);
 assert.match(result,/Owner privileges cannot be granted or changed here/);
 assert.match(result,/A board membership alone does not grant access to sensitive domain records/);
 const unknown=renderUserRoleManagement({verified:true,data:{...data,crmPlatformUnavailable:true},selectedUserId:target});
 assert.match(unknown,/CRM changes are disabled/);
 assert.match(unknown,/Unavailable — backend migration pending/);
 assert.match(unknown,/data-action="user-role-edit-crm-platform"[^>]*disabled/);
});

test('server-controlled user labels and errors remain HTML escaped',()=>{
 const malicious={...data,
  users:[{...data.users[0],name:'<script>alert(1)</script>',email:'member@example.invalid',platformRole:'employee'},
   {...data.users[1],name:'',email:'<img src=x onerror=alert(2)>',platformRole:'admin_general_manager'}],
  boards:[{id:boardId,name:'<svg onload=alert(3)>'}]};
 const result=renderUserRoleManagement({verified:true,data:malicious,selectedUserId:target,
  error:'<b onclick=alert(4)>oops</b>'});
 assert.doesNotMatch(result,/<script>|<img src=x|<svg onload=|<b onclick/);
 assert.match(result,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(result,/&lt;img src=x onerror=alert\(2\)&gt;/);
 assert.match(result,/&lt;svg onload=alert\(3\)&gt;/);
 assert.match(result,/&lt;b onclick=alert\(4\)&gt;oops&lt;\/b&gt;/);
 assert.doesNotMatch(result,/<(?:button|input|div|select|section|table|td|span|svg|a|h1|p|b|img)[^>]*\s(?:onclick|oninput|style)=/i);
});

test('scoped stylesheet includes responsive, keyboard, reduced-motion and contrast rules',()=>{
 for(const rule of [
  '#app .aps-user-roles-shell','#app .aps-user-role-management',
  '.user-role-account-select:focus-visible','.user-role-refresh:focus-visible',
  '.user-role-table button:focus-visible','.user-role-stat-grid',
  '.user-role-table-scroll','.user-role-protected','.user-role-ceiling-note',
  '@media(max-width:1250px)','@media(max-width:820px)',
  '@media(max-width:650px)','@media(max-width:395px)',
  '@media(prefers-reduced-motion:reduce)','@media(prefers-contrast:more)'
 ])assert.ok(css.includes(rule),rule);
 assert.match(css,/overflow-x:auto/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
 const visual=readFileSync('frontend/user-role-visuals.js','utf8');
 assert.doesNotMatch(visual,/WebGL|requestAnimationFrame|setInterval|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(visual,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
});

test('mounted user-role-management components remain stationary on entry and refresh',()=>{
 let queries=0,animations=0;
 const node={isConnected:true,querySelectorAll(){queries++;return [{animate(){animations++;}}]},
  animate(){animations++;}};
 stopUserRoleMotion();
 mountUserRoleMotion(node,'user-role-management');
 mountUserRoleMotion(node,'user-role-management');
 mountUserRoleMotion(null,'overview');
 mountUserRoleMotion(node,'user-role-management');
 stopUserRoleMotion();
 assert.equal(queries,0,'no entrance element traversal');
 assert.equal(animations,0,'no mount-time animations');
 const source=readFileSync('frontend/user-role-visuals.js','utf8');
 assert.doesNotMatch(source,/\.animate\s*\(|translate3d\(|requestAnimationFrame\s*\(/);
});

test('multi-workspace target keeps MRH and board roles scoped while blocking global application roles',()=>{
 const multi={...data,users:data.users.map(u=>u.id===target?{...u,activeWorkspaceCount:2}:u)};
 const output=renderUserRoleManagement({verified:true,data:multi,selectedUserId:target});
 assert.match(output,/This account has 2 active workspace memberships/);
 for(const moduleId of Object.keys(MODULE_ROLE_OPTIONS)){
  const button=output.match(new RegExp('data-action="user-role-edit-module" data-user-id="'+target+'" data-resource="'+moduleId+'"[^>]*'));
  assert.ok(button,moduleId);
  if(['material-request-hub','toolbox-issues'].includes(moduleId))assert.doesNotMatch(button[0],/disabled/);
  else assert.match(button[0],/disabled/,moduleId);
 }
 assert.ok(output.includes('data-action="user-role-edit-board" data-user-id="'+target+'" data-resource="'+boardId+'" >'));
});
test('MRH assignment fails closed until the scoped backend contract is installed',()=>{
 const pending={...data,workspaceScopedMrhAvailable:false};
 const output=renderUserRoleManagement({verified:true,data:pending,selectedUserId:target});
 assert.match(output,/Workspace-scoped Material Request Hub role management is not yet confirmed/);
 assert.ok(new RegExp('data-action="user-role-edit-module" data-user-id="'+target+'" data-resource="material-request-hub"[^>]*disabled').test(output));
});

test('signed-in owner with no other workspace members sees explicit self-assignment and empty-target guidance',()=>{
 const owner={id:'44444444-4444-4444-8444-444444444444',name:'Workspace Owner',
  email:'owner@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:2};
 const isolated={...data,users:[owner],moduleAssignments:[],boardAssignments:[],boards:[],
  crmPlatformRoles:[{userId:owner.id,effectiveRole:'admin',assignedRole:null}]};
 const output=renderUserRoleManagement({verified:true,data:isolated,selectedUserId:owner.id,actorUserId:owner.id});
 assert.match(output,/The signed-in administrator cannot assign or modify roles on their own account/);
 assert.match(output,/There are no other eligible active members in this workspace/);
 assert.equal((output.match(/data-action="user-role-edit-module"[^>]*disabled/g)||[]).length,12);
 assert.match(output,/data-action="user-role-edit-module"[^>]*title="Self-assignment is not permitted\."/);
});

test('default selection and single-workspace application controls remain actionable for an ordinary member',()=>{
 const ordinary={id:'66666666-6666-4666-8666-666666666666',name:'Ordinary member',
  email:'ordinary@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1};
 const expanded={...data,users:[data.users[1],ordinary],moduleAssignments:[],boards:[],boardAssignments:[],
  crmPlatformRoles:[{userId:ordinary.id,effectiveRole:'employee',assignedRole:null}]};
 const output=renderUserRoleManagement({verified:true,data:expanded,selectedUserId:ordinary.id,actorUserId:'77777777-7777-4777-8777-777777777777'});
 assert.match(output,/data-action="user-role-edit-module" data-user-id="66666666-6666-4666-8666-666666666666" data-resource="time-tracker" >/);
 assert.doesNotMatch(output,/data-action="user-role-edit-module" data-user-id="66666666-6666-4666-8666-666666666666" data-resource="time-tracker"[^>]*disabled/);
 assert.match(output,/data-action="user-role-edit-module" data-user-id="66666666-6666-4666-8666-666666666666" data-resource="toolbox-issues" >/);
 assert.match(output,/data-resource="toolbox-issues"[^>]*>Assign \/ change<\/button>/);
});

test('multi-workspace target keeps workspace-scoped MRH and board controls but explains legacy application limits',()=>{
 const multi={id:'88888888-8888-4888-8888-888888888888',name:'Multi-workspace member',
  email:'multi@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:2};
 const expanded={...data,users:[multi],moduleAssignments:[],boards:[{id:boardId,name:'Scoped board'}],
  boardAssignments:[],crmPlatformRoles:[{userId:multi.id,effectiveRole:'employee',assignedRole:null}]};
 const output=renderUserRoleManagement({verified:true,data:expanded,selectedUserId:multi.id,actorUserId:'77777777-7777-4777-8777-777777777777'});
 assert.match(output,/Legacy application roles are global across workspaces/);
 assert.match(output,/data-resource="time-tracker" disabled title="This legacy application role is global/);
 assert.match(output,/data-resource="material-request-hub" >/);
 assert.match(output,/data-resource="toolbox-issues" >/);
 assert.match(output,/data-action="user-role-edit-board" data-user-id="88888888-8888-4888-8888-888888888888"/);
 assert.doesNotMatch(output,/data-action="user-role-edit-board"[^>]*disabled/);
});

test('initial role-management render defaults away from the first protected account',()=>{
 const protectedFirst={id:'99999999-9999-4999-8999-999999999999',name:'Bootstrap admin',
  email:'bootstrap@example.invalid',platformRole:'admin_general_manager',protected:true,activeWorkspaceCount:1};
 const eligible={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Eligible member',
  email:'eligible@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1};
 const expanded={...data,users:[protectedFirst,eligible],moduleAssignments:[],boards:[],boardAssignments:[],
  crmPlatformRoles:[{userId:eligible.id,effectiveRole:'employee',assignedRole:null}]};
 const output=renderUserRoleManagement({verified:true,data:expanded,actorUserId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
 assert.match(output,/option value="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" selected/);
 assert.doesNotMatch(output,/Protected administrator — role modifications are intentionally disabled/);
 assert.match(output,/data-action="user-role-edit-module" data-user-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" data-resource="time-tracker" >/);
});

test('Toolbox source membership is displayed as the effective role with change and revoke controls',()=>{
 const source={...data,moduleAssignments:[{userId:target,moduleId:'toolbox-issues',
  role:'supervisor',enabled:true,updatedAt:'2026-11-13T04:00:00Z'}]};
 const output=renderUserRoleManagement({verified:true,data:source,selectedUserId:target});
 assert.match(output,/Active: supervisor/);
 assert.match(output,/Existing domain role handler/);
 assert.match(output,/data-action="user-role-edit-module" data-user-id="11111111-1111-4111-8111-111111111111" data-resource="toolbox-issues" >/);
 assert.match(output,/data-action="user-role-revoke-module" data-user-id="11111111-1111-4111-8111-111111111111" data-resource="toolbox-issues"/);
});

test('Toolbox assignment fails closed when the backend has not verified the target workspace count',()=>{
 const unverified={...data,users:[{...data.users[0],activeWorkspaceCount:null}]};
 const output=renderUserRoleManagement({verified:true,data:unverified,selectedUserId:target});
 assert.match(output,/The backend has not verified this account’s active workspace scope/);
 assert.match(output,/data-resource="toolbox-issues" disabled title="The backend has not verified this account/);
});
