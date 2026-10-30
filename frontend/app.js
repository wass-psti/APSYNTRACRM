import {AuthClient,ApiError} from './session.js';
import {DomainApi,validUuid} from './data.js';
import {APP_NAME} from './config.js';
import {runReadOnlyAcceptance,summarizeAcceptance} from './acceptance.js';

const root=document.getElementById('app');
const auth=new AuthClient();
const db=new DomainApi(auth);
const state={context:null,user:null,boards:[],archived:[],showArchived:false,board:null,issues:[],edit:false,
  view:'overview',boardId:null,tab:'items',loading:false,loadingIssues:false,filter:'',error:null,authBusy:false,acceptance:null,acceptanceBusy:false};
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
 <div class="auth-left"><a href="#/login" class="brand"><span class="brand-mark">A</span><span>APSYNTRA <span style="font-weight:500">CRM</span></span></a>
 <section class="auth-panel"><span class="eyebrow">Your connected workspace</span>
 <h1>Welcome back<span style="color:#6868e9">.</span></h1>
 <p class="muted">Sign in with your existing WatchdogWorkspace account to manage boards, collaborate, and stay on top of every detail.</p>
 ${message?`<div class="login-error" role="alert">${e(message)}</div>`:''}
 <form id="login-form"><div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" placeholder="you@company.com" autocomplete="username" required autofocus/></div>
 <div class="field"><label for="password">Password</label><div class="password-wrap"><input id="password" name="password" type="password" placeholder="Enter your password" autocomplete="current-password" required minlength="1"/><button type="button" class="eye-btn" data-action="toggle-password">Show</button></div></div>
 <button class="primary wide" type="submit" id="login-submit">Sign in to workspace <span aria-hidden="true">→</span></button></form>
 <p style="text-align:center;color:#a0a5b6;font-size:12px;margin:27px 0 0">Access is managed by your organization. No new account is created.</p></section>
 <div class="auth-bottom">© ${new Date().getFullYear()} APSYNTRA CRM · Secured by Supabase Authentication</div></div>
 <div class="auth-right"><section class="auth-pitch"><span class="eyebrow" style="color:#c5c9ff">Built for better work</span>
 <h2>One workspace.<br/>Every possibility.</h2><p>Bring work, tasks, and conversations together in a single, beautifully organized platform.</p>
 <div class="preview"><div class="preview-top"><span class="dot" style="background:#ff999e"></span><span class="dot" style="background:#ffd78f"></span><span class="dot" style="background:#96e4bb"></span><strong style="font-size:11px;margin-left:12px">Your team workspace</strong></div>
 <div class="preview-body"><div style="font-size:14px;font-weight:800;margin:2px 0 15px">Project overview</div>
 <div class="preview-row"><span style="width:13px;height:13px;border-radius:4px;background:#a6a0f4"></span><b style="flex:1">Plan upcoming activities</b><span class="preview-status">Done</span></div>
 <div class="preview-row"><span style="width:13px;height:13px;border-radius:4px;background:#f1bc95"></span><b style="flex:1">Review team assignments</b><span class="preview-status" style="background:#fff0dd;color:#e4a451">In progress</span></div>
 <div class="preview-row"><span style="width:13px;height:13px;border-radius:4px;background:#b1d9f4"></span><b style="flex:1">Monitor active requests</b><span class="preview-status" style="background:#ebedff;color:#7470e0">Planned</span></div>
 <div class="preview-line" style="width:79%"></div><div class="preview-line" style="width:51%;margin-bottom:3px"></div></div></div></section></div></div>`;
}
function sidebar(){
 const currentBoard=state.boardId;
 return `<aside class="sidebar">
   <a href="#/overview" class="brand"><span class="brand-mark">A</span><span class="brand-text">APSYNTRA <span style="font-weight:500">CRM</span></span></a>
   <div class="workspace-switcher"><div class="workspace-icon">W</div><div><div class="workspace-name">${e(workspaceName())}</div><div class="workspace-sub">Connected workspace</div></div></div>
   <div class="side-section">Workspace</div>
   <nav class="nav-list" aria-label="Primary">
     <a class="nav-link ${state.view==='overview'?'active':''}" href="#/overview"><span class="nav-ico">◫</span><span class="nav-label">Overview</span></a>
     <a class="nav-link ${state.view==='boards'?'active':''}" href="#/boards"><span class="nav-ico">▤</span><span class="nav-label">My boards</span><span class="nav-count">${state.boards.length}</span></a>
     <a class="nav-link ${state.view==='settings'?'active':''}" href="#/settings"><span class="nav-ico">⚙</span><span class="nav-label">Settings</span></a>
   </nav>
   <div class="side-section">Recent boards</div>
   <nav class="nav-list" aria-label="Recent boards">${state.boards.slice(0,6).map((b,i)=>`<a class="nav-link ${currentBoard===b.id?'active':''}" href="#/boards/${e(b.id)}"><span class="nav-ico" style="color:#6d71da">▦</span><span class="nav-label">${e(b.name)}</span></a>`).join('')||'<div class="muted" style="padding:12px;font-size:11px">No boards yet</div>'}</nav>
   <div class="side-bottom"><div class="profile"><span class="avatar">${e(initials(name()))}</span>
   <div><div class="name">${e(name())}</div><div class="role">${e(state.context?.profile?.platform_role||'Team member')}</div></div></div>
   <button class="sign-out" data-action="logout">⇥ <span>Sign out of workspace</span></button></div></aside>`;
}
function shell(body){
 const crumb=state.view==='board'?state.board?.board?.name||'Board':state.view==='overview'?'Overview':state.view==='boards'?'My boards':'Settings';
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
 <div class="stat-card"><span class="stat-icon orange">◷</span><div class="stat-label">Workspace status</div><div class="stat-value" style="font-size:20px;margin-top:21px">Active</div><div class="stat-footer">Access context verified</div></div>
 <div class="stat-card"><span class="stat-icon pink">♢</span><div class="stat-label">Your access</div><div class="stat-value" style="font-size:18px;margin-top:23px;text-transform:capitalize">${e(state.context?.profile?.platform_role||'Member')}</div><div class="stat-footer">Authoritative account role</div></div></section>
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
 return `<div class="panel"><div class="table-scroll"><table class="board-table"><thead><tr><th style="width:35%">Item name</th><th>Status</th><th>Owner</th><th>Due date</th><th></th></tr></thead>
 <tbody>${items.map(item=>`<tr data-searchable="${e((item.title||'').toLowerCase())}">
 <td>▥ &nbsp; ${e(item.title||'Untitled')}</td><td><span class="status ${statusClass(item.status)}">${e(item.status||'Planned')}</span></td>
 <td>${item.assignee_id?e(String(item.assignee_id).slice(0,8))+'…':'Unassigned'}</td><td>${e(displayDate(item.due_date))}</td>
 <td>${allowEdit?`<button class="icon-button" data-action="edit-item" data-id="${e(item.id)}" title="Edit item">✎ Edit</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:#a4aabc;padding:24px">No items in this group yet</td></tr>'}</tbody></table></div></div>`;
}
function issuesPage(){
 if(state.loadingIssues)return '<div class="panel">'+empty('Loading issues','Checking permitted Issue records…')+'</div>';
 const rows=state.issues;
 const canEdit=state.edit;
 return `<div class="toolbar"><div class="search-wrap"><input class="search-input" aria-label="Search issues" placeholder="Search issues…" /></div>
 ${canEdit?'<button class="primary" data-action="new-issue">＋ New issue</button>':''}</div>
 ${rows.length?`<div class="issue-cards">${rows.map(row=>{const s=row.payload?.snapshot||{};
 const priority=Number(s.priority??0);return `<article class="issue-row" data-searchable="${e((s.title||'').toLowerCase())}">
 <div><h3>${e(s.title||'Untitled issue')}</h3><small>Revision ${e(row.revision)} · ${e(displayDate(row.updated_at))}</small></div>
 <span class="status ${statusClass(String(s.status||'').split(':').pop())}">${e(String(s.status||'Todo').split(':').pop())}</span>
 <span class="priority ${priority>=4?'urgent':priority>=3?'high':''}">◆ ${['None','Low','Medium','High','Urgent'][Math.max(0,Math.min(4,priority))]}</span>
 ${canEdit?`<div class="issues-actions"><button class="icon-button" data-action="edit-issue" data-id="${e(row.document_id)}">✎ Edit</button>
 <button class="icon-button danger" data-action="remove-issue" data-id="${e(row.document_id)}">Remove</button></div>`:''}</article>`}).join('')}</div>`:
 `<div class="panel">${empty('No native issues yet','The authenticated Huly document view returned no issues for this board.',canEdit?'<button class="primary" data-action="new-issue">＋ Create first issue</button>':'')}</div>`}`;
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
 <div class="tabs" role="tablist"><a class="tab ${state.tab==='items'?'active':''}" href="#/boards/${e(b.id)}">▤ Board items <span style="opacity:.5">(${items.length})</span></a>
 <a class="tab ${state.tab==='issues'?'active':''}" href="#/boards/${e(b.id)}/issues">◇ Huly Issues <span style="opacity:.5">(${state.issues.length})</span></a></div>
 ${state.tab==='issues'?issuesPage():`
 <div class="toolbar"><div class="search-wrap"><input class="search-input" aria-label="Search items" placeholder="Filter items…" /></div>
 ${state.edit?'<button class="secondary" data-action="new-group">＋ Add group</button>':''}</div>
 ${groups.length?groups.map(g=>`<div class="group-heading"><h3>${e(g.title||'Group')}</h3><small>${items.filter(i=>i.group_id===g.id).length} items</small></div>
 ${groupRows(items.filter(i=>i.group_id===g.id),state.edit)}`).join(''):
 `<div class="panel">${empty('Your board is ready','Create a group to start adding and organizing items.',state.edit?'<button class="primary" data-action="new-group">＋ Add your first group</button>':'')}</div>`}
 ${items.filter(i=>!groups.some(g=>g.id===i.group_id)).length?`<div class="group-heading"><h3>Ungrouped</h3></div>${groupRows(items.filter(i=>!groups.some(g=>g.id===i.group_id)),state.edit)}`:''}`}`;
}
function settingsPage(){
 const p=state.context.profile;
 return `<div class="page-head"><div><span class="label-top">Workspace / Account</span><h1>Account & security</h1><p>Your verified user identity and session preferences.</p></div></div>
 <div class="settings-grid"><section class="panel"><div class="panel-header"><h3>Profile information</h3><span>Supabase Auth</span></div>
 <div class="panel-body"><div class="profile"><span class="avatar" style="height:53px;width:53px;font-size:17px">${e(initials(name()))}</span>
 <div><div class="name" style="font-size:15px">${e(name())}</div><div class="role">${e(p.platform_role||'Member')}</div></div></div>
 <div class="settings-detail"><label>Work email</label><strong>${e(p.email||state.user?.email||'Not available')}</strong></div>
 <div class="settings-detail"><label>Account status</label><strong><span class="status done">${e(p.status)}</span></strong></div>
 <div class="settings-detail"><label>Workspace</label><strong>${e(workspaceName())}</strong></div>
 <div class="settings-detail"><label>User identifier</label><strong style="font-family:ui-monospace,monospace;font-size:11px">${e(state.context.user_id)}</strong></div></div></section>
 <section class="panel"><div class="panel-header"><h3>Session security</h3><span class="online-dot"></span></div>
 <div class="panel-body"><p class="muted" style="font-size:12px;margin:0 0 19px">Your login uses the existing Supabase Auth project. Your session refreshes automatically and is kept in this browser tab.</p>
 <div class="note">The application never requires a database password or privileged backend key. Permissions are enforced by the existing workspace RPCs and row-level security.</div>
 <div class="settings-detail"><label>Authentication</label><strong>Signed in and verified</strong></div>
 <div style="display:flex;flex-wrap:wrap;gap:9px;margin:24px 0 15px">
 <button class="secondary" data-action="copy-token">⎘ Copy short-lived access token</button>
 <button class="secondary" data-action="logout">⇥ Sign out</button></div>
 <div class="note security-note"><b>Access token:</b> Copy only when necessary for local acceptance testing. Anyone holding it may act as your account until it expires. Never share it in chat or commit it.</div>
 <div style="border-top:1px solid #eceefa;margin-top:23px;padding-top:20px">
  <h3 style="font-size:14px;margin:0 0 7px">Signed backend verification</h3>
  <p class="muted" style="font-size:12px;margin:0 0 15px">Run read-only checks against the actual authenticated Supabase session, central board permissions, and Issue view. No token copying or database write required.</p>
  <button class="primary" data-action="verify-backend" ${state.acceptanceBusy?'disabled':''}>${state.acceptanceBusy?'Verifying…':'✓ Verify backend connection'}</button>
  ${state.acceptance ? `<div style="margin-top:17px"><div style="font-size:12px;font-weight:750;margin-bottom:8px">
  ${summarizeAcceptance(state.acceptance).passed} of ${summarizeAcceptance(state.acceptance).total} read-only checks passed</div>
  ${state.acceptance.map(check=>`<div style="border-top:1px solid #eef0f7;padding:10px 0;font-size:12px">
  <div style="display:flex;gap:9px;align-items:center"><span aria-hidden="true" style="color:${check.status==='pass'?'#24a17d':check.status==='fail'?'#d95067':'#8790a3'}">${check.status==='pass'?'✓':check.status==='fail'?'✕':'○'}</span><strong>${e(check.title)}</strong></div>
  <div style="margin:3px 0 0 22px;color:#8790a3">${e(check.detail)}</div></div>`).join('')}
  <p class="muted" style="font-size:11px;margin:12px 0 0">These checks do not certify the local 5173 host or native transaction writes.</p></div>` : ''}
 </div>
 </div></section></div>`;
}
function render(){
 if(!state.context){renderLogin();return;}
 if(state.view==='board')shell(boardPage());
 else if(state.view==='boards')shell(boardsPage());
 else if(state.view==='settings')shell(settingsPage());
 else shell(overview());
}
async function refreshWorkspace(){
 state.context=await db.context();
 state.boards=await db.boards('active');
 state.user=auth.session?.user;
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
 routeSerial++;state.boardId=null;state.board=null;state.view=parts[0]==='boards'?'boards':parts[0]==='settings'?'settings':'overview';
 if(state.view==='boards'&&state.showArchived&&!state.archived.length){try{state.archived=await db.boards('archived');}catch(err){notice(err);}}
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
 case 'logout':{await auth.signOut();state.context=null;state.boards=[];state.board=null;location.hash='#/login';renderLogin();toast('Signed out successfully.');break;}
 case 'refresh':{try{await refreshWorkspace();render();toast('Workspace refreshed.')}catch(err){notice(err);}break;}
 case 'refresh-board':{await loadBoard(state.boardId,state.tab);break;}
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
 case 'new-issue':{
   await writeGuard();
   openModal('Create a Huly issue',input('Issue title','title')+select('Status','status',statuses,statuses[0][0])+select('Priority','priority',priorities,'2'),
    async fd=>{await writeGuard();await db.createIssue(state.boardId,state.context.workspace_id,
     {title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))},state.context.user_id);
     await loadIssues();});break;
 }
 case 'edit-issue':{
   await writeGuard();const row=state.issues.find(x=>x.document_id===button.dataset.id);if(!row)return;
   const issue=row.payload.snapshot;
   openModal('Edit Huly issue',input('Title','title',issue.title)+select('Status','status',statuses,issue.status)+select('Priority','priority',priorities,String(issue.priority)),
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
auth.onExpired=()=>{state.context=null;state.boards=[];renderLogin('Session expired. Please sign in again.');};
async function boot(){
 try{
  if(await auth.restore()){
    state.user=auth.session.user;
    try{await refreshWorkspace();await onRoute();}catch(err){
      if(err instanceof ApiError&&err.status===403){
        root.innerHTML=`<div class="access-denied"><div class="denied-panel"><span class="brand-mark" style="margin:auto">A</span><h1>Workspace access unavailable</h1>
        <p>${e(errorMessage(err))} Contact your administrator to activate your existing profile or workspace membership.</p>
        <button class="secondary" data-action="logout">Sign out</button></div></div>`;
      }else{await auth.signOut();renderLogin('Your session could not be restored. Please sign in again.');}
    }
  }else renderLogin();
 }catch{renderLogin('Unable to initialize session. Please try signing in.');}
}
boot();
