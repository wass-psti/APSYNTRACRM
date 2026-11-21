/** CRM Admin role configuration, backed by server-authorized RPC.
 * All writes are proposals. This UI cannot elevate a user or alter live membership.
 */
import {BOARD_MODULES} from './board/services/manifest.js';
import {roleConfigurationIcon} from './role-configuration-visuals.js';
const actions=['view','create','edit','delete','approve','export','administer'];
const x=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const PERMISSION_ACTIONS=Object.freeze(actions);
const summaryCards=(d)=>{
 const roles=d.roles||[],users=d.users||[],proposals=d.proposals||[],boards=d.boards||[];
 return '<section class="stat-grid role-stat-grid role-entrance" aria-label="Role configuration statistics">'+[
  ['Reference / draft roles',roles.length,'roles'],
  ['Workspace users',users.length,'users'],
  ['Accessible boards',boards.length,'boards'],
  ['Pending proposals',proposals.length,'proposals']
 ].map(([label,value,icon])=>'<div class="stat-card role-stat-card role-stat-'+icon+'"><span class="role-stat-icon" aria-hidden="true">'+roleConfigurationIcon(icon)+'</span><div class="stat-label">'+x(label)+'</div><div class="stat-value">'+value+'</div></div>').join('')+'</section>';
};
const tabs=[
 ['roles','Role catalog'],['users','Assignments'],
 ['matrix','Permission matrix'],['board-access','Board Access'],
 ['workspace','Workspace access'],['audit','Change history']
];
function sectionTable(headers,body,label='Role configuration records'){
 return '<div class="panel role-table-panel"><div class="table-scroll role-table-scroll" tabindex="0" role="region" aria-label="'+x(label)+', scroll horizontally for more columns"><table class="board-table role-data-table" aria-label="'+x(label)+'"><thead><tr>'+
 headers.map(h=>'<th scope="col">'+x(h)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div></div>';
}
function roles(d){
 const records=d.roles||[];
 let rows=records.map(r=>'<tr data-searchable="'+x((r.roleKey+' '+r.displayName).toLowerCase())+'">'+
 '<td><strong>'+x(r.displayName)+'</strong><div class="muted csp-u020" >'+x(r.roleKey)+'</div></td>'+
 '<td>'+x(r.kind)+'</td><td><span class="status '+(r.state==='reference'?'done':'todo')+'">'+x(r.state)+'</span></td>'+
 '<td>v'+Number(r.revision||1)+'</td><td>'+
 (r.kind==='system_reference'?'Protected default role':
 '<button class="secondary" data-action="role-propose-edit" data-role-key="'+x(r.roleKey)+'">Propose edit</button>')+
 '</td></tr>').join('');
 const crmCatalog='<div class="section-header role-section-header role-entrance"><strong>APSYNTRA CRM platform authorization</strong></div>'+
 '<div class="note role-info-note">The CRM role tier is separate from WatchdogWorkspace identity and from the twelve application and board assignments. An explicitly assigned CRM tier sets the maximum effective permission level, but never grants an application membership, board ownership or unrelated application access.</div>'+
 sectionTable(['CRM role','Ceiling','Central administration'],[
 ['Admin','Maximum CRM operational tier; existing module and board grants remain required','CRM Administrator role management'],
 ['Supervisor','Supervisory/module scope; no board manage through a CRM override','Not delegated by default'],
 ['Employee','Normal operational/module scope; no board manage through a CRM override','Not delegated'],
 ['Viewer','View-only where the domain defines a read role; blocks edit/manage','Not delegated']
 ].map(([role,ceiling,admin])=>'<tr><td><strong>'+x(role)+'</strong></td><td>'+
 x(ceiling)+'</td><td>'+x(admin)+'</td></tr>').join(''),'CRM platform role reference');
 return crmCatalog+'<div class="section-header role-section-header role-catalog-heading"><strong>Central role catalog</strong><button class="primary role-proposal-button" data-action="role-propose-create">＋ New role proposal</button></div>'+
 '<div class="note role-info-note role-hierarchy-note">Default role hierarchy: <strong>Admin → Supervisor → Employee → Viewer</strong>. These are immutable reference definitions. New roles and revisions are staged only; live backend permissions are unchanged.</div>'+
 '<div class="role-search-wrap"><input id="search-system-roles" class="search-input csp-u057 role-search" type="search" placeholder="Search roles" aria-label="Search roles" ></div>'+
 sectionTable(['Role','Kind','State','Revision','Actions'],rows||'<tr><td colspan="5">No role definitions</td></tr>','Central role catalog')+
 '<div class="csp-u046 role-catalog-actions" ><button class="secondary role-activation-button" data-action="role-propose-activation">Propose activation / deactivation</button></div>';
}
function assignments(d){
 const users=d.users||[],assignments=d.assignments||[];
 const byUser=new Map();
 for(const a of assignments){const arr=byUser.get(a.userId)||[];arr.push(a);byUser.set(a.userId,arr);}
 const rows=users.map(u=>{
  const roles=byUser.get(u.id)||[];
  const protectedAccount=!!u.bootstrapProtected;
  return '<tr data-searchable="'+x((u.displayName+' '+u.email+' '+u.platformRole).toLowerCase())+'"><td><strong>'+
   x(u.displayName||'User')+'</strong><div class="muted csp-u020" >'+x(u.email)+'</div></td>'+
   '<td>'+x(u.platformRole)+'</td><td>'+
   (roles.map(r=>'<span class="status '+(r.enabled?'done':'todo')+'">'+x(r.moduleId)+': '+x(r.role)+'</span>').join(' ')||
    '<span class="muted">No existing module assignment</span>')+
   '</td><td>'+(protectedAccount?'<span class="status done">Protected bootstrap identity</span>':
     '<button class="secondary" data-action="role-propose-assign" data-user-id="'+x(u.id)+'">Stage assignment</button>')+
   '</td></tr>';
 }).join('');
 return '<div class="section-header"><strong>Existing platform and module assignments</strong><span class="muted">Server-sourced, read-only</span></div>'+
 '<input id="search-workspace-members" type="search" class="search-input csp-u057" placeholder="Search workspace members" aria-label="Search workspace members" autocomplete="off">'+
 sectionTable(['Account','Platform role','Actual module assignments','Proposal'],rows||'<tr><td colspan="4">No members</td></tr>','Workspace member role assignments')+
 '<div class="note">Effective access is still decided by the existing central backend, active workspace and module-specific guards. These records show authoritative stored assignments; pending proposals do not grant access.</div>';
}
function matrix(d){
 const roleNames=(d.roles||[]).map(r=>r.roleKey).filter(Boolean);
 let rows='';
 for(const module of BOARD_MODULES){
  rows+='<tr data-searchable="'+x(module.name.toLowerCase())+'"><td><strong>'+x(module.name)+'</strong></td>'+
  actions.map(action=>'<td><button class="secondary" data-action="role-propose-permission" data-module-id="'+x(ROLE_MODULE_OPTIONS.find(m=>m[1]===module.name)?.[0]||module.key)+'" data-capability="'+action+'" aria-label="Stage '+x(action)+' proposal for '+x(module.name)+'; no live permission change" title="Stage a proposal; no live change">Stage</button></td>').join('')+'</tr>';
 }
 return '<div class="section-header"><strong>Module permission matrix</strong><span class="muted">12 modules × 7 capabilities</span></div>'+
 '<div class="note">All matrix entries are proposal controls, <strong>not effective grants</strong>. Module-specific roles remain mapped to the existing authorization system. Approval and activation are disabled until separately authorized.</div>'+
 '<input id="filter-role-permission-modules" type="search" class="search-input csp-u057" placeholder="Filter application modules" aria-label="Filter application modules" autocomplete="off">'+
 sectionTable(['Module',...actions],rows,'Module permission proposal matrix')+
 '<p class="muted csp-u027" >Available role keys: '+x(roleNames.join(', '))+'</p>';
}
function workspaces(d){
 const boardCount=(d.boards||[]).length;
 return '<div class="panel"><div class="panel-header"><h3>Workspace policy configuration</h3></div><div class="panel-body">'+
 '<div class="settings-detail"><label>Current verified workspace</label><strong>'+x(d.workspaceId)+'</strong></div>'+
 '<div class="settings-detail"><label>Active boards</label><strong>'+boardCount+'</strong></div>'+
 '<div class="settings-detail"><label>Enforcement</label><strong>Existing Supabase workspace membership and board access</strong></div>'+
 '<div class="note">Workspace restrictions must be checked by the server. Draft restrictions cannot broaden an account’s existing permissions.</div>'+
 '<button class="secondary" data-action="role-propose-workspace">Stage workspace restriction</button>'+
 '</div></div>';
}
function boardAccess({data=null,selectedUserId=null,actorUserId=null,busy=false,search=''}={}){
 if(!data||!Array.isArray(data.users)||!Array.isArray(data.boards)||
    !Array.isArray(data.boardAssignments))
  return '<div class="note" role="status">Loading verified board access assignments…</div>';
 const users=data.users;
 const user=users.find(item=>item.id===selectedUserId)||null;
 const locked=!user||user.protected===true||user.id===actorUserId||busy;
 const query=String(search||'').trim().toLocaleLowerCase().slice(0,120);
 const visible=data.boards.filter(board=>String(board.name||'').toLocaleLowerCase().includes(query)).length;
 const options=users.map(member=>{
  const label=(member.name||member.email||'Workspace member')+
   (member.protected?' · Protected':member.id===actorUserId?' · Current account':'');
  return '<option value="'+x(member.id)+'"'+(member.id===user?.id?' selected':'')+'> '+x(label)+'</option>';
 }).join('');
 let html='<section class="role-board-access" aria-label="Board access configuration">'+
  '<div class="role-board-access-toolbar"><div class="role-board-access-member"><label for="role-board-access-user">Workspace member</label>'+
  '<select id="role-board-access-user" aria-describedby="role-board-access-member-note">'+
  '<option value="">Select a member</option>'+options+'</select>'+
  '<p id="role-board-access-member-note" class="muted">Choose a member to review and configure board access in this workspace.</p></div>'+
  '<div class="role-board-access-search"><label for="role-board-access-search">Find a board</label>'+
  '<input id="role-board-access-search" type="search" value="'+x(search)+'" placeholder="Search boards by name" autocomplete="off" aria-controls="role-board-access-table" aria-describedby="role-board-access-count">'+
  '<p id="role-board-access-count" role="status" aria-live="polite">'+visible.toLocaleString('en-US')+' of '+data.boards.length.toLocaleString('en-US')+' boards</p></div></div>';
 if(user){
  html+='<div class="role-board-access-selected"><div><span class="role-content-eyebrow">Selected member</span><strong>'+x(user.name||user.email||'Workspace member')+'</strong>'+
   (user.email?'<small>'+x(user.email)+'</small>':'')+'</div><span class="role-board-access-scope">Active workspace only</span></div>';
  if(user.protected||user.id===actorUserId)
   html+='<div class="note">'+(user.protected?'This protected administrator is read-only here.':'Your own board access cannot be assigned or revoked from this screen.')+'</div>';
 }else{
  html+='<div class="note" role="status">Select a workspace member to view their board memberships.</div>';
 }
 html+='<div class="note role-board-access-note">Viewer permits board reads. Editor permits board reads and writes. Existing Owner assignments are displayed but cannot be changed here. Board access is workspace-scoped and continues to use the existing server-side assignment workflow.</div>'+
  '<div class="panel role-board-access-table-panel"><div class="table-scroll role-board-access-table-scroll" role="region" aria-label="Board access assignments, scroll horizontally for more columns" tabindex="0">'+
  '<table id="role-board-access-table" class="board-table role-board-access-table"><thead><tr><th scope="col">Board</th><th scope="col">Current access</th><th scope="col">Configuration</th></tr></thead><tbody>';
 for(const board of data.boards){
  const assignment=user?data.boardAssignments.find(item=>item.userId===user.id&&item.boardId===board.id):null;
  const role=assignment?.role||'No access';
  const owner=assignment?.role==='owner';
  const disabled=locked||owner;
  const name=String(board.name||'');
  const normalized=name.toLocaleLowerCase();
  html+='<tr data-role-board-access-row data-board-name="'+x(normalized)+'"'+(normalized.includes(query)?'':' hidden')+'>'+
   '<td><strong>'+x(name||'Untitled board')+'</strong></td>'+
   '<td><span class="role-board-access-status '+(assignment?'done':'todo')+'">'+x(role)+'</span></td><td>'+
   '<button type="button" class="secondary" aria-label="Set access for '+x(name)+'" data-action="user-role-edit-board" data-user-id="'+x(user?.id||'')+'" data-resource="'+x(board.id)+'"'+(disabled?' disabled':'')+'>Set access</button> '+
   (assignment&&!owner?'<button type="button" class="secondary" aria-label="Revoke access for '+x(name)+'" data-action="user-role-revoke-board" data-user-id="'+x(user?.id||'')+'" data-resource="'+x(board.id)+'"'+(locked?' disabled':'')+'>Revoke</button>':'')+
   (owner?'<span class="muted role-board-owner-note">Owner is protected</span>':'')+
   '</td></tr>';
 }
 html+='</tbody></table></div>'+(data.boards.length?'':'<p class="muted role-board-access-empty">No boards are available in this workspace.</p>')+'</div>'+
  '<p class="muted role-board-access-footer">'+roleConfigurationIcon('shield')+
  '<span>Board membership does not replace application-specific roles or grant access to sensitive domain records. Changes use the existing signed board-access service and are confirmed by refreshed assignment readback.</span></p></section>';
 return html;
}
function audit(d){
 const changes=d.proposals||[],events=d.audit||[];
 const requests=changes.map(p=>'<tr data-searchable="'+x((p.operation+' '+p.status).toLowerCase())+'">'+
 '<td>'+x(p.operation)+'</td><td>'+x(p.status)+'</td><td>'+x(p.createdAt)+'</td>'+
 '<td><code>'+x(String(p.id).slice(0,8))+'</code></td></tr>').join('');
 const history=events.map(a=>'<tr><td>'+x(a.event)+'</td><td>'+x(a.detail?.operation)+'</td><td>'+x(a.recordedAt)+'</td></tr>').join('');
 return '<div class="section-header"><strong>Immutable change history</strong><span class="muted">Last 150 entries</span></div>'+
 '<div class="note">Every staged proposal produces a server-side append-only event. Updates and deletes to audit rows are blocked; audit records are not proof of approval or effective enforcement.</div>'+
 '<input id="search-role-proposals" type="search" class="search-input csp-u056" placeholder="Search proposals" aria-label="Search proposals" autocomplete="off">'+
 sectionTable(['Requested operation','Status','Created','Request ID'],requests||'<tr><td colspan="4">No changes requested</td></tr>','Staged role change proposals')+
 '<div class="section-header csp-u050" ><strong>Audit events</strong></div>'+
 sectionTable(['Event','Operation','Recorded'],history||'<tr><td colspan="3">No events recorded</td></tr>','Append-only role audit history');
}
export function renderRoleConfiguration({verified=false,loading=false,data=null,tab='roles',error='',boardAccessData=null,selectedBoardUserId=null,actorUserId=null,boardSearch='',boardBusy=false}={}){
 if(!verified)return '<div class="access-denied"><div class="denied-panel"><h1>Access unavailable</h1><p>This module requires verified CRM Administrator authority in the active workspace.</p></div></div>';
 let html='<div class="aps-role-configuration"><section class="page-head role-config-hero role-entrance" aria-labelledby="role-config-title"><div class="role-hero-copy"><span class="label-top"><span class="role-hero-dot" aria-hidden="true"></span> Administration / Central authorization</span>'+
 '<h1 id="role-config-title">Role Configuration<span class="role-heading-stop">.</span></h1><p>Manage centrally governed role change requests and review authoritative workspace grants.</p></div>'+
 '<button class="secondary role-refresh-button" data-action="role-refresh">'+roleConfigurationIcon('refresh')+'<span>Refresh verified data</span></button>'+
 '<svg class="role-hero-art" viewBox="0 0 420 210" aria-hidden="true" focusable="false" fill="none"><circle cx="334" cy="12" r="125" stroke="currentColor" stroke-opacity=".15"/><circle cx="334" cy="12" r="181" stroke="currentColor" stroke-opacity=".07"/><path d="M108 222C186 77 327 79 433 135" stroke="currentColor" stroke-opacity=".16"/><circle cx="257" cy="69" r="4" fill="#a9c9ff"/></svg></section>'+
 '<div class="note security-note role-staged-note role-entrance"><span class="role-note-icon" aria-hidden="true">'+roleConfigurationIcon('lock')+'</span><div>Verified CRM Administrators only. <strong>Role proposals: STAGED ONLY</strong> — role catalog, application-role, permission-matrix and workspace-policy proposals do not change live access. The Board Access section uses the existing server-authorized workspace board assignment workflow and verifies refreshed assignments. No bootstrap identity or board-owner assignment can be changed here.</div></div>';
 if(error)html+='<div class="error-banner" role="alert">'+x(error)+'</div>';
 if(loading)html+='<p class="muted role-loading-state" role="status" aria-live="polite">Loading verified workspace configuration…</p>';
 if(!data)return html+'</div>';
 html+='<div class="role-overview-caption"><div><span class="role-content-eyebrow">Workspace overview</span>'+
  '<h2>Role management at a glance</h2></div><span class="role-overview-caption-note">Signed workspace data</span></div>';
 html+=summaryCards(data);
 const tabIcons={roles:'shield',users:'users',matrix:'boards','board-access':'boards',workspace:'boards',audit:'proposals'};
 html+='<div class="role-config-layout"><nav class="role-config-tabs role-entrance" aria-label="Role configuration sections">'+
  '<div class="role-nav-intro"><span class="role-content-eyebrow">Manage</span><strong>Configuration</strong>'+
  '<small>Select a section to review proposals and authoritative data.</small></div>'+
  tabs.map(([key,label])=>'<button type="button" class="'+(tab===key?'primary':'secondary')+' role-tab-button" data-action="role-tab" data-tab="'+key+'" aria-pressed="'+(tab===key?'true':'false')+'"'+(tab===key?' aria-current="page"':'')+'>'+
   '<span class="role-tab-icon" aria-hidden="true">'+roleConfigurationIcon(tabIcons[key])+'</span><span class="role-tab-label">'+x(label)+'</span>'+
   (tab===key?'<span class="role-tab-current" aria-hidden="true">Active</span>':'')+'</button>').join('')+
  '<div class="role-nav-footer"><span class="role-nav-footer-dot" aria-hidden="true"></span>'+
  '<span>Role proposals are staged. Board access uses the existing workspace assignment service.</span></div></nav>';
 const sections={
  roles:['Role catalog','Review central reference roles and prepare controlled proposals.'],
  users:['Assignments','Inspect existing workspace memberships and stage proposed assignments.'],
  matrix:['Permission matrix','Review module capabilities without changing effective grants.'],
  'board-access':['Board Access','Configure individual board memberships for active workspace members.'],
  workspace:['Workspace access','Inspect signed workspace policy and stage proposed restrictions.'],
  audit:['Change history','Review staged proposals and append-only audit events.']
 };
 const [heading,description]=sections[tab]||sections.roles;
 html+='<section class="role-content-workspace" aria-labelledby="role-content-heading">'+
  '<header class="role-content-heading"><div><span class="role-content-eyebrow">Configuration workspace</span>'+
  '<h2 id="role-content-heading">'+x(heading)+'</h2>'+
  '<p>'+x(description)+'</p></div>'+
  '<span class="role-content-mode" aria-label="'+(tab==='board-access'?'Live board access mode':'Proposal-only mode')+'">'+(tab==='board-access'?'Live assignments':'Proposal-only')+'</span></header>'+
  '<div class="role-content-body">';
 html+=tab==='roles'?roles(data):tab==='users'?assignments(data):
 tab==='matrix'?matrix(data):tab==='board-access'?boardAccess({data:boardAccessData,
  selectedUserId:selectedBoardUserId,actorUserId,busy:boardBusy,search:boardSearch}):
 tab==='workspace'?workspaces(data):audit(data);
 return html+'</div></section></div></div>';
}
export const ROLE_MODULE_OPTIONS=BOARD_MODULES.map(m=>[{
 fueltrans:'fueltrans',tools:'tool-traceability',toolbox:'toolbox-issues',frt:'fund-released-tracker',
 fueltrack:'fueltrack-plus',tradelink:'tradelink',timetracker:'time-tracker',orders:'order-intake',
 evaluation:'employee-eval',charter:'charter-navigator',aims:'aps-aims',materials:'material-request-hub'
}[m.key],m.name]);
