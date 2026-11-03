import {AuthClient,ApiError} from './session.js';
import {startInitialization,setInitializationPhase,finishInitialization} from './initialization-core.js';
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
import {boardGrid,boardGridColumns} from './board-grid.js';
import {normalizeBoardActivity,renderBoardActivityResults,boardItemSummary} from './board-activity-ui.js';
import {BOARD_COL01_AUDIT_CURSOR_ENABLED,BOARD_COL01_AUDIT_MAX_PAGES,
 loadBoardInvitableDirectory,renderBoardInvitableDirectory,
 loadBoardAuditCursorPage,renderBoardAuditCursorPage} from './board-col01-readers.js';
import {loadBoardCollaboration,renderBoardCollaboration} from './board-collaboration.js';
import {boardTable,boardColumnMenu,loadBoardLayout,saveBoardLayout,resetBoardLayout,reorderVisible,
 normalizeLayout,BOARD_REQUIRED_COLUMNS} from './board-presentation.js';
import {runTwelveBoardQa} from './board-operational-qa.js';
import {runSignedNegativeBoardAcceptance,sanitizeNegativeReport} from './board-negative-acceptance.js';
import {renderSecurityAcceptance} from './board-security-ui.js';
import {runDeniedQaWrite} from './board-negative-write.js';
import {runFRTSec03SignedAcceptance} from './frt-sec03-signed-acceptance.js';
import {runFRTSec07ActivationGate} from './frt-sec07-signed-activation.js';
import {runFRTSec09SignedAcceptance,sanitizeFRTSec09Report} from './frt-sec09-signed-acceptance.js';
import {runFRTSec10SignedCeilingProbe,sanitizeFRTSec10Report} from './frt-sec10-signed-ceiling.js';
import {runFRTCI07SignedRoleProbe,sanitizeFRTCI07Report} from './frt-sec10-ci07-signed-runtime.js';
import {runSEC14SignedRead,sanitizeSEC14SignedRead} from './frt-sec14-signed-acceptance.js';
import {runSEC14SignedDenials,sanitizeSEC14SignedDenials} from './frt-sec14-signed-denials.js';
import {loadFRTFinanceReadOnly} from './frt-finance-readonly.js';
import {renderFRTFinanceReadOnly} from './frt-finance-ui.js';
import {TimeTrackerNativeClient,captureAttendanceGeo,filterMyAttendancePeriod,TT_LIVE_ATTENDANCE_WRITES_ACCEPTED} from './time-tracker-native.js';
import {renderTimeTrackerNative,ownAttendanceCsv,syncTimeTrackerClock} from './time-tracker-ui.js';
import {applyTimeTrackerOverviewFilters,filterTimeTrackerOverviewRows,syncTimeTrackerOverviewClock,timeTrackerOverviewCsv} from './time-tracker-overview.js';
import {applyTimeTrackerLogSearch,filterTimeTrackerLogRows,timeTrackerLogCsv,TT_LOG_DEFAULT_FILTERS} from './time-tracker-log.js';
import {filterTimeTrackerReportRows,applyTimeTrackerReportSearch,TT_REPORT_DEFAULT_FILTERS} from './time-tracker-reports.js';
import {timeTrackerCalendarMonth,shiftTimeTrackerCalendarMonth} from './time-tracker-calendar.js';
import {TT_OT_DEFAULT_FILTERS,TT_OT_WRITES_ACCEPTED} from './time-tracker-overtime.js';
import {timeTrackerMyHoursWeek} from './time-tracker-my-hours.js';
import {timeTrackerTeamCsv,TT_TEAM_ROLES} from './time-tracker-team.js';
import {probeTimeTrackerMonitor} from './time-tracker-monitor.js';
import {timeTrackerGpsWindow,summarizeGps} from './time-tracker-gps.js';
import {signedMapPoints,mountTimeTrackerMaps,disposeTimeTrackerMaps,setTimeTrackerMapTheme,retryTimeTrackerMaps,toggleTimeTrackerMapFullscreen} from './time-tracker-map.js';
import {loadFRTRequestDetailReadOnly} from './frt-finance-workflow.js';
import {inspectMySignedEffectiveAccess,sanitizeEffectiveAccessReport} from './signed-effective-access.js';
import {RoleConfigurationClient} from './role-configuration-client.js';
import {renderRoleConfiguration,ROLE_MODULE_OPTIONS} from './role-configuration-ui.js';
import {UserRoleManagementClient,renderUserRoleManagement,MODULE_ROLE_OPTIONS,APSYNTRA_CRM_PLATFORM_ROLES} from './user-role-management.js';

const BOARD_BASE_COLUMNS=[{key:'record',title:'Item name'},{key:'status',title:'Status'},
 {key:'owner',title:'Owner'},{key:'due',title:'Due date'},{key:'actions',title:'Actions'}];
const root=document.getElementById('app');
const auth=new AuthClient();
const db=new DomainApi(auth);
const nativeIssues=new NativeIssueClient(db);
const timeTracker=new TimeTrackerNativeClient({auth,api:db});
const roleConfig=new RoleConfigurationClient(db);
const userRoleManager=new UserRoleManagementClient(db);
const state={context:null,user:null,boards:[],archived:[],showArchived:false,board:null,issues:[],edit:false,
  view:'overview',boardId:null,tab:'items',loading:false,loadingIssues:false,frtFinance:null,frtFinanceBusy:false,ttAttendance:null,ttBusy:false,ttError:'',ttSuccess:'',ttRunId:0,ttReportPeriod:'all',ttReportFilters:{...TT_REPORT_DEFAULT_FILTERS},ttCalendarMonth:'',ttCalendarSelectedDay:'',ttOtFilters:{...TT_OT_DEFAULT_FILTERS},ttOtModalOpen:false,ttOtDraft:{},ttHoursWeekOffset:0,ttHoursMonth:'',ttHoursSelectedDay:'',ttTeam:null,ttTeamBusy:false,ttTeamError:'',ttTeamRunId:0,ttTeamFilters:{search:'',role:'All',layout:'list'},ttMonitor:null,ttMonitorHistory:[],ttMonitorBusy:false,ttMonitorError:'',ttMonitorRunId:0,ttLogGpsData:null,ttLogGpsBusy:false,ttLogGpsError:'',ttLogGpsErrorRecordId:'',ttLogGpsRunId:0,ttLogGpsCacheAt:0,ttLogExpandedIds:[],ttGpsData:null,ttGpsBusy:false,ttGpsError:'',ttGpsRunId:0,ttGpsCacheAt:0,ttGpsView:'map',ttGpsFilters:{},ttMapConsent:true,ttMapConsentIdentity:'',ttView:'clock',ttOverviewFilters:{search:'',location:'all',department:'all',status:'all',sort:'newest'},ttLogFilters:{...TT_LOG_DEFAULT_FILTERS},frtFinanceDetail:null,frtFinanceDetailBusy:false,frtFinanceDetailId:null,frtFinanceDetailRevision:0,filter:'',error:null,authBusy:false,acceptance:null,acceptanceBusy:false,pagesAcceptance:null,pagesBusy:false,nativeAcceptance:null,nativeBusy:false,foundationRows:[],foundationBusy:false,provisionBusy:false,foundationLog:[],foundationError:'',foundationTesting:false,foundationTestResult:null,securityBusy:false,securityResult:null,securityProgress:[],securityWriteBusy:false,securityWriteResult:null,frtSecurityBusy:false,frtSecurityResult:null,ci07Busy:false,ci07Result:null,ci07RunId:0,sec14Busy:false,sec14Result:null,sec14RunId:0,sec14DenialBusy:false,sec14DenialResult:null,sec14DenialRunId:0,sec07Busy:false,sec07Result:null,sec09Busy:false,sec09Result:null,sec09RunId:0,sec10Busy:false,sec10Result:null,sec10RunId:0,effectiveAccessBusy:false,effectiveAccessResult:null,effectiveAccessRunId:0,securityBoardsError:'',roleVerified:false,roleData:null,roleTab:'roles',roleBusy:false,roleError:'',userRoleData:null,userRoleSelected:null,userRoleBusy:false,userRoleError:''};
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
let ttClockTimer=null;
function stopTimeTrackerClock(){
 if(ttClockTimer!==null){clearInterval(ttClockTimer);ttClockTimer=null;}
}
function maintainTimeTrackerClock(){
 const mounted=state.view==='board'&&state.tab==='attendance'&&
  state.ttAttendance?.status==='VERIFIED_READ'&&
  (state.ttView==='clock'&&root.querySelector('#tt-clock-hours')||
   state.ttView==='overview'&&root.querySelector('#tt-overview-time'));
 if(!mounted){stopTimeTrackerClock();return;}
 const tick=()=>{
  if(state.ttView==='clock')syncTimeTrackerClock(root);
  else if(state.ttView==='overview')syncTimeTrackerOverviewClock(root);
 };
 tick();
 if(ttClockTimer===null)ttClockTimer=setInterval(()=>{
  if(!document.hidden)tick();
 },1000);
}

