/** CP-WS-01A — signed-workspace shell, read-only until backend lifecycle activation.
 * Design reference: workspace selector, browse, search, owner/member filters and
 * create dialog. No independent auth, fabricated workspaces or browser persistence.
 * All workspace records presented here come from the signed access context.
 */
import {validUuid} from './data.js';

export const WS01_DISCOVERY_ENABLED=false;
export const WS01_CREATION_ENABLED=true;
export const WS01_SWITCHING_ENABLED=false;
// Invitation delivery requires the separately gated CP-WS-02D backend.
export const WS02_INVITATIONS_ENABLED=false;
const INVITE_ROLES=new Set(['admin','member','viewer']);
const TABS=new Set(['all','recent','owner','member','collaborator']);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const workspaceFromSignedContext=({id,name}={})=>
 validUuid(id)&&typeof name==='string'&&name.trim()?
  Object.freeze({id,name:name.trim().slice(0,120),relation:'member',
   active:true,verifiedScope:'SIGNED_CURRENT_ONLY'}):null;
export function workspaceCatalog(current){
 const row=workspaceFromSignedContext(current);
 return Object.freeze({
  status:row?'CURRENT_WORKSPACE_ONLY':'UNAVAILABLE',
  rows:row?Object.freeze([row]):Object.freeze([]),
  canCreate:false,canSwitch:false,canDiscoverAll:false
 });
}
/** Strict parser for a future separately approved signed wm_ws01_list RPC.
 * Do not run this RPC until its production grant is approved and verified. */
export function normalizeServerWorkspaceCatalog(raw,{userId,workspaceId}={}){
 const rows=raw?.rows;
 const safe=Array.isArray(rows)&&rows.length>0&&rows.length<=100&&
  raw?.schemaVersion===1&&validUuid(userId)&&validUuid(workspaceId)&&
  raw.userId===userId&&raw.activeWorkspaceId===workspaceId;
 if(!safe)return {status:'INVALID',rows:[],canCreate:false,canSwitch:false,canDiscoverAll:false};
 const seen=new Set();
 const normalized=[];
 for(const row of rows){
  if(!validUuid(row?.id)||seen.has(row.id)||
    typeof row.name!=='string'||!row.name.trim()||row.name.length>120||
    !['owner','member','collaborator'].includes(row.relation)||
    !['open','closed'].includes(row.privacy)||typeof row.active!=='boolean'||
    row.active!==(row.id===workspaceId))
   return {status:'INVALID',rows:[],canCreate:false,canSwitch:false,canDiscoverAll:false};
  seen.add(row.id);
  normalized.push(Object.freeze({id:row.id,name:row.name.trim(),relation:row.relation,
   privacy:row.privacy,active:row.active,verifiedScope:'SIGNED_MEMBER_RPC'}));
 }
 if(!seen.has(workspaceId))
  return {status:'INVALID',rows:[],canCreate:false,canSwitch:false,canDiscoverAll:false};
 return Object.freeze({status:'SIGNED_MEMBER_DISCOVERY',
  rows:Object.freeze(normalized),canCreate:false,canSwitch:false,canDiscoverAll:false});
}
export function visibleWorkspaces(catalog,{tab='all',query=''}={}){
 const segment=TABS.has(tab)?tab:'all';
 const term=String(query||'').trim().toLocaleLowerCase().slice(0,120);
 return (Array.isArray(catalog?.rows)?catalog.rows:[]).filter(w=>
  (w?.verifiedScope==='SIGNED_CURRENT_ONLY'||w?.verifiedScope==='SIGNED_MEMBER_RPC')&&
  validUuid(w.id)&&
  (segment==='all'||segment==='recent'&&w.active||segment===w.relation)&&
  w.name.toLocaleLowerCase().includes(term));
}
export function validateWorkspaceProposal({name,privacy}={}){
 const clean=typeof name==='string'?name.trim():'';
 if(clean.length<2||clean.length>80||
   /[\u0000-\u001F\u007F<>]/.test(clean)||
   !['open','closed'].includes(privacy))
  return {valid:false,reason:'Choose a workspace name (2–80 characters) and privacy.'};
 return {valid:true,name:clean,privacy};
}
/** Readiness UI must never imply that client validation authorizes creation.
 * CP-WS-01C/B3 requires separately approved server RPC, grants, lifecycle
 * activation and genuine signed-session acceptance. Nothing in this pure
 * assessment calls an RPC or creates a workspace.
 */
