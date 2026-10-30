/** CP-RC01 bootstrap-only role configuration, backed by server-authorized RPC.
 * All writes are proposals. This UI cannot elevate a user or alter live membership.
 */
import {BOARD_MODULES} from './board-manifest.js';
const actions=['view','create','edit','delete','approve','export','administer'];
const x=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const PERMISSION_ACTIONS=Object.freeze(actions);
const summaryCards=(d)=>{
 const roles=d.roles||[],users=d.users||[],proposals=d.proposals||[],boards=d.boards||[];
 return '<div class="stat-grid">'+[
  ['Reference / draft roles',roles.length],
  ['Workspace users',users.length],
  ['Accessible boards',boards.length],
  ['Pending proposals',proposals.length]
 ].map(([label,value])=>'<div class="stat-card"><div class="stat-label">'+x(label)+'</div><div class="stat-value">'+value+'</div></div>').join('')+'</div>';
};
const tabs=[
 ['roles','Role catalog'],['users','Assignments'],
 ['matrix','Permission matrix'],['workspace','Workspace access'],['audit','Change history']
];
function sectionTable(headers,body){
 return '<div class="panel"><div class="table-scroll"><table class="board-table"><thead><tr>'+
 headers.map(h=>'<th>'+x(h)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div></div>';
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
 return '<div class="section-header"><strong>Central role catalog</strong><button class="primary" data-action="role-propose-create">＋ New role proposal</button></div>'+
 '<div class="note">Default role hierarchy: <strong>Admin → Supervisor → Employee → Viewer</strong>. These are immutable reference definitions. New roles and revisions are staged only; live backend permissions are unchanged.</div>'+
 '<input id="search-system-roles" class="search-input csp-u057" placeholder="Search roles" aria-label="Search roles" >'+
 sectionTable(['Role','Kind','State','Revision','Actions'],rows||'<tr><td colspan="5">No role definitions</td></tr>')+
 '<div class="csp-u046" ><button class="secondary" data-action="role-propose-activation">Propose activation / deactivation</button></div>';
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
    roles.map(r=>'<span class="status '+(r.enabled?'done':'todo')+'">'+x(r.moduleId)+': '+x(r.role)+'</span>').join(' ')||
    '<span class="muted">No existing module assignment</span>'+
   '</td><td>'+(protectedAccount?'<span class="status done">Protected bootstrap identity</span>':
     '<button class="secondary" data-action="role-propose-assign" data-user-id="'+x(u.id)+'">Stage assignment</button>')+
   '</td></tr>';
 }).join('');
 return '<div class="section-header"><strong>Existing platform and module assignments</strong><span class="muted">Server-sourced, read-only</span></div>'+
 '<input id="search-workspace-members" class="search-input csp-u057" placeholder="Search workspace members" aria-label="Search workspace members" >'+
 sectionTable(['Account','Platform role','Actual module assignments','Proposal'],rows||'<tr><td colspan="4">No members</td></tr>')+
 '<div class="note">Effective access is still decided by the existing central backend, active workspace and module-specific guards. These records show authoritative stored assignments; pending proposals do not grant access.</div>';
}
function matrix(d){
 const roleNames=(d.roles||[]).map(r=>r.roleKey).filter(Boolean);
 let rows='';
 for(const module of BOARD_MODULES){
  rows+='<tr data-searchable="'+x(module.name.toLowerCase())+'"><td><strong>'+x(module.name)+'</strong></td>'+
  actions.map(action=>'<td><button class="secondary" data-action="role-propose-permission" data-module-id="'+x(ROLE_MODULE_OPTIONS.find(m=>m[1]===module.name)?.[0]||module.key)+'" data-capability="'+action+'" title="Stage a proposal; no live change">Stage</button></td>').join('')+'</tr>';
 }
 return '<div class="section-header"><strong>Module permission matrix</strong><span class="muted">12 modules × 7 capabilities</span></div>'+
 '<div class="note">All matrix entries are proposal controls, <strong>not effective grants</strong>. Module-specific roles remain mapped to the existing authorization system. Approval and activation are disabled until separately authorized.</div>'+
 '<input id="filter-role-permission-modules" class="search-input csp-u057" placeholder="Filter application modules" aria-label="Filter application modules" >'+
 sectionTable(['Module',...actions],rows)+
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
function audit(d){
 const changes=d.proposals||[],events=d.audit||[];
 const requests=changes.map(p=>'<tr data-searchable="'+x((p.operation+' '+p.status).toLowerCase())+'">'+
 '<td>'+x(p.operation)+'</td><td>'+x(p.status)+'</td><td>'+x(p.createdAt)+'</td>'+
 '<td><code>'+x(String(p.id).slice(0,8))+'</code></td></tr>').join('');
 const history=events.map(a=>'<tr><td>'+x(a.event)+'</td><td>'+x(a.detail?.operation)+'</td><td>'+x(a.recordedAt)+'</td></tr>').join('');
 return '<div class="section-header"><strong>Immutable change history</strong><span class="muted">Last 150 entries</span></div>'+
 '<div class="note">Every staged proposal produces a server-side append-only event. Updates and deletes to audit rows are blocked; audit records are not proof of approval or effective enforcement.</div>'+
 '<input id="search-role-proposals" class="search-input csp-u056" placeholder="Search proposals" aria-label="Search proposals" >'+
 sectionTable(['Requested operation','Status','Created','Request ID'],requests||'<tr><td colspan="4">No changes requested</td></tr>')+
 '<div class="section-header csp-u050" ><strong>Audit events</strong></div>'+
 sectionTable(['Event','Operation','Recorded'],history||'<tr><td colspan="3">No events recorded</td></tr>');
}
export function renderRoleConfiguration({verified=false,loading=false,data=null,tab='roles',error=''}={}){
 if(!verified)return '<div class="access-denied"><div class="denied-panel"><h1>Access unavailable</h1><p>This module is restricted to verified bootstrap administrators.</p></div></div>';
 let html='<div class="page-head"><div><span class="label-top">Administration / Central authorization</span>'+
 '<h1>Role Configuration</h1><p>Manage centrally governed role change requests and review authoritative workspace grants.</p></div>'+
 '<button class="secondary" data-action="role-refresh">↻ Refresh verified data</button></div>'+
 '<div class="note security-note">Bootstrap administrators only. <strong>Change control: STAGED ONLY</strong> — production roles, permissions, board access and memberships cannot be altered by this module until a separately approved activation release. No bootstrap identity can be assigned or revoked here.</div>';
 if(error)html+='<div class="error-banner" role="alert">'+x(error)+'</div>';
 if(loading)html+='<p class="muted">Loading verified workspace configuration…</p>';
 if(!data)return html;
 html+=summaryCards(data);
 html+='<nav class="row csp-u016" aria-label="Role configuration sections" >'+
  tabs.map(([key,label])=>'<button class="'+(tab===key?'primary':'secondary')+'" data-action="role-tab" data-tab="'+key+'">'+x(label)+'</button>').join('')+'</nav>';
 html+=tab==='roles'?roles(data):tab==='users'?assignments(data):
 tab==='matrix'?matrix(data):tab==='workspace'?workspaces(data):audit(data);
 return html;
}
export const ROLE_MODULE_OPTIONS=BOARD_MODULES.map(m=>[{
 fueltrans:'fueltrans',tools:'tool-traceability',toolbox:'toolbox-issues',frt:'fund-released-tracker',
 fueltrack:'fueltrack-plus',tradelink:'tradelink',timetracker:'time-tracker',orders:'order-intake',
 evaluation:'employee-eval',charter:'charter-navigator',aims:'aps-aims',materials:'material-request-hub'
}[m.key],m.name]);