function toast(message,error=false){
 let holder=document.querySelector('.toast-container');
 if(!holder){holder=document.createElement('div');holder.className='toast-container';document.body.append(holder);}
 const item=document.createElement('div');item.className='toast'+(error?' error':'');item.textContent=message;holder.append(item);
 setTimeout(()=>item.remove(),4500);
}
function errorMessage(err){if(err instanceof ApiError&&err.status===403)return 'Access denied by your workspace permissions.';return err?.message||'Unable to complete the request.';}
function notice(err){toast(errorMessage(err),true);}
function renderLogin(message=''){
 stopTimeTrackerClock();
 root.innerHTML=`<div class="auth-layout">
 <div class="auth-left"><a href="#/login" class="brand"><img class="brand-mark" src="./frontend/apsyntra-logo.webp" alt="" width="37" height="37" decoding="async"/><span>APSYNTRA <span class="csp-u043" >CRM</span></span></a>
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
   <a href="#/overview" class="brand"><img class="brand-mark" src="./frontend/apsyntra-logo.webp" alt="" width="37" height="37" decoding="async"/><span class="brand-text">APSYNTRA <span class="csp-u043" >CRM</span></span></a>
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
/** Signed session-local basemap opt-in. No persisted third-party access consent. */
function timeTrackerMapConsentKey(){
 return [state.context?.user_id,state.context?.workspace_id,state.boardId].join('|');
}
function timeTrackerSignedMapConfigs(){
 if(state.view!=='board'||state.tab!=='attendance'||!auth.isSignedIn||
  state.ttAttendance?.status!=='VERIFIED_READ'||
  !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))
  return [];
 const actor=state.context?.user_id,ws=state.context?.workspace_id;
 if(state.ttView==='log'){
  const data=state.ttLogGpsData;
  if(data?.actorId!==actor||data?.workspaceId!==ws||data?.boardId!==state.boardId)return [];
  return (state.ttAttendance.log?.rows||[]).map(row=>({
   scope:'log',elementId:row.id,points:signedMapPoints(data,{type:'log',record:row}),theme:state.ttGpsFilters.theme==='dark'?'dark':'map'
  })).filter(item=>item.points.length);
 }
 if(state.ttView==='gps'){
  const data=state.ttGpsData;
  if(data?.actorId!==actor||data?.workspaceId!==ws||data?.boardId!==state.boardId)return [];
  const summary=summarizeGps(data,state.ttGpsFilters);
  const points=state.ttGpsView==='trail'?summary.selected:
   state.ttGpsView==='geofence'?summary.latest:summary.points;
  const signed=signedMapPoints(data,{points});
  if(!signed.length)return [];
  return [{scope:'hub',points:signed,theme:state.ttGpsFilters.theme==='dark'?'dark':'map'}];
 }
 return [];
}
async function mountSignedTimeTrackerMaps(){
 const configs=timeTrackerSignedMapConfigs();
 if(configs.length)await mountTimeTrackerMaps(root,configs);
}
function shell(body){
 const crumb=state.view==='board'?state.board?.board?.name||'Board':state.view==='overview'?'Overview':state.view==='boards'?'My boards':state.view==='acceptance'?'Pages acceptance':state.view==='foundation'?'12-board foundation':state.view==='security'?'Access acceptance':state.view==='role-configuration'?'Role Configuration':state.view==='user-role-management'?'User Role Management':'Settings';
 disposeTimeTrackerMaps();
 root.innerHTML=`<div class="shell">${sidebar()}<main class="main">
 <header class="topbar"><div class="breadcrumb"><span>Workspace</span><span>›</span><strong>${e(crumb)}</strong></div>
 <div class="top-actions"><span class="top-pill"><span class="online-dot"></span> Secure session</span><a href="#/settings" class="avatar top-avatar" title="Account settings">${e(initials(name()))}</a></div></header>
 <div class="main-content">${body}</div></main></div>`;
 maintainTimeTrackerClock();
 void mountSignedTimeTrackerMaps();
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
function groupRows(items,allowEdit,layout=null,groupId='ungrouped'){
 const rows=items.map(item=>({search:String(item.title||'').toLowerCase(),
  cells:{record:'<button class="board-item-open" type="button" data-action="board-item-detail" data-id="'+e(item.id)+'" aria-label="Open '+e(item.title||'Untitled')+' details">▥ &nbsp; '+e(item.title||'Untitled')+'</button>',
   status:'<span class="status '+statusClass(item.status)+'">'+e(item.status||'Planned')+'</span>',
   owner:item.assignee_id?e(String(item.assignee_id).slice(0,8))+'…':'Unassigned',
   due:e(displayDate(item.due_date)),
   actions:allowEdit?'<button class="icon-button" data-action="edit-item" data-id="'+
    e(item.id)+'" title="Edit item">✎ Edit</button>':''}}));
 return boardTable({columns:BOARD_BASE_COLUMNS,rows,layout,groupId,
  empty:'No items in this group yet'});
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
 const moduleKey=moduleByBoardName(b.name)?.key;
 const tabSpecs=[
  {key:'items',href:'#/boards/'+b.id+(moduleKey==='timetracker'?'/items':''),
    label:'▤ Board items <span class="csp-u060">('+items.length+')</span>'},
  {key:'issues',href:'#/boards/'+b.id+'/issues',
    label:'◇ APSYNTRA Issues <span class="csp-u060">('+state.issues.length+')</span>'},
  ...(moduleKey==='frt'?[{key:'finance',href:'#/boards/'+b.id+'/finance',
    label:'▣ FRT finance (read-only)'}]:[]),
  ...(moduleKey==='timetracker'?[{key:'attendance',href:'#/boards/'+b.id+'/attendance',
    label:'◷ TimeTracker attendance'}]:[])
 ];
 const columns=moduleKey?boardGridColumns(state.board):BOARD_BASE_COLUMNS;
 const layout=loadBoardLayout(state.context,b.id,tabSpecs.map(t=>t.key),columns.map(c=>c.key));
 const tabLookup=new Map(tabSpecs.map(t=>[t.key,t]));
 const tabOrder=layout.tabs.map(k=>tabLookup.get(k)).filter(Boolean);

 return `<div class="page-head"><div><span class="label-top">Workspace / Boards / ${e(b.name)}</span>
 <h1>${e(b.name)}</h1><p>${e(b.description||'Track your team’s work and updates.')}</p></div>
 <div class="head-actions"><button class="secondary" data-action="board-activity">◷ Activity</button><details class="board-actions-menu"><summary>Board options</summary><div class="board-actions-popover"><button type="button" data-action="board-members">Members &amp; access</button><button type="button" data-action="board-layout-reset">Reset board layout</button><button type="button" data-action="refresh-board">Refresh board</button></div></details><button class="secondary" data-action="refresh-board">↻ Refresh</button>
 ${state.edit&&state.tab==='items'?'<button class="primary" data-action="new-item">＋ New item</button>':''}
 </div></div>
 <div class="tabs board-draggable-tabs" role="tablist" aria-label="Board views">
 ${tabOrder.map(t=>'<div class="board-tab-slot" data-board-tab-slot="'+e(t.key)+'">'+
  '<a role="tab" draggable="true" data-board-tab="'+e(t.key)+'" aria-selected="'+(state.tab===t.key)+
  '" class="tab '+(state.tab===t.key?'active':'')+'" href="'+e(t.href)+'">'+t.label+'</a>'+
  '<button type="button" class="board-tab-reorder" data-action="board-tab-move" data-key="'+e(t.key)+
  '" data-direction="-1" aria-label="Move '+e(t.key)+' tab left" title="Move tab left">‹</button>'+
  '<button type="button" class="board-tab-reorder" data-action="board-tab-move" data-key="'+e(t.key)+
  '" data-direction="1" aria-label="Move '+e(t.key)+' tab right" title="Move tab right">›</button></div>').join('')}</div>

 ${state.tab==='finance'&&moduleByBoardName(b.name)?.key==='frt'?renderFRTFinanceReadOnly({result:state.frtFinance,busy:state.frtFinanceBusy,detailResult:state.frtFinanceDetail,detailBusy:state.frtFinanceDetailBusy,selectedRequestId:state.frtFinanceDetailId}):state.tab==='attendance'&&moduleByBoardName(b.name)?.key==='timetracker'?renderTimeTrackerNative({result:state.ttAttendance,busy:state.ttBusy,error:state.ttError,success:state.ttSuccess,period:state.ttReportPeriod,view:state.ttView,overviewFilters:state.ttOverviewFilters,logFilters:state.ttLogFilters,reportFilters:state.ttReportFilters,calendarMonth:state.ttCalendarMonth,calendarSelectedDay:state.ttCalendarSelectedDay,otFilters:state.ttOtFilters,otModalOpen:state.ttOtModalOpen,otDraft:state.ttOtDraft,hoursWeekOffset:state.ttHoursWeekOffset,hoursMonth:state.ttHoursMonth,hoursSelectedDay:state.ttHoursSelectedDay,teamEligible:state.roleVerified===true,teamDirectory:state.ttTeam,teamFilters:state.ttTeamFilters,teamBusy:state.ttTeamBusy,teamError:state.ttTeamError,monitorResult:state.ttMonitor,monitorHistory:state.ttMonitorHistory,monitorBusy:state.ttMonitorBusy,monitorError:state.ttMonitorError,logGpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',logGpsData:state.ttLogGpsData,logGpsBusy:state.ttLogGpsBusy,logGpsError:state.ttLogGpsError,logGpsErrorRecordId:state.ttLogGpsErrorRecordId,logExpandedRecordIds:state.ttLogExpandedIds,mapEnabled:auth.isSignedIn&&state.ttAttendance?.status==='VERIFIED_READ'&&(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'),mapTheme:state.ttGpsFilters.theme==='dark'?'dark':'map',
 gpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',gpsData:state.ttGpsData,gpsView:state.ttGpsView,gpsFilters:state.ttGpsFilters,gpsBusy:state.ttGpsBusy,gpsError:state.ttGpsError}):state.tab==='issues'?issuesPage():`
 <div class="toolbar board-customize-toolbar"><div class="search-wrap"><input id="search-board-items" class="search-input" aria-label="Search items" placeholder="Filter items…" /></div>
 ${boardColumnMenu(columns,layout)}
 ${state.edit?'<button class="secondary" data-action="new-group">＋ Add group</button>':''}</div>
 ${groups.length?groups.map(g=>`<div class="group-heading"><h3>${e(g.title||'Group')}</h3><small>${items.filter(i=>i.group_id===g.id).length} items</small></div>
 ${moduleByBoardName(b.name)?boardGrid(state.board,{groupId:g.id,layout}):groupRows(items.filter(i=>i.group_id===g.id),state.edit,layout,g.id)}`).join(''):
 `<div class="panel">${empty('Your board is ready','Create a group to start adding and organizing items.',state.edit?'<button class="primary" data-action="new-group">＋ Add your first group</button>':'')}</div>`}
 ${items.filter(i=>!groups.some(g=>g.id===i.group_id)).length?`<div class="group-heading"><h3>Ungrouped</h3></div>${moduleByBoardName(b.name)?boardGrid({...state.board,items:items.filter(i=>!groups.some(g=>g.id===i.group_id))},{layout}):groupRows(items.filter(i=>!groups.some(g=>g.id===i.group_id)),state.edit,layout)}`:''}`}`;
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
function preserveTimeTrackerLogExpansion(){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='log'||
    state.ttAttendance?.status!=='VERIFIED_READ')return;
 const section=root.querySelector('.tt-log');
 if(!section)return;
 const allowed=new Set((state.ttAttendance.log?.rows||state.ttAttendance.records||[]).map(r=>r.id));
 state.ttLogExpandedIds=[...section.querySelectorAll('.tt-log-detail[open][data-record-id]')]
  .map(el=>el.dataset.recordId).filter(id=>allowed.has(id)).slice(0,30);
}
function render(){
 if(!state.context){renderLogin();return;}
 preserveTimeTrackerLogExpansion();
 if(state.view==='board')shell(boardPage());
 else if(state.view==='acceptance')shell(renderPagesAcceptance({qaBoard:state.boards.find(b=>b.name===QA_BOARD_NAME),result:state.pagesAcceptance,running:state.pagesBusy,nativeResult:state.nativeAcceptance,nativeRunning:state.nativeBusy}));
 else if(state.view==='foundation')shell(renderFoundation({
   rows:state.foundationRows,loading:state.foundationBusy,provisioning:state.provisionBusy,
   testing:state.foundationTesting,testResult:state.foundationTestResult,
   log:state.foundationLog,error:state.foundationError,
   canProvision:state.context?.profile?.platform_role==='admin_general_manager'
 }));
 else if(state.view==='security')shell(renderSecurityAcceptance({context:state.context,report:state.securityResult,busy:state.securityBusy,progress:state.securityProgress,writeResult:state.securityWriteResult,writeBusy:state.securityWriteBusy,frtResult:state.frtSecurityResult,frtBusy:state.frtSecurityBusy,ci07Result:state.ci07Result,ci07Busy:state.ci07Busy,sec14Result:state.sec14Result,sec14Busy:state.sec14Busy,sec14DenialResult:state.sec14DenialResult,sec14DenialBusy:state.sec14DenialBusy,sec07Result:state.sec07Result,sec07Busy:state.sec07Busy,sec09Result:state.sec09Result,sec09Busy:state.sec09Busy,sec10Result:state.sec10Result,sec10Busy:state.sec10Busy,sec10Boards:state.boards,sec10IsBootstrap:state.roleVerified===true,effectiveAccessResult:state.effectiveAccessResult,effectiveAccessBusy:state.effectiveAccessBusy,sec10BoardsError:state.securityBoardsError}));
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
   state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;
   state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;
 }
 state.boards=await db.boards('active');
 state.user=auth.session?.user;
 // Verified server RPC is the ONLY entry gate. A profile role or email is never sufficient.
 try{state.roleVerified=await roleConfig.bootstrapVerified();}
 catch{state.roleVerified=false;}
 if(!state.roleVerified){state.roleData=null;state.roleError='';state.userRoleData=null;state.ttTeam=null;state.ttTeamRunId++;state.ttTeamError='';}
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
 state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';
 if(state.boardId!==boardId||state.tab!=='attendance'){
  state.ttView='clock';state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
 }
 state.view='board';state.boardId=boardId;state.tab=tab;state.loading=true;state.board=null;state.error=null;state.issues=[];state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;
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
 if(tab==='attendance'&&moduleByBoardName(state.board.board?.name)?.key==='timetracker')await loadTimeTracker(seq);
 if(tab==='finance'&&moduleByBoardName(state.board.board?.name)?.key==='frt')await loadFRTFinance(null,seq);
}
async function loadTimeTracker(seq=routeSerial){
 if(state.view!=='board'||state.tab!=='attendance'||
    moduleByBoardName(state.board?.board?.name)?.key!=='timetracker')return;
 const run=++state.ttRunId,identity=state.context?.user_id,ws=state.context?.workspace_id;
 state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';
 state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
 state.ttBusy=true;state.ttError='';render();
 try{
  const snapshot=await timeTracker.snapshot(state.boardId);
  if(run===state.ttRunId&&seq===routeSerial&&auth.isSignedIn&&
    state.context?.user_id===identity&&state.context?.workspace_id===ws)
   state.ttAttendance=snapshot;
 }catch(err){
  if(run===state.ttRunId&&seq===routeSerial){
   state.ttAttendance=null;state.ttError=errorMessage(err);
  }
 }finally{
  if(run===state.ttRunId&&seq===routeSerial){state.ttBusy=false;render();}
 }
}
/** Privileged attendance Log GPS. Never sourced from broad, redacted attendance state. */
async function loadTimeTrackerLogGps(seq=routeSerial,record=null,{force=false}={}){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='log'||
    state.ttAttendance?.status!=='VERIFIED_READ'||!auth.isSignedIn||
    state.ttBusy||state.ttLogGpsBusy)return;
 const eligible=state.roleVerified===true||
  state.ttAttendance.access?.moduleRole==='Supervisor';
 if(!eligible)return;
 const run=++state.ttLogGpsRunId,identity=state.context?.user_id,
  workspace=state.context?.workspace_id,boardId=state.boardId;
 const range=record?timeTrackerGpsWindow(new Date(record.clockIn),1):
  timeTrackerGpsWindow(new Date(),31);
 const params={from:range.from,to:range.to,
  userId:record?String(record.ownerId||'').replace(/^cloud:/,''):null};
 const cached=state.ttLogGpsData;
 if(!force&&Date.now()-state.ttLogGpsCacheAt<15000&&!cached?.truncated&&
    cached?.actorId===identity&&cached?.workspaceId===workspace&&cached?.boardId===boardId&&
    cached.ranges?.some(x=>x.from<=range.from&&x.to>=range.to)&&
    (!record||cached.events.some(p=>p.recordId===record.id&&
      'cloud:'+p.userId===record.ownerId)))return;
 state.ttLogGpsBusy=true;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';
 render();
 try{
  const data=await timeTracker.gpsEvidence(boardId,params);
  if(run===state.ttLogGpsRunId&&seq===routeSerial&&
     state.view==='board'&&state.tab==='attendance'&&state.ttView==='log'&&
     state.boardId===boardId&&auth.isSignedIn&&auth.userId===identity&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspace){
   const existing=state.ttLogGpsData;
   const merged=new Map();
   if(existing?.actorId===identity&&existing.workspaceId===workspace&&
      existing.boardId===boardId){
    for(const p of existing.events)merged.set(p.userId+':'+p.recordId+':'+p.kind,p);
   }
   for(const p of data.events)merged.set(p.userId+':'+p.recordId+':'+p.kind,p);
   const ranges=existing?.actorId===identity&&existing.workspaceId===workspace&&
      existing.boardId===boardId?existing.ranges||[]:[];
   state.ttLogGpsCacheAt=Date.now();
   state.ttLogGpsData={...data,events:[...merged.values()],
    ranges:[...ranges,{from:range.from,to:range.to}],
    truncated:existing?.truncated===true||data.truncated===true};
  }
 }catch(err){
  if(run===state.ttLogGpsRunId&&seq===routeSerial){
   // Do not invalidate earlier authorized fixes when a single read fails.
   const message=String(err?.message||'');
   const status=Number(err?.status);
   const code=String(err?.code||'');
   state.ttLogGpsErrorRecordId=record?.id||'';
   if(status===401||/signed session required|session.*expir|session.*revok/i.test(message))
    state.ttLogGpsError='Your signed session is no longer valid. Sign in again to view GPS evidence.';
   else if(status===403||/GPS.*(denied|restricted)|bootstrap.*Supervisor|access denied/i.test(message))
    state.ttLogGpsError='GPS authorization was denied. Only bootstrap administrators and assigned TimeTracker Supervisors may view coordinates.';
   else if(code==='PGRST202'||/function.*not found|schema cache/i.test(message))
    state.ttLogGpsError='The GPS evidence service is not available in the active backend schema.';
   else if(/date window|date range|future date/i.test(message))
    state.ttLogGpsError='The selected attendance date is outside the permitted GPS evidence window.';
   else if(/scope mismatch|identity|workspace changed|revoked during/i.test(message))
    state.ttLogGpsError='The signed GPS response did not match your current session or workspace.';
   else
    state.ttLogGpsError='The signed GPS request failed validation. Refresh your session and retry.';
  }
 }finally{
  if(run===state.ttLogGpsRunId&&seq===routeSerial){
   state.ttLogGpsBusy=false;render();
  }
 }
}
/** Fetch only dedicated server-guarded GPS evidence, never broad module state. */
async function loadTimeTrackerGps(seq=routeSerial,{force=false}={}){
 if(state.view!=='board'||state.tab!=='attendance'||
    state.ttAttendance?.status!=='VERIFIED_READ'||!auth.isSignedIn||
    state.ttBusy||state.ttGpsBusy||state.ttView!=='gps')return;
 const eligible=state.roleVerified===true||
  state.ttAttendance.access?.moduleRole==='Supervisor';
 if(!eligible)return;
 const run=++state.ttGpsRunId,identity=state.context?.user_id,
  workspace=state.context?.workspace_id,boardId=state.boardId;
 const range=timeTrackerGpsWindow();
 const params={from:state.ttGpsFilters.from||range.from,
  to:state.ttGpsFilters.to||range.to,userId:state.ttGpsFilters.userId||null};
 if(!force&&Date.now()-state.ttGpsCacheAt<15000&&!state.ttGpsData?.truncated&&
    state.ttGpsData?.actorId===identity&&state.ttGpsData?.workspaceId===workspace&&
    state.ttGpsData?.boardId===boardId&&
    state.ttGpsData?.from===params.from&&state.ttGpsData?.to===params.to&&
    (!params.userId||state.ttGpsData.events.some(p=>p.userId===params.userId)))return;
 state.ttGpsBusy=true;state.ttGpsError='';render();
 try{
  const data=await timeTracker.gpsEvidence(boardId,params);
  if(run===state.ttGpsRunId&&seq===routeSerial&&
     state.view==='board'&&state.tab==='attendance'&&state.ttView==='gps'&&
     state.boardId===boardId&&auth.isSignedIn&&auth.userId===identity&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspace){
   state.ttGpsData=data;state.ttGpsCacheAt=Date.now();
  }
 }catch(err){
  if(run===state.ttGpsRunId&&seq===routeSerial){
   state.ttGpsData=null;
   state.ttGpsError='Signed GPS evidence is unavailable or access was denied.';
   if(err?.status===403||/GPS authorization|GPS evidence is restricted|Only bootstrap/.test(String(err?.message||'')))
    state.ttView='clock';
  }
 }finally{
  if(run===state.ttGpsRunId&&seq===routeSerial){
   state.ttGpsBusy=false;render();
  }
 }
}
/** Signed, non-mutating probes. Results are in-memory and invalidated on identity change. */
async function loadTimeTrackerMonitor(seq=routeSerial){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttAttendance?.status!=='VERIFIED_READ'||
    !auth.isSignedIn||state.ttBusy||state.ttMonitorBusy)return;
 const run=++state.ttMonitorRunId,identity=state.context?.user_id,
  workspace=state.context?.workspace_id,boardId=state.boardId;
 state.ttMonitor=null;state.ttMonitorError='';state.ttMonitorBusy=true;render();
 try{
  const result=await probeTimeTrackerMonitor({auth,api:db,boardId,
   bootstrapEligible:state.roleVerified===true});
  if(run===state.ttMonitorRunId&&seq===routeSerial&&
     state.view==='board'&&state.ttView==='monitor'&&state.boardId===boardId&&
     auth.isSignedIn&&auth.userId===identity&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspace){
   state.ttMonitor=result;
   state.ttMonitorHistory=[...state.ttMonitorHistory,result].slice(-12);
  }
 }catch(error){
  if(run===state.ttMonitorRunId&&seq===routeSerial){
   state.ttMonitor=null;
   state.ttMonitorError='Monitor check could not verify the current signed session.';
  }
 }finally{
  if(run===state.ttMonitorRunId&&seq===routeSerial){
   state.ttMonitorBusy=false;render();
  }
 }
}
/** Re-verify bootstrap status and workspace identity for every Team read. */
async function loadTimeTrackerTeam(seq=routeSerial){
 if(state.view!=='board'||state.tab!=='attendance'||
    state.ttAttendance?.status!=='VERIFIED_READ'||state.roleVerified!==true)return;
 const run=++state.ttTeamRunId,identity=state.context?.user_id,
  workspaceId=state.context?.workspace_id,boardId=state.boardId;
 state.ttTeam=null;state.ttTeamError='';state.ttTeamBusy=true;render();
 try{
  const data=await timeTracker.teamDirectory(boardId);
  if(run===state.ttTeamRunId&&seq===routeSerial&&auth.isSignedIn&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspaceId&&
     state.boardId===boardId){
   state.ttTeam=data;
  }
 }catch(err){
  if(run===state.ttTeamRunId&&seq===routeSerial){
   state.ttTeam=null;state.ttTeamError=errorMessage(err);
   if(err?.status===401||err?.status===403||/bootstrap|authorization|permission/i.test(String(err?.message||''))){
    state.roleVerified=false;state.ttView='clock';
   }
  }
 }finally{
  if(run===state.ttTeamRunId&&seq===routeSerial){state.ttTeamBusy=false;render();}
 }
}
async function submitTimeTrackerAction(form,actionName){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttBusy||
    moduleByBoardName(state.board?.board?.name)?.key!=='timetracker')return;
 if(!['clock-in','clock-out'].includes(actionName)||state.ttAttendance?.status!=='VERIFIED_READ')return;
 if(!TT_LIVE_ATTENDANCE_WRITES_ACCEPTED||state.ttAttendance?.access?.attendanceWritesAccepted!==true){state.ttError='Live attendance writes require a signed, server-verified Clock capability.';render();return;}
 const values=new FormData(form);
 const active=state.ttAttendance.active;
 if(actionName==='clock-out'&&!active)return;
 const location=actionName==='clock-out'?String(active.location||''):
  String(values.get('tt-location')||'');
 const department=actionName==='clock-out'?String(active.department||''):
  String(values.get('tt-department')||'');
 const workNote=String(form.querySelector('#tt-note')?.value||'');
 const seq=routeSerial,run=++state.ttRunId,identity=state.context.user_id,ws=state.context.workspace_id;
 state.ttBusy=true;state.ttError='';state.ttSuccess='';render();
 try{
  const geo=await captureAttendanceGeo(navigator.geolocation);
  if(seq!==routeSerial||run!==state.ttRunId||!auth.isSignedIn||
    state.context?.user_id!==identity||state.context?.workspace_id!==ws)
   throw new Error('Attendance session changed before commit');
  const receipt=await timeTracker.commit(state.boardId,{
   action:actionName,location,department,workNote,geo
  });
  if(seq!==routeSerial||run!==state.ttRunId)return;
  state.ttSuccess=(receipt.action==='clock-in'?'Clock In':'Clock Out')+
   ' confirmed by PostgreSQL · revision '+receipt.revision;
  state.ttAttendance=await timeTracker.snapshot(state.boardId);
 }catch(err){if(seq===routeSerial&&run===state.ttRunId)state.ttError=errorMessage(err);}
 finally{if(seq===routeSerial&&run===state.ttRunId){state.ttBusy=false;render();}}
}
async function loadIssues(seq=routeSerial){
 state.loadingIssues=true;render();
 try{const rows=await db.issues(state.boardId,state.context.workspace_id);
 if(seq===routeSerial)state.issues=rows;
 }catch(err){if(seq===routeSerial)notice(err);}
 finally{if(seq===routeSerial){state.loadingIssues=false;render();}}
}
async function loadFRTFinance(companyCode=null,seq=routeSerial){
 if(state.view!=='board'||state.tab!=='finance'||
    moduleByBoardName(state.board?.board?.name)?.key!=='frt'||state.frtFinanceBusy)return;
 const identity=state.context?.user_id;
 const workspace=state.context?.workspace_id;
 state.frtFinanceBusy=true;state.frtFinance=null;state.frtFinanceDetail=null;state.frtFinanceDetailId=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailRevision++;render();
 try{
  const result=await loadFRTFinanceReadOnly({auth,api:db,companyCode});
  if(seq===routeSerial&&auth.isSignedIn&&state.context?.user_id===identity&&
     state.context?.workspace_id===workspace)state.frtFinance=result;
 }finally{if(seq===routeSerial){state.frtFinanceBusy=false;render();}}
}
async function loadFRTFinanceDetail(requestId,seq=routeSerial){
 if(state.view!=='board'||state.tab!=='finance'||!auth.isSignedIn||
    state.frtFinanceBusy||state.frtFinanceDetailBusy||
    state.frtFinance?.status!=='PASS'||state.frtFinance?.companyCode===null||
    moduleByBoardName(state.board?.board?.name)?.key!=='frt')return;
 const ids=(state.frtFinance.requests||[]).map(r=>r.requestId);
 if(!ids.includes(requestId))return;
 const revision=++state.frtFinanceDetailRevision;
 const identity=state.context?.user_id,workspace=state.context?.workspace_id;
 const companyCode=state.frtFinance.companyCode;
 state.frtFinanceDetail=null;state.frtFinanceDetailId=requestId;
 state.frtFinanceDetailBusy=true;render();
 try{
  const response=await loadFRTRequestDetailReadOnly({
   auth,api:db,requestId,companyCode,allowedRequestIds:ids,workspaceId:workspace,
   expectedRole:state.frtFinance.role
  });
  if(revision===state.frtFinanceDetailRevision&&seq===routeSerial&&
     auth.isSignedIn&&state.context?.user_id===identity&&
     state.context?.workspace_id===workspace&&
     state.frtFinance?.companyCode===companyCode&&
     state.frtFinance?.requests?.some(r=>r.requestId===requestId))
   state.frtFinanceDetail=response;
 }catch{
  if(revision===state.frtFinanceDetailRevision&&seq===routeSerial)
   state.frtFinanceDetail={status:'BLOCKED',reason:'FRT_DETAIL_READ_INCOMPLETE'};
 }finally{
  if(revision===state.frtFinanceDetailRevision&&seq===routeSerial){
   state.frtFinanceDetailBusy=false;render();
  }
 }
}
async function onRoute(){
 if(!state.context)return;
 const hash=location.hash||routeHome;
 const parts=hash.replace(/^#\/?/,'').split('/');
 if(parts[0]==='boards'&&validUuid(parts[1])){
  const defaultClock=!parts[2]&&state.boards.some(b=>
    b.id===parts[1]&&moduleByBoardName(b.name)?.key==='timetracker');
  const requested=parts[2]==='issues'?'issues':
    parts[2]==='finance'?'finance':
    parts[2]==='attendance'?'attendance':defaultClock?'attendance':'items';
  await loadBoard(parts[1],requested);
  return;
 }
 routeSerial++;state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttView='clock';state.boardId=null;state.board=null;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.view=parts[0]==='boards'?'boards':parts[0]==='settings'?'settings':parts[0]==='acceptance'?'acceptance':parts[0]==='foundation'?'foundation':parts[0]==='security'?'security':parts[0]==='role-configuration'?'role-configuration':parts[0]==='user-role-management'?'user-role-management':'overview';
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
 if(state.view==='security'){
   // Re-read existing authenticated board grants whenever security is opened.
   try{await refreshWorkspace();state.securityBoardsError='';}
   catch{state.boards=[];state.securityBoardsError='SIGNED_BOARD_LIST_REFRESH_FAILED';}
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
   state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;
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
function activeBoardLayout(){
 if(state.view!=='board'||!auth.isSignedIn||auth.userId!==state.context?.user_id||
    state.board?.board?.id!==state.boardId||
    state.board?.board?.workspace_id!==state.context?.workspace_id)return null;
 const moduleKey=moduleByBoardName(state.board.board.name)?.key;
 const tabs=['items','issues',...(moduleKey==='frt'?['finance']:[]),
  ...(moduleKey==='timetracker'?['attendance']:[])];
 const columns=(moduleKey?boardGridColumns(state.board):BOARD_BASE_COLUMNS).map(c=>c.key);
 return {tabs,columns,pref:loadBoardLayout(state.context,state.boardId,tabs,columns)};
}
function persistBoardLayout(transform){
 const a=activeBoardLayout();
 if(!a)return false;
 const changed=normalizeLayout(transform(a.pref,a),a.tabs,a.columns);
 return saveBoardLayout(state.context,state.boardId,changed);
}
let boardHistory=null;
function boardHistoryAuthorized(snapshot){
 return snapshot&&auth.isSignedIn&&
  state.view==='board'&&state.boardId===snapshot.boardId&&
  state.context?.workspace_id===snapshot.workspaceId&&
  auth.userId===snapshot.userId&&
  activeBoardLayout()!==null;
}
function redrawBoardHistory({focus=false}={}){
 if(!modal||!boardHistoryAuthorized(boardHistory)){hideModal();boardHistory=null;return;}
 const host=modal.querySelector('[data-board-activity-results]');
 if(!host)return;
 if(boardHistory.mode==='cursor'){
  const result=boardHistory.pages[boardHistory.index];
  host.innerHTML=renderBoardAuditCursorPage(result,{
   pageIndex:boardHistory.index,busy:boardHistory.busy,error:boardHistory.error,
   cachedNext:boardHistory.index<boardHistory.pages.length-1
  });
  return;
 }
 const results=renderBoardActivityResults(boardHistory.rows,boardHistory);
 boardHistory.page=results.page;
 host.innerHTML=results.html;
 if(focus){
  const search=host.querySelector('#board-activity-search');
  search?.focus();search?.setSelectionRange(search.value.length,search.value.length);
 }
}
async function openBoardActivity(){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 const cursorMode=BOARD_COL01_AUDIT_CURSOR_ENABLED;
 const events=cursorMode?
  await loadBoardAuditCursorPage(db,snapshot.boardId):
  await db.boardEvents(snapshot.boardId,100);
 if(!boardHistoryAuthorized(snapshot))return;
 boardHistory=cursorMode?
  {...snapshot,mode:'cursor',pages:[events],index:0,busy:false,error:''}:
  {...snapshot,rows:normalizeBoardActivity(events),limit:100,
   search:'',type:'all',actor:'all',page:0,busy:false,error:''};
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-history-backdrop';
 modal.innerHTML='<section class="modal board-history-modal" role="dialog" aria-modal="true" aria-labelledby="board-activity-title">'+
  '<div class="modal-head"><h2 id="board-activity-title">Board activity history</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close activity history">×</button></div>'+
  '<p class="muted">'+(cursorMode?'Signed server-paginated board events. Older pages use a protected audit cursor.':'Read-only signed board events. Filters apply to records retrieved from the authoritative server.')+'</p>'+
  '<div data-board-activity-results></div></section>';
 document.body.append(modal);
 modal.addEventListener('click',async event=>{
  if(event.target===modal||event.target.closest('[data-dismiss]')){hideModal();boardHistory=null;return;}
  const action=event.target.closest('[data-board-history-action]')?.dataset.boardHistoryAction;
  if(!action||!boardHistoryAuthorized(boardHistory)||boardHistory.busy)return;
  if(boardHistory.mode==='cursor'){
   const current=boardHistory;
   if(action==='cursor-previous'&&current.index>0)current.index--;
   else if(action==='cursor-next'){
    if(current.index<current.pages.length-1)current.index++;
    else if(current.pages.length<BOARD_COL01_AUDIT_MAX_PAGES&&
     current.pages[current.index]?.hasMore){
     current.busy=true;redrawBoardHistory();
     try{
      const page=await loadBoardAuditCursorPage(db,current.boardId,{
       beforeId:current.pages[current.index].nextCursor});
      if(!boardHistoryAuthorized(current)||boardHistory!==current)return;
      current.pages.push(page);current.index++;current.error='';
     }catch{if(boardHistory===current)current.error='Older audit events could not be loaded.';}
     finally{current.busy=false;}
    }
   }else if(action==='cursor-refresh'){
    current.busy=true;redrawBoardHistory();
    try{
     const page=await loadBoardAuditCursorPage(db,current.boardId);
     if(!boardHistoryAuthorized(current)||boardHistory!==current)return;
     current.pages=[page];current.index=0;current.error='';
    }catch{if(boardHistory===current)current.error='Audit events could not be refreshed.';}
    finally{current.busy=false;}
   }
   redrawBoardHistory();return;
  }
  if(action==='next')boardHistory.page++;
  if(action==='previous')boardHistory.page--;
  if(['more','refresh'].includes(action)){
   const current=boardHistory;
   current.busy=true;redrawBoardHistory();
   try{
    const limit=action==='more'?200:current.limit;
    const rows=await db.boardEvents(current.boardId,limit);
    if(!boardHistoryAuthorized(current)||boardHistory!==current)return;
    current.rows=normalizeBoardActivity(rows);current.limit=limit;current.page=0;current.error='';
   }catch(err){if(boardHistory===current)current.error='Activity could not be refreshed. Retry after checking your signed access.';}
   finally{current.busy=false;}
  }
  redrawBoardHistory();
 });
 modal.addEventListener('input',event=>{
  if(event.target.id!=='board-activity-search'||!boardHistory)return;
  boardHistory.search=event.target.value.slice(0,160);
  boardHistory.page=0;redrawBoardHistory({focus:true});
 });
 modal.addEventListener('change',event=>{
  if(!boardHistory)return;
  if(event.target.id==='board-activity-type')boardHistory.type=event.target.value;
  else if(event.target.id==='board-activity-actor')boardHistory.actor=event.target.value;
  else return;
  boardHistory.page=0;redrawBoardHistory();
 });
 redrawBoardHistory();modal.querySelector('[data-dismiss]')?.focus();
}
async function openBoardItemDetails(itemId){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 // Revalidate server-side board access before revealing details from cached state.
 if(!(await db.allowed(snapshot.boardId,'view'))||!boardHistoryAuthorized(snapshot))return;
 const item=state.board?.items?.find(x=>x.id===itemId);
 if(!item)return;
 const restricted=!!moduleByBoardName(state.board.board.name);
 const group=state.board.groups?.find(x=>x.id===item.group_id);
 const collaboration=await loadBoardCollaboration(db,itemId).catch(()=>({status:'ERROR'}));
 if(!boardHistoryAuthorized(snapshot))return;
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-detail-backdrop';
 modal.innerHTML='<aside class="board-item-drawer" role="dialog" aria-modal="true" aria-labelledby="board-detail-title">'+
  '<div class="board-item-drawer-header"><span class="label-top">APSYNTRA CRM / Board item</span>'+
  '<button type="button" class="modal-close" data-dismiss aria-label="Close item details">×</button></div>'+
  '<h2 id="board-detail-title">'+e(item.title||'Untitled')+'</h2>'+
  '<p class="muted">Read-only item details from the signed board response.</p>'+
  boardItemSummary(item,{groupTitle:group?.title||'Ungrouped',restricted})+
  renderBoardCollaboration(collaboration)+
  '</aside>';
 document.body.append(modal);
 modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-dismiss]'))hideModal();});
 modal.querySelector('[data-dismiss]')?.focus();
}
async function openBoardMembers(){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 const detail=await db.board(snapshot.boardId);
 if(!boardHistoryAuthorized(snapshot)||detail.board?.workspace_id!==snapshot.workspaceId)return;
 // The existing signed board RPC returns only this board's membership.
 const members=Array.isArray(detail.members)?detail.members:[];
 const directory=await loadBoardInvitableDirectory(db,snapshot.boardId)
  .catch(()=>({status:'ERROR'}));
 if(!boardHistoryAuthorized(snapshot))return;
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-history-backdrop';
 modal.innerHTML='<section class="modal board-history-modal" role="dialog" aria-modal="true" aria-labelledby="board-members-title">'+
  '<div class="modal-head"><h2 id="board-members-title">Board members</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close board members">×</button></div>'+
  '<p class="muted">Existing authorized membership. New invitations require a verified server-side same-workspace and role-ceiling contract.</p>'+
  '<div class="board-member-list">'+(members.length?members.map(row=>
    '<div class="board-member"><strong>'+e(row.display_name||'Registered user')+'</strong>'+
    '<span>'+e(row.role||'Member')+'</span></div>').join(''):
    '<p>No board membership records were returned.</p>')+'</div>'+
  '<div data-col01-directory-results>'+renderBoardInvitableDirectory(directory)+'</div></section>';
 document.body.append(modal);
 const view=modal;
 view.addEventListener('submit',async event=>{
  if(!event.target.matches('[data-col01-directory-search]'))return;
  event.preventDefault();
  if(!boardHistoryAuthorized(snapshot))return;
  const query=event.target.elements.namedItem('query')?.value||'';
  let result;
  try{result=await loadBoardInvitableDirectory(db,snapshot.boardId,{query});}
  catch{result={status:'ERROR'};}
  if(view!==modal||!boardHistoryAuthorized(snapshot))return;
  const host=view.querySelector('[data-col01-directory-results]');
  if(host)host.innerHTML=renderBoardInvitableDirectory(result);
 });
 view.addEventListener('click',event=>{if(event.target===view||event.target.closest('[data-dismiss]'))hideModal();});
 view.querySelector('[data-dismiss]')?.focus();
}

async function action(name,button){
 switch(name){
 case 'toggle-password':{const f=root.querySelector('#password');if(f){f.type=f.type==='password'?'text':'password';button.textContent=f.type==='password'?'Show':'Hide';}break;}
 case 'logout':{await auth.signOut();stopTimeTrackerClock();state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};state.context=null;state.roleVerified=false;state.roleData=null;state.userRoleData=null;state.boards=[];state.board=null;state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;location.hash='#/login';renderLogin();toast('Signed out successfully.');break;}
 case 'refresh':{try{await refreshWorkspace();render();toast('Workspace refreshed.')}catch(err){notice(err);}break;}
 case 'board-activity':{await openBoardActivity();break;}
 case 'board-members':{await openBoardMembers();break;}
 case 'board-item-detail':{await openBoardItemDetails(button.dataset.id);break;}
 case 'board-layout-reset':{
  const current=activeBoardLayout();if(!current)return;
  resetBoardLayout(state.context,state.boardId);render();break;
 }
 case 'board-column-move':{
  const current=activeBoardLayout(),key=button.dataset.key,
   delta=Number(button.dataset.direction);
  if(!current||!current.columns.includes(key)||
    BOARD_REQUIRED_COLUMNS.includes(key)||![-1,1].includes(delta))return;
  persistBoardLayout(p=>{
   const movable=p.columns.filter(k=>!BOARD_REQUIRED_COLUMNS.includes(k));
   const index=movable.indexOf(key),target=movable[index+delta];
   return target?{...p,columns:[...BOARD_REQUIRED_COLUMNS,...reorderVisible(movable,key,target)]}:p;
  });
  render();root.querySelector('.board-column-menu')?.setAttribute('open','');break;
 }
 case 'board-tab-move':{
  const current=activeBoardLayout(),key=button.dataset.key,
   delta=Number(button.dataset.direction);
  if(!current||!current.tabs.includes(key)||![-1,1].includes(delta))return;
  persistBoardLayout(p=>{
   const target=p.tabs[p.tabs.indexOf(key)+delta];
   return target?{...p,tabs:reorderVisible(p.tabs,key,target)}:p;
  });
  render();root.querySelector('[data-board-tab="'+key+'"]')?.focus();break;
 }
  case 'refresh-board':{await loadBoard(state.boardId,state.tab);break;}
 case 'tt-refresh':{if(!state.ttBusy){const team=state.ttView==='team',gps=state.ttView==='gps',log=state.ttView==='log';await loadTimeTracker();if(team&&state.roleVerified===true&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerTeam();if(gps&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerGps();if(log&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerLogGps();}break;}
 case 'tt-tab':{
  if(state.ttBusy||state.view!=='board'||state.tab!=='attendance'||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const next=button.dataset.target;
  if(!['overview','clock','log','reports','calendar','ot','hours','team','monitor','gps'].includes(next))return;
  if(next==='gps'&&state.roleVerified!==true&&state.ttAttendance.access?.moduleRole!=='Supervisor')return;
  if(next==='team'&&state.roleVerified!==true)return;
  if(next!=='ot')state.ttOtModalOpen=false;
  state.ttView=next;render();
  if(next==='team')await loadTimeTrackerTeam();
  if(next==='monitor')await loadTimeTrackerMonitor();
  if(next==='gps')await loadTimeTrackerGps();
  if(next==='log')await loadTimeTrackerLogGps();
  break;
 }
 case 'tt-map-fullscreen':{
  if(!auth.isSignedIn||state.view!=='board'||state.tab!=='attendance'||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor')||
     !['log','gps'].includes(state.ttView))return;
  await toggleTimeTrackerMapFullscreen(button.closest('.tt-map-host'));break;
 }
 case 'tt-map-retry':{
  if(!auth.isSignedIn||state.view!=='board'||state.tab!=='attendance'||
    state.ttAttendance?.status!=='VERIFIED_READ'||
    !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor')||
    !['log','gps'].includes(state.ttView))return;
  await retryTimeTrackerMaps(root,timeTrackerSignedMapConfigs(),button.closest('.tt-map-host'));break;
 }
 case 'tt-map-enable':{
  if(!auth.isSignedIn||state.view!=='board'||state.tab!=='attendance'||
   state.ttAttendance?.status!=='VERIFIED_READ'||
   !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor')||
   !['log','gps'].includes(state.ttView))return;
  state.ttMapConsent=true;
  state.ttMapConsentIdentity=timeTrackerMapConsentKey();
  void mountSignedTimeTrackerMaps();break;
 }
 case 'tt-log-gps-load':{
  if(state.ttView!=='log'||state.ttBusy||state.ttLogGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ'||!auth.isSignedIn||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const record=(state.ttAttendance.log?.rows||[]).find(r=>
   r.id===button.dataset.recordId);
  if(!record||typeof record.ownerId!=='string'||!record.ownerId.startsWith('cloud:'))return;
  await loadTimeTrackerLogGps(routeSerial,record,{force:button.textContent?.includes('Refresh')===true});break;
 }
 case 'tt-location-shortcut':{
  if(state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ'||state.ttView!=='clock')return;
  const location=button.dataset.location;
  if(!['Office-Base Duty','Offsite (Home)'].includes(location))return;
  const selected=root.querySelector('#tt-location');
  if(!selected)return;
  selected.value=location;
  selected.dispatchEvent(new Event('change',{bubbles:true}));
  for(const chip of root.querySelectorAll('[data-action="tt-location-shortcut"]')){
   const chosen=chip.dataset.location===location;
   chip.classList.toggle('is-selected',chosen);
   chip.setAttribute('aria-pressed',String(chosen));
  }
  break;
 }
 case 'tt-overview-export':{
  if(state.ttBusy||state.ttView!=='overview'||
     state.ttAttendance?.status!=='VERIFIED_READ'||!state.ttAttendance.overview)return;
  const rows=filterTimeTrackerOverviewRows(state.ttAttendance.overview.rows,state.ttOverviewFilters);
  if(!rows.length)return;
  const blob=new Blob([timeTrackerOverviewCsv(rows)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
    link.download='timetracker-authorized-overview-'+state.ttAttendance.overview.day+'.csv';
    link.click();
  }finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-log-export':{
  if(state.ttBusy||state.ttView!=='log'||state.view!=='board'||
     state.tab!=='attendance'||state.ttAttendance?.status!=='VERIFIED_READ')return;
  const rows=filterTimeTrackerLogRows(state.ttAttendance.log?.rows||state.ttAttendance.records,state.ttLogFilters);
  if(!rows.length)return;
  const blob=new Blob([timeTrackerLogCsv(rows)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
   link.download='timetracker-authorized-filtered-log.csv';link.click();}
  finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-export':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='reports'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const records=filterTimeTrackerReportRows(
   state.ttAttendance.log?.rows||state.ttAttendance.records,
   {period:state.ttReportPeriod,filters:state.ttReportFilters}
  );
  if(!records.length)return;
  const blob=new Blob([timeTrackerLogCsv(records)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
   link.download='timetracker-authorized-reports.csv';link.click();}
  finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-calendar-prev':
 case 'tt-calendar-next':
 case 'tt-calendar-today':
 case 'tt-calendar-day':{
  if(state.view!=='board'||state.tab!=='attendance'||
     state.ttView!=='calendar'||state.ttBusy||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const current=state.ttCalendarMonth||timeTrackerCalendarMonth();
  if(name==='tt-calendar-today'){
   state.ttCalendarMonth=timeTrackerCalendarMonth();
   state.ttCalendarSelectedDay='';
  }else if(name==='tt-calendar-prev'||name==='tt-calendar-next'){
   state.ttCalendarMonth=shiftTimeTrackerCalendarMonth(current,
    name==='tt-calendar-prev'?-1:1);
   state.ttCalendarSelectedDay='';
  }else{
   const day=button.dataset.day;
   if(!/^\d{4}-(0[1-9]|1[0-2])-([0-3]\d)$/.test(day||'')||
      !day.startsWith(current+'-'))return;
   const d=new Date(day+'T00:00:00.000Z');
   if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)return;
   state.ttCalendarSelectedDay=state.ttCalendarSelectedDay===day?'':day;
  }
  render();break;
 }
 case 'tt-gps-view':{
  if(state.ttView!=='gps'||state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const next=button.dataset.view;
  if(!['map','geofence','trail','accuracy','trends'].includes(next))return;
  state.ttGpsView=next;render();break;
 }
 case 'tt-gps-zoom':{
  if(state.ttView!=='gps'||state.ttBusy||state.ttGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const direction=button.dataset.direction;
  if(direction!=='in'&&direction!=='out')return;
  const current=Number(state.ttGpsFilters.zoom)||1;
  const zoom=Math.max(1,Math.min(4,current+(direction==='in'?.5:-.5)));
  state.ttGpsFilters={...state.ttGpsFilters,zoom};
  render();break;
 }
 case 'tt-gps-theme':
 case 'tt-map-style':{
  if(!['gps','log'].includes(state.ttView)||state.ttBusy||state.ttGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const theme=button.dataset.theme;
  if(theme!=='map'&&theme!=='dark')return;
  state.ttGpsFilters={...state.ttGpsFilters,theme};
  setTimeTrackerMapTheme(theme);
  for(const control of root.querySelectorAll('[data-action="tt-gps-theme"],[data-action="tt-map-style"]')){
   const chosen=control.dataset.theme===theme;
   control.classList.toggle('is-active',chosen);
   control.setAttribute('aria-pressed',String(chosen));
  }
  break;
 }
 case 'tt-gps-load':{
  if(state.ttView!=='gps'||state.ttBusy||state.ttGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const from=root.querySelector('#tt-gps-from')?.value||'';
  const to=root.querySelector('#tt-gps-to')?.value||'';
  const userId=root.querySelector('#tt-gps-user')?.value||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return;
  const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z');
  const today=timeTrackerGpsWindow().to;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||
     (end-start)>30*86400000||to>today)return;
  if(userId&&!(state.ttGpsData?.events||[]).some(p=>p.userId===userId))return;
  state.ttGpsFilters={...state.ttGpsFilters,from,to,userId,referenceId:''};
  await loadTimeTrackerGps(routeSerial,{force:true});break;
 }
 case 'tt-gps-compare':{
  if(state.ttView!=='gps'||state.ttGpsView!=='geofence'||
     !state.ttGpsData||state.ttGpsBusy)return;
  const referenceId=root.querySelector('#tt-gps-reference')?.value||'';
  if(referenceId&&!state.ttGpsData.events.some(p=>p.recordId+':'+p.kind===referenceId))return;
  const radius=Number(root.querySelector('#tt-gps-radius')?.value);
  if(!Number.isFinite(radius)||radius<100||radius>50000)return;
  state.ttGpsFilters={...state.ttGpsFilters,referenceId,radius};
  render();break;
 }
 case 'tt-monitor-refresh':{
  if(state.ttView!=='monitor'||state.ttMonitorBusy||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  await loadTimeTrackerMonitor();
  break;
 }
 case 'tt-monitor-clear':{
  if(state.ttView!=='monitor'||state.ttAttendance?.status!=='VERIFIED_READ')return;
  state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
  state.ttMonitorBusy=false;render();break;
 }
 case 'tt-team-refresh':{
  if(state.ttBusy||state.ttTeamBusy||state.ttView!=='team'||state.roleVerified!==true||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  await loadTimeTrackerTeam();break;
 }
 case 'tt-team-role':
 case 'tt-team-layout':{
  if(state.ttBusy||state.ttTeamBusy||state.ttView!=='team'||state.roleVerified!==true||
     state.ttAttendance?.status!=='VERIFIED_READ'||!state.ttTeam)return;
  if(name==='tt-team-role'&&['All','Unassigned',...TT_TEAM_ROLES].includes(button.dataset.role))
    state.ttTeamFilters={...state.ttTeamFilters,role:button.dataset.role};
  if(name==='tt-team-layout'&&['grid','list'].includes(button.dataset.layout))
    state.ttTeamFilters={...state.ttTeamFilters,layout:button.dataset.layout};
  render();break;
 }
 case 'tt-team-export':{
  if(state.ttBusy||state.ttTeamBusy||state.ttView!=='team'||state.roleVerified!==true||
     state.ttAttendance?.status!=='VERIFIED_READ'||!state.ttTeam)return;
  const id=state.context?.user_id,ws=state.context?.workspace_id,
   boardId=state.boardId,seq=routeSerial;
  const verified=await timeTracker.teamDirectory(boardId);
  if(seq!==routeSerial||state.context?.user_id!==id||
     state.context?.workspace_id!==ws||verified.actorId!==id||
     verified.workspaceId!==ws)return;
  const blob=new Blob([timeTrackerTeamCsv(verified)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
   link.download='timetracker-authorized-team.csv';link.click();}
  finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-hours-week-prev':
 case 'tt-hours-week-next':
 case 'tt-hours-week-current':
 case 'tt-hours-month-prev':
 case 'tt-hours-month-next':
 case 'tt-hours-month-current':
 case 'tt-hours-day':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='hours'||
     state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ')return;
  if(name==='tt-hours-week-current')state.ttHoursWeekOffset=0;
  if(name==='tt-hours-week-prev'||name==='tt-hours-week-next'){
   const step=name==='tt-hours-week-prev'?-1:1;
   const candidate=state.ttHoursWeekOffset+step;
   if(Math.abs(candidate)>104)return;
   timeTrackerMyHoursWeek(candidate);
   state.ttHoursWeekOffset=candidate;
  }
  if(name==='tt-hours-month-current'){
   state.ttHoursMonth=timeTrackerCalendarMonth();
   state.ttHoursSelectedDay='';
  }
  if(name==='tt-hours-month-prev'||name==='tt-hours-month-next'){
   const current=state.ttHoursMonth||timeTrackerCalendarMonth();
   const next=shiftTimeTrackerCalendarMonth(current,
    name==='tt-hours-month-prev'?-1:1);
   state.ttHoursMonth=next;state.ttHoursSelectedDay='';
  }
  if(name==='tt-hours-day'){
   const day=button.dataset.day||'';
   const current=state.ttHoursMonth||timeTrackerCalendarMonth();
   if(!/^\d{4}-(0[1-9]|1[0-2])-([0-3]\d)$/.test(day)||
      !day.startsWith(current+'-'))return;
   const date=new Date(day+'T00:00:00.000Z');
   if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==day)return;
   state.ttHoursSelectedDay=state.ttHoursSelectedDay===day?'':day;
  }
  render();break;
 }
 case 'tt-ot-prev':
 case 'tt-ot-next':
 case 'tt-ot-current':
 case 'tt-ot-status':
 case 'tt-ot-sort':
 case 'tt-ot-open':
 case 'tt-ot-close':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ')return;
  if(name==='tt-ot-open')state.ttOtModalOpen=true;
  if(name==='tt-ot-close')state.ttOtModalOpen=false;
  if(name==='tt-ot-current')state.ttOtFilters={...state.ttOtFilters,weekOffset:0};
  if(name==='tt-ot-prev'||name==='tt-ot-next'){
   const offset=state.ttOtFilters.weekOffset+(name==='tt-ot-prev'?-1:1);
   if(Math.abs(offset)>104)return;
   state.ttOtFilters={...state.ttOtFilters,weekOffset:offset};
  }
  if(name==='tt-ot-status'&&['Submitted','Approved','Rejected'].includes(button.dataset.status))
   state.ttOtFilters={...state.ttOtFilters,status:button.dataset.status};
  if(name==='tt-ot-sort')
   state.ttOtFilters={...state.ttOtFilters,
    sort:state.ttOtFilters.sort==='oldest'?'newest':'oldest'};
  render();break;
 }
 case 'tt-ot-approve':
 case 'tt-ot-reject':{
  if(!TT_OT_WRITES_ACCEPTED||state.ttBusy||
     state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     state.ttAttendance.access?.bootstrapApprover!==true)return;
  const requestId=button.dataset.id;
  const decision=name==='tt-ot-approve'?'Approved':'Rejected';
  if(!confirm(decision+' this overtime request? The decision will be audited and cannot be reversed here.'))return;
  state.ttBusy=true;render();
  try{
   await timeTracker.decideOvertime(state.boardId,requestId,decision);
   await loadTimeTracker();
   toast('Overtime request '+decision.toLowerCase()+'.');
  }finally{state.ttBusy=false;render();}
  break;
 }
 case 'tt-report-preset':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='reports'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const period=button.dataset.period;
  if(!['all','today','week','month','custom'].includes(period))return;
  state.ttReportPeriod=period;render();break;
 }
 case 'tt-report-status':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='reports'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const status=button.dataset.status;
  if(!['all','Late','Active','Completed'].includes(status))return;
  state.ttReportFilters={...state.ttReportFilters,status};render();break;
 }
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
 case 'security-effective-access':{
   if(state.effectiveAccessBusy||!state.context||!auth.isSignedIn)return;
   state.effectiveAccessBusy=true;state.effectiveAccessResult=null;
   const revision=++state.effectiveAccessRunId;render();
   try{
     const result=await inspectMySignedEffectiveAccess({auth,api:db});
     if(revision!==state.effectiveAccessRunId||!auth.isSignedIn)return;
     state.effectiveAccessResult=result;
     if(result.status==='PASS'){
       // The snapshot's board list was already filtered by the authoritative
       // work_board_access RPC, not by a client-side guess or host role.
       toast('Signed effective platform, application and board permissions inspected.');
     }else toast('Effective permission inspection '+result.status+'.',true);
   }catch{
     if(revision===state.effectiveAccessRunId&&auth.isSignedIn)
       state.effectiveAccessResult={checkpoint:'CP-FRT-SEC11',status:'BLOCKED',
        reason:'SIGNED_SELF_INSPECTION_INCOMPLETE',modules:[],boards:[],
        writesAttempted:0,roleChangesAttempted:0};
   }finally{if(revision===state.effectiveAccessRunId){state.effectiveAccessBusy=false;render();}}
   break;
 }
 case 'security-effective-access-copy':{
   if(!state.effectiveAccessResult)return;
   try{
     await navigator.clipboard.writeText(sanitizeEffectiveAccessReport(state.effectiveAccessResult));
     toast('Nonsecret permission summary copied.');
   }catch{toast('Clipboard unavailable. Use the displayed summary.',true);}
   break;
 }
 case 'security-sec10-readonly':{
   if(state.sec10Busy||!state.context||!auth.isSignedIn)return;
   if(state.roleVerified===true)
     return toast('SEC10 requires a signed nonbootstrap user in an approved isolated nonproduction environment. Sign out of the bootstrap administrator account.',true);
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
 case 'frt-finance-detail':{
   if(state.frtFinanceBusy||state.frtFinanceDetailBusy||
      state.tab!=='finance'||!auth.isSignedIn)return;
   const requestId=String(button?.dataset?.requestId||'');
   if(!state.frtFinance?.requests?.some(r=>r.requestId===requestId))return;
   await loadFRTFinanceDetail(requestId);
   break;
 }
 case 'frt-finance-detail-close':{
   state.frtFinanceDetailRevision++;state.frtFinanceDetailBusy=false;
   state.frtFinanceDetail=null;state.frtFinanceDetailId=null;render();break;
 }
 case 'frt-finance-refresh':{
   if(state.frtFinanceBusy||state.tab!=='finance'||!auth.isSignedIn)return;
   await loadFRTFinance(state.frtFinance?.companyCode||null);
   break;
 }
 case 'frt-finance-company':{
   if(state.frtFinanceBusy||state.tab!=='finance'||!auth.isSignedIn)return;
   const code=String(button?.dataset?.code||'');
   if(!state.frtFinance?.companies?.some(c=>c.code===code))return;
   await loadFRTFinance(code);
   break;
 }
 case 'security-sec14-readonly':{
   if(state.sec14Busy||!state.context||!auth.isSignedIn)return;
   state.sec14Busy=true;state.sec14Result=null;
   const revision=++state.sec14RunId;render();
   try{
    const result=await runSEC14SignedRead({auth,api:db});
    if(revision!==state.sec14RunId||!auth.isSignedIn)return;
    state.sec14Result=result;
    toast(result.status==='PASS'?'SEC14 signed restricted reads passed.':
      'SEC14 signed restricted-read result: '+result.status,result.status!=='PASS');
   }finally{
    if(revision===state.sec14RunId){state.sec14Busy=false;render();}
   }
   break;
 }
 case 'security-sec14-denial':{
   if(state.sec14DenialBusy||!state.context||!auth.isSignedIn)return;
   state.sec14DenialBusy=true;state.sec14DenialResult=null;
   const revision=++state.sec14DenialRunId;render();
   try{
    const result=await runSEC14SignedDenials({auth,api:db});
    if(revision!==state.sec14DenialRunId||!auth.isSignedIn)return;
    state.sec14DenialResult=result;
    toast('SEC14 nonbootstrap denial verification: '+result.status,result.status!=='PASS');
   }finally{
    if(revision===state.sec14DenialRunId){state.sec14DenialBusy=false;render();}
   }
   break;
 }
 case 'security-sec14-denial-copy':{
   if(!state.sec14DenialResult)return;
   try{
    await navigator.clipboard.writeText(sanitizeSEC14SignedDenials(state.sec14DenialResult));
    toast('Nonsecret SEC14 denial report copied.');
   }catch{toast('Clipboard unavailable.',true);}
   break;
 }
 case 'security-sec14-copy':{
   if(!state.sec14Result)return;
   try{
    await navigator.clipboard.writeText(sanitizeSEC14SignedRead(state.sec14Result));
    toast('Nonsecret SEC14 signed read report copied.');
   }catch{toast('Clipboard unavailable.',true);}
   break;
 }
 case 'security-ci07-readonly':{
   if(state.ci07Busy||!state.context||!auth.isSignedIn)return;
   state.ci07Busy=true;state.ci07Result=null;
   const revision=++state.ci07RunId;render();
   try{
     const result=await runFRTCI07SignedRoleProbe({auth,api:db});
     if(revision!==state.ci07RunId||!auth.isSignedIn)return;
     state.ci07Result=result;
     toast(result.status==='PASS'?'Live signed FRT role resolved through session guard.':
       'CI07 signed FRT read-only check '+result.status+'.',result.status!=='PASS');
   }catch{
     if(revision===state.ci07RunId&&auth.isSignedIn)
       state.ci07Result={checkpoint:'CP-FRT-SEC10-CI07',status:'BLOCKED',
        reason:'SIGNED_FRT_READONLY_PROBE_INCOMPLETE',role:'UNVERIFIED',
        checks:[],writesAttempted:0,roleChangesAttempted:0,
        revocationVerified:'NOT_VERIFIED',financialOperationsVerified:'NOT_VERIFIED'};
   }finally{
     if(revision===state.ci07RunId){state.ci07Busy=false;render();}
   }
   break;
 }
 case 'security-ci07-copy':{
   if(!state.ci07Result)return;
   try{
     await navigator.clipboard.writeText(sanitizeFRTCI07Report(state.ci07Result));
     toast('Nonsecret CI07 read-only result copied.');
   }catch{toast('Clipboard unavailable. Use the displayed summary.',true);}
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
root.addEventListener('toggle',event=>{
 if(event.target.matches('.tt-log-detail')&&event.target.open)
  void mountSignedTimeTrackerMaps();
},true);

let boardDrag=null,boardResize=null,boardTouch=null,boardSuppressedClick=false;
function moveBoardPresentation(kind,from,to){
 if(!from||!to||from===to||!activeBoardLayout())return false;
 if(kind==='tab'){
  const c=activeBoardLayout();
  if(!c.tabs.includes(from)||!c.tabs.includes(to))return false;
  persistBoardLayout(p=>({...p,tabs:reorderVisible(p.tabs,from,to)}));
 }else if(kind==='column'){
  const c=activeBoardLayout();
  if(!c.columns.includes(from)||!c.columns.includes(to)||
    BOARD_REQUIRED_COLUMNS.includes(from)||BOARD_REQUIRED_COLUMNS.includes(to))return false;
  persistBoardLayout(p=>{
   const movable=p.columns.filter(k=>!BOARD_REQUIRED_COLUMNS.includes(k));
   return {...p,columns:[...BOARD_REQUIRED_COLUMNS,...reorderVisible(movable,from,to)]};
  });
 }else return false;
 render();return true;
}
root.addEventListener('dragstart',event=>{
 if(!activeBoardLayout())return;
 const tab=event.target.closest('[data-board-tab]');
 const th=event.target.closest('th[data-column-key]');
 const kind=tab?'tab':th?'column':null;
 if(!kind)return;
 const key=(tab||th).dataset[kind==='tab'?'boardTab':'columnKey'];
 if(kind==='column'&&BOARD_REQUIRED_COLUMNS.includes(key)){event.preventDefault();return;}
 boardDrag={kind,key};
 event.dataTransfer?.setData('text/plain','APSYNTRA board layout');
 if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
 (tab||th).classList.add('board-dragging');
});
root.addEventListener('dragover',event=>{
 if(!boardDrag)return;
 const target=event.target.closest(boardDrag.kind==='tab'?'[data-board-tab]':'th[data-column-key]');
 if(!target)return;
 const key=target.dataset[boardDrag.kind==='tab'?'boardTab':'columnKey'];
 if(boardDrag.kind==='column'&&BOARD_REQUIRED_COLUMNS.includes(key))return;
 if(key!==boardDrag.key){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}
});
root.addEventListener('drop',event=>{
 if(!boardDrag)return;
 const target=event.target.closest(boardDrag.kind==='tab'?'[data-board-tab]':'th[data-column-key]');
 if(!target)return;
 const key=target.dataset[boardDrag.kind==='tab'?'boardTab':'columnKey'];
 event.preventDefault();moveBoardPresentation(boardDrag.kind,boardDrag.key,key);
 boardDrag=null;
});
root.addEventListener('dragend',()=>{
 boardDrag=null;root.querySelectorAll('.board-dragging').forEach(x=>x.classList.remove('board-dragging'));
});
root.addEventListener('pointerdown',event=>{
 if(!activeBoardLayout())return;
 const resize=event.target.closest('button.board-column-resize');
 if(resize){
  const th=resize.closest('th[data-column-key]');
  const table=resize.closest('table.board-table-custom');
  const col=table?.querySelector('col[data-column-key="'+resize.dataset.columnKey+'"]');
  if(!col||!th)return;
  boardResize={pointerId:event.pointerId,x:event.clientX,key:resize.dataset.columnKey,
   col,table,start:col.width?Number(col.getAttribute('width')):th.offsetWidth};
  resize.setPointerCapture?.(event.pointerId);event.preventDefault();return;
 }
 // Native drag is for mouse/trackpad; pointer reorder supports touch and pen.
 if(event.pointerType==='mouse')return;
 const tab=event.target.closest('[data-board-tab]');
 const handle=event.target.closest('button.board-column-handle');
 if(!tab&&!handle)return;
 const kind=tab?'tab':'column';
 const element=tab||handle.closest('th[data-column-key]');
 boardTouch={kind,key:element.dataset[kind==='tab'?'boardTab':'columnKey'],
  x:event.clientX,y:event.clientY,pointerId:event.pointerId};
});
window.addEventListener('pointermove',event=>{
 if(boardResize&&event.pointerId===boardResize.pointerId){
  const width=columnWidth(boardResize.start+event.clientX-boardResize.x);
  const previous=Number(boardResize.col.getAttribute('width'))||boardResize.start;
  boardResize.col.setAttribute('width',String(width));
  const total=Number(boardResize.table.getAttribute('width'))||boardResize.table.offsetWidth;
  boardResize.table.setAttribute('width',String(total+width-previous));
  return;
 }
});
window.addEventListener('pointerup',event=>{
 if(boardResize&&event.pointerId===boardResize.pointerId){
  const {key,col}=boardResize;
  const width=columnWidth(col.getAttribute('width'));
  persistBoardLayout(p=>({...p,widths:{...p.widths,[key]:width}}));
  boardResize=null;return;
 }
 if(boardTouch&&event.pointerId===boardTouch.pointerId){
  const {kind,key,x,y}=boardTouch;boardTouch=null;
  if(Math.hypot(event.clientX-x,event.clientY-y)<24)return;
  const at=document.elementFromPoint(event.clientX,event.clientY);
  const target=at?.closest(kind==='tab'?'[data-board-tab]':'th[data-column-key]');
  const to=target?.dataset[kind==='tab'?'boardTab':'columnKey'];
  if(moveBoardPresentation(kind,key,to)){boardSuppressedClick=true;}
 }
});
window.addEventListener('pointercancel',()=>{boardResize=null;boardTouch=null;});
root.addEventListener('click',event=>{
 if(boardSuppressedClick&&event.target.closest('[data-board-tab]')){
  event.preventDefault();boardSuppressedClick=false;
 }
},true);

root.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');
 if(!target)return;
 event.preventDefault();
 Promise.resolve(action(target.dataset.action,target)).catch(notice);
});
root.addEventListener('change',event=>{
 if(event.target.matches('[data-board-column-toggle]')){
  const c=activeBoardLayout(),key=event.target.dataset.boardColumnToggle;
  if(!c||!c.columns.includes(key)||BOARD_REQUIRED_COLUMNS.includes(key))return;
  persistBoardLayout(p=>({...p,hidden:event.target.checked?
   p.hidden.filter(x=>x!==key):[...p.hidden,key]}));
  render();root.querySelector('.board-column-menu')?.setAttribute('open','');return;
 }

 if(['tt-overview-location','tt-overview-department','tt-overview-status','tt-overview-sort'].includes(event.target.id)&&
    state.view==='board'&&state.ttView==='overview'){
  const key=event.target.id.slice('tt-overview-'.length);
  const {overview}=state.ttAttendance||{};
  const value=event.target.value;
  if(overview&&(
    key==='location'&&(value==='all'||overview.locations.some(x=>x.location===value))||
    key==='department'&&(value==='all'||overview.departmentCounts.some(x=>x.department===value))||
    key==='status'&&['all','Active','Completed','Late'].includes(value)||
    key==='sort'&&['newest','oldest'].includes(value)
  )){
   state.ttOverviewFilters={...state.ttOverviewFilters,[key]:value};
   render();
  }
 }
 if(['tt-log-period','tt-log-status','tt-log-location','tt-log-sort'].includes(event.target.id)&&
    state.view==='board'&&state.ttView==='log'&&state.ttAttendance?.status==='VERIFIED_READ'){
  const key=event.target.id.slice('tt-log-'.length);
  const value=event.target.value;
  if(key==='period'&&['all','today','week','month'].includes(value)||
     key==='status'&&['all','Active','Completed','Late','Administrative closure'].includes(value)||
     key==='sort'&&['newest','oldest'].includes(value)||
     key==='location'&&(value==='all'||(state.ttAttendance.log?.rows||state.ttAttendance.records).some(r=>r.location===value))){
    state.ttLogFilters={...state.ttLogFilters,[key]:value};
    render();
  }
 }
 if(event.target.id==='tt-report-period'&&
    state.ttView==='reports'&&['all','today','week','month','custom'].includes(event.target.value)){
  state.ttReportPeriod=event.target.value;render();
 }
 if(['tt-report-start','tt-report-end'].includes(event.target.id)&&
    state.ttView==='reports'&&state.ttAttendance?.status==='VERIFIED_READ'){
  const key=event.target.id==='tt-report-start'?'start':'end';
  const value=event.target.value;
  if(value===''||/^\d{4}-\d{2}-\d{2}$/.test(value)){
   state.ttReportFilters={...state.ttReportFilters,[key]:value};render();
  }
 }
 if(event.target.id==='tt-location'){
  const group=root.querySelector('#tt-note-wrap');
  const note=root.querySelector('#tt-note');
  if(group&&note){
   const offsite=event.target.value==='Offsite (Home)' &&
    state.ttAttendance?.access?.moduleRole!=='System Admin';
   group.hidden=!offsite;note.required=offsite;
   if(!offsite)note.value='';
  }
 }
 if(event.target.id==='managed-user'&&state.roleVerified&&state.userRoleData){
  const id=event.target.value;
  if(state.userRoleData.users.some(u=>u.id===id)){
    state.userRoleSelected=id;render();
  }
 }
});
root.addEventListener('submit',event=>{
 if(event.target.id==='tt-ot-form'){
  event.preventDefault();
  if(!TT_OT_WRITES_ACCEPTED){
   toast('OT submission remains disabled until signed backend authorization and audit are verified.',true);
   return;
  }
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const draft={
   date:root.querySelector('#tt-ot-date')?.value||'',
   start:root.querySelector('#tt-ot-start')?.value||'',
   end:root.querySelector('#tt-ot-end')?.value||'',
   reason:root.querySelector('#tt-ot-reason')?.value||''
  };
  state.ttBusy=true;
  Promise.resolve(timeTracker.submitOvertime(state.boardId,draft))
   .then(async()=>{state.ttOtModalOpen=false;state.ttOtDraft={};
     await loadTimeTracker();toast('OT request submitted for bootstrap review.');})
   .catch(notice).finally(()=>{state.ttBusy=false;render();});
  return;
 }
 if(event.target.id==='login-form'){event.preventDefault();login(event.target);}
 if(event.target.id==='tt-clock-form'){
  event.preventDefault();
  const kind=event.submitter?.value;
  Promise.resolve(submitTimeTrackerAction(event.target,kind)).catch(notice);
 }
});
root.addEventListener('input',event=>{
 if(event.target.id==='tt-team-search'&&state.view==='board'&&state.ttView==='team'&&
    state.roleVerified===true&&state.ttTeam&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttTeamFilters={...state.ttTeamFilters,search:String(event.target.value).slice(0,120)};
  const focus=event.target.selectionStart;
  render();
  const field=root.querySelector('#tt-team-search');
  if(field){field.focus();field.setSelectionRange(focus,focus);}
  return;
 }
 if(event.target.id==='tt-ot-search'&&state.view==='board'&&state.ttView==='ot'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttOtFilters={...state.ttOtFilters,search:String(event.target.value).slice(0,120)};
  const focus=event.target.selectionStart;
  render();
  const field=root.querySelector('#tt-ot-search');
  if(field){field.focus();field.setSelectionRange(focus,focus);}
  return;
 }
 if(event.target.id==='tt-overview-search'&&state.view==='board'&&state.ttView==='overview'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttOverviewFilters={...state.ttOverviewFilters,search:String(event.target.value).slice(0,120)};
  applyTimeTrackerOverviewFilters(root);
  return;
 }
 if(event.target.id==='tt-log-search'&&state.view==='board'&&state.ttView==='log'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttLogFilters={...state.ttLogFilters,search:String(event.target.value).slice(0,120)};
  applyTimeTrackerLogSearch(root,state.ttLogFilters.search);
  return;
 }
 if(event.target.id==='tt-report-search'&&
    state.view==='board'&&state.ttView==='reports'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttReportFilters={...state.ttReportFilters,
   search:String(event.target.value).slice(0,120)};
  applyTimeTrackerReportSearch(root,state.ttReportFilters.search);
  return;
 }
 if(!event.target.matches('.search-input'))return;
 const value=event.target.value.toLowerCase().trim();
 for(const row of root.querySelectorAll('[data-searchable]'))row.hidden=!row.dataset.searchable.includes(value);
});
window.addEventListener('hashchange',()=>{onRoute().catch(notice);});
window.addEventListener('keydown',event=>{if(event.key==='Escape'){
 hideModal();if(state.ttOtModalOpen){state.ttOtModalOpen=false;render();}
}});
auth.onExpired=()=>{state.context=null;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.roleVerified=false;state.roleData=null;state.userRoleData=null;state.boards=[];stopTimeTrackerClock();state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};renderLogin('Session expired. Please sign in again.');};
async function boot(){
 startInitialization();
 try{
  setInitializationPhase('authentication');
  if(await auth.restore()){
    state.user=auth.session.user;
    setInitializationPhase('authorization');
    try{
      await refreshWorkspace();
      setInitializationPhase('workspace');
      await onRoute();
    }catch(err){
      if(err instanceof ApiError&&err.status===403){
        root.innerHTML=`<div class="access-denied"><div class="denied-panel"><img class="brand-mark csp-u059" src="./frontend/apsyntra-logo.webp" alt="" width="37" height="37" decoding="async"/><h1>Workspace access unavailable</h1>
        <p>${e(errorMessage(err))} Contact your administrator to activate your existing profile or workspace membership.</p>
        <button class="secondary" data-action="logout">Sign out</button></div></div>`;
      }else{await auth.signOut();renderLogin('Your session could not be restored. Please sign in again.');}
    }
  }else renderLogin();
 }catch{renderLogin('Unable to initialize session. Please try signing in.');}
 finally{finishInitialization();}
}
boot();
