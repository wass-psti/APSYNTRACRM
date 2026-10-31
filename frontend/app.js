import {AuthClient,ApiError} from './session.js';
import {DomainApi,validUuid} from './data.js';
import {APP_NAME} from './config.js';
import {runReadOnlyAcceptance,summarizeAcceptance} from './acceptance.js';
import {runPagesPersistenceAcceptance,QA_BOARD_NAME} from './pages-persistence.js';
import {renderPagesAcceptance} from './pages-acceptance-ui.js';
import {runNativeQa} from './native-qa.js';
import {NativeIssueClient} from './native-client.js';
import {BOARD_MODULES,moduleByBoardName} from './board-manifest.js';
import {inspectFoundation,provisionMissingBoards} from './board-foundation.js';
import {renderFoundation} from './board-foundation-ui.js';
import {boardGrid} from './board-grid.js';
import {runTwelveBoardQa} from './board-operational-qa.js';
import {runSignedNegativeBoardAcceptance,sanitizeNegativeReport} from './board-negative-acceptance.js';
import {renderSecurityAcceptance} from './board-security-ui.js';
import {runDeniedQaWrite} from './board-negative-write.js';
import {runFRTSec03SignedAcceptance} from './frt-sec03-signed-acceptance.js';
import {runFRTSec07ActivationGate} from './frt-sec07-signed-activation.js';
import {runFRTSec09SignedAcceptance,sanitizeFRTSec09Report} from './frt-sec09-signed-acceptance.js';
import {runFRTSec10SignedCeilingProbe,sanitizeFRTSec10Report} from './frt-sec10-signed-ceiling.js';
import {RoleConfigurationClient} from './role-configuration-client.js';
import {renderRoleConfiguration,ROLE_MODULE_OPTIONS} from './role-configuration-ui.js';
import {UserRoleManagementClient,renderUserRoleManagement,MODULE_ROLE_OPTIONS,APSYNTRA_CRM_PLATFORM_ROLES} from './user-role-management.js';

const root=document.getElementById('app');
const auth=new AuthClient();
const db=new DomainApi(auth);
const nativeIssues=new NativeIssueClient(db);
const roleConfig=new RoleConfigurationClient(db);
const userRoleManager=new UserRoleManagementClient(db);
const state={context:null,user:null,boards:[],archived:[],showArchived:false,board:null,issues:[],edit:false,
  view:'overview',boardId:null,tab:'items',loading:false,loadingIssues:false,filter:'',error:null,authBusy:false,acceptance:null,acceptanceBusy:false,pagesAcceptance:null,pagesBusy:false,nativeAcceptance:null,nativeBusy:false,foundationRows:[],foundationBusy:false,provisionBusy:false,foundationLog:[],foundationError:'',foundationTesting:false,foundationTestResult:null,securityBusy:false,securityResult:null,securityProgress:[],securityWriteBusy:false,securityWriteResult:null,frtSecurityBusy:false,frtSecurityResult:null,sec07Busy:false,sec07Result:null,sec09Busy:false,sec09Result:null,sec09RunId:0,sec10Busy:false,sec10Result:null,sec10RunId:0,roleVerified:false,roleData:null,roleTab:'roles',roleBusy:false,roleError:'',userRoleData:null,userRoleSelected:null,userRoleBusy:false,userRoleError:''};
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusClass=value=>({'done':'done','completed':'completed','working':'working','in progress':'in-progress',
'stuck':'stuck','blocked':'blocked','todo':'todo','planned':'planned'}[String(value??'').toLowerCase()]||'todo');
const displayDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(d)};
const initials=value=>String(value||'U').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
const iconColor=index=>['','green','orange','pink','blue'][Math.abs(index)%5];
const name=()=>state.context?.profile?.display_name||state.context?.profile?.email?.split('@')[0]||'Member';
const workspaceName=()=>state.context?.workspace_id==='00000000-0000-4000-8000-000000000001'?'Work Management':'Current workspace';
const cards=()=>state.showArchived?state.archived:state.boards;
const routeHome='#/overview';
let modal=null;
let routeSerial=0;