export function assessWorkspaceCreationReadiness(proposal){
 const validated=validateWorkspaceProposal(proposal);
 if(!validated.valid)return Object.freeze({
  status:'INVALID_DRAFT',canCreate:false,valid:false,
  message:validated.reason
 });
 // The currently deployed production lifecycle has no create RPC, and the
 // static client feature gate is deliberately OFF. A future enablement
 // must be tied to reviewed backend acceptance, not to this UI.
 if(!WS01_CREATION_ENABLED)return Object.freeze({
  status:'PENDING_SERVER_ACTIVATION',canCreate:false,valid:true,
  message:'Draft validated. Workspace creation requires the approved signed server lifecycle, authenticated permission grant, and production activation. No workspace was created.'
 });
 return Object.freeze({
  status:'SERVER_ACCEPTANCE_REQUIRED',canCreate:false,valid:true,
  message:'Draft validated. The server must independently authorize creation. No workspace was created.'
 });
}
/**
 * Creation transaction adapter: the checked-in UI gate is OFF until a
 * separately approved signed production RPC/grant/flag activation.
 * A submitted request ID is reused on retries to prevent duplicate writes.
 * Only a validated server receipt can be shown as a committed creation.
 * No raw error, bearer token, actor ID or workspace ID is rendered.
 */
