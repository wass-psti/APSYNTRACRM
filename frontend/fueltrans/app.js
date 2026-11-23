import {select,verifiedUser,signOut,clearSession,insertTicket,listTickets,countTickets,readTicket,readCollection,updateTicket,markNotificationRead,readBugDraftState,saveBugDraftState,readAllTicketsForSnapshot,countAllTicketsForSnapshot,updateFuelTransMembership,submitSharedIssue,readSharedIssues,triageSharedIssue,readTrustedTicketHistory,readFreshFuelTransMembership,readTicketDraftState,saveTicketDraftState,findActiveTicketDuplicates} from './supabase-client.js';
import {canTransition,canClaim,canAcceptAssigned,canHandover,canArchive,canOperate,mayReadAdministration,buildChange} from './workflow-domain.js';
import {FUELTRANS_ROLES,MEMBER_STATUSES,validateMembershipChange,canDelegate,buildDelegation} from './membership-domain.js';
import {listEvidence,uploadEvidence,signedEvidenceUrl} from './storage-client.js';
import {BUG_SEVERITIES,BUG_STATUSES,LOGO_CATALOG,missingSharedIssueSchema,validateBugDraft,normalizeBugState,makeBugDraft,findBug,replaceBug} from './support-domain.js';
import {collectReadOnlySnapshot,snapshotSha256} from './export-domain.js';
import {projectTicketTimers,formatDuration} from './timer-domain.js';
import {buildWorkflowQuery,QUEUE_SCOPES} from './queue-domain.js';
import {auditFieldChanges,auditActorLabel} from './history-domain.js';
import {REPORTS,collectReportRows,summarizeReports,reportCsv,canReadReports} from './analytics-domain.js';
import {parseReportWindow,applyReportWindow,reportWindowLabel} from './report-window-domain.js';
import {SYSTEM_TYPES,normalizeQueueFilters,buildQueueFiltersQuery} from './queue-filters15.js';
import {IMPACTS,CHANNELS,SOURCE_CREATE_STEPS,sourceOperationalInfo,validateSourceTicketDraft,buildSourceTicketRecord} from './ticket-create16.js';
import {makeTicketDraft,normalizeTicketDraftState,isMeaningfulTicketDraft,sanitizeTicketDraft} from './ticket-draft17.js';
import {validateCreateEvidence,uploadCreatedTicketEvidence,creationEvidenceMessage} from './create-evidence18.js';
import {buildStationHistoryQuery,projectStationHistory} from './station-lookup18.js';
import {buildRecordedStationsQuery,projectRecordedStations,STATION_HISTORY_PAGE_SIZE} from './station-history03.js';
import {parseStationSourceCsv,reconcileStationSource,stationReconciliationCsv,STATION_SOURCE_MAX_BYTES} from './station-source04.js';
import {stationCandidateEvidence} from './station-evidence07.js';
import {buildStationOwnerReviewPacket} from './station-owner-review08.js';
import {stageStationRegistryLocally} from './station-staging08.js';
import {MAX_BATCH_STATIONS,validateBatchStations,stationTicketTitle,runSequentialTicketBatch,batchOutcomeMessage} from './batch-create19.js';
import {reconcileUncertainTicket,validateUncertainReceipt} from './ticket-reconcile21.js';
import {TICKET_DELETION_ROLES,executeSoftDelete,executeRestore} from './ticket-delete23.js';
import {callTicketDeletionRpc} from './supabase-client.js';
import {bulkDelete,recoveryPage} from './ticket-bulk24.js';
import {projectRecovery25,permanentDelete25} from './recovery25.js';
import {REFRESH_OPTIONS25,DEFAULT_REFRESH25,normalizeRefresh25,canAutoRefresh25,refreshLabel25,AUTO_ROUTES25} from './refresh-policy25.js';
import {createDirtyControlTracker} from './refresh-guard.js';
import {QUEUE_SHORTCUTS,ticketCardData,pageTicketSummary} from './ticket-presentation02.js';
import {STATUS,CLIENTS,PRIORITIES,pageSize,escapeHTML as h,permitted,clientForMembership,canCreate,canChangeStatus,titleOf,statusOf,priorityOf,friendlyTime,validateTicketForm,createTicketRecord,buildTicketQuery,parseTotal,csvQuote} from './ticket-domain.js';
/** Mounted into the CRM board; all state and timers die with this view. */
export function mountFuelTrans(root,host){
 const nativeDocument=globalThis.document;
 const document=new Proxy(nativeDocument,{get(target,key){
  if(key==='getElementById')return id=>root.querySelector('#'+CSS.escape(id));
  if(key==='querySelector'||key==='querySelectorAll')return root[key].bind(root);
  if(key==='activeElement')return root.getRootNode().activeElement;
  if(key==='body')return root;
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 let disposed=false;
 let routeHash=host.route||'dashboard';
 const location={get hash(){return '#'+routeHash;},set hash(value){
  routeHash=String(value).replace(/^#\/?/,'');
  history.pushState(null,'',host.base+'/'+routeHash);
  queueMicrotask(()=>{if(!disposed)routeChanged();});
 }};
 root.addEventListener('click',event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
  const link=event.target.closest('a[href^="#"]');
  if(!link)return;
  event.preventDefault();event.stopPropagation();
  if(link.getAttribute('href')==='#main-content'){document.getElementById('main-content')?.focus();return;}
  const href=link.getAttribute('href');
  location.hash=href.startsWith(host.base+'/')?href.slice(host.base.length+1):href;
 });
const HOST_EMBEDDED=true;
let viewRevision=0; // Ignore out-of-order results after navigation or workspace changes.
let pendingUncertainTicket=null; // Minimal identity-only receipt, never an automatic retry.
let postCreateNotice=null; // Bound to one confirmed ticket; never re-submit on navigation.
let reportRowsCache=null;
let reportScopeMeta=null;
let recoveryPage24=0;let recoverySearch24='';
let autoRefreshHandle25=null;
let refreshMs25=(()=>{try{return normalizeRefresh25(localStorage.getItem('fueltrans-auto-refresh-ms-v1')??DEFAULT_REFRESH25)}catch{return DEFAULT_REFRESH25}})();
function scheduleAutoRefresh25(){
 if(autoRefreshHandle25!==null)clearTimeout(autoRefreshHandle25);autoRefreshHandle25=null;
 if(disposed||!state.active||!state.user||refreshMs25===0||!AUTO_REFRESH_ALLOWED25.has(state.route))return;
 autoRefreshHandle25=setTimeout(async()=>{
  autoRefreshHandle25=null;
  const editing=Boolean(document.activeElement?.matches?.('input,textarea,select,[contenteditable=true]')||document.querySelector('.bulk-ticket-id:checked,.recovery-select25:checked')||document.querySelector('#restore-ticket23 input')?.value.trim());
  if(canAutoRefresh25({interval:refreshMs25,route:state.route,busy:state.busy,hidden:document.hidden,online:navigator.onLine,editing,scrolled:window.scrollY>80})){
   await go(state.route,{preserveNotice:true});
  }else scheduleAutoRefresh25();
 },refreshMs25);
}
const AUTO_REFRESH_ALLOWED25=new Set(AUTO_ROUTES25);
let visibleTimerTickets=new Map();
function trackedTime(ticket,field){const id=String(ticket.id);visibleTimerTickets.set(id,ticket);const timer=projectTicketTimers(ticket)[field];return `<span class="timer-value" data-ticket-timer="${h(id)}" data-timer-field="${field}">${h(formatDuration(timer.ms))}</span>`;}
function refreshVisibleTimers(){for(const el of document.querySelectorAll('[data-ticket-timer]')){const t=visibleTimerTickets.get(el.dataset.ticketTimer);if(t){const field=el.dataset.timerField;el.textContent=formatDuration(projectTicketTimers(t)[field]?.ms);}}}
// One display-only heartbeat; no network calls and no mutation of persisted clock values.
const heartbeat=setInterval(()=>{if(!document.hidden&&!disposed)refreshVisibleTimers();},30000);
const dirtyControlTracker=createDirtyControlTracker(root);
const refreshFromHost=()=>{
 if(disposed||!state.active||state.busy)return;
 const focused=root.getRootNode()?.activeElement;
 if(focused?.matches?.('input,textarea,select,[contenteditable="true"]')||
    dirtyControlTracker.hasDirtyControls())return;
 void go(state.route,{preserveNotice:true});
};
root.addEventListener('apsyntra:refresh',refreshFromHost);
let state={user:null,memberships:[],active:null,route:'dashboard',tickets:[],total:0,page:0,filter:'',status:'all',archived:false,clientFilter:'all',priorityFilter:'all',systemFilter:'all',queueFrom:'',queueTo:'',queueSort:'recent',detail:null,stats:null,busy:false,notice:'',workflowPage:0,viewPage:0,workflowScope:'all',issuePage:0,reportTab:'executive',reportWindow:{from:'',to:''},stationPage:0,stationClient:'all',stationIdSearch:''};
const val=(x)=>h(x);const knownRoutes=new Set(['dashboard','tickets','create-ticket','reports','l1-workspace','l2-dispatch','handover','station-history','notifications','admin','users','sessions','audit','report-bug','logo-files','disaster-recovery','it-issues']);
const escAttr=val;const role=()=>state.active?.role;
function say(message){state.notice=message;const alert=document.getElementById('feedback');if(alert){alert.textContent=message;alert.hidden=!message;}}
function pendingTicketReconciliationPanel(){
 if(!pendingUncertainTicket||pendingUncertainTicket.workspaceId!==state.active?.workspace_id||pendingUncertainTicket.userId!==state.user?.id)return '';
 return `<section class="panel" id="uncertain-ticket-recovery"><h2>Uncertain ticket submission</h2><p>One ticket INSERT returned without confirmation. Reconciliation is a read-only lookup using the original ticket ID. Do not resubmit, even if no ticket is visible.</p><button type="button" class="secondary" id="verify-uncertain-ticket">Check original ticket ID (read only)</button><p id="uncertain-ticket-result" role="status" aria-live="polite"></p></section>`;
}
function bindPendingTicketReconciliation(){
 const button=document.getElementById('verify-uncertain-ticket'),output=document.getElementById('uncertain-ticket-result');
 if(!button||!output)return;
 button.onclick=async()=>{
  if(button.disabled||state.busy)return;
  const receipt=pendingUncertainTicket,ws=state.active?.workspace_id,uid=state.user?.id,revision=viewRevision;
  button.disabled=true;output.textContent='Checking the previously attempted ticket ID…';
  try{
   validateUncertainReceipt(receipt);
   const result=await reconcileUncertainTicket({receipt,workspaceId:ws,userId:uid,readMembership:readFreshFuelTransMembership,readTicket});
   if(revision!==viewRevision||ws!==state.active?.workspace_id||uid!==state.user?.id||!output.isConnected)return;
   output.textContent=result.message;
   if(result.status==='confirmed'){
    const link=document.createElement('a');link.href=`#ticket/${encodeURIComponent(result.ticketId)}`;link.textContent=`Open confirmed ticket ${result.displayNumber}`;output.append(' ',link);
    pendingUncertainTicket=null;
   }
  }catch(error){if(output.isConnected)output.textContent=`Read-only check unavailable: ${error.message} Do not resubmit.`;}
  finally{if(button.isConnected)button.disabled=!pendingUncertainTicket;}
 };
}
function pageHeader(title,subtitle=''){
 return `<div class="page-heading"><div><p class="eyebrow">SUPPORT OPERATIONS</p><h1>${h(title)}</h1>${subtitle?`<p class="muted">${h(subtitle)}</p>`:''}</div><button id="refresh" class="secondary" type="button" aria-label="Refresh current FuelTrans view">↻ Refresh</button></div>`;
}
function activeShift(){
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 return hour>=6&&hour<18?'Shift A · 06:00–18:00':'Shift B · 18:00–06:00';
}
function greeting(){
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 return hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
}
function statusBadge(s){return `<span class="status status-${String(s).toLowerCase().replace(/[^a-z0-9]/g,'-')}">${h(s)}</span>`;}
const navigation=[
 {label:'OVERVIEW',links:[['dashboard','Dashboard','▦']]},
 {label:'SUPPORT OPERATIONS',links:[
  ['create-ticket','Create Ticket','＋'],['tickets','Ticket Queue','▤'],
  ['l1-workspace','Global L1 Workspace','◉'],['l2-dispatch','Local L2 Dispatch','↗'],
  ['handover','Shift Handover','⇄'],['station-history','Recorded Stations','▣']]},
 {label:'INSIGHTS',links:[['reports','Analytics & Reports','▥'],['notifications','Notifications','♧'],['report-bug','Report Issue','⚑']]},
 {label:'SYSTEM',links:[['admin','Administration','⚙'],['users','User Directory','♙'],
  ['sessions','Sessions','◷'],['audit','Audit Events','☰'],
  ['it-issues','IT Issue Queue','⚑'],['logo-files','Logo Files','▣'],
  ['disaster-recovery','Disaster Recovery','♙']]}
];
function allowRoute(r){if(['admin','users','sessions','audit','logo-files','it-issues'].includes(r))return mayReadAdministration(state.active);if(r==='disaster-recovery')return mayReadAdministration(state.active)&&['asenagan@watchdogautomation.com.ph','lmsenagan@watchdogautomation.com.ph'].includes(String(state.user?.email||'').toLowerCase());if(r==='create-ticket')return canCreate(state.active);if(r==='l1-workspace')return ['admin','global_l1_support'].includes(role());if(r==='l2-dispatch')return ['admin','local_l2_support'].includes(role());if(r==='handover')return ['admin','global_l1_support','local_l2_support'].includes(role());if(r==='reports')return ['admin','fueltrans','watchdog_employee','global_l1_support','local_l2_support','call_center_specialist','viewer'].includes(role());return true;}
function currentHash(){let raw;try{raw=decodeURIComponent(location.hash.replace(/^#\/?/,'').trim());}catch{return 'dashboard';}if(raw.startsWith('ticket/')||raw.startsWith('report-bug/'))return raw;return knownRoutes.has(raw)?raw:'dashboard';}
function loginView(){root.innerHTML='<main class="auth"><div class="auth-card"><h1>APSYNTRA CRM session required</h1><p>Access FuelTrans through the authenticated APSYNTRA CRM host.</p></div></main>';}

async function bootstrap(){++viewRevision;root.innerHTML='<main class="loading">Authenticating FuelTrans membership…</main>';try{const user=await verifiedUser();if(!user){loginView();return;}state.user=user;const q=new URLSearchParams({select:'workspace_id,user_id,role,client_code,enabled,status,display_name,email',workspace_id:`eq.${host.workspaceId}`,user_id:`eq.${user.id}`,enabled:'eq.true',status:'eq.active'});const memberships=(await select('fueltrans_memberships',q.toString())).filter(x=>permitted(x)&&x.user_id===user.id&&x.workspace_id===host.workspaceId);if(!memberships.length){root.innerHTML=`<main class="auth"><div class="auth-card"><h1>Access restricted</h1><p>Account has no active FuelTrans membership.</p>${HOST_EMBEDDED?'':'<button id="logout">Sign out</button>'}</div></main>`;if(!HOST_EMBEDDED)document.getElementById('logout').onclick=logout;return;}const id=state.active?.workspace_id;state.memberships=memberships;state.active=memberships.find(m=>m.workspace_id===id)||memberships[0];state.route=currentHash();if(!allowRoute(state.route))state.route='dashboard';await go(state.route);}catch(error){root.innerHTML=`<main class="auth"><div class="auth-card"><h1>Could not open FuelTrans</h1><p id="feedback" role="alert">${h(error.message)}</p><div class="button-row"><button id="retry">Retry</button>${HOST_EMBEDDED?'':'<button id="logout" class="secondary">Sign out</button>'}</div></div></main>`;document.getElementById('retry').onclick=bootstrap;if(!HOST_EMBEDDED)document.getElementById('logout').onclick=logout;}}
async function logout(){try{await signOut();}catch{clearSession();}loginView();}
function layout(content){
 if(disposed)return;
 const memberName=state.active?.display_name||state.user?.email||'Support engineer';
 const initials=memberName.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
 const nav=navigation.map(group=>`<div class="ft-nav-group"><span class="ft-nav-label">${h(group.label)}</span>${group.links.filter(x=>allowRoute(x[0])).map(([r,label,icon])=>{
  const active=state.route===r||(r==='tickets'&&state.route.startsWith('ticket/'))||(r==='report-bug'&&state.route.startsWith('report-bug/'));
  return `<a href="${host.base}/${r}" class="${active?'active':''}" ${active?'aria-current="page"':''}><span class="ft-nav-icon" aria-hidden="true">${h(icon)}</span><span>${h(label)}</span></a>`;
 }).join('')}</div>`).join('');
 root.innerHTML=`<section class="ft-application">
  <a class="skip-to-content" href="#main-content">Skip to FuelTrans content</a>
  <aside class="ft-sidebar" aria-label="FuelTrans application sidebar">
   <div class="ft-brand"><span class="ft-brand-mark" aria-hidden="true">F</span><span><strong>FuelTrans Support</strong><small>OPERATIONS PORTAL</small></span></div>
   <nav class="ft-navigation" aria-label="FuelTrans views">${nav}</nav>
   <div class="ft-sidebar-footer"><span class="ft-avatar" aria-hidden="true">${h(initials)}</span><span><strong>${h(memberName)}</strong><small>${h(role().replaceAll('_',' '))}</small></span></div>
  </aside>
  <div class="ft-main">
   <header class="ft-toolbar">
    <div class="ft-toolbar-identity"><span class="ft-toolbar-mark" aria-hidden="true">F</span><span><small>Watchdog Automation</small><strong>FuelTrans Support Portal</strong></span></div>
    <div class="ft-toolbar-actions"><span class="ft-shift-indicator"><span class="ft-live-dot" aria-hidden="true"></span>${h(activeShift())}</span>
     <label class="refresh-setting25">Auto refresh<select id="auto-refresh25" aria-label="Automatic data refresh interval">${REFRESH_OPTIONS25.map(ms=>`<option value="${ms}" ${refreshMs25===ms?'selected':''}>${refreshLabel25(ms)}</option>`).join('')}</select></label>
     <span class="ft-toolbar-avatar" aria-label="${h(memberName)}">${h(initials)}</span>
    </div>
   </header>
   <main id="main-content" class="content" tabindex="-1">${content}<p id="feedback" role="status" aria-live="polite" ${state.notice?'':'hidden'}>${h(state.notice)}</p></main>
  </div>
 </section>`;
 document.getElementById('auto-refresh25').onchange=e=>{refreshMs25=normalizeRefresh25(e.target.value);try{localStorage.setItem('fueltrans-auto-refresh-ms-v1',String(refreshMs25));}catch{}scheduleAutoRefresh25();};
 const button=document.getElementById('refresh');if(button)button.onclick=()=>go(state.route);
}
function skeleton(msg='Loading FuelTrans data…'){layout(`<div class="loading-inline">${h(msg)}</div>`);}
async function go(route,{preserveNotice=false}={}){if(disposed||!state.active)return;if(autoRefreshHandle25!==null)clearTimeout(autoRefreshHandle25);autoRefreshHandle25=null;visibleTimerTickets.clear();if(route!=='reports'){reportRowsCache=null;reportScopeMeta=null;}const revision=++viewRevision;if(!preserveNotice)state.notice='';state.route=route;if(!allowRoute(route)){state.route='dashboard';route='dashboard';}try{if(route==='dashboard'){skeleton('Loading dashboard…');await dashboard(revision);}else if(route==='tickets'){skeleton('Loading ticket queue…');await tickets(revision);}else if(route.startsWith('ticket/')){skeleton('Loading ticket details…');await details(route.slice(7),revision);}else if(route==='create-ticket')createForm();else if(route==='station-history'){skeleton('Loading recorded station history…');await recordedStations(revision);}else if(route==='report-bug'){skeleton('Loading your private issue drafts…');await bugReports(revision);}else if(route.startsWith('report-bug/')){skeleton('Loading issue draft…');await bugReportDetail(route.slice('report-bug/'.length),revision);}else if(route==='it-issues'){skeleton('Loading IT issue queue…');await sharedIssueQueue(revision);}else if(route==='logo-files')logoFiles();else if(route==='disaster-recovery')disasterRecovery();else if(route==='reports'){skeleton('Loading report counts…');await reports(revision);}else if(['l1-workspace','l2-dispatch','handover'].includes(route)){skeleton('Loading workflow queue…');await workflow(route,revision);}else if(['admin','users','sessions','audit','notifications'].includes(route)){skeleton('Loading authorized records…');await auxiliary(route,revision);}else{state.route='dashboard';await dashboard(revision);}}catch(e){if(revision!==viewRevision)return;layout(`<section class="error-panel"><h2>Unable to load this view</h2><p role="alert">${h(e.message)}</p><button id="try-again">Retry</button></section>`);document.getElementById('try-again').onclick=()=>go(route);}finally{if(revision===viewRevision)scheduleAutoRefresh25();}}
async function fetchPage(){const q=buildQueueFiltersQuery({workspaceId:state.active.workspace_id,member:state.active,archived:state.archived,status:state.status,search:state.filter,page:state.page,client:state.clientFilter,priority:state.priorityFilter,system:state.systemFilter,from:state.queueFrom,to:state.queueTo,sort:state.queueSort});const {rows,totalRange}=await listTickets(q);return {rows,total:parseTotal(totalRange,rows.length)};}
const ticketTable=(rows,empty='No tickets in this result set.')=>`<div class="table-wrap"><table><thead><tr><th>Ticket</th><th>Subject / Station</th><th>Client</th><th>Priority</th><th>Status</th><th>Age</th><th>Updated</th></tr></thead><tbody>${rows.length?rows.map(t=>`<tr><td><a class="ticket-link" href="${host.base}/ticket/${encodeURIComponent(t.id)}">${h(t.ticket_number||t.payload?.ticketId||t.id)}</a></td><td><strong>${h(titleOf(t))}</strong><small>${h(t.payload?.stationName||t.payload?.stationId||'—')}</small></td><td>${h(t.client_code||'—')}</td><td>${h(priorityOf(t))}</td><td>${statusBadge(statusOf(t))}</td><td>${trackedTime(t,'age')}</td><td>${h(friendlyTime(t.updated_at))}</td></tr>`).join(''):`<tr><td colspan="7" class="empty">${h(empty)}</td></tr>`}</tbody></table></div>`;
function ticketCards(rows,empty='No tickets in this result set.'){
 if(!rows.length)return `<div class="ft-ticket-empty" role="status">${h(empty)}</div>`;
 return `<div class="ft-ticket-cards" role="list">${rows.map(ticket=>{
  const item=ticketCardData(ticket);
  return `<article class="ft-ticket-card" role="listitem">
   <div class="ft-ticket-card-head"><div class="ft-ticket-card-identity"><a class="ft-ticket-number" href="${host.base}/ticket/${encodeURIComponent(item.id)}">${h(item.number)}</a><span class="ft-ticket-station-id">${h(item.stationId)}</span></div>
    <div class="ft-ticket-chips"><span class="ft-priority ft-priority-${h(item.priorityClass)}">${h(item.priority)}</span>${statusBadge(item.status)}<span class="ft-system-badge">${h(item.system)}</span>${item.handover?'<span class="ft-handover-badge">Handover</span>':''}</div></div>
   <a class="ft-ticket-subject" href="${host.base}/ticket/${encodeURIComponent(item.id)}">${h(item.title)}</a>
   <p class="ft-ticket-summary">${h(String(ticket.payload?.issueDetails||ticket.payload?.description||'No issue description recorded.').slice(0,180))}</p>
   <div class="ft-ticket-facts"><div><small>Client</small><strong>${h(item.client)}</strong></div><div><small>Station</small><strong>${h(item.station)}</strong></div><div><small>Impact</small><strong>${h(item.impact)}</strong></div><div><small>Status</small>${statusBadge(item.status)}</div><div><small>Age</small><strong>${trackedTime(ticket,'age')}</strong></div><div><small>Updated</small><strong>${h(item.updatedAt)}</strong></div></div>
  </article>`;
 }).join('')}</div>`;
}
function queueStatusTabs(){
 return `<div class="ft-queue-tabs" role="group" aria-label="Quick ticket status filters">${QUEUE_SHORTCUTS.map(tab=>`<button type="button" data-queue-status="${h(tab.value)}" class="${state.status===tab.value?'':'secondary'}" aria-pressed="${state.status===tab.value}">${h(tab.label)}</button>`).join('')}</div>`;
}
function toolbar(){
 const client=clientForMembership(state.active);
 const option=(value,current,label=value)=>`<option value="${h(value)}" ${value===current?'selected':''}>${h(label)}</option>`;
 return `<form class="filter-bar source-queue-filters" id="filter-form"><label>Ticket / client search<input name="search" placeholder="Ticket number or client" maxlength="80" value="${h(state.filter)}"></label><label>Status<select name="status">${option('all',state.status,'All statuses')}${STATUS.map(s=>option(s,state.status)).join('')}</select></label><label>Priority<select name="priority">${option('all',state.priorityFilter,'All priorities')}${PRIORITIES.map(p=>option(p,state.priorityFilter)).join('')}</select></label>${client?'':`<label>Client<select name="client">${option('all',state.clientFilter,'All clients')}${CLIENTS.map(c=>option(c,state.clientFilter)).join('')}</select></label>`}<label>System<select name="system">${option('all',state.systemFilter,'All systems')}${SYSTEM_TYPES.map(t=>option(t,state.systemFilter)).join('')}</select></label><label>Operational date from<input name="from" type="date" value="${h(state.queueFrom)}"></label><label>Through<input name="to" type="date" value="${h(state.queueTo)}"></label><label>Order<select name="sort">${option('recent',state.queueSort,'Recently updated')}${option('oldest',state.queueSort,'Oldest updated')}</select></label><label class="check"><input type="checkbox" name="archived" ${state.archived?'checked':''}> Archived</label><button type="submit">Apply filters</button><button type="button" id="clear-filter" class="secondary">Reset</button></form><p class="muted">Filters are applied in Supabase before pagination. Date ranges use source-recorded operational dates; tickets without dates are excluded while filtering. Client accounts cannot browse other clients.</p>`;
}
async function tickets(revision){const {rows,total}=await fetchPage();if(revision!==viewRevision)return;state.tickets=rows;state.total=total;const pageCount=Math.max(1,Math.ceil(state.total/pageSize));const visible=pageTicketSummary(rows);layout(`${pageHeader('Ticket Queue','Browse and manage support incidents in your current workspace.')}<div class="panel ft-queue-panel">${queueStatusTabs()}${toolbar()}<p class="muted">Server-scoped results · ${state.total} ticket(s) · page ${state.page+1} of ${pageCount}</p><p class="ft-page-summary">On this page: ${visible.visible} tickets · ${visible.unassigned} unassigned · ${visible.flagged} flagged for handover</p>${ticketCards(state.tickets)}${TICKET_DELETION_ROLES.includes(state.active.role)?`<section class="bulk-controls" aria-label="Bulk recoverable ticket deletion"><h3>Bulk delete (recoverable)</h3><p class="muted">Select up to 25 tickets shown on this page. Each deletion is separately confirmed by the server; confirmed deletions will not be retried if a subsequent operation fails.</p><div id="bulk-ticket-selection">${state.tickets.map(t=>`<label class="check"><input type="checkbox" class="bulk-ticket-id" value="${h(t.id)}">${h(t.ticket_number||t.id)} — ${h(titleOf(t))}</label>`).join('')}</div><button id="bulk-delete24" type="button">Delete selected tickets (recoverable)</button></section>`:''}<div class="pager"><button id="prev" class="secondary" ${state.page===0?'disabled':''}>← Previous</button><span>${Math.min(state.page*pageSize+1,state.total)}–${Math.min((state.page+1)*pageSize,state.total)} / ${state.total}</span><button id="next" class="secondary" ${(state.page+1)*pageSize>=state.total?'disabled':''}>Next →</button></div></div>`);for(const tab of document.querySelectorAll('[data-queue-status]'))tab.onclick=()=>{state.status=tab.dataset.queueStatus;state.page=0;go('tickets');};const bulkButton=document.getElementById('bulk-delete24');if(bulkButton)bulkButton.onclick=async()=>{if(state.busy)return;const ids=[...document.querySelectorAll('.bulk-ticket-id:checked')].map(x=>x.value);if(!ids.length||ids.length>25){say('Select 1 to 25 tickets from this page.');return;}if(!confirm(`Recoverably delete ${ids.length} selected ticket(s)? Existing records, history, and attachments are preserved.`))return;const ws=state.active.workspace_id,uid=state.user.id;state.busy=true;bulkButton.disabled=true;try{const result=await bulkDelete({rows:state.tickets,ids,workspaceId:ws,userId:uid,readMembership:readFreshFuelTransMembership,readTicket,invoke:args=>callTicketDeletionRpc('fueltrans_soft_delete_ticket_v1',args)});await go('tickets',{preserveNotice:true});say(`${result.confirmed.length} ticket(s) confirmed deleted.${result.failure?` Stopped on ${result.failure.id}: ${result.failure.message}. Do not automatically retry uncertain operations.`:''}`);}catch(err){say(err.message);}finally{state.busy=false;if(bulkButton.isConnected)bulkButton.disabled=false;}};document.getElementById('filter-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const next=normalizeQueueFilters({client:String(f.get('client')||'all'),priority:String(f.get('priority')||'all'),system:String(f.get('system')||'all'),from:String(f.get('from')||''),to:String(f.get('to')||''),sort:String(f.get('sort')||'recent')});const search=String(f.get('search')||'').trim();if(search.length>80)throw Error('Ticket search is too long.');if(clientForMembership(state.active)&&next.client!=='all'&&next.client!==clientForMembership(state.active))throw Error('Cross-client filter denied.');state.filter=search;state.status=String(f.get('status')||'all');state.archived=f.get('archived')==='on';state.clientFilter=next.client;state.priorityFilter=next.priority;state.systemFilter=next.system;state.queueFrom=next.from;state.queueTo=next.to;state.queueSort=next.sort;state.page=0;go('tickets');}catch(err){say(err.message);}};document.getElementById('clear-filter').onclick=()=>{state.filter='';state.status='all';state.archived=false;state.clientFilter='all';state.priorityFilter='all';state.systemFilter='all';state.queueFrom='';state.queueTo='';state.queueSort='recent';state.page=0;go('tickets');};document.getElementById('prev').onclick=()=>{state.page=Math.max(0,state.page-1);go('tickets');};document.getElementById('next').onclick=()=>{state.page++;go('tickets');};}
async function stats(){const ws=state.active.workspace_id;const keys=[null,...STATUS];const result=await Promise.all(keys.map(s=>countTickets(ws,s)));return Object.fromEntries(keys.map((s,i)=>[s||'total',result[i]]));}
async function dashboard(revision){
 const ws=state.active.workspace_id;
 const [counts,{rows}]=await Promise.all([stats(),listTickets(buildTicketQuery({workspaceId:ws,limit:6}))]);
 if(revision!==viewRevision)return;
 state.stats=counts;
 const total=Number(counts.total)||0;
 const open=Number(counts.Open)||0;
 const l1=Number(counts['Under L1 Review'])||0;
 const escalated=Number(counts['Escalated to L2'])||0;
 const l2=Number(counts['Under L2 Review'])||0;
 const resolved=Number(counts.Resolved)||0;
 const active=open+l1+escalated+l2;
 const firstName=String(state.active.display_name||'team').trim().split(/\s+/)[0];
 const metrics=[
  ['Active',active],['Open',open],['Under L1',l1],
  ['Escalated to L2',escalated],['Resolved',resolved],['Total records',total]
 ];
 const recent=rows.length?rows.map(t=>`<li><a href="${host.base}/ticket/${encodeURIComponent(t.id)}"><span class="ft-ticket-id">${h(t.ticket_number||t.id)}</span><span class="ft-dashboard-title">${h(titleOf(t))}</span>${statusBadge(statusOf(t))}<time datetime="${h(t.updated_at)}">${h(friendlyTime(t.updated_at))}</time></a></li>`).join(''):'<li class="ft-dashboard-empty">No tickets have been created in this workspace.</li>';
 const segments=`<span class="ft-open-fill" style="width:${total?Math.round(open/total*100):0}%"></span><span style="width:${total?Math.round(resolved/total*100):0}%"></span>`;
 const statusRows=[['Open',open],['Under L1 Review',l1],['Escalated to L2',escalated],['Under L2 Review',l2],['Resolved',resolved]];
 layout(`${pageHeader(greeting()+', '+firstName,'Current ticket activity in your FuelTrans workspace.')}
  <section class="stat-grid" aria-label="Ticket status summary">${metrics.map(([label,value])=>`<div class="stat-card"><small>${h(label)}</small><strong>${value}</strong></div>`).join('')}</section>
  <div class="ft-dashboard-grid">
   <section class="panel"><div class="panel-header"><h2>Recent Tickets</h2><a href="${host.base}/tickets">View all →</a></div><ul class="ft-dashboard-list">${recent}</ul></section>
   <section class="panel"><div class="panel-header"><h2>Status Distribution</h2></div><div class="ft-distribution-bar" aria-hidden="true">${segments}</div><ul class="ft-distribution">${statusRows.map(([label,value])=>`<li><span>${h(label)}</span><strong>${value}</strong></li>`).join('')}</ul></section>
  </div>`);
}
async function details(id,revision){
 const ticket=await readTicket(state.active.workspace_id,id);
 if(revision!==viewRevision)return;
 if(!ticket){
  layout(`<a href="${host.base}/tickets" class="back-link">← Ticket Queue</a><div class="error-panel"><h2>Ticket unavailable</h2><p>The ticket does not exist or your membership cannot access it.</p></div>`);
  return;
 }
 state.detail=ticket;
 const payload=ticket.payload||{};
 const fields=[
  ['Client',ticket.client_code],['Station',payload.stationName],
  ['Site ID',payload.stationId],['System Type',payload.systemType],
  ['Impact Level',payload.impactLevel],['Priority',priorityOf(ticket)],
  ['Reporting Channel',payload.reportingChannel],
  ['Reporting Shift',payload.reportingShift],
  ['Operational Date',payload.operationalDate],
  ['Assigned L1 ID',ticket.assigned_l1],['Assigned L2 ID',ticket.assigned_l2]
 ];
 const ticketActivity=Array.isArray(payload.activity)?payload.activity:[];
 const activityItems=ticketActivity.length?ticketActivity.slice(-20).reverse().map(activity=>`<li>
  <strong>${h(activity.title||activity.type||'Activity')}</strong>
  <span>${h(friendlyTime(activity.timestamp))}</span>
  <p>${h(activity.message||'')}</p>
 </li>`).join(''):'<li>No recorded activity.</li>';
 const facts=fields.map(([label,value])=>`<div>
  <dt>${h(label)}</dt>
  <dd>${h(value??'—')}</dd>
 </div>`).join('');
 layout(`<div class="ft-detail-page">
  <a href="${host.base}/tickets" class="back-link">← Back to ticket queue</a>
  <header class="ft-detail-heading">
   <div>
    <div class="ft-detail-ticket-label"><span class="ft-ticket-number">${h(ticket.ticket_number||ticket.id)}</span>
     <span class="ft-priority ft-priority-${h(priorityOf(ticket).toLowerCase())}">${h(priorityOf(ticket))}</span>
     ${statusBadge(statusOf(ticket))}</div>
    <h1>${h(titleOf(ticket))}</h1>
    <p class="muted">${h(ticket.client_code||'Client not recorded')} · ${h(payload.stationName||payload.stationId||'Station not recorded')} · ${h(friendlyTime(ticket.created_at))}</p>
   </div>
   <button id="refresh" type="button" class="secondary">↻ Refresh</button>
  </header>
  <section class="ft-detail-timers" aria-label="Elapsed incident timers">
   <div><small>Ticket age</small><strong>${trackedTime(ticket,'age')}</strong><span>Time since ticket creation</span></div>
   <div><small>Response segment</small><strong>${trackedTime(ticket,'response')}</strong><span>Current recorded response segment</span></div>
   <div><small>First L1 response</small><strong>${trackedTime(ticket,'firstResponse')}</strong><span>Source-recorded elapsed time</span></div>
   <div><small>Resolution elapsed</small><strong>${trackedTime(ticket,'resolution')}</strong><span>Source-recorded elapsed time</span></div>
  </section>
  <div class="ft-detail-columns">
   <div class="ft-detail-primary">
    <section class="panel"><h2>Incident Details</h2><dl class="ft-incident-grid">${facts}</dl></section>
    <section class="panel"><h2>Issue Description</h2>
     <p class="description">${h(payload.issueDetails||payload.description||'No issue details provided.')}</p></section>
    ${evidencePanel(ticket)}
    ${pendingTicketReconciliationPanel()}
    <section class="panel" id="trusted-history"><h2>Server-recorded Ticket History</h2><p class="muted">Loading trusted event history…</p></section>
   </div>
   <aside class="ft-detail-secondary" aria-label="Ticket workbench">
    ${ticketActions(ticket)}
    ${delegationPanel(ticket)}
    <section class="panel"><h2>Activity Timeline</h2><ol class="activity-list">${activityItems}</ol></section>
   </aside>
  </div>
 </div>`);
 bindTicketActions(ticket);
 bindEvidence(ticket);
 bindPendingTicketReconciliation();
 void bindDelegation(ticket);
 void loadTrustedHistory(ticket,revision);
}
function createForm(){
 const m=state.active;if(!canCreate(m)){say('Not allowed to create tickets.');return;}
 const forced=clientForMembership(m),localInfo=sourceOperationalInfo(),options=(items,prompt='Select…')=>`<option value="">${h(prompt)}</option>${items.map(v=>`<option value="${h(v)}">${h(v)}</option>`).join('')}`;
 layout(`${pageHeader('Create New Ticket','Submit a support request for station technical issues.')}<section class="panel source-create-panel"><ol class="source-step-progress" id="source-step-progress" aria-label="Ticket creation steps">${SOURCE_CREATE_STEPS.map((name,i)=>`<li data-stage-label="${i}">${h(name)}</li>`).join('')}</ol><p class="muted">Operational ${h(localInfo.shift)} · ${h(new Date(localInfo.operationalDate).toLocaleDateString())}. Shift and operational date use your device’s local time.</p><details class="source-draft-actions" aria-label="Private ticket draft" open><summary>Private ticket draft &amp; recovery</summary><p class="muted" id="create-draft-status" role="status">Checking saved draft…</p><div class="button-row"><button id="create-save-draft" type="button" class="secondary">Save draft</button><button id="create-restore-draft" type="button" class="secondary" disabled>Restore saved draft</button><button id="create-discard-draft" type="button" class="secondary" disabled>Discard saved draft</button></div></details><form id="ticket-form" novalidate>
 <section data-create-stage="0" class="source-create-stage"><h2>1. Client &amp; Location</h2>
 <div class="source-client-cards" role="group" aria-label="Choose client organization">
  ${(forced?[forced]:CLIENTS).map(client=>`<button type="button" class="source-client-card" data-client-choice="${h(client)}" aria-pressed="${forced===client?'true':'false'}" ${forced?'disabled':''}><span class="source-client-symbol" aria-hidden="true">${h(client.slice(0,1))}</span><strong>${h(client)}</strong></button>`).join('')}
 </div><p class="muted source-client-help">Select the client here or use the client dropdown below. Station names remain unverified until confirmed against an approved directory.</p>
 <div class="form-grid"><label>Client *<select name="client" ${forced?'disabled':''} required>${forced?`<option value="${h(forced)}">${h(forced)}</option>`:options(CLIENTS,'Select client')}</select></label><label>Station ID *<input name="stationId" minlength="3" maxlength="120" required autocomplete="off"></label><label>Station Name *<input name="stationName" minlength="3" maxlength="160" required></label><div class="full source-station-history"><button type="button" class="secondary" id="find-station-history">Find previous station entries</button><p class="muted" id="station-history-status" role="status">Uses matching tickets visible to this account. Historical names are suggestions, not a verified station registry.</p><div id="station-history-suggestions" class="source-station-suggestions"></div></div></div><div class="full source-batch-stations" aria-label="Additional batch stations"><h3>Additional stations (optional)</h3><p class="muted">Create one ticket per station, up to 10 total. Each station is submitted separately. Any incomplete submissions are clearly reported.</p><div id="batch-station-list"></div><button type="button" class="secondary" id="batch-add-station">+ Add Another Station</button><p class="muted" id="batch-station-feedback" role="status">1 station selected.</p></div></section>
 <section data-create-stage="1" class="source-create-stage" hidden><h2>2. Classification</h2><div class="form-grid"><label>System Type *<select name="systemType" required>${options(SYSTEM_TYPES,'Select system')}</select></label><label>Priority Level *<select name="priority" required>${options(PRIORITIES,'Select priority')}</select></label><label>Impact Level *<select name="impactLevel" required>${options(IMPACTS,'Select impact')}</select></label><label>Estimated Downtime (minutes)<input type="number" name="downtimeMinutes" min="0" max="525600" step="any"></label><label>Affected Terminals / Lanes<input type="number" name="affectedTerminals" min="0" max="10000" step="1"></label></div></section>
 <section data-create-stage="2" class="source-create-stage" hidden><h2>3. Issue Details</h2><div class="form-grid"><label class="full">Ticket Title *<input name="title" minlength="5" maxlength="160" required></label><label class="full">Issue Description *<textarea name="description" minlength="20" maxlength="10000" rows="7" required></textarea></label><label>Error Code / Reference<input name="errorCode" maxlength="50"></label><div class="full" id="critical-create-fields" hidden><div class="source-critical"><h3>Critical priority — additional information required</h3><label>Escalation Justification *<textarea name="escalationJustification" maxlength="500" minlength="10" rows="3"></textarea></label><label>Estimated Affected Transactions *<input name="affectedTransactions" type="number" min="1" max="100000000" step="1"></label></div></div></div></section>
 <section data-create-stage="3" class="source-create-stage" hidden><h2>4. Contact &amp; Handover</h2><div class="form-grid"><label>Reporting Channel *<select name="reportingChannel" required>${options(CHANNELS,'Select channel')}</select></label><label>Reporter Contact Name<input name="contactName" maxlength="120"></label><label>Reporter Phone<input name="contactPhone" maxlength="50" autocomplete="off"></label><label class="full source-evidence-picker">Attach evidence at creation (optional, up to 5 files)<input id="create-evidence-files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" aria-describedby="create-evidence-help create-evidence-status"></label><p id="create-evidence-help" class="muted full">Allowed: JPEG, PNG, WebP, PDF, text. Maximum 10 MB per file, 25 MB total. Files are uploaded only after the ticket is created and will not be included in the saved draft.</p><p id="create-evidence-status" role="status" class="muted full">No attachments selected.</p><label class="source-checkbox">Flag for shift handover <input type="checkbox" name="handoverFlag" ${localInfo.nearBoundary?'checked':''}></label></div><p class="muted">Handover is suggested only near the original 05:00–07:00 or 17:00–19:00 boundary; you control the flag.</p></section>
 <section data-create-stage="4" class="source-create-stage" hidden><h2>5. Review &amp; Submit</h2><div id="source-create-review" class="source-create-review" role="status"></div><div id="create-duplicate-warning" class="source-duplicate-warning" role="status"></div><p class="muted">Drafts are private and revision-checked; duplicate lookup inspects only RLS-visible active tickets and cannot guarantee uniqueness under concurrency. Sequential FTS numbering and personnel suggestions remain unverified. Batch station submits are sequential and non-atomic; check each confirmed ticket before any retry. Creation-time attachments use a non-atomic confirmed-ticket-then-private-storage upload; failures must be retried from Ticket Details. Tickets use UUID-based identifiers.</p></section>
 <div class="source-create-nav"><button type="button" class="secondary" id="create-back">← Back</button><span id="source-create-step-count" aria-live="polite">Step 1 of 5</span><button type="button" id="create-next">Continue →</button><button type="submit" id="create-submit" hidden>Submit Ticket</button></div></form>${pendingTicketReconciliationPanel()}</section>`);
 bindPendingTicketReconciliation();
 const form=document.getElementById('ticket-form');let step=0;const stages=[...form.querySelectorAll('[data-create-stage]')];
 const clientSelect=form.elements.client;
 const syncClientCards=()=>{for(const button of form.querySelectorAll('[data-client-choice]')){
  button.setAttribute('aria-pressed',String(button.dataset.clientChoice===clientSelect.value));
 }};
 for(const button of form.querySelectorAll('[data-client-choice]'))button.onclick=()=>{
  if(forced)return;
  clientSelect.value=button.dataset.clientChoice;
  clientSelect.dispatchEvent(new Event('change',{bubbles:true}));
 };
 clientSelect.addEventListener('change',syncClientCards);
 syncClientCards();
 let batchStations=[];
 const batchList=form.querySelector('#batch-station-list'),batchStatus=form.querySelector('#batch-station-feedback'),batchAdd=form.querySelector('#batch-add-station');
 const batchSnapshot=()=>batchStations.map(s=>({stationId:s.stationId,stationName:s.stationName}));
 const drawBatch=()=>{batchList.replaceChildren();batchStations.forEach((s,i)=>{
  const line=document.createElement('div');line.className='source-batch-row';
  for(const [field,max,label] of [['stationId',120,'Station ID'],['stationName',160,'Station Name']]){
   const wrap=document.createElement('label');wrap.textContent=`${label} ${i+2} *`;
   const input=document.createElement('input');input.required=true;input.minLength=3;input.maxLength=max;input.value=s[field];input.setAttribute('aria-label',`${label} ${i+2}`);input.dataset.batchField=field;
   input.addEventListener('input',()=>{batchStations[i][field]=input.value;form.dispatchEvent(new Event('input',{bubbles:true}));});wrap.append(input);line.append(wrap);
  }
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove station ${i+2}`);remove.onclick=()=>{batchStations.splice(i,1);drawBatch();form.dispatchEvent(new Event('change',{bubbles:true}));};line.append(remove);batchList.append(line);
 });batchAdd.disabled=batchStations.length>=MAX_BATCH_STATIONS-1;batchStatus.textContent=`${batchStations.length+1} station(s) selected. Each gets an independent ticket.`;};
 batchAdd.onclick=()=>{if(batchStations.length>=MAX_BATCH_STATIONS-1)return;batchStations.push({stationId:'',stationName:''});drawBatch();form.dispatchEvent(new Event('change',{bubbles:true}));};
 drawBatch();
 const stationHistoryStatus=form.querySelector('#station-history-status'),stationHistoryMatches=form.querySelector('#station-history-suggestions');
 form.querySelector('#find-station-history').onclick=async()=>{
  const btn=form.querySelector('#find-station-history');if(btn.disabled||state.busy)return;
  const client=forced||form.elements.client.value,stationId=form.elements.stationId.value.trim(),workspaceId=m.workspace_id;
  btn.disabled=true;stationHistoryStatus.textContent='Searching previously recorded stations…';stationHistoryMatches.replaceChildren();
  try{
   const fresh=await readFreshFuelTransMembership(workspaceId,state.user.id);
   const q=buildStationHistoryQuery({workspaceId,member:fresh,client,stationId});
   const rows=await select('fueltrans_tickets',q);
   if(!form.isConnected||viewRevision!==draftView||state.active?.workspace_id!==workspaceId||form.elements.stationId.value.trim()!==stationId||(forced||form.elements.client.value)!==client)return;
   const matches=projectStationHistory(rows,{workspaceId,client,stationId});
   stationHistoryStatus.textContent=matches.length?`${matches.length} previously recorded station entries. Select only after confirming the station is correct.`:'No matching stations found in visible ticket history. This does not validate a new station.';
   for(const match of matches){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=`${match.stationId} — ${match.stationName}`;button.onclick=()=>{form.elements.stationId.value=match.stationId;form.elements.stationName.value=match.stationName;stationHistoryStatus.textContent='Historical station selected. Confirm the values before submission.';form.dispatchEvent(new Event('input',{bubbles:true}));};stationHistoryMatches.append(button);}
  }catch(error){if(form.isConnected)stationHistoryStatus.textContent='Station lookup unavailable: '+error.message;}
  finally{if(btn.isConnected)btn.disabled=false;}
 };

 const critical=form.querySelector('#critical-create-fields');const criticalInputs=[...critical.querySelectorAll('input,textarea')];
 const showCritical=()=>{const enabled=form.elements.priority.value==='Critical';critical.hidden=!enabled;for(const el of criticalInputs)el.required=enabled;};
 const evidencePicker=form.querySelector('#create-evidence-files');
 const selectedEvidence=()=>validateCreateEvidence(evidencePicker.files);
 evidencePicker.addEventListener('change',()=>{const el=document.getElementById('create-evidence-status');try{const files=selectedEvidence();el.textContent=files.length?`${files.length} file(s) selected, ${files.reduce((n,f)=>n+f.size,0)} bytes. Not uploaded yet.`:'No attachments selected.';}catch(error){el.textContent='Invalid selection: '+error.message;}});
 const readInput=()=>{const f=Object.fromEntries(new FormData(form));if(forced)f.client=forced;f.handoverFlag=form.elements.handoverFlag.checked;return f;};
 const syncStep=()=>{stages.forEach((stage,i)=>stage.hidden=i!==step);document.getElementById('source-step-progress').querySelectorAll('[data-stage-label]').forEach((label,i)=>{label.classList.toggle('current',i===step);label.classList.toggle('completed',i<step);label.setAttribute('aria-current',i===step?'step':'false');});document.getElementById('create-back').disabled=step===0;document.getElementById('create-next').hidden=step===4;document.getElementById('create-submit').hidden=step!==4;document.getElementById('source-create-step-count').textContent=`Step ${step+1} of ${stages.length}`;};
 function review(){try{showCritical();const files=selectedEvidence();const v=validateSourceTicketDraft(readInput(),state.active);const allStations=validateBatchStations({stationId:v.stationId,stationName:v.stationName},batchSnapshot());for(const station of allStations)stationTicketTitle(v.name,station);const info=sourceOperationalInfo();document.getElementById('source-create-review').innerHTML=`<dl>${[['Client',v.client],['Stations',allStations.map(s=>`${s.stationId} — ${s.stationName}`).join('; ')],['System',v.systemType],['Priority',v.priority],['Impact',v.impactLevel],['Title',v.name],['Reporting channel',v.reportingChannel],['Estimated downtime',v.downtimeMinutes===null?'Unknown':`${v.downtimeMinutes} minutes`],['Operational shift',info.shift],['Issue details',v.details],['Creation attachments',files.length?`${files.length} selected; uploads happen after ticket creation`:'None']].map(([k,v])=>`<div><dt>${h(k)}</dt><dd>${h(v)}</dd></div>`).join('')}</dl>`;return true;}catch(err){say(err.message);return false;}}
 // Checkpoint 17: isolated per-user/workspace persistence, compare-and-swap and explicit restore.
 const draftWorkspace=m.workspace_id,draftUser=state.user.id,draftView=viewRevision;
 let draftRev=0,savedDraft=null,draftLoaded=false,draftSaving=null,autoSaveTimer=null,draftDirty=false,draftSubmitted=false;
 const stillHere=()=>!draftSubmitted&&state.route==='create-ticket'&&state.active?.workspace_id===draftWorkspace&&state.user?.id===draftUser&&viewRevision===draftView&&form.isConnected;
 const draftStatus=document.getElementById('create-draft-status'),restoreDraft=document.getElementById('create-restore-draft'),discardDraft=document.getElementById('create-discard-draft');
 const updateDraftUI=()=>{restoreDraft.disabled=!savedDraft||!draftLoaded;discardDraft.disabled=!savedDraft||!draftLoaded;};
 const saveDraft=async(manual=false)=>{
  if(!stillHere()||!draftLoaded||state.busy)return;
  if(draftSaving){if(manual)await draftSaving;else return;}
  const snapshot=readInput();
  if(!isMeaningfulTicketDraft(snapshot)){if(manual)say('Enter a station, title or description before saving a draft.');return;}
  const serialized=JSON.stringify(sanitizeTicketDraft(snapshot));
  const draft=makeTicketDraft(snapshot,new Date().toISOString(),batchSnapshot());
  draftSaving=(async()=>{const row=await saveTicketDraftState(draftWorkspace,draftUser,draftRev,draft);draftRev=row.revision;savedDraft=draft;draftDirty=false;})();
  try{await draftSaving;if(stillHere()){draftStatus.textContent=`Private draft saved at ${new Date(draft.savedAt).toLocaleString()}.`;updateDraftUI();if(manual)say('Draft saved privately to your FuelTrans account.');}}
  catch(error){if(stillHere()){draftStatus.textContent='Draft was not saved — '+error.message;say(error.message);}}
  finally{draftSaving=null;if(stillHere()&&serialized!==JSON.stringify(sanitizeTicketDraft(readInput())))scheduleSave();}
 };
 function scheduleSave(){if(autoSaveTimer)clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>{if(stillHere()&&draftLoaded&&!draftSaving)void saveDraft();},1800);}
 form.addEventListener('input',()=>{draftDirty=true;if(draftLoaded)scheduleSave();});
 form.addEventListener('change',()=>{draftDirty=true;if(draftLoaded)scheduleSave();});
 document.getElementById('create-save-draft').onclick=()=>void saveDraft(true);
 restoreDraft.onclick=()=>{if(!savedDraft||!draftLoaded)return;for(const [k,v] of Object.entries(savedDraft.form)){const el=form.elements.namedItem(k);if(!el)continue;if(el instanceof HTMLInputElement&&el.type==='checkbox')el.checked=v===true;else el.value=String(v??'');}batchStations=(savedDraft.batchStations||[]).map(s=>({...s}));drawBatch();step=0;showCritical();syncClientCards();syncStep();draftDirty=false;draftStatus.textContent=`Restored private ticket draft saved ${new Date(savedDraft.savedAt).toLocaleString()}.`;say('Private draft restored. Verify details before submitting.');};
 discardDraft.onclick=async()=>{if(!draftLoaded||!savedDraft||state.busy)return;if(!confirm('Discard your saved private ticket draft? Current unsaved form input will remain.'))return;
  if(autoSaveTimer)clearTimeout(autoSaveTimer);if(draftSaving)await draftSaving;
  try{const row=await saveTicketDraftState(draftWorkspace,draftUser,draftRev,null);draftRev=row.revision;savedDraft=null;draftDirty=false;if(stillHere()){draftStatus.textContent='Saved draft discarded.';updateDraftUI();say('Saved private draft discarded.');}}
  catch(err){if(stillHere())say('Discard failed: '+err.message);}
 };
 void (async()=>{try{const record=normalizeTicketDraftState(await readTicketDraftState(draftWorkspace,draftUser));if(!stillHere())return;draftRev=record.revision;savedDraft=record.draft;draftLoaded=true;draftStatus.textContent=savedDraft?`Saved draft available from ${new Date(savedDraft.savedAt).toLocaleString()}. Select Restore; unsaved input is not overwritten.`:'No saved private ticket draft.';updateDraftUI();if(draftDirty)scheduleSave();}catch(err){if(stillHere()){draftLoaded=false;draftStatus.textContent='Draft storage unavailable: '+err.message+' (no silent local fallback).';}}})();
 const checkDuplicates=async(valid)=>{
  const rows=await findActiveTicketDuplicates({workspaceId:draftWorkspace,client:valid.client,stationId:valid.stationId,systemType:valid.systemType});
  if(!stillHere())throw Error('Form context changed during duplicate lookup.');
  return rows;
 };
 form.elements.priority.addEventListener('change',showCritical);showCritical();syncStep();
 document.getElementById('create-back').onclick=()=>{step=Math.max(0,step-1);syncStep();say('');};
 document.getElementById('create-next').onclick=async()=>{if(state.busy)return;showCritical();const invalid=[...stages[step].querySelectorAll('input,select,textarea')].find(el=>!el.checkValidity());if(invalid){invalid.reportValidity();say('Complete the required source fields before continuing.');return;}if(step===0){try{validateBatchStations({stationId:form.elements.stationId.value,stationName:form.elements.stationName.value},batchSnapshot());}catch(err){say(err.message);return;}}if(step===3){if(!review())return;state.busy=true;try{const v=validateSourceTicketDraft(readInput(),state.active);const batch=validateBatchStations({stationId:v.stationId,stationName:v.stationName},batchSnapshot());const rows=[];for(const st of batch)rows.push(...await checkDuplicates({...v,...st}));const box=document.getElementById('create-duplicate-warning');box.innerHTML=rows.length?`<strong>Possible active duplicates (${rows.length}, up to 5 visible)</strong><ul>${rows.map(x=>`<li>${h(x.ticket_number||x.id)} · ${h(x.status)}</li>`).join('')}</ul><p>These records are visible under your access policy. Review before creating another ticket.</p>`:'<p>No matching active tickets visible to this account. This is not a concurrency guarantee.</p>';}catch(err){say('Duplicate check unavailable: '+err.message+' Submission not enabled.');return;}finally{state.busy=false;}}step=Math.min(stages.length-1,step+1);syncStep();say('');};
 form.onsubmit=async e=>{e.preventDefault();if(step!==4||state.busy)return;
 if(pendingUncertainTicket?.workspaceId===draftWorkspace&&pendingUncertainTicket?.userId===draftUser){say('A previous ticket submission is uncertain. Use the read-only verification control; do not create another ticket yet.');return;}
 showCritical();if(!review())return;const btn=document.getElementById('create-submit');state.busy=true;btn.disabled=true;say('Verifying active FuelTrans membership and saving ticket…');try{
  const member=await readFreshFuelTransMembership(state.active.workspace_id,state.user.id);
  if(!canCreate(member))throw Error('Ticket creation access was revoked.');
  const valid=validateSourceTicketDraft(readInput(),member);
  const pendingEvidence=selectedEvidence(); // Preflight all files BEFORE ticket insert.
  if(member.workspace_id!==draftWorkspace||state.user.id!==draftUser)throw Error('Ticket creator context changed.');
  const stations=validateBatchStations({stationId:valid.stationId,stationName:valid.stationName},batchSnapshot());
  for(const station of stations)stationTicketTitle(valid.name,station);
  const found=[];for(const station of stations)found.push(...await checkDuplicates({...valid,...station}));
  if(found.length&&!confirm(`${found.length} potentially duplicate active ticket(s) detected for the selected stations. Proceed with sequential non-atomic creation?`)){say('Submission cancelled.');return;}
  if(stations.length>1&&!confirm(`Create ${stations.length} tickets sequentially? Earlier confirmed tickets cannot be rolled back automatically if a later station fails.`)){say('Batch submission cancelled.');return;}
  const result=await runSequentialTicketBatch({stations,
   prepare:async(station)=>{
    if(state.active?.workspace_id!==draftWorkspace||state.user?.id!==draftUser)throw Error('Creator workspace/identity changed.');
    const current=await readFreshFuelTransMembership(draftWorkspace,draftUser);
    if(!canCreate(current))throw Error('FuelTrans creation access revoked during batch.');
    const entry=validateSourceTicketDraft({...readInput(),...station,title:stationTicketTitle(readInput().title,station)},current);
    const id=crypto.randomUUID(),now=new Date().toISOString(),ticketId=`FT-${now.slice(0,10).replaceAll('-','')}-${id.slice(0,8).toUpperCase()}`;
    return buildSourceTicketRecord(entry,current,state.user,{id,now,ticketId});
   },insert:insertTicket,
   onProgress:()=>{draftSubmitted=true;if(autoSaveTimer)clearTimeout(autoSaveTimer);},
   afterInsert:async(saved)=>{
    const evidence=await uploadCreatedTicketEvidence({workspaceId:draftWorkspace,ticketId:saved.id,files:pendingEvidence,upload:async(ws,id,file)=>{const live=await readFreshFuelTransMembership(ws,draftUser);if(!canCreate(live))throw Error('FuelTrans creation rights revoked.');return uploadEvidence(ws,id,file);}});
    return evidence.failed>0?creationEvidenceMessage(evidence):null;
   }});
  if(result.failure?.stage==='insert_uncertain'){pendingUncertainTicket=validateUncertainReceipt(result.failure.receipt);}
  const message=batchOutcomeMessage(result);
  if(result.confirmed.length){
   if(draftSaving)await draftSaving.catch(()=>{});
   if(!result.failure){try{if(draftLoaded){const cleared=await saveTicketDraftState(draftWorkspace,draftUser,draftRev,null);draftRev=cleared.revision;}}catch(error){console.warn('Saved ticket draft cleanup failed:',error.message);}}
   const saved=result.confirmed[result.confirmed.length-1];postCreateNotice={ticketId:saved.ticketId,message};say(message);location.hash=`ticket/${encodeURIComponent(saved.ticketId)}`;
  }else{say(message);if(result.failure?.stage==='insert_uncertain'){draftSubmitted=true;btn.disabled=true;const wrapper=form.parentElement;wrapper.insertAdjacentHTML('beforeend',pendingTicketReconciliationPanel());bindPendingTicketReconciliation();}}

 }catch(err){say(err.message);}finally{state.busy=false;if(btn.isConnected)btn.disabled=draftSubmitted;}};
}
async function recordedStations(revision){
 const member=state.active,workspaceId=member.workspace_id;
 const assignedClient=clientForMembership(member);
 const query=buildRecordedStationsQuery({
  workspaceId,member,client:state.stationClient,stationId:state.stationIdSearch,page:state.stationPage
 });
 const result=await select('fueltrans_tickets',query);
 if(revision!==viewRevision||state.active?.workspace_id!==workspaceId)return;
 if(!Array.isArray(result)||result.length>STATION_HISTORY_PAGE_SIZE+1)throw Error('Invalid station-history page.');
 const hasMore=result.length>STATION_HISTORY_PAGE_SIZE;
 const rows=result.slice(0,STATION_HISTORY_PAGE_SIZE);
 const stations=projectRecordedStations(rows,{workspaceId,member});
 const firstIndex=state.stationPage*STATION_HISTORY_PAGE_SIZE;
 const clientOptions=assignedClient
  ?`<option value="${h(assignedClient)}">${h(assignedClient)} (membership)</option>`
  :`<option value="all">All clients</option>${CLIENTS.map(c=>`<option value="${h(c)}" ${state.stationClient===c?'selected':''}>${h(c)}</option>`).join('')}`;
 const cards=stations.length?stations.map(s=>`<article class="ft-station-card">
  <div class="ft-station-card-head"><span class="ft-station-network">${h(s.client)}</span><span class="ft-station-id">${h(s.stationId)}</span></div>
  <h2>${h(s.stationName)}</h2>
  <dl class="ft-station-facts">
   <div><dt>Last recorded ticket</dt><dd><a href="${host.base}/ticket/${encodeURIComponent(s.latestTicketId)}">${h(s.latestTicketNumber)}</a></dd></div>
   <div><dt>Ticket status</dt><dd>${h(s.latestTicketStatus)}</dd></div>
   <div><dt>Last ticket update</dt><dd>${h(friendlyTime(s.lastTicketUpdated))}</dd></div>
   <div><dt>Tickets on this page</dt><dd>${s.pageTickets}</dd></div>
  </dl>
 </article>`).join(''):'<div class="ft-ticket-empty" role="status">No station names and IDs are recorded in this ticket page. Try another page or adjust the search.</div>';
 layout(`${pageHeader('Recorded Stations','Read-only station information observed in existing FuelTrans tickets.')}
  <section class="panel ft-station-history">
   <div class="ft-station-contract" role="note"><strong>Ticket history, not a verified station directory.</strong>
    <p>These entries come only from accessible, non-archived FuelTrans tickets. Names may be outdated, results are deduplicated on this page only, and no deployed station inventory, AnyDesk credentials or operational status is inferred.</p>
   </div>
   <form id="station-history-filter" class="ft-station-filters">
    <label>Station ID search <input name="stationId" maxlength="60" autocomplete="off" value="${h(state.stationIdSearch)}" placeholder="e.g. 1013C" aria-describedby="station-history-search-help"></label>
    <label>Client <select name="client" ${assignedClient?'disabled':''}>${clientOptions}</select></label>
    <button type="submit">Search recorded stations</button><button type="button" class="secondary" id="station-clear">Clear</button>
   </form>
   <p class="muted" id="station-history-search-help">Station ID searches use server-side ticket filtering. Enter letters, numbers, spaces, hyphens or underscores; no full directory is available.</p>
   <p class="ft-page-summary">Ticket page ${state.stationPage+1} · ${rows.length} ticket records loaded · ${stations.length} unique station IDs on this page. Counts are page-scoped, not a complete station inventory.</p>
   <div class="ft-station-cards">${cards}</div>
   <details class="ft-source-review" id="station-source-review">
    <summary>Compare an existing station CSV with this ticket page</summary>
    <p class="muted">Local preview only. CSV columns: Client, Station ID, Station Name (or Site ID / Site Name). Extra columns are ignored. No data is uploaded, saved, or designated authoritative. Comparisons cover the currently visible ticket page only.</p>
    <form id="station-source-form" class="ft-source-form">
     <label>Choose a local station CSV (not uploaded)
      <input type="file" id="station-source-file" accept=".csv,text/csv" required aria-describedby="station-source-help">
     </label>
     <button type="submit">Validate and compare</button>
     <button type="button" class="secondary" id="station-source-template">Download blank CSV template</button>
    </form>
    <p class="muted" id="station-source-help">Maximum 1 MB, 5,000 rows; exported reports contain only station metadata and page-scoped comparison outcomes.</p>
    <section id="station-source-results" aria-live="polite" role="status"></section>
   </details>
   <div class="pager"><button id="station-prev" type="button" class="secondary" ${state.stationPage===0?'disabled':''}>← Previous page</button>
    <span>${rows.length?firstIndex+1:0}–${firstIndex+rows.length} visible ticket records</span>
    <button id="station-next" type="button" class="secondary" ${hasMore?'':'disabled'}>Next page →</button></div>
  </section>`);
 const sourceForm=document.getElementById('station-source-form');
 document.getElementById('station-source-template').onclick=()=>{
  browserDownload('fueltrans-station-template.csv','Client,Station ID,Station Name\r\n','text/csv;charset=utf-8');
 };
 sourceForm.onsubmit=async event=>{
  event.preventDefault();
  const output=document.getElementById('station-source-results');
  const button=sourceForm.querySelector('button[type="submit"]');
  const file=document.getElementById('station-source-file').files?.[0];
  if(!file){output.textContent='Choose a CSV file to review.';return;}
  if(file.size>STATION_SOURCE_MAX_BYTES){output.textContent='Station CSV must be smaller than 1 MB.';return;}
  button.disabled=true;
  output.textContent='Validating local station metadata…';
  try{
   const parsed=parseStationSourceCsv(await file.text(),{assignedClient});
   if(revision!==viewRevision||state.active?.workspace_id!==workspaceId||!output.isConnected)return;
   const compared=reconcileStationSource(parsed.rows,stations);
   const evidence=parsed.issues.length?null:await stationCandidateEvidence({
    parsed,compared,ticketPage:state.stationPage+1,ticketCount:rows.length,reviewedAt:new Date().toISOString()
   });
   if(revision!==viewRevision||state.active?.workspace_id!==workspaceId||!output.isConnected)return;
   const labels={
    matched_on_visible_page:'Matches ticket on this page',
    name_difference_on_visible_page:'Name differs on this page',
    not_on_visible_page:'Not observed on this page'
   };
   const counts={matched_on_visible_page:0,name_difference_on_visible_page:0,not_on_visible_page:0};
   for(const row of compared)counts[row.status]++;
   const issueList=parsed.issues.slice(0,10).map(issue=>`<li>CSV row ${issue.line}: ${h(issue.reason)}</li>`).join('');
   const comparison=compared.slice(0,40).map(row=>`<tr>
     <td>${h(row.client)}</td><td>${h(row.stationId)}</td>
     <td>${h(row.stationName)}</td>
     <td>${h(labels[row.status])}</td>
     <td>${h(row.recordedStationName||'—')}</td>
    </tr>`).join('');
   output.innerHTML=`<div class="ft-source-results-head">
     <strong>Local source review — no changes saved</strong>
     <p>Validated: ${parsed.rows.length} unique station candidates · ${parsed.duplicates} identical duplicates · ${parsed.issues.length} validation issues · ${parsed.ignoredColumnCount} extra columns ignored.</p>
     <p>Current ticket page only: ${counts.matched_on_visible_page} matching names · ${counts.name_difference_on_visible_page} differing names · ${counts.not_on_visible_page} not observed. A station not observed on this page may exist elsewhere.</p>
     ${evidence?`<p class="ft-source-fingerprint">Allowed station metadata SHA-256: <code>${h(evidence.fingerprint.value)}</code></p>`:''}
    </div>
    ${parsed.issues.length?`<div class="ft-source-issues" role="note"><strong>Resolve validation issues before exporting.</strong><ul>${issueList}</ul>${parsed.issues.length>10?`<p>Plus ${parsed.issues.length-10} additional issues.</p>`:''}</div>`:''}
    ${compared.length?`<div class="table-wrap ft-source-table"><table>
     <thead><tr><th>Client</th><th>Station ID</th><th>Candidate station name</th><th>Comparison</th><th>Name on ticket page</th></tr></thead>
     <tbody>${comparison}</tbody></table></div>
     ${compared.length>40?`<p class="muted">Showing the first 40 of ${compared.length} candidates.</p>`:''}
     ${parsed.issues.length?'':`<button class="secondary" id="station-export-review" type="button">Export comparison CSV</button><button class="secondary" id="station-export-evidence" type="button">Download candidate evidence manifest</button>`}`:
     '<p class="muted">No valid station candidates to compare.</p>'}
    <div class="ft-owner-onboarding" id="station-owner-onboarding" aria-label="Owner verification handoff">
     <strong>Prepare owner verification handoff</strong>
     <p class="muted">The fields below are owner/source claims supplied for independent review, not proof of approval. No registry is activated.</p>
     <form id="station-owner-packet-form">
      <label>Proposed data owner *<input name="owner" required minlength="3" maxlength="140" autocomplete="off" placeholder="Owner or responsible team"></label>
      <label>Source reference *<input name="sourceReference" required minlength="3" maxlength="220" autocomplete="off" placeholder="Approved repository, document or API reference"></label>
      <label>Source revision/date *<input name="revision" required minlength="3" maxlength="80" placeholder="Version or export date"></label>
      <label>Approval reference (optional)<input name="approvalReference" maxlength="160" autocomplete="off" placeholder="Ticket or signed approval reference"></label>
      <button type="submit" class="secondary">Download owner-review packet</button>
      <button type="button" class="secondary" id="station-stage-json">Download sanitized staging JSON (not imported)</button>
      <p id="station-owner-packet-status" role="status" aria-live="polite"></p>
     </form>
    </div>
    <p class="muted">A CSV preview cannot establish station ownership or registry authority. Records remain local to this view until navigation.</p>`;
   const ownerForm=document.getElementById('station-owner-packet-form');
   if(ownerForm&&!evidence)ownerForm.closest('.ft-owner-onboarding')?.remove();
   if(ownerForm&&evidence)ownerForm.onsubmit=event=>{
    event.preventDefault();
    const status=ownerForm.querySelector('#station-owner-packet-status');
    try{
     const packet=buildStationOwnerReviewPacket(evidence,Object.fromEntries(new FormData(ownerForm)),new Date().toISOString());
     browserDownload(`fueltrans-station-owner-review-page-${state.stationPage+1}.json`,JSON.stringify(packet,null,2));
     status.textContent='Owner-review packet prepared locally. Independent source verification is still required.';
    }catch(error){status.textContent='Owner-review packet unavailable: '+error.message;}
   };
   const stageButton=document.getElementById('station-stage-json');
   if(stageButton&&evidence)stageButton.onclick=async()=>{
    const status=document.getElementById('station-owner-packet-status');
    stageButton.disabled=true;
    try{
     const ownerPacket=buildStationOwnerReviewPacket(evidence,Object.fromEntries(new FormData(ownerForm)),new Date().toISOString());
     const staged=await stageStationRegistryLocally(await file.text(),ownerPacket);
     if(revision!==viewRevision||state.active?.workspace_id!==workspaceId||!stageButton.isConnected)return;
     browserDownload(`fueltrans-station-staging-not-imported-${state.stationPage+1}.json`,JSON.stringify(staged,null,2));
     status.textContent='Sanitized staging file downloaded. No source authority was verified and no database import occurred.';
    }catch(error){if(status?.isConnected)status.textContent='Staging unavailable: '+error.message;}
    finally{if(stageButton.isConnected)stageButton.disabled=false;}
   };
   const manifestButton=document.getElementById('station-export-evidence');
   if(manifestButton&&evidence)manifestButton.onclick=()=>{
    browserDownload(`fueltrans-station-candidate-evidence-page-${state.stationPage+1}.json`,JSON.stringify(evidence,null,2));
   };
   const exportButton=document.getElementById('station-export-review');
   if(exportButton)exportButton.onclick=()=>{
    browserDownload(`fueltrans-station-comparison-page-${state.stationPage+1}.csv`,
     stationReconciliationCsv(compared,{ticketPage:state.stationPage+1}),'text/csv;charset=utf-8');
   };
  }catch(error){
   if(revision===viewRevision&&output.isConnected)output.textContent='Could not review CSV: '+error.message;
  }finally{if(button.isConnected)button.disabled=false;}
 };
 document.getElementById('station-history-filter').onsubmit=e=>{
  e.preventDefault();
  const values=new FormData(e.currentTarget);
  const stationId=String(values.get('stationId')||'').trim();
  const client=assignedClient||String(values.get('client')||'all');
  try{
   buildRecordedStationsQuery({workspaceId,member,client,stationId,page:0});
   state.stationClient=client;state.stationIdSearch=stationId;state.stationPage=0;
   void go('station-history');
  }catch(error){say(error.message);}
 };
 document.getElementById('station-clear').onclick=()=>{
  state.stationIdSearch='';state.stationClient=assignedClient||'all';state.stationPage=0;
  void go('station-history');
 };
 document.getElementById('station-prev').onclick=()=>{state.stationPage=Math.max(0,state.stationPage-1);void go('station-history');};
 document.getElementById('station-next').onclick=()=>{if(hasMore){state.stationPage++;void go('station-history');}};
}

async function workflow(r,revision){
 const ws=state.active.workspace_id;
 const scope=r==='handover'?'all':state.workflowScope;
 const q=buildWorkflowQuery({workspaceId:ws,route:r,scope,userId:state.user.id,page:state.workflowPage,limit:25});
 const {rows,totalRange}=await listTickets(q);if(revision!==viewRevision)return;
 const total=parseTotal(totalRange,rows.length),visible=pageTicketSummary(rows),header=r==='l1-workspace'?'Global L1 Workspace':r==='l2-dispatch'?'Local L2 Dispatch':'Shift Handover';
 const filters=r==='handover'?'':`<div class="assignment-filters" role="group" aria-label="Assignment filter">${QUEUE_SCOPES.map(x=>`<button type="button" class="${scope===x?'':'secondary'}" data-assignment-scope="${x}" aria-pressed="${scope===x}">${x==='all'?'All tickets':x==='mine'?'Assigned to me':'Unassigned'}</button>`).join('')}</div>`;
 layout(`${pageHeader(header,'Review the assigned workflow queue and open tickets for permitted operations.')}<div class="ft-workflow-banner"><span class="ft-live-dot" aria-hidden="true"></span><strong>${h(activeShift())}</strong><span>${r==='handover'?'Tickets flagged for incoming shift attention.':'Live assignment queue; claim and resolve actions remain on the ticket.'}</span></div><div class="panel ft-workflow-panel">${filters}<p class="muted">${total} matching tickets · Page ${state.workflowPage+1}. Age and response duration are live, read-only projections; no SLA target or breach is inferred.</p><p class="ft-page-summary">On this page: ${visible.visible} tickets · ${visible.unassigned} unassigned · ${visible.flagged} flagged for handover</p>${ticketCards(rows)}<div class="pager"><button id="workflow-prev" class="secondary" ${state.workflowPage===0?'disabled':''}>← Previous</button><span>${total?state.workflowPage*25+1:0}–${Math.min((state.workflowPage+1)*25,total)} / ${total}</span><button id="workflow-next" class="secondary" ${(state.workflowPage+1)*25>=total?'disabled':''}>Next →</button></div></div>`);
 for(const button of document.querySelectorAll('[data-assignment-scope]'))button.onclick=()=>{const selected=button.dataset.assignmentScope;if(!QUEUE_SCOPES.includes(selected))return;state.workflowScope=selected;state.workflowPage=0;go(r);};
 document.getElementById('workflow-prev').onclick=()=>{state.workflowPage=Math.max(0,state.workflowPage-1);go(r);};
 document.getElementById('workflow-next').onclick=()=>{state.workflowPage++;go(r);};
}

function delegationPanel(t){
 if(!canDelegate(state.active,t,'L1')&&!canDelegate(state.active,t,'L2'))return '';
 return `<section class="panel ft-delegation-panel" id="delegation-panel"><h2>Transfer Responsibility</h2><p class="muted">Administrators may assign an eligible L1 or L2 member. Assignment does not imply acceptance and does not start response timers. Server permissions apply.</p><div id="delegation-body" role="status">Loading active, role-matched members…</div></section>`;
}
async function readEligibleDelegates(ws,level){
 const role=level==='L1'?'global_l1_support':'local_l2_support',out=[];
 for(let page=0;page<5;page++){
  const rows=await readCollection('fueltrans_memberships',ws,{selectFields:'workspace_id,user_id,role,client_code,enabled,status,display_name,email',page,limit:100,extra:{role:`eq.${role}`,enabled:'eq.true',status:'eq.active',order:'user_id.asc'}});
  out.push(...rows);if(rows.length<100)return out;
 }
 throw Error('Too many eligible operators to list safely; refine membership provisioning.');
}
async function bindDelegation(t){
 const target=document.getElementById('delegation-body');if(!target)return;
 const levels=['L1','L2'].filter(level=>canDelegate(state.active,t,level));
 try{
  const rosters=await Promise.all(levels.map(level=>readEligibleDelegates(t.workspace_id,level)));
  if(!target.isConnected||state.active?.workspace_id!==t.workspace_id||state.detail?.id!==t.id)return;
  target.innerHTML=levels.map((level,i)=>`<form class="delegation-form" data-delegate="${level}"><label>${level} operator<select name="userId" required><option value="">Choose active ${level} operator</option>${rosters[i].map(m=>`<option value="${h(m.user_id)}">${h(m.display_name||m.email||m.user_id)}</option>`).join('')}</select></label><button type="submit" ${rosters[i].length?'':'disabled'}>Assign ${level}</button></form>`).join('');
  for(const form of target.querySelectorAll('[data-delegate]'))form.onsubmit=async e=>{
   e.preventDefault();if(state.busy)return;
   const level=form.dataset.delegate,assignee=rosters[levels.indexOf(level)].find(m=>m.user_id===form.elements.userId.value);
   const button=form.querySelector('button');button.disabled=true;state.busy=true;
   try{
    if(!assignee)throw Error('Choose a valid operator.');
    // Revalidate live membership and ticket state; optimistic write also rejects stale ticket timestamp.
    const latest=await readTicket(t.workspace_id,t.id);
    const validMembers=await readEligibleDelegates(t.workspace_id,level);
    const fresh=validMembers.find(m=>m.user_id===assignee.user_id);
    if(!fresh||!latest||state.active?.workspace_id!==t.workspace_id)throw Error('Assignment no longer available. Refresh.');
    if(latest.updated_at!==t.updated_at)throw Error('Ticket changed. Refresh before delegating.');
    const actingMembership=await readFreshFuelTransMembership(t.workspace_id,state.user.id);
    if(actingMembership.role!==state.active.role||actingMembership.workspace_id!==state.active.workspace_id)throw Error('Your FuelTrans permissions changed. Refresh and retry.');
    const next=buildDelegation(latest,actingMembership,state.user,fresh,level);
    await updateTicket({workspaceId:t.workspace_id,id:t.id,expectedUpdatedAt:t.updated_at,patch:{updated_at:next.updated_at,status:next.status,archived:next.archived,assigned_l1:next.assigned_l1,assigned_l2:next.assigned_l2,payload:next.payload}});
    await go(`ticket/${t.id}`);say(`${level} operator delegated. Awaiting acceptance.`);
   }catch(err){say(err.message);}finally{state.busy=false;if(button.isConnected)button.disabled=false;}
  };
 }catch(err){if(target.isConnected)target.textContent=err.message;}
}
function ticketActions(t){
 if(!canOperate(state.active)&&!canHandover(state.active,t))return '';
 const transitions=STATUS.filter(s=>canTransition(state.active,t,s));
 const commands=[
  ...(canClaim(state.active,t,'L1')?[['claim-l1','Claim for L1']]:[]),
  ...(canClaim(state.active,t,'L2')?[['claim-l2','Claim for L2']]:[]),
  ...(canAcceptAssigned(state.active,t,'L1',state.user.id)?[['accept-l1','Accept my L1 assignment']]:[]),
  ...(canAcceptAssigned(state.active,t,'L2',state.user.id)?[['accept-l2','Accept my L2 assignment']]:[]),
  ...transitions.map(s=>[`status:${s}`,`Move to ${s}`]),
  ...(canHandover(state.active,t)?[['handover',t.payload?.handoverFlag?'Clear handover flag':'Flag handover']]:[]),
  ...(canArchive(state.active,t)?[['archive','Archive resolved ticket']]:[]),
  ...(permitted(state.active)&&TICKET_DELETION_ROLES.includes(state.active.role)?[['delete-recoverable','Delete ticket (recoverable)']]:[])
 ];
 return `<section class="panel ft-ticket-actions"><h2>Ticket Operations</h2><p class="muted">Changes are restricted by membership and Supabase RLS. Concurrent changes require a refresh.</p><div class="operation-buttons">${commands.map(([code,label])=>`<button type="button" class="${code.startsWith('claim-')?'':'secondary'}" data-ticket-action="${h(code)}">${h(label)}</button>`).join('')||'<span class="muted">No state transitions available for this ticket.</span>'}</div>${canOperate(state.active)?`<form id="ticket-note" class="note-form"><label>Operator work update<textarea name="note" required minlength="3" maxlength="2000" rows="3" placeholder="Record an operational update"></textarea></label><button type="submit">Add update</button></form>`:''}<h2>Work updates</h2><ol class="activity-list">${Array.isArray(t.payload?.updates)&&t.payload.updates.length?t.payload.updates.slice(-30).reverse().map(a=>`<li><strong>${h(a.author?.name||'Operator')}</strong><span>${h(friendlyTime(a.timestamp))}</span><p>${h(a.message||'')}</p></li>`).join(''):'<li>No work updates.</li>'}</ol></section>`;
}
function bindTicketActions(t){
 for(const btn of document.querySelectorAll('[data-ticket-action]'))btn.onclick=()=>submitTicketAction(t,btn.dataset.ticketAction);
 const f=document.getElementById('ticket-note');if(f)f.onsubmit=e=>{e.preventDefault();const text=String(new FormData(f).get('note')||'');submitTicketAction(t,'note',text);};
}
async function submitTicketAction(t,action,note=''){
 if(state.busy)return;
 if(action==='archive'&&!confirm('Archive this resolved ticket?'))return;
 if(action==='delete-recoverable'&&!confirm('Remove this ticket from active views? The ticket, history and evidence will be retained for administrator restoration.'))return;
 state.busy=true;document.querySelectorAll('[data-ticket-action],#ticket-note button').forEach(b=>b.disabled=true);
 say('Submitting authorized operation…');
 try{
  // Revalidate signed-in identity, active membership, and latest ticket state before writing.
  const ws=t.workspace_id,uid=state.user.id;
  const [liveMember,liveTicket]=await Promise.all([readFreshFuelTransMembership(ws,uid),readTicket(ws,t.id)]);
  if(state.active?.workspace_id!==ws||state.user?.id!==uid||liveMember.role!==state.active.role)throw Error('Your workspace or role changed. Refresh before retrying.');
  if(!liveTicket||liveTicket.updated_at!==t.updated_at)throw Error('Ticket changed or was removed. Refresh before retrying.');
  if(action==='delete-recoverable'){
   await executeSoftDelete({member:liveMember,workspaceId:ws,ticketId:t.id,updatedAt:liveTicket.updated_at,userId:uid,invoke:args=>callTicketDeletionRpc('fueltrans_soft_delete_ticket_v1',args)});
   state.page=0;
   await go('tickets',{preserveNotice:true});
   say('Ticket removed from active views. Audit history and evidence retained; administrator may restore using the original ticket ID.');
   return;
  }
  const next=buildChange(liveTicket,liveMember,state.user,action,{note});
  await updateTicket({workspaceId:t.workspace_id,id:t.id,expectedUpdatedAt:t.updated_at,patch:{updated_at:next.updated_at,status:next.status,archived:next.archived,assigned_l1:next.assigned_l1,assigned_l2:next.assigned_l2,payload:next.payload}});
  await go(`ticket/${t.id}`,{preserveNotice:true});say('Ticket updated successfully.');
 }catch(e){say(e.message);}finally{state.busy=false;document.querySelectorAll('[data-ticket-action],#ticket-note button').forEach(b=>b.disabled=false);}
}
function evidencePanel(t){
 return `<section class="panel ft-evidence-panel"><h2>Attached Evidence</h2><p class="muted">Private bucket with workspace/ticket RLS. File types: JPEG, PNG, WebP, PDF, text. Maximum 10 MB.</p><div id="evidence-list">Loading authorized files…</div>${state.active.role!=='viewer'?`<form id="evidence-upload" class="evidence-upload"><label>Attach supporting evidence <input type="file" name="file" required accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"></label><button type="submit">Upload evidence</button></form>`:''}<div id="evidence-feedback" role="status"></div></section>`;
}
function bindEvidence(t){
 let page=0;
 const list=document.getElementById('evidence-list'),feedback=document.getElementById('evidence-feedback');
 async function load(){
  const currentTicket=t.id,currentWorkspace=t.workspace_id;list.textContent='Loading…';
  try{
   const files=await listEvidence(currentWorkspace,currentTicket,page*50);
   if(!list.isConnected||state.detail?.id!==currentTicket||state.active?.workspace_id!==currentWorkspace)return;
   list.innerHTML=`<ul class="evidence-items">${files.map(f=>`<li><span>${h(f.name)}</span><button type="button" class="secondary" data-evidence="${h(f.name)}">Open</button></li>`).join('')||'<li>No evidence files available.</li>'}</ul><div class="pager"><button id="evidence-back" class="secondary" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1}</span><button id="evidence-forward" class="secondary" ${files.length<50?'disabled':''}>Next</button></div>`;
   document.getElementById('evidence-back').onclick=()=>{page=Math.max(0,page-1);load();};
   document.getElementById('evidence-forward').onclick=()=>{page++;load();};
   for(const button of list.querySelectorAll('[data-evidence]'))button.onclick=async()=>{button.disabled=true;try{const signed=await signedEvidenceUrl(currentWorkspace,currentTicket,button.dataset.evidence);const a=document.createElement('a');a.href=signed;a.target='_blank';a.rel='noopener noreferrer';document.body.append(a);a.click();a.remove();}catch(e){feedback.textContent=e.message;}finally{button.disabled=false;}};
  }catch(e){if(list.isConnected)list.textContent=e.message;}
 }
 const upload=document.getElementById('evidence-upload');if(upload)upload.onsubmit=async e=>{e.preventDefault();const file=new FormData(upload).get('file');const button=upload.querySelector('button');button.disabled=true;feedback.textContent='Uploading…';try{await uploadEvidence(t.workspace_id,t.id,file);feedback.textContent='Evidence uploaded.';upload.reset();page=0;await load();}catch(err){feedback.textContent=err.message;}finally{button.disabled=false;}};
 void load();
}
async function auxiliary(route,revision){
 if(route!=='notifications'&&!mayReadAdministration(state.active))throw Error('Administrator access required.');
 const ws=state.active.workspace_id,pg=state.viewPage,limit=25;
 if(route==='admin'){
  const [counts,members]=await Promise.all([stats(),readCollection('fueltrans_memberships',ws,{selectFields:'role,user_id,status,enabled,client_code',limit:100})]);if(revision!==viewRevision)return;
  const roles={};for(const m of members)roles[m.role]=(roles[m.role]||0)+1;
  layout(`${pageHeader('Administration','Workspace membership and ticket overview (read-only).')}<section class="stat-grid"><div class="stat-card"><small>Total tickets</small><strong>${counts.total}</strong></div><div class="stat-card"><small>Members shown</small><strong>${members.length}</strong></div><div class="stat-card"><small>Active tickets</small><strong>${(counts.Open||0)+(counts['Under L1 Review']||0)+(counts['Escalated to L2']||0)+(counts['Under L2 Review']||0)}</strong></div></section><div class="panel"><h2>Role assignments</h2>${Object.entries(roles).map(([r,n])=>`<p>${h(r)}: <strong>${n}</strong></p>`).join('')}<p class="muted">Account provisioning remains restricted to existing administrator controls. Recoverable ticket deletion is available only to approved FuelTrans roles.</p></div><section class="panel"><h2>Restore a deleted ticket</h2><p class="muted">Only an active FuelTrans administrator can restore a recoverably deleted ticket. Supply its original ticket ID. Audit events and evidence are retained.</p><form id="restore-ticket23"><label>Original ticket ID<input required name="ticket_id" maxlength="120" placeholder="Ticket ID" autocomplete="off"></label><button type="submit">Restore ticket</button></form></section>`);
  document.getElementById('restore-ticket23').onsubmit=async e=>{e.preventDefault();if(state.busy)return;const form=e.currentTarget,btn=form.querySelector('button'),id=String(new FormData(form).get('ticket_id')||'').trim();btn.disabled=true;state.busy=true;try{
   const uid=state.user.id;const member=await readFreshFuelTransMembership(ws,uid);
   if(state.active?.workspace_id!==ws||state.user?.id!==uid||member.role!=='admin')throw Error('Administrator authorization changed.');
   if(!confirm(`Restore deleted ticket ${id}?`))return;
   await executeRestore({member,workspaceId:ws,ticketId:id,userId:uid,invoke:args=>callTicketDeletionRpc('fueltrans_restore_deleted_ticket_v1',args)});
   await go('admin',{preserveNotice:true});say(`Ticket ${id} restored. Open Ticket Queue to inspect it.`);
  }catch(err){say(err.message);}finally{state.busy=false;if(btn.isConnected)btn.disabled=false;}};
  const list=document.createElement('section');list.className='panel';list.id='recovery-list24';list.innerHTML='<h2>Deleted tickets</h2><p role="status">Loading deleted tickets…</p>';document.querySelector('main')?.append(list);
  let recoveryRequest25=0;
  async function loadDeleted(){
   const request=++recoveryRequest25,userId=state.user.id,member=await readFreshFuelTransMembership(ws,userId);
   if(member.role!=='admin'||state.active?.workspace_id!==ws||state.user?.id!==userId)throw Error('Administrator access changed.');
   const page=projectRecovery25(await callTicketDeletionRpc('fueltrans_deleted_ticket_page_v1',{p_workspace_id:ws,p_offset:recoveryPage24*25,p_limit:25,p_search:recoverySearch24}),ws);
   if(request!==recoveryRequest25||!list.isConnected||viewRevision!==revision)return;
   list.innerHTML=`<h2>Deleted Ticket Recovery</h2><form id="recovery-search24" class="filter-bar"><label>Search ticket, station ID or station name<input name="search" maxlength="80" value="${h(recoverySearch24)}"></label><button>Search</button></form>
<p class="muted">${page.total} matching deleted ticket(s). Created and Deleted dates are separate. Page ${recoveryPage24+1}. Administrator-only permanent deletion cannot be undone; audit history and private evidence may remain retained under separate policies.</p>
<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="recovery-select-all25" aria-label="Select all tickets on this page"></th><th>Ticket ID</th><th>Subject / Station (Station ID and Station Name)</th><th>Created date</th><th>Deleted date</th><th>Actions</th></tr></thead><tbody>${page.items.map(t=>`<tr><td><input type="checkbox" class="recovery-select25" value="${h(t.id)}" aria-label="Select deleted ticket ${h(t.id)}"></td><td>${h(t.ticket_number||t.id)}<small>${h(t.id)}</small></td><td><strong>${h(t.station_id)}</strong><small>${h(t.station_name)}</small></td><td>${h(friendlyTime(t.created_at))}</td><td>${h(friendlyTime(t.deleted_at))}</td><td><div class="recovery-actions25"><button type="button" class="secondary" data-restore24="${h(t.id)}">Restore</button><button type="button" class="danger25" data-purge25="${h(t.id)}">Delete Permanently</button></div></td></tr>`).join('')||'<tr><td colspan="6">No matching deleted tickets.</td></tr>'}</tbody></table></div>
<div class="bulk-purge25"><button type="button" class="danger25" id="bulk-purge25" ${page.items.length?'':'disabled'}>Bulk Delete Permanently (selected)</button><span class="muted" id="purge-count25" role="status">0 tickets selected on this page</span></div>
<div class="pager"><button type="button" class="secondary" id="recovery-prev24" ${recoveryPage24===0?'disabled':''}>Previous</button><span>${page.total?recoveryPage24*25+1:0}–${Math.min((recoveryPage24+1)*25,page.total)} / ${page.total}</span><button type="button" class="secondary" id="recovery-next24" ${(recoveryPage24+1)*25>=page.total?'disabled':''}>Next</button></div>`;
   list.querySelector('#recovery-search24').onsubmit=e=>{e.preventDefault();recoverySearch24=String(new FormData(e.currentTarget).get('search')||'').trim();recoveryPage24=0;loadDeleted().catch(err=>say(err.message));};
   list.querySelector('#recovery-prev24').onclick=()=>{recoveryPage24=Math.max(0,recoveryPage24-1);loadDeleted().catch(err=>say(err.message));};
   list.querySelector('#recovery-next24').onclick=()=>{recoveryPage24++;loadDeleted().catch(err=>say(err.message));};
   const boxes=[...list.querySelectorAll('.recovery-select25')],counter=list.querySelector('#purge-count25');
   function recount(){counter.textContent=`${boxes.filter(b=>b.checked).length} ticket(s) selected on this page`;}
   list.querySelector('#recovery-select-all25').onchange=e=>{for(const b of boxes)b.checked=e.target.checked;recount();};
   for(const b of boxes)b.onchange=recount;
   for(const b of list.querySelectorAll('[data-restore24]'))b.onclick=()=>{const input=document.querySelector('#restore-ticket23 [name=ticket_id]');input.value=b.dataset.restore24;input.focus();document.getElementById('restore-ticket23').scrollIntoView({block:'center'});};
   async function purge(ids){
    if(state.busy||!ids.length)return;
    const typed=prompt(`PERMANENT DELETION: ${ids.length} ticket(s) will be removed from the recovery list and cannot be restored. Existing audit events and private evidence may be retained separately. Type DELETE ${ids.length} to proceed.`);
    if(typed!==`DELETE ${ids.length}`)return;
    state.busy=true;
    for(const b of list.querySelectorAll('button,input'))b.disabled=true;
    try{
     const result=await permanentDelete25({rows:page.items,ids,workspaceId:ws,userId,readMembership:readFreshFuelTransMembership,invoke:args=>callTicketDeletionRpc('fueltrans_permanently_delete_ticket_v1',args)});
     say(`${result.confirmed.length} ticket(s) permanently deleted and confirmed.${result.failure?` Stopped at ${result.failure.id}: ${result.failure.message}. Do not automatically retry.`:''}`);
     if(result.confirmed.length){if(page.items.length===result.confirmed.length&&recoveryPage24>0)recoveryPage24--;await loadDeleted();}
     else for(const b of list.querySelectorAll('button,input'))b.disabled=false;
    }catch(err){say(err.message);for(const b of list.querySelectorAll('button,input'))b.disabled=false;}
    finally{state.busy=false;}
   }
   list.querySelector('#bulk-purge25').onclick=()=>purge(boxes.filter(b=>b.checked).map(b=>b.value));
   for(const b of list.querySelectorAll('[data-purge25]'))b.onclick=()=>purge([b.dataset.purge25]);
  }
  loadDeleted().catch(e=>{if(list.isConnected)list.textContent=e.message;});
  return;
 }
 const mapping={users:['fueltrans_memberships','workspace_id,user_id,display_name,email,role,client_code,status,enabled,updated_at','User Directory'],sessions:['fueltrans_sessions','session_id,user_id,created_at,last_activity,terminated_at','Sessions'],audit:['fueltrans_audit_events','id,actor_user_id,event_type,action,occurred_at','Audit Events'],notifications:['fueltrans_notifications','id,recipient_user_id,recipient_scope,ticket_id,message,created_at,read_at','Notifications']};
 const [table,fields,title]=mapping[route];let extra={};
 if(route==='sessions')extra.order='last_activity.desc';
 if(route==='audit')extra.order='occurred_at.desc';
 if(route==='notifications')extra.order='created_at.desc';
 if(route==='users')extra.order='updated_at.desc';
 const rows=await readCollection(table,ws,{selectFields:fields,page:pg,limit,extra});if(revision!==viewRevision)return;
 const rendered=rows.map(x=>{
  if(route==='users')return `<tr><td>${h(x.display_name||x.user_id)}${x.user_id===state.user.id?' (you)':''}</td><td>${h(x.email||'—')}</td><td colspan="3">${x.user_id===state.user.id?`<span class="muted">${h(x.role)} · Your own membership cannot be edited here.</span>`:`<form class="member-edit" data-user-id="${h(x.user_id)}"><label>Role<select name="role">${FUELTRANS_ROLES.map(r=>`<option value="${h(r)}" ${r===x.role?'selected':''}>${h(r)}</option>`).join('')}</select></label><label>Client<select name="client_code"><option value="">None</option>${CLIENTS.map(c=>`<option value="${h(c)}" ${c===x.client_code?'selected':''}>${h(c)}</option>`).join('')}</select></label><label>Status<select name="status">${MEMBER_STATUSES.map(v=>`<option value="${v}" ${v===x.status?'selected':''}>${v}</option>`).join('')}</select></label><label class="member-enabled"><input type="checkbox" name="enabled" ${x.enabled?'checked':''}> Enabled</label><button type="submit">Save</button></form>`}</td></tr>`;
  if(route==='sessions')return `<tr><td>${h(x.user_id)}</td><td>${h(friendlyTime(x.created_at))}</td><td>${h(friendlyTime(x.last_activity))}</td><td>${h(x.terminated_at?'Terminated':'Recorded')}</td></tr>`;
  if(route==='audit')return `<tr><td>${h(x.actor_user_id||'—')}</td><td>${h(x.event_type||'—')}</td><td>${h(x.action||'—')}</td><td>${h(friendlyTime(x.occurred_at))}</td></tr>`;
  return `<tr><td>${h(x.message)}</td><td>${h(x.ticket_id||'—')}</td><td>${h(friendlyTime(x.created_at))}</td><td>${x.read_at?'Read':x.recipient_user_id===state.user.id?`<button type="button" class="secondary" data-notification="${h(x.id)}">Mark read</button>`:'Unread'}</td></tr>`;
 }).join('');
 const head={users:['Name','Email','FuelTrans Role','Client','Status'],sessions:['User ID','Created','Last Activity','State'],audit:['Actor','Type','Action','Time'],notifications:['Notification','Ticket','Created','Status']}[route];
 layout(`${pageHeader(title,'Server-scoped records; access is controlled by Supabase RLS.')}<div class="panel"><div class="table-wrap"><table><thead><tr>${head.map(x=>`<th>${h(x)}</th>`).join('')}</tr></thead><tbody>${rendered||`<tr><td colspan="${head.length}" class="empty">No accessible records.</td></tr>`}</tbody></table></div><div class="pager"><button class="secondary" id="aux-prev" ${pg===0?'disabled':''}>← Previous</button><span>Page ${pg+1}</span><button class="secondary" id="aux-next" ${rows.length<limit?'disabled':''}>Next →</button></div></div>`);
 document.getElementById('aux-prev').onclick=()=>{state.viewPage=Math.max(0,state.viewPage-1);go(route);};
 document.getElementById('aux-next').onclick=()=>{state.viewPage++;go(route);};
 if(route==='users')for(const form of document.querySelectorAll('.member-edit'))form.onsubmit=async e=>{
  e.preventDefault();if(state.busy)return;
  const target=rows.find(x=>x.user_id===form.dataset.userId);const submit=form.querySelector('button[type=submit]');submit.disabled=true;state.busy=true;
  try{
   if(state.active?.workspace_id!==ws)throw Error('Workspace changed.');
   const freshAdmin=await readFreshFuelTransMembership(ws,state.user.id);
   if(!mayReadAdministration(freshAdmin))throw Error('Administrator authorization is no longer active.');
   const changes=validateMembershipChange(freshAdmin,target,{role:form.elements.role.value,client_code:form.elements.client_code.value,status:form.elements.status.value,enabled:form.elements.enabled.checked},state.user.id);
   if(!confirm(`Update FuelTrans membership of ${target.display_name||target.email||target.user_id}?`))return;
   await updateFuelTransMembership({workspaceId:ws,userId:target.user_id,expectedUpdatedAt:target.updated_at,changes});
   await go('users');say('Membership change saved.');
  }catch(err){say(err.message);}finally{state.busy=false;if(submit.isConnected)submit.disabled=false;}
 };
 if(route==='notifications')for(const btn of document.querySelectorAll('[data-notification]'))btn.onclick=async()=>{btn.disabled=true;try{await markNotificationRead(ws,btn.dataset.notification,state.user.id);await go(route);}catch(e){btn.disabled=false;say(e.message);}};
}
function reportRowsTable(head,rows,empty='No matching records in the visible workspace.'){
 if(!rows.length)return `<p class="muted">${h(empty)}</p>`;
 return `<div class="table-wrap"><table><thead><tr>${head.map(x=>`<th scope="col">${h(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${h(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function reportBars(entries){const maximum=Math.max(1,...entries.map(x=>x[1]));return `<div class="report-bars">${entries.map(([label,count])=>`<div class="report-line"><span>${h(label)}</span><progress max="${maximum}" value="${Number(count)||0}" aria-label="${h(label)}"></progress><strong>${Number(count)||0}</strong></div>`).join('')}</div>`;}
function renderReportTab(summary,tab){
 const cfg=REPORTS.find(x=>x.id===tab)||REPORTS[0];state.reportTab=cfg.id;
 const tabs=REPORTS.map(x=>`<button type="button" role="tab" data-report-tab="${h(x.id)}" aria-selected="${x.id===cfg.id}" class="${x.id===cfg.id?'':'secondary'}">${h(x.name)}</button>`).join('');
 let content='';
 if(cfg.id==='executive'){
  content=`<section class="report-kpis"><div class="stat-card"><small>Non-archived tickets</small><strong>${summary.unarchived}</strong></div><div class="stat-card"><small>Active workload</small><strong>${summary.active}</strong></div><div class="stat-card"><small>Resolved</small><strong>${summary.resolved}</strong></div><div class="stat-card"><small>Archived (excluded)</small><strong>${summary.archived}</strong></div></section><h2>Status breakdown</h2>${reportBars(Object.entries(summary.statuses))}`;
 } else if(cfg.id==='client-performance'){
  content=`<h2>Client Performance</h2>${reportRowsTable(['Client','Visible tickets','Active','Resolved','Unknown status','Downtime minutes (recorded)'],summary.clients.map(v=>[v.name,v.tickets,v.active,v.resolved,v.unknownStatus,v.downtimeMinutes]))}`;
 } else if(cfg.id==='technician-productivity'){
  content=`<h2>Technician Productivity</h2><p class="muted">Assignment counts are not time worked or quality scores. UUIDs are shown where profile names are unavailable.</p>${reportRowsTable(['Assigned technician','Level','Assigned tickets','Resolved tickets'],summary.technicians.slice(0,50).map(v=>[v.name,v.level,v.tickets,v.resolved]))}${summary.technicians.length>50?'<p class="muted">Showing first 50 technicians; CSV includes all authorized summary rows.</p>':''}`;
 } else {
  content=`<section class="report-kpis"><div class="stat-card"><small>Recorded downtime (minutes)</small><strong>${summary.downtimeMinutes}</strong></div><div class="stat-card"><small>Tickets with recorded downtime</small><strong>${summary.knownDowntimeTickets}</strong></div><div class="stat-card"><small>Unknown downtime tickets</small><strong>${summary.unknownDowntimeTickets}</strong></div></section><h2>Downtime by system</h2><p class="muted">Only explicitly recorded numeric downtime contributes. No downtime cost is calculated from assumed hourly rates.</p>${reportRowsTable(['System','Tickets with data','Minutes'],summary.systems.map(v=>[v.name,v.tickets,v.minutes]))}`;
 }
 const reportWindow=reportScopeMeta||{excludedMissingOperationalDate:0,excludedOutOfWindow:0,range:{from:'',to:'',filtered:false}};
 const from=state.reportWindow.from,to=state.reportWindow.to;
 const windowDescription=reportWindowLabel(reportWindow.range);
 const exclusion=reportWindow.range.filtered?` · ${reportWindow.excludedMissingOperationalDate} ticket(s) excluded without valid operationalDate; ${reportWindow.excludedOutOfWindow} outside range.`:'';
 layout(`${pageHeader('Analytics & Reports','Operational reporting for the tickets you can access.')}<section class="panel"><form id="report-window" class="report-window-controls"><label>Operational date from <input type="date" name="from" value="${h(from)}"></label><label>Through <input type="date" name="to" value="${h(to)}"></label><button type="submit">Apply date filter</button><button id="clear-report-window" type="button" class="secondary">Clear</button></form><p class="muted" id="report-scope-note">${h(windowDescription)}${h(exclusion)}</p><p class="muted">Date filters use the operational date recorded on each ticket.</p><div role="tablist" aria-label="FuelTrans reports" class="report-tabs">${tabs}</div><div id="report-print-area" class="report-print-area"><header class="print-only"><h1>FuelTrans · ${h(cfg.name)}</h1><p>${h(windowDescription)} · workspace ${h(state.active.workspace_id)} · ${h(summary.totalRows)} records · ${h(reportScopeMeta?.snapshotAt||'')}</p></header><div role="tabpanel" aria-label="${h(cfg.name)}"><p class="muted">${h(cfg.description)} · ${summary.totalRows} selected accessible records · including ${summary.archived} archived.</p>${content}</div></div><div class="report-footer"><p class="muted">Reports include up to 10,000 accessible tickets. Use your browser’s print options to save a PDF.</p><div class="report-export-actions"><button id="print-report" type="button" class="secondary">Print / Save as PDF</button><button id="export" type="button" class="secondary">Export ${h(cfg.name)} CSV</button></div></div></section>`);
 for(const btn of document.querySelectorAll('[data-report-tab]'))btn.onclick=()=>renderReportTab(summary,btn.dataset.reportTab);
 document.getElementById('report-window').onsubmit=e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const choice={from:String(fields.get('from')||''),to:String(fields.get('to')||'')};try{parseReportWindow(choice);state.reportWindow=choice;recalculateReportView();}catch(err){say(err.message);}};
 document.getElementById('clear-report-window').onclick=()=>{state.reportWindow={from:'',to:''};recalculateReportView();};
 document.getElementById('print-report').onclick=()=>window.print();
 document.getElementById('export').onclick=()=>{const csv=reportCsv(summary,cfg.id);const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`fueltrans-${cfg.id}-summary.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
function recalculateReportView(){
 if(!reportRowsCache||!state.active||reportScopeMeta?.workspaceId!==state.active.workspace_id)throw Error('Report snapshot is stale; refresh reports.');
 const projection=applyReportWindow(reportRowsCache,state.reportWindow);
 reportScopeMeta={...reportScopeMeta,range:projection.range,excludedMissingOperationalDate:projection.excludedMissingOperationalDate,excludedOutOfWindow:projection.excludedOutOfWindow};
 const summary=summarizeReports(projection.rows,{workspaceId:state.active.workspace_id});
 renderReportTab(summary,state.reportTab);
}
async function reports(revision){
 if(!canReadReports(state.active))throw Error('Reports require an active authorized FuelTrans membership.');
 const workspaceId=state.active.workspace_id;
 const records=await collectReportRows({workspaceId,member:state.active,readPage:readAllTicketsForSnapshot,readCount:countAllTicketsForSnapshot});
 if(revision!==viewRevision||state.active.workspace_id!==workspaceId)return;
 reportRowsCache=records;
 reportScopeMeta={workspaceId,snapshotAt:new Date().toISOString()};
 recalculateReportView();
}

// Private bug report drafts: persisted in existing per-user Supabase state, NOT delivered to IT.
async function loadMyBugDrafts(){
 const row=await readBugDraftState(state.active.workspace_id,state.user.id);
 return normalizeBugState(row);
}
async function bugReports(revision){
 const data=await loadMyBugDrafts();if(revision!==viewRevision)return;
 const rows=data.items.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 layout(`${pageHeader('Report Issue','Report technical problems with the FuelTrans application.')}<div class="panel ft-issue-panel"><p role="status" class="notice">Drafts are private to your signed-in account. Drafts alone are <strong>not delivered to IT</strong>. Select a draft and use Submit to shared IT queue after the secured backend migration has been deployed.</p><form id="bug-form" class="form-grid"><label>Title *<input name="title" minlength="5" maxlength="160" required></label><fieldset class="ft-severity-field full"><legend>Issue severity</legend><div class="ft-severity-options">${BUG_SEVERITIES.map(x=>`<label class="ft-severity-option ft-severity-${h(x)}"><input type="radio" name="severity" value="${h(x)}" ${x==='medium'?'checked':''}><span>${h(x[0].toUpperCase()+x.slice(1))}</span></label>`).join('')}</div></fieldset><label class="full">Description *<textarea name="description" minlength="10" maxlength="6000" rows="5" required></textarea></label><label class="full">Steps to reproduce<textarea name="steps" maxlength="4000" rows="4"></textarea></label><div class="full"><button id="bug-save" type="submit">Save private issue draft</button></div></form></div><section class="panel"><h2>My saved drafts (${rows.length})</h2><div class="table-wrap"><table><thead><tr><th>Title</th><th>Severity</th><th>State</th><th>Last updated</th></tr></thead><tbody>${rows.map(x=>`<tr><td><a class="ticket-link" href="${host.base}/report-bug/${encodeURIComponent(x.id)}">${h(x.title)}</a></td><td>${h(x.severity)}</td><td>${h(x.status)}</td><td>${h(friendlyTime(x.updatedAt))}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No private bug drafts.</td></tr>'}</tbody></table></div></section>`);
 // Live submission list is distinct from private drafts. Absence of the additive schema is non-fatal here.
 const sharedSection=document.createElement('section');sharedSection.className='panel';sharedSection.id='my-shared-issues';
 sharedSection.innerHTML='<h2>My submitted IT issues</h2><p class="muted">Loading shared issue records…</p>';
 const privateTable=document.getElementById('bug-form').closest('.panel');privateTable?.parentElement?.append(sharedSection);
 void (async()=>{try{
  const shared=await readSharedIssues(state.active.workspace_id,{ownerId:state.user.id});
  if(revision!==viewRevision)return;
  sharedSection.innerHTML=`<h2>My submitted IT issues (${shared.length})</h2><div class="table-wrap"><table><thead><tr><th>Title</th><th>Severity</th><th>IT status</th><th>Submitted</th></tr></thead><tbody>${shared.map(issue=>`<tr><td>${h(issue.title)}</td><td>${h(issue.severity)}</td><td>${h(issue.status)}</td><td>${h(friendlyTime(issue.created_at))}</td></tr>`).join('')||'<tr><td colspan="4">No shared issues submitted.</td></tr>'}</tbody></table></div>`;
 }catch(e){if(revision===viewRevision)sharedSection.innerHTML=`<h2>My submitted IT issues</h2><p class="muted">Shared issue storage unavailable. Private drafts still work. ${h(e.message)}</p>`;}})();
 document.getElementById('bug-form').onsubmit=async e=>{
  e.preventDefault();if(state.busy)return;
  state.busy=true;const button=document.getElementById('bug-save');button.disabled=true;
  try{const ws=state.active.workspace_id,uid=state.user.id;const valid=validateBugDraft(Object.fromEntries(new FormData(e.currentTarget)));const latest=await loadMyBugDrafts();if(ws!==state.active?.workspace_id||uid!==state.user?.id)throw Error('Workspace or user changed; retry.');if(latest.items.length>=200)throw Error('Private draft storage limit reached.');const id=crypto.randomUUID();const now=new Date().toISOString();const bug=makeBugDraft(valid,state.user,now,id);await saveBugDraftState(ws,uid,latest.revision,[...latest.items,bug]);location.hash=`report-bug/${id}`;await go(`report-bug/${id}`);say('Private bug draft saved. Not delivered to IT.');}catch(e){say(e.message);}finally{state.busy=false;if(button.isConnected)button.disabled=false;}
 };
}
async function bugReportDetail(id,revision){
 if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid bug report reference.');
 const data=await loadMyBugDrafts();if(revision!==viewRevision)return;
 const item=findBug(data.items,id);
 if(!item){layout(`<a href="${host.base}/report-bug">← Bug reports</a><section class="error-panel"><h2>Draft not found</h2><p>No accessible personal draft matches this ID.</p></section>`);return;}
 layout(`<a class="back-link" href="${host.base}/report-bug">← My bug drafts</a>${pageHeader(item.title,'Private issue draft')}<section class="panel"><p role="status" class="notice">This draft copy remains private until you explicitly submit it to IT. Submitted reports are listed on the Report Bug page.</p><div class="info-row"><span>Severity</span><strong>${h(item.severity)}</strong></div><div class="info-row"><span>Created</span><strong>${h(friendlyTime(item.createdAt))}</strong></div><div class="info-row"><span>Updated</span><strong>${h(friendlyTime(item.updatedAt))}</strong></div><h2>Description</h2><p class="description">${h(item.description)}</p><h2>Steps to reproduce</h2><p class="description">${h(item.steps||'Not provided')}</p><button id="bug-submit-it">Submit to shared IT queue</button> <button class="secondary" id="bug-delete">Delete my private draft</button></section>`);
 document.getElementById('bug-submit-it').onclick=async()=>{
  const button=document.getElementById('bug-submit-it');button.disabled=true;
  try{
   const ws=state.active.workspace_id,uid=state.user.id;
   const current=await loadMyBugDrafts();const draft=findBug(current.items,id);
   if(!draft||draft.createdBy!==uid||state.active?.workspace_id!==ws)throw Error('Private draft or workspace changed.');
   const submitted=await submitSharedIssue({workspaceId:ws,sourceDraftId:draft.id,title:draft.title,description:draft.description,steps:draft.steps||'',severity:draft.severity});
   say(`Shared IT report submitted (${submitted.id}). Open Report Bug to review its status.`);
  }catch(e){say(e.message);}finally{if(button.isConnected)button.disabled=!pendingUncertainTicket;}
 };
 document.getElementById('bug-delete').onclick=async()=>{
  if(!confirm('Permanently delete this private draft?'))return;
  const btn=document.getElementById('bug-delete');btn.disabled=true;
  try{const ws=state.active.workspace_id,uid=state.user.id;const latest=await loadMyBugDrafts();if(ws!==state.active?.workspace_id||uid!==state.user?.id)throw Error('Workspace or user changed; retry.');if(!findBug(latest.items,id))throw Error('Draft not found or changed.');await saveBugDraftState(ws,uid,latest.revision,latest.items.filter(x=>x.id!==id));location.hash='report-bug';await go('report-bug');say('Private draft deleted.');}catch(e){say(e.message);if(btn.isConnected)btn.disabled=false;}
 };
}
function logoFiles(){
 if(!mayReadAdministration(state.active))throw Error('Administrator access required.');
 layout(`${pageHeader('Logo Files','Source v0.5.0 asset catalog (read-only).')}<section class="panel"><p class="muted">External source CDN assets. Availability depends on the original provider; there is no new logo storage or administration API.</p><div class="logo-grid">${LOGO_CATALOG.map(a=>`<article class="logo-card"><strong>${h(a.name)}</strong><span>${h(a.category)} · ${h(a.file)}</span><a href="${h(a.url)}" target="_blank" rel="noopener noreferrer">Open source asset ↗</a></article>`).join('')}</div></section>`);
}
function browserDownload(filename,data,type='application/json'){
 const blob=new Blob([data],{type});const link=document.createElement('a'),url=URL.createObjectURL(blob);
 link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function disasterRecovery(){
 if(!allowRoute('disaster-recovery'))throw Error('Recovery console access denied.');
 layout(`${pageHeader('Disaster Recovery','Administrator-only read-only export.')}<section class="panel"><p role="status" class="notice">This is a client-downloaded read-only ticket snapshot, NOT continuous backup, server replication, or a tested recovery system. Restore is disabled. Export respects RLS and is limited to 10,000 records.</p><p class="muted">Treat downloaded JSON as sensitive workspace data. Store it in an encrypted, access-controlled location. A snapshot cannot guarantee consistency across concurrent content edits.</p><button type="button" id="snapshot-export">Export workspace ticket snapshot</button><p id="snapshot-progress" role="status"></p></section>`);
 document.getElementById('snapshot-export').onclick=async e=>{
  const button=e.currentTarget,notice=document.getElementById('snapshot-progress');button.disabled=true;notice.textContent='Reading authorized ticket records…';
  try{
   const ws=state.active.workspace_id;
   const snapshot=await collectReadOnlySnapshot({workspaceId:ws,readPage:readAllTicketsForSnapshot,readCount:countAllTicketsForSnapshot});
   const hash=await snapshotSha256(snapshot);
   if(state.active?.workspace_id!==ws||!allowRoute('disaster-recovery'))throw Error('Account/workspace changed; export cancelled.');
   const exportFile={snapshot,sha256:hash,hashOf:'JSON.stringify(snapshot) UTF-8 bytes'};
   browserDownload(`fueltrans-readonly-snapshot-${ws}-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(exportFile,null,2));
   notice.textContent=`Exported ${snapshot.recordCount} ticket records; SHA-256 ${hash}. No restore performed.`;
  }catch(err){notice.textContent=err.message;}finally{if(button.isConnected)button.disabled=!pendingUncertainTicket;}
 };
}

async function loadTrustedHistory(ticket,revision,page=0){
 const box=document.getElementById('trusted-history');if(!box)return;
 if(!Number.isSafeInteger(page)||page<0)return;
 box.setAttribute('aria-busy','true');
 try{
  const items=await readTrustedTicketHistory(ticket.workspace_id,ticket.id,{page});
  if(revision!==viewRevision||!box.isConnected||state.active?.workspace_id!==ticket.workspace_id||state.detail?.id!==ticket.id)return;
  const body=items.map(x=>{
   const changes=auditFieldChanges(x);
   return `<li><strong>${h(x.event_type||'ticket.updated')}</strong><span>${h(friendlyTime(x.recorded_at))}</span><p>Actor: ${h(auditActorLabel(x))}</p>${changes.length?`<dl class="audit-diff">${changes.map(c=>`<div><dt>${h(c.field)}</dt><dd>${h(c.before)} → ${h(c.after)}</dd></div>`).join('')}</dl>`:''}</li>`;
  }).join('')||'<li>No server-recorded events on this page.</li>';
  box.innerHTML=`<h2>Server-recorded ticket history</h2><p class="muted">PostgreSQL-triggered, read-only history. Events recorded since Checkpoint 10 deployment; older ticket actions are not retrospectively reconstructed.</p><ol class="activity-list">${body}</ol><div class="pager"><button type="button" class="secondary" id="audit-prev" ${page===0?'disabled':''}>← Newer events</button><span>Page ${page+1}</span><button type="button" class="secondary" id="audit-next" ${items.length<40?'disabled':''}>Older events →</button></div>`;
  document.getElementById('audit-prev').onclick=()=>loadTrustedHistory(ticket,revision,page-1);
  document.getElementById('audit-next').onclick=()=>loadTrustedHistory(ticket,revision,page+1);
 }catch(err){if(revision===viewRevision&&box.isConnected)box.innerHTML=`<h2>Server-recorded ticket history</h2><p role="alert">Unable to read server history: ${h(err.message)}</p><button id="audit-retry" type="button" class="secondary">Retry</button>`;
  const retry=box.querySelector('#audit-retry');if(retry)retry.onclick=()=>loadTrustedHistory(ticket,revision,page);
 }finally{if(revision===viewRevision&&box.isConnected)box.removeAttribute('aria-busy');}
}
async function sharedIssueQueue(revision){
 if(!mayReadAdministration(state.active))throw Error('Only administrators can triage shared IT issues.');
 const ws=state.active.workspace_id;
 let issues;
 try { issues=await readSharedIssues(ws,{page:state.issuePage}); }
 catch(error){
  if(!missingSharedIssueSchema(error))throw error;
  if(revision!==viewRevision)return;
  layout(`${pageHeader('IT Issue Queue','Backend schema configuration required.')}<section class="panel"><h2>Shared issue backend unavailable</h2><p role="alert">The FuelTrans shared IT issue table is missing from the Supabase Data API schema. Private drafts remain available. No submission or triage changes were made.</p><p class="muted">A database administrator must verify and install the checkpoint issue-queue migration, then reload the PostgREST schema. Refresh this view afterward.</p><button id="issue-retry" type="button">Retry IT Issue Queue</button></section>`);
  document.getElementById('issue-retry').onclick=()=>go('it-issues');
  return;
 }
 if(revision!==viewRevision)return;
 layout(`${pageHeader('IT Issue Queue','Shared submitted reports (administrator triage).')}<section class="panel"><p class="muted">Server-stored IT submissions, separate from private drafts. Page ${state.issuePage+1} (50 records per page). No attachments or messages have been migrated yet.</p><div class="table-wrap"><table><thead><tr><th>Title / Description</th><th>Severity</th><th>Submitted</th><th>Status</th><th>Triage</th></tr></thead><tbody>${issues.map(x=>`<tr><td><strong>${h(x.title)}</strong><small>${h(x.description.slice(0,240))}</small></td><td>${h(x.severity)}</td><td>${h(friendlyTime(x.created_at))}</td><td>${h(x.status)}</td><td><form class="issue-triage" data-issue="${h(x.id)}"><select name="status" aria-label="Change IT issue status">${BUG_STATUSES.map(s=>`<option ${s===x.status?'selected':''}>${h(s)}</option>`).join('')}</select><label class="triage-note-label">Internal triage note<textarea name="triage_note" maxlength="4000" rows="3">${h(x.triage_note||'')}</textarea></label><button type="submit">Save</button></form></td></tr>`).join('')||'<tr><td colspan="5">No submitted IT issues.</td></tr>'}</tbody></table></div><div class="pager"><button type="button" class="secondary" id="issues-prev" ${state.issuePage===0?'disabled':''}>← Previous</button><span>Page ${state.issuePage+1}</span><button type="button" class="secondary" id="issues-next" ${issues.length<50?'disabled':''}>Next →</button></div></section>`);
 document.getElementById('issues-prev').onclick=()=>{state.issuePage=Math.max(0,state.issuePage-1);go('it-issues');};
 document.getElementById('issues-next').onclick=()=>{state.issuePage++;go('it-issues');};
 for(const form of document.querySelectorAll('.issue-triage'))form.onsubmit=async e=>{
  e.preventDefault();if(state.busy)return;const issue=issues.find(x=>x.id===form.dataset.issue);if(!issue)return;
  state.busy=true;const button=form.querySelector('button');button.disabled=true;
  try{if(state.active?.workspace_id!==ws)throw Error('Workspace changed.');const admin=await readFreshFuelTransMembership(ws,state.user.id);if(!mayReadAdministration(admin))throw Error('Administrator authorization is no longer active.');await triageSharedIssue({workspaceId:ws,id:issue.id,expectedUpdatedAt:issue.updated_at,status:form.elements.status.value,triageNote:String(form.elements.triage_note.value)});await go('it-issues');say('IT issue triage saved.');}
  catch(error){say(error.message);}finally{state.busy=false;if(button.isConnected)button.disabled=false;}
 };
}
function routeChanged(){if(state.active){let route=currentHash();if(!allowRoute(route)){location.hash='dashboard';return;}const notice=postCreateNotice;postCreateNotice=null;if(notice&&route===`ticket/${notice.ticketId}`){state.notice=notice.message;go(route,{preserveNotice:true});}else go(route);}}
bootstrap();
return ()=>{disposed=true;root.removeEventListener('apsyntra:refresh',refreshFromHost);dirtyControlTracker.dispose();++viewRevision;state.active=null;clearInterval(heartbeat);clearTimeout(autoRefreshHandle25);root.replaceChildren();};
}