function toast(message,error=false){
 let holder=document.querySelector('.toast-container');
 if(!holder){holder=document.createElement('div');holder.className='toast-container';document.body.append(holder);}
 const item=document.createElement('div');item.className='toast'+(error?' error':'');item.textContent=message;holder.append(item);
 setTimeout(()=>item.remove(),4500);
}
function errorMessage(err){if(err instanceof ApiError&&err.status===403)return 'Access denied by your workspace permissions.';return err?.message||'Unable to complete the request.';}
function notice(err){toast(errorMessage(err),true);}
function renderLogin(message=''){
 root.innerHTML=`<div class="auth-layout">
 <div class="auth-left"><a href="#/login" class="brand"><span class="brand-mark">A</span><span>APSYNTRA <span class="csp-u043" >CRM</span></span></a>
 <section class="auth-panel"><span class="eyebrow">Your connected workspace</span>
 <h1>Welcome back<span class="csp-u010" >.</span></h1>
 <p class="muted">Sign in with your existing WatchdogWorkspace account to manage boards, collaborate, and stay on top of every detail.</p>
 ${message?`<div class="login-error" role="alert">${e(message)}</div>`:''}
 <form id="login-form"><div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" placeholder="you@company.com" autocomplete="username" required autofocus/></div>
 <div class="field"><label for="password">Password</label><div class="password-wrap"><input id="password" name="password" type="password" placeholder="Enter your password" autocomplete="current-password" required minlength="1"/><button type="button" class="eye-btn" data-action="toggle-password">Show</button></div></div>
 <button class="primary wide" type="submit" id="login-submit">Sign in to workspace <span aria-hidden="true">→</span></button></form>
 <p class="csp-u064" >Access is managed by your organization. No new account is created.</p></section>
 <div class="auth-bottom">© ${new Date().getFullYear()} APSYNTRA CRM · Secured by Supabase Authentication</div></div>
 <div class="auth-right"><section class="auth-pitch"><span class="eyebrow csp-u014" >Built for better work</span>
 <h2>One workspace.<br/>Every possibility.</h2><p>Bring work, tasks, and conversations together in a single, beautifully organized platform.</p>
 <div class="preview"><div class="preview-top"><span class="dot csp-u003" ></span><span class="dot csp-u004" ></span><span class="dot csp-u001" ></span><strong class="csp-u022" >Your team workspace</strong></div>
 <div class="preview-body"><div class="csp-u038" >Project overview</div>
 <div class="preview-row"><span class="csp-u066" ></span><b class="csp-u018" >Plan upcoming activities</b><span class="preview-status">Done</span></div>
 <div class="preview-row"><span class="csp-u068" ></span><b class="csp-u018" >Review team assignments</b><span class="preview-status csp-u005" >In progress</span></div>
 <div class="preview-row"><span class="csp-u067" ></span><b class="csp-u018" >Monitor active requests</b><span class="preview-status csp-u002" >Planned</span></div>
 <div class="preview-line csp-u071" ></div><div class="preview-line csp-u070" ></div></div></div></section></div></div>`;
}
function sidebar(){
 const currentBoard=state.boardId;
 return `<aside class="sidebar">
   <a href="#/overview" class="brand"><span class="brand-mark">A</span><span class="brand-text">APSYNTRA <span class="csp-u043" >CRM</span></span></a>
   <div class="workspace-switcher"><div class="workspace-icon">W</div><div><div class="workspace-name">${e(workspaceName())}</div><div class="workspace-sub">Connected workspace</div></div></div>
   <div class="side-section">Workspace</div>
   <nav class="nav-list" aria-label="Primary">
     <a class="nav-link ${state.view==='overview'?'active':''}" href="#/overview"><span class="nav-ico">◫</span><span class="nav-label">Overview</span></a>
     <a class="nav-link ${state.view==='boards'?'active':''}" href="#/boards"><span class="nav-ico">▤</span><span class="nav-label">My boards</span><span class="nav-count">${state.boards.length}</span></a>
     <a class="nav-link ${state.view==='foundation'?'active':''}" href="#/foundation"><span class="nav-ico">◇</span><span class="nav-label">12-board foundation</span></a>
     <a class="nav-link ${state.view==='security'?'active':''}" href="#/security"><span class="nav-ico">◈</span><span class="nav-label">Access acceptance</span></a>
     ${state.roleVerified===true?`<div class="side-section">Administration</div><a class="nav-link ${state.view==='role-configuration'?'active':''}" href="#/role-configuration"><span class="nav-ico">⚿</span><span class="nav-label">Role Configuration</span></a><a class="nav-link ${state.view==='user-role-management'?'active':''}" href="#/user-role-management"><span class="nav-ico">♧</span><span class="nav-label">User Role Management</span></a>`:''}
     <a class="nav-link ${state.view==='settings'?'active':''}" href="#/settings"><span class="nav-ico">⚙</span><span class="nav-label">Settings</span></a>
     <a class="nav-link ${state.view==='acceptance'?'active':''}" href="#/acceptance"><span class="nav-ico">✓</span><span class="nav-label">Pages acceptance</span></a>
   </nav>
   <div class="side-section">Recent boards</div>
   <nav class="nav-list" aria-label="Recent boards">${state.boards.slice(0,6).map((b,i)=>`<a class="nav-link ${currentBoard===b.id?'active':''}" href="#/boards/${e(b.id)}"><span class="nav-ico csp-u011" >▦</span><span class="nav-label">${e(b.name)}</span></a>`).join('')||'<div class="muted csp-u061" >No boards yet</div>'}</nav>
   <div class="side-bottom"><div class="profile"><span class="avatar">${e(initials(name()))}</span>
   <div><div class="name">${e(name())}</div><div class="role">${e(state.context?.profile?.platform_role||'Team member')}</div></div></div>
   <button class="sign-out" data-action="logout">⇥ <span>Sign out of workspace</span></button></div></aside>`;
}
function shell(body){
 const crumb=state.view==='board'?state.board?.board?.name||'Board':state.view==='overview'?'Overview':state.view==='boards'?'My boards':state.view==='acceptance'?'Pages acceptance':state.view==='foundation'?'12-board foundation':state.view==='security'?'Access acceptance':state.view==='role-configuration'?'Role Configuration':state.view==='user-role-management'?'User Role Management':'Settings';
 root.innerHTML=`<div class="shell">${sidebar()}<main class="main">
 <header class="topbar"><div class="breadcrumb"><span>Workspace</span><span>›</span><strong>${e(crumb)}</strong></div>
 <div class="top-actions"><span class="top-pill"><span class="online-dot"></span> Secure session</span><a href="#/settings" class="avatar top-avatar" title="Account settings">${e(initials(name()))}</a></div></header>
 <div class="main-content">${body}</div></main></div>`;
}
function boardCard(board,index){
 return `<a class="board-card" data-searchable="${e((board.name+' '+(board.description||'')).toLowerCase())}" href="#/boards/${e(board.id)}">
 <div class="board-card-top"><span class="board-symbol ${iconColor(index)}">${e((board.name||'B').slice(0,1).toUpperCase())}</span><span class="board-menu">···</span></div>
 <h3>${e(board.name||'Untitled board')}</h3><p>${e(board.description||'Organize work and track progress in this board.')}</p>
 <div class="board-card-footer"><span>▤ ${Number(board.item_count)||0} items</span><span>${e(displayDate(board.updated_at))}</span></div></a>`;
}
function empty(title,description,action=''){
 return `<div class="empty"><span class="empty-icon">▦</span><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`;
}
function overview(){
 const total=state.boards.reduce((a,b)=>a+(Number(b.item_count)||0),0);
 const recent=state.boards.slice(0,6);
 return `<div class="page-head"><div><span class="label-top">Workspace / Overview</span><h1>Good to see you, ${e(name().split(' ')[0])} 👋</h1><p>Here's what your workspace looks like today.</p></div>
 <div class="head-actions"><button class="secondary" data-action="refresh">↻ Refresh</button><button class="primary" data-action="new-board">＋ New board</button></div></div>
 <section class="stat-grid" aria-label="Workspace statistics">
 <div class="stat-card"><span class="stat-icon">▦</span><div class="stat-label">Active boards</div><div class="stat-value">${state.boards.length}</div><div class="stat-footer">Available to your account</div></div>
 <div class="stat-card"><span class="stat-icon green">☷</span><div class="stat-label">Board items</div><div class="stat-value">${total}</div><div class="stat-footer">Across your active boards</div></div>
 <div class="stat-card"><span class="stat-icon orange">◷</span><div class="stat-label">Workspace status</div><div class="stat-value csp-u042" >Active</div><div class="stat-footer">Access context verified</div></div>
 <div class="stat-card"><span class="stat-icon pink">♢</span><div class="stat-label">Your access</div><div class="stat-value csp-u041" >${e(state.context?.profile?.platform_role||'Member')}</div><div class="stat-footer">Authoritative account role</div></div></section>
 <div class="section-header"><span class="section-title">Your boards</span><a class="inline-link" href="#/boards">View all boards →</a></div>
 ${recent.length?`<div class="card-grid">${recent.map(boardCard).join('')}</div>`:
 `<div class="panel">${empty('Start with your first board','Create a board to organize tasks and updates.','<button class="primary" data-action="new-board">＋ Create board</button>')}</div>`}
 <div class="section-header"><span class="section-title">Workspace essentials</span></div>
 <div class="panel"><div class="panel-body"><div class="activity-item"><div class="activity-avatar">✓</div><div><b>Supabase Auth connected</b><small>Your session is verified against the existing identity system.</small></div></div>
 <div class="activity-item"><div class="activity-avatar">▦</div><div><b>Board permissions are centralized</b><small>Each board and action is checked against the authoritative workspace permissions.</small></div></div>
 <div class="activity-item"><div class="activity-avatar">↻</div><div><b>Native issue transactions</b><small>Issue records use the existing RLS view and atomic Supabase transaction RPC.</small></div></div></div></div>`;
}
function boardsPage(){
 const items=cards();
 return `<div class="page-head"><div><span class="label-top">Workspace / Boards</span><h1>My boards</h1><p>Everything your team is working on, organized in one place.</p></div>
 <button class="primary" data-action="new-board">＋ New board</button></div>
 <div class="toolbar"><div class="segmented"><button class="segment ${!state.showArchived?'active':''}" data-action="active-boards">Active</button><button class="segment ${state.showArchived?'active':''}" data-action="archived-boards">Archived</button></div>
 <div class="search-wrap"><input class="search-input" id="board-search" placeholder="Search boards…" aria-label="Search boards" autocomplete="off" /></div></div>
 ${items.length?`<div class="card-grid">${items.map(boardCard).join('')}</div>`:
 `<div class="panel">${empty(state.showArchived?'No archived boards':'No boards available',state.showArchived?'You have no archived boards in this workspace.':'Only boards allowed by your organization appear here.','')}</div>`}`;
}
function groupRows(items,allowEdit){
 return `<div class="panel"><div class="table-scroll"><table class="board-table"><thead><tr><th class="csp-u069" >Item name</th><th>Status</th><th>Owner</th><th>Due date</th><th></th></tr></thead>
 <tbody>${items.map(item=>`<tr data-searchable="${e((item.title||'').toLowerCase())}">
 <td>▥ &nbsp; ${e(item.title||'Untitled')}</td><td><span class="status ${statusClass(item.status)}">${e(item.status||'Planned')}</span></td>
 <td>${item.assignee_id?e(String(item.assignee_id).slice(0,8))+'…':'Unassigned'}</td><td>${e(displayDate(item.due_date))}</td>
 <td>${allowEdit?`<button class="icon-button" data-action="edit-item" data-id="${e(item.id)}" title="Edit item">✎ Edit</button>`:''}</td></tr>`).join('')||'<tr><td class="csp-u065" colspan="5" >No items in this group yet</td></tr>'}</tbody></table></div></div>`;
}
function issuesPage(){
 if(state.loadingIssues)return '<div class="panel">'+empty('Loading issues','Checking permitted Issue records…')+'</div>';
 const rows=state.issues;
 const canEdit=state.edit;
 return `<div class="toolbar"><div class="search-wrap"><input id="search-issues" class="search-input" aria-label="Search issues" placeholder="Search issues…" /></div>
 ${canEdit?'<button class="primary" data-action="new-issue">＋ New issue</button> <button class="secondary" data-action="native-new-issue">＋ Native issue</button>':''}</div>
 ${rows.length?`<div class="issue-cards">${rows.map(row=>{const s=row.payload?.snapshot||{};
 const priority=Number(s.priority??0);return `<article class="issue-row" data-searchable="${e((s.title||'').toLowerCase())}">
 <div><h3>${e(s.title||'Untitled issue')}</h3><small>Revision ${e(row.revision)} · ${e(displayDate(row.updated_at))}</small></div>
 <span class="status ${statusClass(String(s.status||'').split(':').pop())}">${e(String(s.status||'Todo').split(':').pop())}</span>
 <span class="priority ${priority>=4?'urgent':priority>=3?'high':''}">◆ ${['None','Low','Medium','High','Urgent'][Math.max(0,Math.min(4,priority))]}</span>
 ${canEdit?`<div class="issues-actions"><button class="icon-button" data-action="edit-issue" data-id="${e(row.document_id)}">✎ Edit</button>
 <button class="icon-button danger" data-action="remove-issue" data-id="${e(row.document_id)}">Remove</button>
 <button class="icon-button" data-action="native-edit-issue" data-id="${e(row.document_id)}">Native edit</button>
 <button class="icon-button danger" data-action="native-remove-issue" data-id="${e(row.document_id)}">Native remove</button></div>`:''}</article>`}).join('')}</div>`:
 `<div class="panel">${empty('No issues yet','No active APSYNTRA Issues were found for this board.',canEdit?'<button class="primary" data-action="new-issue">＋ Create first issue</button>':'')}</div>`}`;
}
function boardPage(){
 if(state.loading)return `<div class="page-head"><div><span class="label-top">Workspace / Board</span><h1>Loading board…</h1></div></div><div class="panel">${empty('Loading board','Retrieving authorized board details…')}</div>`;
 if(!state.board)return `<div class="panel">${empty('Board unavailable',state.error||'Unable to access this board.','<a class="secondary" href="#/boards">Back to boards</a>')}</div>`;
 const b=state.board.board;
 const items=Array.isArray(state.board.items)?state.board.items:[];
 const groups=Array.isArray(state.board.groups)?state.board.groups:[];
 return `<div class="page-head"><div><span class="label-top">Workspace / Boards / ${e(b.name)}</span>
 <h1>${e(b.name)}</h1><p>${e(b.description||'Track your team’s work and updates.')}</p></div>
 <div class="head-actions"><button class="secondary" data-action="refresh-board">↻ Refresh</button>
 ${state.edit&&state.tab==='items'?'<button class="primary" data-action="new-item">＋ New item</button>':''}
 </div></div>
 <div class="tabs" role="tablist"><a class="tab ${state.tab==='items'?'active':''}" href="#/boards/${e(b.id)}">▤ Board items <span class="csp-u060" >(${items.length})</span></a>
 <a class="tab ${state.tab==='issues'?'active':''}" href="#/boards/${e(b.id)}/issues">◇ APSYNTRA Issues <span class="csp-u060" >(${state.issues.length})</span></a></div>
 ${state.tab==='issues'?issuesPage():`
 <div class="toolbar"><div class="search-wrap"><input id="search-board-items" class="search-input" aria-label="Search items" placeholder="Filter items…" /></div>
 ${state.edit?'<button class="secondary" data-action="new-group">＋ Add group</button>':''}</div>
 ${groups.length?groups.map(g=>`<div class="group-heading"><h3>${e(g.title||'Group')}</h3><small>${items.filter(i=>i.group_id===g.id).length} items</small></div>
 ${moduleByBoardName(b.name)?boardGrid(state.board,{groupId:g.id}):groupRows(items.filter(i=>i.group_id===g.id),state.edit)}`).join(''):
 `<div class="panel">${empty('Your board is ready','Create a group to start adding and organizing items.',state.edit?'<button class="primary" data-action="new-group">＋ Add your first group</button>':'')}</div>`}
 ${items.filter(i=>!groups.some(g=>g.id===i.group_id)).length?`<div class="group-heading"><h3>Ungrouped</h3></div>${moduleByBoardName(b.name)?boardGrid({...state.board,items:items.filter(i=>!groups.some(g=>g.id===i.group_id))}):groupRows(items.filter(i=>!groups.some(g=>g.id===i.group_id)),state.edit)}`:''}`}`;
}
function settingsPage(){
 const p=state.context.profile;
 return `<div class="page-head"><div><span class="label-top">Workspace / Account</span><h1>Account & security</h1><p>Your verified user identity and session preferences.</p></div></div>
 <div class="settings-grid"><section class="panel"><div class="panel-header"><h3>Profile information</h3><span>Supabase Auth</span></div>
 <div class="panel-body"><div class="profile"><span class="avatar csp-u044" >${e(initials(name()))}</span>
 <div><div class="name csp-u040" >${e(name())}</div><div class="role">${e(p.platform_role||'Member')}</div></div></div>
 <div class="settings-detail"><label>Work email</label><strong>${e(p.email||state.user?.email||'Not available')}</strong></div>
 <div class="settings-detail"><label>Account status</label><strong><span class="status done">${e(p.status)}</span></strong></div>
 <div class="settings-detail"><label>Workspace</label><strong>${e(workspaceName())}</strong></div>
 <div class="settings-detail"><label>User identifier</label><strong class="csp-u019" >${e(state.context.user_id)}</strong></div></div></section>
 <section class="panel"><div class="panel-header"><h3>Session security</h3><span class="online-dot"></span></div>
 <div class="panel-body"><p class="muted csp-u032" >Your login uses the existing Supabase Auth project. Your session refreshes automatically and is kept in this browser tab.</p>
 <div class="note">The application never requires a database password or privileged backend key. Permissions are enforced by the existing workspace RPCs and row-level security.</div>
 <div class="settings-detail"><label>Authentication</label><strong>Signed in and verified</strong></div>
 <div class="csp-u015" >
 <button class="secondary" data-action="copy-token">⎘ Copy short-lived access token</button>
 <button class="secondary" data-action="logout">⇥ Sign out</button></div>
 <div class="note security-note"><b>Access token:</b> Copy only when necessary for local acceptance testing. Anyone holding it may act as your account until it expires. Never share it in chat or commit it.</div>
 <p class="csp-u047" ><a class="secondary" href="#/acceptance">✓ GitHub Pages persistence acceptance</a></p>
 <div class="csp-u006" >
  <h3 class="csp-u039" >Signed backend verification</h3>
  <p class="muted csp-u031" >Run read-only checks against the actual authenticated Supabase session, central board permissions, and Issue view. No token copying or database write required.</p>
  <button class="primary" data-action="verify-backend" ${state.acceptanceBusy?'disabled':''}>${state.acceptanceBusy?'Verifying…':'✓ Verify backend connection'}</button>
  ${state.acceptance ? `<div class="csp-u048" ><div class="csp-u028" >
  ${summarizeAcceptance(state.acceptance).passed} of ${summarizeAcceptance(state.acceptance).total} read-only checks passed</div>
  ${state.acceptance.map(check=>`<div class="csp-u008" >
  <div class="csp-u017" ><span aria-hidden="true" class="${check.status==='pass'?'csp-check-pass':check.status==='fail'?'csp-check-fail':'csp-check-pending'}">${check.status==='pass'?'✓':check.status==='fail'?'✕':'○'}</span><strong>${e(check.title)}</strong></div>
  <div class="csp-u058" >${e(check.detail)}</div></div>`).join('')}
  <p class="muted csp-u026" >These checks do not certify the local 5173 host or native transaction writes.</p></div>` : ''}
 </div>
 </div></section></div>`;
}
function render(){
 if(!state.context){renderLogin();return;}
 if(state.view==='board')shell(boardPage());
 else if(state.view==='acceptance')shell(renderPagesAcceptance({qaBoard:state.boards.find(b=>b.name===QA_BOARD_NAME),result:state.pagesAcceptance,running:state.pagesBusy,nativeResult:state.nativeAcceptance,nativeRunning:state.nativeBusy}));
 else if(state.view==='foundation')shell(renderFoundation({
   rows:state.foundationRows,loading:state.foundationBusy,provisioning:state.provisionBusy,
   testing:state.foundationTesting,testResult:state.foundationTestResult,
   log:state.foundationLog,error:state.foundationError,
   canProvision:state.context?.profile?.platform_role==='admin_general_manager'
 }));
 else if(state.view==='security')shell(renderSecurityAcceptance({context:state.context,report:state.securityResult,busy:state.securityBusy,progress:state.securityProgress,writeResult:state.securityWriteResult,writeBusy:state.securityWriteBusy,frtResult:state.frtSecurityResult,frtBusy:state.frtSecurityBusy,sec07Result:state.sec07Result,sec07Busy:state.sec07Busy,sec09Result:state.sec09Result,sec09Busy:state.sec09Busy,sec10Result:state.sec10Result,sec10Busy:state.sec10Busy,sec10Boards:state.boards}));
 else if(state.view==='role-configuration')shell(renderRoleConfiguration({verified:state.roleVerified,loading:state.roleBusy,data:state.roleData,tab:state.roleTab,error:state.roleError}));
 else if(state.view==='user-role-management')shell(renderUserRoleManagement({verified:state.roleVerified,data:state.userRoleData,selectedUserId:state.userRoleSelected,busy:state.userRoleBusy,error:state.userRoleError}));
 else if(state.view==='boards')shell(boardsPage());
 else if(state.view==='settings')shell(settingsPage());
 else shell(overview());
}
async function refreshWorkspace(){
 const priorIdentity=state.context?.user_id,priorWorkspace=state.context?.workspace_id;
 state.context=await db.context();
 if(priorIdentity!==state.context?.user_id||priorWorkspace!==state.context?.workspace_id){
   state.roleData=null;state.userRoleData=null;state.userRoleSelected=null;
   state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;
 }
 state.boards=await db.boards('active');
 state.user=auth.session?.user;
 // Verified server RPC is the ONLY entry gate. A profile role or email is never sufficient.
 try{state.roleVerified=await roleConfig.bootstrapVerified();}
 catch{state.roleVerified=false;}
 if(!state.roleVerified){state.roleData=null;state.roleError='';state.userRoleData=null;}
}
async function loadUserRoleManagement(){
 if(state.roleVerified!==true || !(await roleConfig.bootstrapVerified()))throw new ApiError('Bootstrap role management access denied.',403);
 const ctx=await db.context();
 if(ctx.user_id!==state.context?.user_id||ctx.workspace_id!==state.context?.workspace_id)throw new ApiError('Authoritative workspace changed.',403);
 state.userRoleData=await userRoleManager.snapshot(ctx.workspace_id);
 state.userRoleError='';
 if(!state.userRoleData.users.some(u=>u.id===state.userRoleSelected))
  state.userRoleSelected=state.userRoleData.users[0]?.id??null;
}
async function applyUserRoleChange({userId,scope,resourceId,role,enabled,expectedUpdatedAt}){
 if(state.roleVerified!==true||!(await roleConfig.bootstrapVerified()))throw new ApiError('Bootstrap privilege required.',403);
 const identity=await auth.getVerifiedUser(),ctx=await db.context();
 if(identity?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
    ctx.workspace_id!==state.context?.workspace_id)throw new ApiError('Signed identity or workspace changed.',403);
 await userRoleManager.mutate({workspaceId:ctx.workspace_id,userId,scope,resourceId,role,enabled,expectedUpdatedAt});
 await loadUserRoleManagement();
 toast('Authoritative user role updated and audited.');
 render();
}
async function applyCrmPlatformRole({userId,role,expectedUpdatedAt}){
 if(state.roleVerified!==true||!(await roleConfig.bootstrapVerified()))
   throw new ApiError('Bootstrap privilege required.',403);
 const identity=await auth.getVerifiedUser(),ctx=await db.context();
 if(identity?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
    ctx.workspace_id!==state.context?.workspace_id)
   throw new ApiError('Signed identity or workspace changed.',403);
 await userRoleManager.setCrmPlatformRole({
   workspaceId:ctx.workspace_id,userId,role,expectedUpdatedAt});
 await loadUserRoleManagement();
 toast('APSYNTRA CRM platform role updated and audited.');
 render();
}
async function loadRoleConfiguration(){
 if(state.roleVerified!==true)throw new ApiError('Bootstrap verification required.',403);
 const context=await db.context();
 if(context.user_id!==state.context?.user_id||context.workspace_id!==state.context?.workspace_id)
  throw new ApiError('Identity or active workspace changed.',403);
 const data=await roleConfig.snapshot(context.workspace_id);
 state.roleData=data;state.roleError='';
}
async function stageRoleProposal(operation,payload){
 if(state.roleVerified!==true)throw new ApiError('Role configuration access denied.',403);
 const identity=await auth.getVerifiedUser();
 const context=await db.context();
 if(identity?.id!==context.user_id||context.user_id!==state.context?.user_id||
    context.workspace_id!==state.context?.workspace_id||
    !(await roleConfig.bootstrapVerified()))
  throw new ApiError('Bootstrap identity or active workspace changed.',403);
 await roleConfig.propose(context.workspace_id,operation,payload);
 await loadRoleConfiguration();
 toast('Change proposal recorded. No production access has changed.');
 render();
}
async function refreshFoundation(){
 const context=await db.context();
 if(context.user_id!==state.context?.user_id||context.workspace_id!==state.context?.workspace_id)
   throw new ApiError('Workspace context changed; reload and sign in again.',403);
 state.boards=await db.boards('active');
 state.foundationRows=await inspectFoundation(db,{context,boards:state.boards});
 state.foundationError='';
}
async function loadBoard(boardId,tab){
 const seq=++routeSerial;
 state.view='board';state.boardId=boardId;state.tab=tab;state.loading=true;state.board=null;state.error=null;state.issues=[];
 render();
 try{
   const detail=await db.board(boardId);
   const edit=await db.allowed(boardId,'edit');
   if(seq!==routeSerial)return;
   state.board=detail;state.edit=edit;
 }catch(err){if(seq!==routeSerial)return;state.error=errorMessage(err);}
 finally{if(seq===routeSerial){state.loading=false;render();}}
 if(seq!==routeSerial||!state.board)return;
 if(tab==='issues')await loadIssues(seq);
}
async function loadIssues(seq=routeSerial){
 state.loadingIssues=true;render();
 try{const rows=await db.issues(state.boardId,state.context.workspace_id);
 if(seq===routeSerial)state.issues=rows;
 }catch(err){if(seq===routeSerial)notice(err);}
 finally{if(seq===routeSerial){state.loadingIssues=false;render();}}
}
async function onRoute(){
 if(!state.context)return;
 const hash=location.hash||routeHome;
 const parts=hash.replace(/^#\/?/,'').split('/');
 if(parts[0]==='boards'&&validUuid(parts[1])){await loadBoard(parts[1],parts[2]==='issues'?'issues':'items');return;}
 routeSerial++;state.boardId=null;state.board=null;state.view=parts[0]==='boards'?'boards':parts[0]==='settings'?'settings':parts[0]==='acceptance'?'acceptance':parts[0]==='foundation'?'foundation':parts[0]==='security'?'security':parts[0]==='role-configuration'?'role-configuration':parts[0]==='user-role-management'?'user-role-management':'overview';
 if(state.view==='role-configuration'||state.view==='user-role-management'){
   // Recheck current server authority on EVERY entry, including direct URL visits.
   try{state.roleVerified=await roleConfig.bootstrapVerified();}
   catch{state.roleVerified=false;}
   if(!state.roleVerified){
     state.roleData=null;state.roleError='';
     location.hash=routeHome;return onRoute();
   }
 }
 if(state.view==='user-role-management'){
   state.userRoleBusy=true;render();
   try{await loadUserRoleManagement();}catch(err){state.userRoleError=errorMessage(err);}
   finally{state.userRoleBusy=false;}
 }
 if(state.view==='role-configuration'){
   state.roleBusy=true;render();
   try{await loadRoleConfiguration();}catch(err){state.roleError=errorMessage(err);}
   finally{state.roleBusy=false;}
 }
 if(state.view==='boards'&&state.showArchived&&!state.archived.length){try{state.archived=await db.boards('archived');}catch(err){notice(err);}}
 if(state.view==='foundation'){
   state.foundationBusy=true;render();
   try{await refreshFoundation();}catch(err){state.foundationError=errorMessage(err);}
   finally{state.foundationBusy=false;}
 }
 render();
}
async function login(form){
 if(state.authBusy)return;
 const email=String(new FormData(form).get('email')||'');
 const password=String(new FormData(form).get('password')||'');
 const submit=form.querySelector('[type="submit"]');
 state.authBusy=true;submit.disabled=true;submit.textContent='Signing in…';
 try{
   await auth.signIn(email,password);
   await refreshWorkspace();
   state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;
   location.hash=routeHome;await onRoute();
   toast('Successfully signed in.');
 }catch(err){await auth.signOut();state.context=null;renderLogin(errorMessage(err));}
 finally{state.authBusy=false;}
}
function hideModal(){if(modal){modal.remove();modal=null;}}
function openModal(title,fields,submit){
 hideModal();
 modal=document.createElement('div');modal.className='modal-backdrop';modal.setAttribute('role','presentation');
 modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal-head"><h2 id="modal-title">${e(title)}</h2><button type="button" class="modal-close" data-dismiss aria-label="Close dialog">×</button></div>
  <form id="modal-form">${fields}<div class="modal-actions"><button class="secondary" type="button" data-dismiss>Cancel</button>
  <button class="primary" type="submit">Save changes</button></div></form></section>`;
 document.body.append(modal);
 modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-dismiss]'))hideModal();});
 modal.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();const button=modal?.querySelector('[type="submit"]');if(!button||button.disabled)return;
   button.disabled=true;button.textContent='Saving…';
   try{await submit(new FormData(event.currentTarget));hideModal();toast('Changes saved.');}
   catch(err){notice(err);button.disabled=false;button.textContent='Save changes';}
 });
 modal.querySelector('input,select,textarea')?.focus();
}
const input=(label,key,value='',type='text',required=true)=>
 `<div class="field"><label for="modal-${e(key)}">${e(label)}</label><input id="modal-${e(key)}" name="${e(key)}" type="${e(type)}" value="${e(value)}" ${required?'required':''} maxlength="180"/></div>`;
const select=(label,key,choices,current)=>
 `<div class="field"><label for="modal-${e(key)}">${e(label)}</label><select id="modal-${e(key)}" name="${e(key)}">${choices.map(([value,text])=>`<option value="${e(value)}" ${current===value?'selected':''}>${e(text)}</option>`).join('')}</select></div>`;
const priorities=[['0','None'],['1','Low'],['2','Medium'],['3','High'],['4','Urgent']];
const statuses=[['tracker:status:Todo','To do'],['tracker:status:InProgress','In progress'],['tracker:status:Done','Done'],['tracker:status:Blocked','Blocked']];
async function writeGuard(){if(!state.boardId||!await db.allowed(state.boardId,'edit'))throw new ApiError('No edit permission for this board.',403);}
async function action(name,button){
 switch(name){
 case 'toggle-password':{const f=root.querySelector('#password');if(f){f.type=f.type==='password'?'text':'password';button.textContent=f.type==='password'?'Show':'Hide';}break;}
 case 'logout':{await auth.signOut();state.context=null;state.roleVerified=false;state.roleData=null;state.userRoleData=null;state.boards=[];state.board=null;state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;location.hash='#/login';renderLogin();toast('Signed out successfully.');break;}
 case 'refresh':{try{await refreshWorkspace();render();toast('Workspace refreshed.')}catch(err){notice(err);}break;}
 case 'refresh-board':{await loadBoard(state.boardId,state.tab);break;}
 case 'user-role-refresh':{
   if(!state.roleVerified||state.userRoleBusy)return;
   state.userRoleBusy=true;render();
   try{await loadUserRoleManagement();}catch(err){state.userRoleError=errorMessage(err);notice(err);}
   finally{state.userRoleBusy=false;render();}
   break;
 }
 case 'user-role-edit-crm-platform':
 case 'user-role-revert-crm-platform':{
   if(!state.roleVerified||state.userRoleBusy||!state.userRoleData)return;
   const userId=button.dataset.userId;
   const user=state.userRoleData.users.find(u=>u.id===userId&&
     !u.protected&&u.platformRole!=='admin_general_manager');
   if(!user||userId!==state.userRoleSelected)
     throw new ApiError('Protected or stale CRM platform role target.',403);
   const record=state.userRoleData.crmPlatformRoles?.find(r=>r.userId===userId);
   if(!record)throw new ApiError('Authoritative CRM role snapshot missing.',403);
   const reverting=name==='user-role-revert-crm-platform';
   if(reverting&&!record.assignedRole)throw new ApiError('No CRM override to revoke.',409);
   const fields='<div class="note">APSYNTRA CRM platform role for '+e(user.name||user.email)+
    '. CRM tiers cap module and board permissions without changing WatchdogWorkspace identity. '+
    'Changes are audited and enforced by the central backend.</div>'+
    (reverting?'':select('CRM platform role','role',
      APSYNTRA_CRM_PLATFORM_ROLES.map(x=>[x,x[0].toUpperCase()+x.slice(1)]),
      record.assignedRole||record.effectiveRole))+
    input('Type APPLY CRM ROLE','ack');
   openModal(reverting?'Revert CRM platform role':'Assign APSYNTRA CRM platform role',fields,async fd=>{
     if(String(fd.get('ack')||'')!=='APPLY CRM ROLE')
       throw new ApiError('Confirm by typing APPLY CRM ROLE exactly.');
     const role=reverting?null:String(fd.get('role'));
     if(role!==null&&!APSYNTRA_CRM_PLATFORM_ROLES.includes(role))
       throw new ApiError('Invalid CRM platform role.',400);
     state.userRoleBusy=true;
     try{await applyCrmPlatformRole({userId,role,
       expectedUpdatedAt:record.updatedAt||null});}
     finally{state.userRoleBusy=false;render();}
   });
   break;
 }
 case 'user-role-edit-module':
 case 'user-role-revoke-module':
 case 'user-role-edit-board':
 case 'user-role-revoke-board':{
   if(!state.roleVerified||state.userRoleBusy||!state.userRoleData)return;
   const scope=name.includes('module')?'module':'board';
   const resourceId=button.dataset.resource,userId=button.dataset.userId;
   const user=state.userRoleData.users.find(u=>u.id===userId&&!u.protected&&u.platformRole!=='admin_general_manager');
   if(!user||userId!==state.userRoleSelected)throw new ApiError('Protected or stale target.',403);
   const record=scope==='module'?
      state.userRoleData.moduleAssignments.find(r=>r.userId===userId&&r.moduleId===resourceId):
      state.userRoleData.boardAssignments.find(r=>r.userId===userId&&r.boardId===resourceId);
   if(record?.role==='owner')throw new ApiError('Board owner is protected.',403);
   const enabled=!name.includes('revoke');
   const options=scope==='module'?MODULE_ROLE_OPTIONS[resourceId]:['viewer','editor'];
   if(!options?.length)throw new ApiError('Unsupported role resource.');
   const current=record?.role&&options.includes(record.role)?record.role:options[0];
   const label=scope==='module'?ROLE_MODULE_OPTIONS.find(m=>m[0]===resourceId)?.[1]:
      state.userRoleData.boards.find(b=>b.id===resourceId)?.name;
   if(!label)throw new ApiError('Unknown board or application.');
   const fields='<div class="note">Target: '+e(user.name||user.email)+' / '+e(label)+
       '. The change is enforced immediately by the existing central backend and recorded in immutable audit history.</div>'+
      (enabled?select('Role','role',options.map(r=>[r,r]),current):'')+
      input('Type APPLY ROLE CHANGE','ack');
   openModal((enabled?'Assign / modify':'Revoke')+' role',fields,async fd=>{
      if(String(fd.get('ack')||'')!=='APPLY ROLE CHANGE')throw new ApiError('Confirm by typing APPLY ROLE CHANGE exactly.');
      state.userRoleBusy=true;
      try{await applyUserRoleChange({userId,scope,resourceId,role:enabled?String(fd.get('role')):current,
        enabled,expectedUpdatedAt:record?.updatedAt||null});}
      finally{state.userRoleBusy=false;render();}
   });
   break;
 }
 case 'role-tab':{
   if(!state.roleVerified)return;
   const tab=button.dataset.tab;
   if(['roles','users','matrix','workspace','audit'].includes(tab)){state.roleTab=tab;render();}
   break;
 }
 case 'role-refresh':{
   if(!state.roleVerified||state.roleBusy)return;
   state.roleBusy=true;render();
   try{await loadRoleConfiguration();}catch(err){state.roleError=errorMessage(err);notice(err);}
   finally{state.roleBusy=false;render();}
   break;
 }
 case 'role-propose-create':{
   if(!state.roleVerified)return;
   openModal('Stage a new role definition',
      input('Role key','roleKey','custom_role')+
      input('Display name','displayName','Custom Role')+
      input('Description','description','', 'text',false),
      async fd=>stageRoleProposal('role.create',{
        roleKey:String(fd.get('roleKey')||'').trim(),
        displayName:String(fd.get('displayName')||'').trim(),
        description:String(fd.get('description')||'').trim()
      }));break;
 }
 case 'role-propose-edit':{
   if(!state.roleVerified)return;
   const key=button.dataset.roleKey;
   const role=state.roleData?.roles?.find(r=>r.roleKey===key&&r.kind==='custom_draft');
   if(!role)throw new ApiError('Only draft custom roles may be edited.');
   openModal('Stage role revision',
      input('Role key','roleKey',key,'text',true)+
      input('Display name','displayName',role.displayName)+
      input('Description','description','', 'text',false),
      async fd=>stageRoleProposal('role.edit',{
       roleKey:key,displayName:String(fd.get('displayName')||'').trim(),
       description:String(fd.get('description')||'').trim()
      }));break;
 }
 case 'role-propose-activation':{
   if(!state.roleVerified)return;
   const roles=state.roleData?.roles?.filter(r=>r.kind==='custom_draft')||[];
   if(!roles.length){toast('No custom roles are available for staging.',true);return;}
   openModal('Stage activation or deactivation',
      select('Custom role','roleKey',roles.map(r=>[r.roleKey,r.displayName]))+
      select('Proposed change','operation',[['role.activate','Activate'],['role.deactivate','Deactivate']]),
      async fd=>stageRoleProposal(String(fd.get('operation')),{roleKey:String(fd.get('roleKey'))}));break;
 }
 case 'role-propose-assign':{
   if(!state.roleVerified)return;
   const id=button.dataset.userId;
   const user=state.roleData?.users?.find(u=>u.id===id&&!u.bootstrapProtected);
   if(!user)throw new ApiError('Protected or missing user cannot be assigned.',403);
   openModal('Stage an application role change',
      select('Application module','moduleId',ROLE_MODULE_OPTIONS)+
      select('Proposed change','operation',[['assignment.assign','Assign'],['assignment.revoke','Revoke']])+
      input('Existing application role','role','Employee'),
      async fd=>stageRoleProposal(String(fd.get('operation')),
        {userId:id,moduleId:String(fd.get('moduleId')),role:String(fd.get('role')).trim()}));break;
 }
 case 'role-propose-permission':{
   if(!state.roleVerified)return;
   const moduleId=button.dataset.moduleId,capability=button.dataset.capability;
   if(!ROLE_MODULE_OPTIONS.some(x=>x[0]===moduleId)||
      !['view','create','edit','delete','approve','export','administer'].includes(capability))
     throw new ApiError('Unknown permission scope.');
   openModal('Stage module capability',
     input('Role key','roleKey','employee')+
     select('Proposed access','enabled',[['false','Deny'],['true','Allow']]),
     async fd=>stageRoleProposal('permission.configure',
       {moduleId,capability,roleKey:String(fd.get('roleKey')).trim(),enabled:fd.get('enabled')==='true'}));break;
 }
 case 'role-propose-workspace':{
   if(!state.roleVerified)return;
   const users=state.roleData?.users?.filter(u=>!u.bootstrapProtected)||[];
   if(!users.length){toast('No eligible workspace members.',true);return;}
   openModal('Stage workspace access restriction',
      select('Member','userId',users.map(u=>[u.id,u.displayName||u.email||'Member']))+
      select('Requested restriction','enabled',[['false','Suspend workspace access'],['true','Restore existing access']]),
      async fd=>stageRoleProposal('workspace.configure',
         {userId:String(fd.get('userId')),enabled:fd.get('enabled')==='true'}));break;
 }
 case 'security-sec10-readonly':{
   if(state.sec10Busy||!state.context||!auth.isSignedIn)return;
   const stage=root.querySelector('#sec10-stage')?.value||'';
   const boardId=root.querySelector('#sec10-board')?.value||'';
   if(!state.boards.some(b=>b.id===boardId)||!['VIEWER','SUPERVISOR','RESTORED'].includes(stage))
     return toast('Choose an existing board and the independently verified CRM transition stage.',true);
   state.sec10Busy=true;state.sec10Result=null;
   const revision=++state.sec10RunId;render();
   try{
     const result=await runFRTSec10SignedCeilingProbe({auth,api:db,boardId,stage});
     if(revision!==state.sec10RunId||!auth.isSignedIn)return;
     state.sec10Result=result;
     toast(result.status==='PASS'?'Signed role-ceiling checks passed; fresh login still requires separate evidence.':
       'Signed role-ceiling checks '+result.status+'.',result.status!=='PASS');
   }catch{
     if(revision===state.sec10RunId&&auth.isSignedIn)
       state.sec10Result={checkpoint:'CP-FRT-SEC10',status:'BLOCKED',phase:stage,
        scenario:'NONBOOTSTRAP',checks:[],writesAttempted:0,roleChangesAttempted:0,
        reason:'SIGNED_CAPABILITY_READ_INCOMPLETE'};
   }finally{if(revision===state.sec10RunId){state.sec10Busy=false;render();}}
   break;
 }
 case 'security-sec10-copy':{
   if(!state.sec10Result)return;
   try{
     await navigator.clipboard.writeText(sanitizeFRTSec10Report(state.sec10Result));
     toast('Nonsecret SEC10 capability report copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'security-sec09-readonly':{
   if(state.sec09Busy||!state.context)return;
   state.sec09Busy=true;state.sec09Result=null;
   const revision=++state.sec09RunId;render();
   try{
     const result=await runFRTSec09SignedAcceptance({auth,api:db});
     if(revision!==state.sec09RunId||!auth.isSignedIn)return;
     state.sec09Result=result;
     toast(result.status==='PASS'?'Signed CP-FRT-SEC09 read-only acceptance passed.':
       'Signed CP-FRT-SEC09 '+result.status+'. Review the result.',result.status!=='PASS');
   }catch{
     if(revision===state.sec09RunId&&auth.isSignedIn)
      state.sec09Result={checkpoint:'CP-FRT-SEC09',status:'BLOCKED',scenario:'UNVERIFIED',
       checks:[],sources:[],writesAttempted:0,roleChangesAttempted:0,
       reason:'SIGNED_READ_ONLY_ACCEPTANCE_INCOMPLETE'};
   }finally{if(revision===state.sec09RunId){state.sec09Busy=false;render();}}
   break;
 }
 case 'security-sec09-copy':{
   if(!state.sec09Result)return;
   try{
     await navigator.clipboard.writeText(sanitizeFRTSec09Report(state.sec09Result));
     toast('Nonsecret SEC09 result copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'security-sec07-readonly':{
   if(state.sec07Busy||!state.context)return;
   state.sec07Busy=true;state.sec07Result=null;render();
   try{
     state.sec07Result=await runFRTSec07ActivationGate({auth,api:db});
     const outcome=state.sec07Result.status;
     toast(outcome==='PASS'?'CRM signed read-only activation gate passed.':
       'CRM role activation gate '+outcome+'. Review the checks.',outcome!=='PASS');
   }catch{
     state.sec07Result={checkpoint:'CP-FRT-SEC07',status:'BLOCKED',
       scenario:'UNVERIFIED',checks:[],writesAttempted:0,
       reason:'SIGNED_READ_ONLY_CHECK_INCOMPLETE'};
   }finally{state.sec07Busy=false;render();}
   break;
 }
 case 'security-sec07-copy':{
   if(!state.sec07Result)return;
   const {checkpoint,status,scenario,checks,writesAttempted,reason}=state.sec07Result;
   try{
     await navigator.clipboard.writeText(JSON.stringify({
       checkpoint,status,scenario,checks,writesAttempted,reason
     },null,2));
     toast('Nonsecret SEC07 result copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'security-frt-readonly':{
   if(state.frtSecurityBusy||!state.context)return;
   state.frtSecurityBusy=true;state.frtSecurityResult=null;render();
   try{
     state.frtSecurityResult=await runFRTSec03SignedAcceptance({auth,api:db});
     const result=state.frtSecurityResult;
     toast(result.status==='PASS'?'FRT signed read-only checks passed.':
       result.status==='BLOCKED'?'Signed FRT acceptance blocked. Review the result.':
       'FRT authorization check failed. Review the result.',result.status!=='PASS');
   }catch{
     // Never display or export raw server errors: they may contain identity data.
     state.frtSecurityResult={checkpoint:'CP-FRT-SEC03',status:'BLOCKED',
       scenario:'UNVERIFIED',checks:[],writesAttempted:0,
       reason:'Authenticated read-only request did not complete'};
   }finally{state.frtSecurityBusy=false;render();}
   break;
 }
 case 'security-frt-copy':{
   if(!state.frtSecurityResult)return;
   const {checkpoint,status,scenario,checks,writesAttempted,reason}=state.frtSecurityResult;
   try{
     await navigator.clipboard.writeText(JSON.stringify(
       {checkpoint,status,scenario,checks,writesAttempted,reason},null,2));
     toast('Nonsecret FRT acceptance report copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'security-run-negative':{
   if(state.securityBusy)return;
   state.securityBusy=true;state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;
   render();
   try{
     state.securityResult=await runSignedNegativeBoardAcceptance(auth,db,{
       onBoard:entry=>{state.securityProgress.push(entry);render();}
     });
     const report=state.securityResult;
     if(report.status==='pass')toast('Signed read-only authorization checks passed on twelve boards.');
     else if(report.status==='fail')toast('Unexpected authorization result. Review the failed board.',true);
     else toast('This account cannot establish the selected negative-access scenario.',true);
   }catch(err){notice(err);}
   finally{state.securityBusy=false;render();}
   break;
 }
 case 'security-deny-write':{
   if(state.securityWriteBusy||state.securityResult?.status!=='pass')return;
   openModal('Confirm isolated QA denial',input('Type VERIFY DENIAL','ack')+
    '<div class="note security-note">This submits one expected-to-fail create attempt to the isolated APSYNTRA QA board only. It must return HTTP 403. If unexpectedly authorized, the test attempts to delete only its unique QA item.</div>',
    async fd=>{
      if(String(fd.get('ack')||'')!=='VERIFY DENIAL')throw new ApiError('Enter VERIFY DENIAL exactly.');
      state.securityWriteBusy=true;state.securityWriteResult=null;render();
      try{
        state.securityWriteResult=await runDeniedQaWrite(auth,db,{verifiedReadOnlyResult:state.securityResult});
        toast(state.securityWriteResult.status==='pass'?'Signed QA write rejected correctly.':'QA write rejection was not verified.',state.securityWriteResult.status!=='pass');
      }finally{state.securityWriteBusy=false;render();}
    });
   break;
 }
 case 'security-copy-report':{
   if(!state.securityResult)return;
   try{
     await navigator.clipboard.writeText(sanitizeNegativeReport(state.securityResult));
     toast('Nonsecret acceptance report copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'foundation-refresh':{
   if(state.foundationBusy||state.provisionBusy)return;
   state.foundationBusy=true;state.foundationError='';render();
   try{await refreshFoundation();}catch(err){state.foundationError=errorMessage(err);notice(err);}
   finally{state.foundationBusy=false;render();}
   break;
 }
 case 'foundation-provision':{
   if(state.provisionBusy||state.context?.profile?.platform_role!=='admin_general_manager')return;
   openModal('Provision twelve dedicated boards',
     input('Type PROVISION 12 BOARDS to confirm','ack')+
     '<div class="note security-note">This creates empty domain-specific boards with owner-only membership through existing signed RPCs. Archived boards and operational records are not changed. Application acceptance is not included.</div>',
     async fd=>{
       if(String(fd.get('ack')||'')!=='PROVISION 12 BOARDS')
         throw new ApiError('Enter PROVISION 12 BOARDS exactly.');
       state.provisionBusy=true;state.foundationError='';state.foundationLog=[];render();
       try{
         await provisionMissingBoards(db,{context:state.context,confirm:true,onProgress:entry=>{
           state.foundationLog.push(entry.key+': '+entry.action);render();
         }});
         await refreshWorkspace();await refreshFoundation();
         toast('Dedicated board provisioning completed; inspect live readiness.');
       }catch(err){
         state.foundationError=errorMessage(err);notice(err);
         try{await refreshWorkspace();await refreshFoundation();}catch{/* preserve original error */}
         throw err;
       }finally{state.provisionBusy=false;render();}
     });
   break;
 }
 case 'foundation-operational-test':{
   if(state.foundationTesting||state.context?.profile?.platform_role!=='admin_general_manager')return;
   openModal('Verify all twelve dedicated boards',
     input('Type RUN 12 BOARD CHECKS','ack')+
     '<div class="note security-note">This executes real signed QA create, conditional update, stale-write denial, delete and audit checks only on the twelve EMPTY dedicated boards. Changes leave event records. Do not run if any board contains production records.</div>',
     async fd=>{
       if(String(fd.get('ack')||'')!=='RUN 12 BOARD CHECKS')
         throw new ApiError('Type RUN 12 BOARD CHECKS exactly.');
       state.foundationTesting=true;state.foundationTestResult=null;state.foundationLog=[];render();
       try{
         state.foundationTestResult=await runTwelveBoardQa(db,{
          context:state.context,onProgress:entry=>{
           state.foundationLog.push(entry.boardName+': '+entry.status);render();
          }});
         const r=state.foundationTestResult;
         toast(r.status==='pass'?'Signed 12-board foundation acceptance passed.':
           'Foundation acceptance stopped on a failed board. Review evidence.',r.status!=='pass');
       }finally{state.foundationTesting=false;render();}
     });
   break;
 }
 case 'new-board':{
   openModal('Create a board',input('Board name','name')+input('Description (optional)','description','','text',false),async fd=>{
     const title=String(fd.get('name')||'').trim();if(!title)throw new ApiError('Board name is required.');
     await db.createBoard(title,String(fd.get('description')||''));await refreshWorkspace();location.hash='#/boards';await onRoute();
   });break;
 }
 case 'active-boards':{state.showArchived=false;render();break;}
 case 'archived-boards':{state.showArchived=true;try{state.archived=await db.boards('archived');}catch(err){notice(err);}render();break;}
 case 'new-group':{
   await writeGuard();
   openModal('Add board group',input('Group name','name','New group'),async fd=>{
     await writeGuard();await db.addGroup(state.boardId,String(fd.get('name')||''));await loadBoard(state.boardId,'items');
   });break;
 }
 case 'new-item':{
   await writeGuard();const groups=state.board?.groups||[];
   if(!groups.length){toast('Create a group first.',true);return;}
   openModal('Add a board item',input('Item title','title')+select('Group','group',groups.map(g=>[g.id,g.title]),groups[0].id),
   async fd=>{await writeGuard();await db.addItem(state.boardId,String(fd.get('group')),String(fd.get('title')||''));await loadBoard(state.boardId,'items');});break;
 }
 case 'edit-item':{
   await writeGuard();const item=state.board?.items?.find(x=>x.id===button.dataset.id);if(!item)return;
   openModal('Edit board item',input('Title','title',item.title)+select('Status','status',[['working','Working'],['done','Done'],['stuck','Blocked'],['planned','Planned']],item.status)+
    `<div class="field"><label for="modal-notes">Notes</label><textarea id="modal-notes" name="notes" maxlength="4000">${e(item.notes||'')}</textarea></div>`,
    async fd=>{await writeGuard();await db.updateItem({...item,title:String(fd.get('title')||''),status:String(fd.get('status')||''),notes:String(fd.get('notes')||'')});await loadBoard(state.boardId,'items');});break;
 }
 case 'native-new-issue':{
   await writeGuard();
   openModal('Create APSYNTRA native issue',input('Issue title','title')+
    select('Status','status',statuses,statuses[0][0])+select('Priority','priority',priorities,'2'),
    async fd=>{
      await writeGuard();
      await nativeIssues.create(state.boardId,state.context.workspace_id,state.context.user_id,{
        title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))});
      await loadIssues();
    });break;
 }
 case 'new-issue':{
   await writeGuard();
   openModal('Create an APSYNTRA issue',input('Issue title','title')+select('Status','status',statuses,statuses[0][0])+select('Priority','priority',priorities,'2'),
    async fd=>{await writeGuard();await db.createIssue(state.boardId,state.context.workspace_id,
     {title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))},state.context.user_id);
     await loadIssues();});break;
 }
 case 'native-edit-issue':{
   await writeGuard();
   const row=state.issues.find(x=>x.document_id===button.dataset.id);
   if(!row)return;
   const issue=row.payload.snapshot;
   openModal('Edit APSYNTRA native issue',input('Title','title',issue.title)+
    select('Status','status',statuses,issue.status)+select('Priority','priority',priorities,String(issue.priority)),
    async fd=>{
      await writeGuard();
      await nativeIssues.update(state.boardId,state.context.workspace_id,state.context.user_id,row,{
        title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))});
      await loadIssues();
    });break;
 }
 case 'native-remove-issue':{
   await writeGuard();
   const row=state.issues.find(x=>x.document_id===button.dataset.id);
   if(!row||!confirm('Remove this APSYNTRA native issue? Its audit trail remains intact.'))return;
   await nativeIssues.remove(state.boardId,state.context.workspace_id,state.context.user_id,row);
   await loadIssues();toast('Native Issue removed.');break;
 }
 case 'edit-issue':{
   await writeGuard();const row=state.issues.find(x=>x.document_id===button.dataset.id);if(!row)return;
   const issue=row.payload.snapshot;
   openModal('Edit APSYNTRA issue',input('Title','title',issue.title)+select('Status','status',statuses,issue.status)+select('Priority','priority',priorities,String(issue.priority)),
   async fd=>{await writeGuard();await db.updateIssue(state.boardId,state.context.workspace_id,row,{
     title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))},state.context.user_id);await loadIssues();});break;
 }
 case 'remove-issue':{
   await writeGuard();const row=state.issues.find(x=>x.document_id===button.dataset.id);
   if(!row||!confirm('Remove this issue? It will be retained as a reversible tombstone.'))return;
   try{await db.removeIssue(state.boardId,state.context.workspace_id,row);await loadIssues();toast('Issue removed.');}catch(err){notice(err);}
   break;
 }
 case 'verify-backend':{
   if(state.acceptanceBusy)return;
   state.acceptanceBusy=true;state.acceptance=null;render();
   try{
     state.acceptance=await runReadOnlyAcceptance(auth,db);
     const summary=summarizeAcceptance(state.acceptance);
     toast(summary.failed?'Backend verification found '+summary.failed+' failed check(s).':
        summary.passed+' authenticated checks passed.',summary.failed>0);
   }catch(err){notice(err);}
   finally{state.acceptanceBusy=false;render();}
   break;
 }
 case 'run-pages-acceptance':{
   if(state.pagesBusy)return;
   const qa=state.boards.find(b=>b.name===QA_BOARD_NAME);
   if(!qa){toast('Create an isolated APSYNTRA QA board first.',true);return;}
   const fields=input('Type APSYNTRA QA to confirm','ack','')+
     '<div class="note security-note">Confirm this is an isolated nonproduction QA board. This test performs real INSERT, UPDATE and removal operations; tombstones and audit events remain in PostgreSQL.</div>';
   openModal('Approve isolated QA write acceptance',fields,async fd=>{
     if(String(fd.get('ack')||'').trim()!==QA_BOARD_NAME)throw new ApiError('Type APSYNTRA QA exactly.');
     state.pagesBusy=true;state.pagesAcceptance=null;render();
     try{
       state.pagesAcceptance=await runPagesPersistenceAcceptance(db,{board:qa,context:state.context});
       if(state.pagesAcceptance.status==='fail')toast('Persistence acceptance failed; inspect the report.',true);
       else toast('Signed Pages persistence and audit acceptance passed.');
     }finally{state.pagesBusy=false;render();}
   });
   break;
 }
 case 'run-native-acceptance':{
   if(state.nativeBusy)return;
   const qa=state.boards.find(b=>b.name===QA_BOARD_NAME);
   if(!qa){toast('An isolated APSYNTRA QA board is required.',true);return;}
   const fields=input('Type APSYNTRA QA to confirm','ack','')+
    '<div class="note security-note">This verifies real native Issue transactions on an isolated nonproduction QA board. Successful runs retain audit records and a tombstone.</div>';
   openModal('Confirm native QA acceptance',fields,async fd=>{
     if(String(fd.get('ack')||'').trim()!==QA_BOARD_NAME)throw new ApiError('Type APSYNTRA QA exactly.');
     state.nativeBusy=true;state.nativeAcceptance=null;render();
     try{
       state.nativeAcceptance=await runNativeQa(db,{board:qa,context:state.context});
       toast(state.nativeAcceptance.status==='pass'?'Hosted native acceptance passed.':'Hosted native acceptance failed — inspect the result.',
        state.nativeAcceptance.status!=='pass');
     }finally{state.nativeBusy=false;render();}
   });
   break;
 }
 case 'copy-token':{
   if(!confirm('Copy your short-lived access token? Anyone with this token can act as your account. Never share it publicly.'))return;
   try{const token=await auth.copyAccessToken();await navigator.clipboard.writeText(token);toast('Token copied. Use it only in your local acceptance test.');}
   catch(err){notice(err);}break;
 }
 }
}
root.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');
 if(!target)return;
 event.preventDefault();
 Promise.resolve(action(target.dataset.action,target)).catch(notice);
});
root.addEventListener('change',event=>{
 if(event.target.id==='managed-user'&&state.roleVerified&&state.userRoleData){
  const id=event.target.value;
  if(state.userRoleData.users.some(u=>u.id===id)){
    state.userRoleSelected=id;render();
  }
 }
});
root.addEventListener('submit',event=>{
 if(event.target.id==='login-form'){event.preventDefault();login(event.target);}
});
root.addEventListener('input',event=>{
 if(!event.target.matches('.search-input'))return;
 const value=event.target.value.toLowerCase().trim();
 for(const row of root.querySelectorAll('[data-searchable]'))row.hidden=!row.dataset.searchable.includes(value);
});
window.addEventListener('hashchange',()=>{onRoute().catch(notice);});
window.addEventListener('keydown',event=>{if(event.key==='Escape')hideModal();});
auth.onExpired=()=>{state.context=null;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.roleVerified=false;state.roleData=null;state.userRoleData=null;state.boards=[];renderLogin('Session expired. Please sign in again.');};
async function boot(){
 try{
  if(await auth.restore()){
    state.user=auth.session.user;
    try{await refreshWorkspace();await onRoute();}catch(err){
      if(err instanceof ApiError&&err.status===403){
        root.innerHTML=`<div class="access-denied"><div class="denied-panel"><span class="brand-mark csp-u059" >A</span><h1>Workspace access unavailable</h1>
        <p>${e(errorMessage(err))} Contact your administrator to activate your existing profile or workspace membership.</p>
        <button class="secondary" data-action="logout">Sign out</button></div></div>`;
      }else{await auth.signOut();renderLogin('Your session could not be restored. Please sign in again.');}
    }
  }else renderLogin();
 }catch{renderLogin('Unable to initialize session. Please try signing in.');}
}
boot();