export async function submitWorkspaceCreation({
 proposal,lifecycle,requestId,enabled=WS01_CREATION_ENABLED
}={}){
 const validated=validateWorkspaceProposal(proposal);
 if(!validated.valid)return Object.freeze({
  status:'INVALID_DRAFT',ok:false,valid:false,message:validated.reason
 });
 if(enabled!==true)return Object.freeze({
  status:'PENDING_SERVER_ACTIVATION',ok:false,valid:true,
  message:'Draft validated. Workspace creation is not authorized on the production server. No workspace was created.'
 });
 if(!validUuid(requestId)||typeof lifecycle?.create!=='function')return Object.freeze({
  status:'CLIENT_NOT_READY',ok:false,valid:true,
  message:'Creation cannot start because its signed workspace client is unavailable. No request was sent.'
 });
 try{
  const result=await lifecycle.create({
   name:validated.name,privacy:validated.privacy,requestId
  });
  if(!validUuid(result?.workspaceId)||result.relation!=='owner'||
     result.privacy!==validated.privacy||result.active!==false||
     typeof result.idempotent!=='boolean')return Object.freeze({
   status:'UNCONFIRMED',ok:false,valid:true,
   message:'The server returned an unexpected receipt. Creation is not confirmed; retry this same request or contact an administrator.'
  });
  return Object.freeze({
   status:result.idempotent?'EXISTING_REQUEST':'CREATED',
   ok:true,valid:true,
   message:result.idempotent?
    'This workspace request was already completed. You are its workspace owner; your current workspace has not changed.':
    'Workspace created successfully. You are its workspace owner. Your current workspace has not changed.',
   receipt:Object.freeze({workspaceId:result.workspaceId,
    active:false,relation:'owner',privacy:result.privacy,
    idempotent:result.idempotent})
  });
 }catch(error){
  const status=Number.isInteger(error?.status)?error.status:0;
  if(status===401)return Object.freeze({
   status:'SESSION_EXPIRED',ok:false,valid:true,
   message:'Your signed session was not verified. Sign in again before attempting workspace creation.'
  });
  if(status===403||status===404||status===503)return Object.freeze({
   status:'SERVER_DENIED',ok:false,valid:true,
   message:'The server has not authorized workspace creation for this session. No successful creation was confirmed.'
  });
  if(status===400||status===422)return Object.freeze({
   status:'SERVER_REJECTED',ok:false,valid:true,
   message:'The server rejected the workspace name or privacy settings.'
  });
  if(status===409)return Object.freeze({
   status:'REQUEST_CONFLICT',ok:false,valid:true,
   message:'This request conflicts with a prior creation attempt. Review the draft and try again with a new request.'
  });
  // Timeouts/network/5xx can occur AFTER the server committed.
  // Preserve the same request UUID for safe idempotent retry.
  return Object.freeze({
   status:'UNCONFIRMED',ok:false,valid:true,
   message:'The server did not confirm the result. Retry this unchanged draft using the same request to avoid duplicate workspaces.'
  });
 }
}
/** Validates preview-only invitation drafts; never issues or stores an invitation. */
export function validateWorkspaceInvitationDraft({emails='',role='member',message=''}={}){
 const raw=typeof emails==='string'?emails.trim():'';
 const recipients=raw.split(/[,;\n]+/).map(value=>value.trim()).filter(Boolean);
 if(!raw||!recipients.length||recipients.length>10||raw.length>1500)
  return {valid:false,reason:'Enter between 1 and 10 email addresses, separated by commas.'};
 const seen=new Set();
 for(const email of recipients){
  const canonical=email.toLowerCase();
  if(email.length>254||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))
   return {valid:false,reason:'Check the email addresses and separate each one with a comma.'};
  if(seen.has(canonical))
   return {valid:false,reason:'Remove duplicate email addresses before continuing.'};
  seen.add(canonical);
 }
 if(!INVITE_ROLES.has(role))
  return {valid:false,reason:'Choose an approved workspace invitation role.'};
 const clean=typeof message==='string'?message.trim():'';
 if(clean.length>500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean))
  return {valid:false,reason:'Keep the optional message within 500 readable characters.'};
 return Object.freeze({valid:true,recipients:Object.freeze(recipients),role,message:clean});
}
export function renderWorkspaceInviteLaunch(current,{placement='sidebar'}={}){
 const row=workspaceFromSignedContext(current);
 if(!row)return '';
 const surface=placement==='topbar'?'topbar':'sidebar';
 return '<button type="button" class="ws02-invite-launch ws02-invite-'+surface+
  '" data-action="ws02-open-invites" aria-haspopup="dialog" title="Invite to '+escape(row.name)+'">'+
  '<span aria-hidden="true" class="ws02-invite-glyph">＋</span>'+
  '<span>Invite members</span></button>';
}
export function renderWorkspaceSwitcher(current){
 const row=workspaceFromSignedContext(current);
 const title=escape(row?.name||'Workspace unavailable');
 return '<div class="workspace-switcher ws01-trigger-wrap">'+
  '<button type="button" class="ws01-switcher-button" data-action="ws01-open"'+
  ' aria-label="Browse workspace: '+title+'" aria-haspopup="dialog">'+
  '<span class="workspace-icon" aria-hidden="true">'+
   escape((row?.name||'W').slice(0,1).toUpperCase())+'</span>'+
  '<span class="sidebar-workspace-copy"><span class="workspace-name">'+title+'</span>'+
  '<span class="workspace-sub"><span class="sidebar-workspace-dot" aria-hidden="true"></span>Connected workspace</span></span>'+
  '<span class="ws01-chevron" aria-hidden="true">⌄</span></button></div>';
}
let activeOverlay=null,returnFocus=null;
export function closeWorkspacePanels(){
 const old=activeOverlay;
 activeOverlay=null;
 old?.remove();
 if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
 returnFocus=null;
}
function panel(html,kind){
 // Modal transitions retain the original invoker for focus restoration.
 activeOverlay?.remove();
 activeOverlay=null;
 const layer=document.createElement('div');
 layer.className='ws01-overlay ws01-'+kind;
 layer.innerHTML=html;
 activeOverlay=layer;
 document.body.append(layer);
 layer.addEventListener('click',e=>{
  if(e.target===layer||e.target.closest('[data-ws01-close]'))closeWorkspacePanels();
 });
 layer.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeWorkspacePanels();}
  if(e.key!=='Tab')return;
  const allowed=[...layer.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[href]')]
   .filter(el=>el.offsetParent!==null);
  if(!allowed.length)return;
  if(e.shiftKey&&document.activeElement===allowed[0]){
   e.preventDefault();allowed.at(-1).focus();
  }else if(!e.shiftKey&&document.activeElement===allowed.at(-1)){
   e.preventDefault();allowed[0].focus();
  }
 });
 return layer;
}
function rowMarkup(row){
 return '<div class="ws01-entry"><span class="ws01-entry-icon" aria-hidden="true">'+
  escape(row.name.slice(0,1).toUpperCase())+'</span><span class="ws01-entry-copy">'+
  '<strong>'+escape(row.name)+'</strong><small>'+escape(row.relation)+
  ' · '+(row.active?'Current signed workspace':'Signed member workspace')+'</small></span>'+
  '<span class="ws01-entry-badge">Active</span></div>';
}
function resultsMarkup(catalog,tab,query){
 const rows=visibleWorkspaces(catalog,{tab,query});
 return rows.length?rows.map(rowMarkup).join(''):
  '<p class="ws01-empty" role="status">No authorized workspaces match this filter.</p>';
}
function currentFootnote(){
 return '<p class="ws01-note">Only your current server-verified workspace is shown. '+
  'Account-wide discovery and switching are pending a reviewed server-side authorization contract.</p>';
}
function menuContent(catalog){
 return '<section class="ws01-menu-card" role="dialog" aria-modal="true" aria-label="Select workspace">'+
  '<header class="ws01-menu-heading"><strong>Workspaces</strong>'+
  '<button class="ws01-close" type="button" data-ws01-close aria-label="Close workspace selector">×</button></header>'+
  '<label class="ws01-sr-only" for="ws01-menu-search">Search workspaces</label>'+
  '<input id="ws01-menu-search" type="search" placeholder="Search workspaces" autocomplete="off" maxlength="120"/>'+
  '<p class="ws01-eyebrow">Recent workspaces</p>'+
  '<div data-ws01-results>'+resultsMarkup(catalog,'recent','')+'</div>'+
  '<div class="ws01-menu-actions"><button type="button" data-ws01-action="browse">Browse all</button>'+
  '<button type="button" data-ws01-action="create">Add workspace</button>'+
  '<button type="button" data-ws01-action="invite">Invite members</button></div>'+
  currentFootnote()+'</section>';
}
function openMenu(catalog,options={}){
 const layer=panel(menuContent(catalog),'menu');
 const input=layer.querySelector('#ws01-menu-search');
 input.addEventListener('input',()=>{layer.querySelector('[data-ws01-results]').innerHTML=
  resultsMarkup(catalog,'recent',input.value);});
 layer.addEventListener('click',event=>{
  const command=event.target.closest('[data-ws01-action]')?.dataset.ws01Action;
  if(command==='browse')openBrowse(catalog,options);
  if(command==='create')openCreate(catalog,options);
  if(command==='invite')openInvites(catalog.rows[0]);
 });
 input.focus();
}
function browseContent(catalog){
 const tabs=[['all','All workspaces'],['recent','Recent workspaces'],
  ['owner','Owner'],['member','Member'],['collaborator','Collaborator']];
 return '<section class="ws01-browser-card" role="dialog" aria-modal="true"'+
  ' aria-labelledby="ws01-browser-title"><header class="ws01-browser-top">'+
  '<h2 id="ws01-browser-title">Browse all workspaces</h2>'+
  '<label class="ws01-sr-only" for="ws01-browser-search">Search authorized workspaces</label>'+
  '<input id="ws01-browser-search" type="search" placeholder="Search for a workspace" maxlength="120"/>'+
  '<button type="button" class="ws01-close" data-ws01-close aria-label="Close browse workspaces">×</button></header>'+
  '<div class="ws01-browser-body"><nav class="ws01-browser-tabs" aria-label="Workspace categories">'+
  tabs.map(([id,label])=>'<button type="button" data-ws01-filter="'+id+
   '" aria-pressed="'+(id==='all')+'">'+escape(label)+'</button>').join('')+
  '<button type="button" data-ws01-action="create" class="ws01-add-button">+ Add workspace</button></nav>'+
  '<div class="ws01-browser-results"><h3 data-ws01-title>All workspaces</h3>'+
  '<div data-ws01-results class="ws01-browser-grid">'+resultsMarkup(catalog,'all','')+'</div>'+
  currentFootnote()+'</div></div></section>';
}
function openBrowse(catalog,options={}){
 const layer=panel(browseContent(catalog),'browse');
 let tab='all';
 const input=layer.querySelector('#ws01-browser-search');
 const redraw=()=>{
  layer.querySelector('[data-ws01-results]').innerHTML=resultsMarkup(catalog,tab,input.value);
  for(const btn of layer.querySelectorAll('[data-ws01-filter]'))
   btn.setAttribute('aria-pressed',String(btn.dataset.ws01Filter===tab));
  layer.querySelector('[data-ws01-title]').textContent={
   all:'All workspaces',recent:'Recent workspaces',owner:'Workspaces owned by me',
   member:'Workspaces I am a member of',collaborator:'Workspaces I collaborate in'
  }[tab];
 };
 input.addEventListener('input',redraw);
 layer.addEventListener('click',event=>{
  const filter=event.target.closest('[data-ws01-filter]')?.dataset.ws01Filter;
  if(TABS.has(filter)){tab=filter;redraw();}
  if(event.target.closest('[data-ws01-action="create"]'))openCreate(catalog,options);
 });
 input.focus();
}
function createContent({enabled=WS01_CREATION_ENABLED}={}){
 const active=enabled===true;
 return '<section class="ws01-create-card" role="dialog" aria-modal="true"'+
  ' aria-labelledby="ws01-create-title" aria-describedby="ws01-create-description">'+
  '<header class="ws01-create-heading"><div><h2 id="ws01-create-title">Add new workspace</h2>'+
  '<p class="ws01-create-subtitle" id="ws01-create-description">'+
   (active?'Create a workspace with your existing verified account. New workspaces are not automatically selected.':
    'Workspace creation is not activated. You can validate a draft, but nothing will be saved.')+
   '</p></div>'+
  '<button type="button" class="ws01-close" data-ws01-close aria-label="Close create workspace">×</button></header>'+
  '<div class="ws01-create-symbol" aria-hidden="true">N</div>'+
  '<form id="ws01-proposal" novalidate>'+
  '<label for="ws01-name">Workspace name</label>'+
  '<input id="ws01-name" type="text" name="name" maxlength="80" minlength="2"'+
   ' autocomplete="off" spellcheck="false" required placeholder="New Workspace"'+
   ' aria-describedby="ws01-name-hint"/>'+
  '<p id="ws01-name-hint" class="ws01-field-hint">2–80 characters.'+(active?'':' Draft only.')+'</p>'+
  '<fieldset><legend>Workspace privacy</legend>'+
   '<label><input type="radio" name="privacy" value="closed" checked/> Closed</label>'+
   '<label><input type="radio" name="privacy" value="open"/> Open</label></fieldset>'+
  '<p class="ws01-create-safety">Closed is selected by default. Open is workspace metadata only; '+
   'it does not permit unrestricted discovery, joining or access. Server-enforced membership '+
   'and workspace isolation remain mandatory.</p>'+
  '<p class="ws01-create-state">'+(active?
   'Creation requires a valid signed session and explicit server authorization.':
   'Creation unavailable — pending authorized backend activation.')+'</p>'+
  '<p class="ws01-form-feedback" role="status" aria-live="polite" aria-atomic="true"></p>'+
  '<footer class="ws01-create-footer">'+
   '<button type="button" class="ws01-create-cancel" data-ws01-close>Cancel</button>'+
   '<button type="submit" class="ws01-primary">'+(active?'Create workspace':'Validate draft')+'</button>'+
  '</footer></form></section>';
}
function openCreate(catalog,{lifecycle}={}){
 const enabled=WS01_CREATION_ENABLED&&typeof lifecycle?.create==='function';
 const layer=panel(createContent({enabled}),'create');
 const form=layer.querySelector('#ws01-proposal');
 const feedback=layer.querySelector('.ws01-form-feedback');
 const field=form.querySelector('#ws01-name');
 const submit=form.querySelector('button[type="submit"]');
 let busy=false,completed=false,requestId=null,requestDraft=null;
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||completed)return;
  const values=new FormData(form);
  const proposal={name:values.get('name'),privacy:values.get('privacy')};
  if(!enabled){
   const assessed=assessWorkspaceCreationReadiness(proposal);
   feedback.textContent=assessed.message;
   feedback.dataset.status=assessed.status;
   field.setAttribute('aria-invalid',String(!assessed.valid));
   return;
  }
  const validated=validateWorkspaceProposal(proposal);
  if(!validated.valid){
   feedback.textContent=validated.reason;
   feedback.dataset.status='INVALID_DRAFT';
   field.setAttribute('aria-invalid','true');
   return;
  }
  const fingerprint=JSON.stringify([validated.name,validated.privacy]);
  if(requestDraft!==fingerprint){
   requestId=null;requestDraft=fingerprint;
  }
  if(!requestId){
   const generated=globalThis.crypto?.randomUUID?.();
   if(!validUuid(generated)){
    feedback.textContent='Secure request identifiers are unavailable. Creation was not attempted.';
    feedback.dataset.status='CLIENT_NOT_READY';
    return;
   }
   requestId=generated;
  }
  busy=true;submit.disabled=true;field.disabled=true;
  for(const radio of form.querySelectorAll('input[name="privacy"]'))radio.disabled=true;
  feedback.textContent='Requesting signed server authorization…';
  feedback.dataset.status='PENDING';
  let result;
  try{
   result=await submitWorkspaceCreation({proposal:validated,
    lifecycle,requestId,enabled});
  }finally{
   busy=false;
   if(activeOverlay===layer&&layer.isConnected){
    submit.disabled=false;field.disabled=false;
    for(const radio of form.querySelectorAll('input[name="privacy"]'))radio.disabled=false;
   }
  }
  if(activeOverlay!==layer||!layer.isConnected)return;
  feedback.textContent=result.message;
  feedback.dataset.status=result.status;
  field.setAttribute('aria-invalid',String(!result.valid));
  if(result.ok){
   completed=true;submit.disabled=true;
   field.disabled=true;
   for(const radio of form.querySelectorAll('input[name="privacy"]'))radio.disabled=true;
   submit.textContent='Created';
  }else if(result.status==='REQUEST_CONFLICT'){
   requestId=null;requestDraft=null;
  }
 });
 form.addEventListener('input',()=>{
  if(busy||completed)return;
  feedback.textContent='';
  delete feedback.dataset.status;
  field.removeAttribute('aria-invalid');
 });
 field.focus();
}
function inviteContent(current){
 const title=escape(current.name);
 return '<section class="ws02-invite-card" role="dialog" aria-modal="true"'+
  ' aria-labelledby="ws02-invite-title" aria-describedby="ws02-invite-description">'+
  '<header class="ws02-invite-heading"><div><p class="ws02-eyebrow">Workspace collaboration</p>'+
  '<h2 id="ws02-invite-title">Invite to '+title+'</h2></div>'+
  '<button type="button" data-ws01-close aria-label="Close invitations">×</button></header>'+
  '<p id="ws02-invite-description" class="ws02-invite-subtitle">Invite collaborators to this workspace. '+
  'Roles below apply only within this workspace, never to the entire APSYNTRA CRM platform.</p>'+
  '<form id="ws02-invite-preview" novalidate>'+
  '<div class="ws02-invite-fields"><div class="ws02-invite-addresses">'+
  '<label for="ws02-invite-emails">Invite with email</label>'+
  '<textarea id="ws02-invite-emails" name="emails" rows="2" maxlength="1500" '+
   'placeholder="name@example.com, colleague@example.com" autocomplete="off" required></textarea>'+
  '<small>Enter up to 10 email addresses, separated by commas.</small></div>'+
  '<div class="ws02-invite-role"><label for="ws02-invite-role">Workspace role</label>'+
  '<select id="ws02-invite-role" name="role">'+
  '<option value="member" selected>Member</option>'+
  '<option value="admin">Admin</option>'+
  '<option value="viewer">Viewer</option></select>'+
  '<small data-ws02-role-description>Collaborate within assigned workspace permissions.</small></div></div>'+
  '<label for="ws02-invite-message">Add a custom message <span>(optional)</span></label>'+
  '<textarea name="message" id="ws02-invite-message" rows="3" maxlength="500"'+
  ' placeholder="Tell your team what they will work on together"></textarea>'+
  '<div class="ws02-invite-context"><span>Suggested context</span><div role="group" aria-label="Message suggestions">'+
  '<button type="button" data-ws02-context="work">Track and manage work</button>'+
  '<button type="button" data-ws02-context="team">Collaborate with your team</button>'+
  '<button type="button" data-ws02-context="project">Coordinate a project</button></div></div>'+
  '<p class="ws02-invite-safety">Invitation sending is not activated yet. Only authorized workspace owners '+
  'or delegated workspace administrators will be able to send invitations after '+
  'the signed server-side invitation and role contracts pass acceptance.</p>'+
  '<p class="ws02-invite-feedback" role="status" aria-live="polite"></p>'+
  '<footer class="ws02-invite-footer">'+
  '<button type="button" class="ws02-secondary" data-ws01-close>Cancel</button>'+
  '<button type="submit" class="ws02-secondary">Review invitation</button>'+
  '<button type="button" class="ws02-send" disabled aria-describedby="ws02-invite-description">'+
  'Send invites — pending activation</button></footer></form></section>';
}
function openInvites(current){
 const row=workspaceFromSignedContext(current);
 if(!row)return;
 const layer=panel(inviteContent(row),'invite');
 const form=layer.querySelector('#ws02-invite-preview');
 const description=layer.querySelector('[data-ws02-role-description]');
 const messages={
  admin:'Workspace administration preview only; cannot change platform roles.',
  member:'Collaborate within assigned workspace permissions.',
  viewer:'Read-only workspace access after server-side permission enforcement.'
 };
 const contexts={
  work:'Join us to track and manage work in our workspace.',
  team:'Join our workspace to collaborate with the team.',
  project:'Join our workspace to coordinate the project together.'
 };
 form.querySelector('#ws02-invite-role').addEventListener('change',event=>{
  description.textContent=messages[event.target.value]||'Unknown workspace role.';
 });
 form.addEventListener('click',event=>{
  const key=event.target.closest('[data-ws02-context]')?.dataset.ws02Context;
  if(key&&Object.hasOwn(contexts,key)){
   const field=form.querySelector('#ws02-invite-message');
   field.value=contexts[key];field.focus();
  }
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const data=new FormData(form);
  const result=validateWorkspaceInvitationDraft({
   emails:data.get('emails'),role:data.get('role'),message:data.get('message')
  });
  form.querySelector('.ws02-invite-feedback').textContent=!result.valid?result.reason:
   result.recipients.length+' recipient(s) validated for the '+result.role+
   ' workspace role. No invitations were sent. Secure invitation delivery remains pending activation.';
 });
 form.querySelector('#ws02-invite-emails').focus();
}
export function openWorkspaceInvitationDialog(current){
 const row=workspaceFromSignedContext(current);
 if(!row)return;
 returnFocus=document.activeElement;
 openInvites(row);
}
export function openWorkspaceSelector(current,options={}){
 if(activeOverlay){closeWorkspacePanels();return;}
 const catalog=workspaceCatalog(current);
 returnFocus=document.activeElement;
 openMenu(catalog,options);
}
