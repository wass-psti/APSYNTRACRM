/** Signed workspace catalog and lifecycle interface.
 * Discovery and creation use separately authorized server contracts; selection,
 * configuration and invitation delivery retain their explicit safety boundaries.
 * No fabricated memberships, independent auth or browser-persisted scope.
 */
import {validUuid} from './data.js';
import {canCreateOrganizationalWorkspace,WS03_RESTRICTED_CREATION_ENABLED} from './workspace-authority.js';

export const WS01_DISCOVERY_ENABLED=true;
export const WS01_CREATION_ENABLED=true;
export const WS01_SWITCHING_ENABLED=true;
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
/** Strict parser for the existing signed, membership-scoped wm_ws01_list RPC.
 * Its response cannot authorize a workspace switch or direct table access. */
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
 // Validation is not a persistence grant. If creation is disabled,
 // no RPC is attempted; otherwise the signed server remains authoritative.
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
 * Creation transaction adapter: a client request requires an enabled
 * lifecycle and a separately authorized signed production RPC.
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
/** A single exact-address invitation, with no user-ID lookup or account creation.
 * Keep legacy draft parsing for its existing tests, but the issuance UI always
 * uses this one-recipient, role-ceiling-compatible contract.
 */
export function validateDirectEmailInvitation({email='',message=''}={}){
 const value=typeof email==='string'?email.trim():'';
 if(!value||/[\s,;<>]/.test(value)||value.length>254)
  return Object.freeze({valid:false,reason:'Enter one complete email address.'});
 const result=validateWorkspaceInvitationDraft({emails:value,role:'member',message});
 if(!result.valid||result.recipients.length!==1)
  return Object.freeze({valid:false,reason:result.reason||'Enter one complete email address.'});
 return Object.freeze({valid:true,email:result.recipients[0].toLowerCase(),
  role:'member',message:result.message,recipients:Object.freeze([result.recipients[0].toLowerCase()])});
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
function switchingUiReady(options={}){
 return options.switchingEnabled===true&&
  typeof options.lifecycle?.discover==='function'&&
  typeof options.lifecycle?.select==='function'&&
  typeof options.onWorkspaceSwitched==='function';
}
function rowMarkup(row,options={}){
 // Row interaction opens signed metadata, not an unauthorized workspace switch.
 return '<div class="ws01-entry"><button type="button" class="ws01-entry-button"'+
  ' data-ws01-action="details" data-ws01-workspace="'+escape(row.id)+'"'+
  ' aria-label="View details for '+escape(row.name)+'">'+
  '<span class="ws01-entry-icon" aria-hidden="true">'+
  escape(row.name.slice(0,1).toUpperCase())+'</span><span class="ws01-entry-copy">'+
  '<strong>'+escape(row.name)+'</strong><small>'+escape(row.relation)+
  ' · '+(row.active?'Current signed workspace':switchingUiReady(options)?
   'Signed member workspace · server-verified switching':'Signed member workspace · switching unavailable')+'</small></span>'+
  '<span class="ws01-entry-badge">'+(row.active?'Current':'Member')+'</span></button></div>';
}
function resultsMarkup(catalog,tab,query,options={}){
 const rows=visibleWorkspaces(catalog,{tab,query});
 return rows.length?rows.map(row=>rowMarkup(row,options)).join(''):
  '<p class="ws01-empty" role="status">No authorized workspaces match this filter.</p>';
}
/** A detail action may only resolve a row from the validated signed catalog.
 * It never changes the authoritative active workspace or expands membership. */
export function workspaceDetailsFor(catalog,workspaceId){
 if(!validUuid(workspaceId)||!['SIGNED_MEMBER_DISCOVERY','CURRENT_WORKSPACE_ONLY'].includes(catalog?.status))
  return null;
 const row=visibleWorkspaces(catalog).find(w=>w.id===workspaceId);
 return row&&((catalog.status==='SIGNED_MEMBER_DISCOVERY'&&row.verifiedScope==='SIGNED_MEMBER_RPC')||
  (catalog.status==='CURRENT_WORKSPACE_ONLY'&&row.verifiedScope==='SIGNED_CURRENT_ONLY'))?row:null;
}
/** UI handoff only: production authorization is enforced again by the signed
 * discovery RPC, the CAS selection RPC, and the lifecycle's post-write read.
 * An existing UI catalog is never sufficient authority to switch workspaces. */
export async function requestSignedWorkspaceSwitch({lifecycle,workspaceId,expectedWorkspaceId}={}){
 if(!validUuid(workspaceId)||!validUuid(expectedWorkspaceId)||
    workspaceId===expectedWorkspaceId||
    typeof lifecycle?.discover!=='function'||typeof lifecycle?.select!=='function')
  throw Error('Workspace selection prerequisites unavailable.');
 const current=await lifecycle.discover();
 if(current?.status!=='SIGNED_MEMBER_DISCOVERY'||
    current.rows?.filter(row=>row.active&&row.verifiedScope==='SIGNED_MEMBER_RPC').length!==1||
    !current.rows.some(row=>row.id===expectedWorkspaceId&&row.active===true&&
      row.verifiedScope==='SIGNED_MEMBER_RPC')||
    !current.rows.some(row=>row.id===workspaceId&&row.active===false&&
      row.verifiedScope==='SIGNED_MEMBER_RPC'))
  throw Error('Signed workspace membership changed.');
 const receipt=await lifecycle.select(workspaceId,expectedWorkspaceId);
 if(receipt?.workspaceId!==workspaceId||
    receipt?.previousWorkspaceId!==expectedWorkspaceId||receipt?.switched!==true)
  throw Error('Authoritative workspace selection could not be verified.');
 return receipt;
}
function detailsContent(row,{canSwitch=false}={}){
 const name=escape(row.name);
 return '<section class="ws01-details-card" role="dialog" aria-modal="true"'+
  ' aria-labelledby="ws01-details-title">'+
  '<header class="ws01-details-heading"><h2 id="ws01-details-title">'+name+'</h2>'+
  '<button type="button" class="ws01-close" data-ws01-close aria-label="Close workspace details">×</button></header>'+
  '<p class="ws01-details-description">Workspace details verified for your signed membership.</p>'+
  '<dl class="ws01-details-fields"><div><dt>Membership</dt><dd>'+escape(row.relation)+'</dd></div>'+
  '<div><dt>Privacy</dt><dd>'+escape(row.privacy||'Not provided by current context')+'</dd></div>'+
  '<div><dt>Session</dt><dd>'+(row.active?'Current workspace':canSwitch?'Signed member · available to switch':'Not active · switching unavailable')+'</dd></div></dl>'+
  '<p class="ws01-details-note" role="status">'+(row.active?
   'This is your current server-selected workspace.':
   (canSwitch?'This signed membership can be selected. The server will recheck access and reload the active workspace.':
   'You can inspect this authorized membership, but changing the active workspace requires the separate signed switching contract.'))+'</p>'+
  '<div class="ws01-details-actions"><button type="button" data-ws01-action="back">Back to workspaces</button>'+
  '<button type="button" data-ws01-action="configure">Configuration</button>'+
  (row.active?'<button type="button" class="ws01-details-primary" data-ws01-action="open-current">Open current workspace</button>':
   (canSwitch?'<button type="button" class="ws01-details-primary" data-ws01-action="select">Switch workspace</button>':
   '<button type="button" disabled title="Workspace switching is not activated">Switch workspace — unavailable</button>'))+
  '</div>'+(canSwitch?'<p class="ws01-config-feedback" data-ws01-switch-feedback role="status" aria-live="polite"></p>':'')+'</section>';
}
/** A configuration becomes editable only after a fresh signed read receipt.
 * Until server activation, keep the existing owner draft validation behavior. */
function configurationContent(row,{live=false,settings=null,loading=false,error=''}={}){
 const ownerDraft=row.relation==='owner'&&row.verifiedScope==='SIGNED_MEMBER_RPC';
 const verifiedEdit=live&&ownerDraft&&settings?.workspaceId===row.id&&settings.canEdit===true;
 const editable=live?verifiedEdit:ownerDraft;
 const name=live&&settings?settings.name:row.name;
 const privacy=live&&settings?settings.privacy:row.privacy;
 return '<section class="ws01-details-card" role="dialog" aria-modal="true" aria-labelledby="ws01-config-title">'+
  '<header class="ws01-details-heading"><h2 id="ws01-config-title">Workspace configuration</h2>'+
  '<button type="button" class="ws01-close" data-ws01-close aria-label="Close configuration">×</button></header>'+
  '<p class="ws01-details-description">Review settings for '+escape(row.name)+'. '+
   (live?'Settings require fresh server-authorized owner access.':
    'No configuration writes are activated.')+'</p>'+
  '<form id="ws01-config-preview" novalidate>'+
  '<label for="ws01-config-name">Workspace name</label>'+
  '<input id="ws01-config-name" name="name" type="text" minlength="2" maxlength="80" value="'+escape(name)+'"'+(editable?'':' disabled')+'/>'+
  '<fieldset><legend>Privacy</legend>'+
  '<label><input type="radio" name="privacy" value="closed"'+(privacy==='closed'?' checked':'')+(editable?'':' disabled')+'/> Closed</label>'+
  '<label><input type="radio" name="privacy" value="open"'+(privacy==='open'?' checked':'')+(editable?'':' disabled')+'/> Open</label></fieldset>'+
  '<p class="ws01-details-note">'+(live?
   'Saving uses a server-supplied revision and rechecks the signed configuration; switching is unchanged.':
   'Only owners can validate a settings draft. Saving configuration requires a separate server-authorized update contract. Nothing entered here is saved.')+'</p>'+
  '<p class="ws01-config-feedback" role="status" aria-live="polite">'+
   escape(error||(loading?'Checking signed configuration access…':''))+'</p>'+
  '<div class="ws01-details-actions"><button type="button" data-ws01-action="back-details">Back to details</button>'+
  (editable?'<button type="submit" class="ws01-details-primary">'+
   (live?'Save workspace settings':'Validate settings draft')+'</button>':
   (live&&error?'<button type="button" data-ws01-action="retry-config">Retry signed configuration read</button>':
    '<button type="button" disabled>'+(loading?'Checking access…':'Owner permissions required')+'</button>'))+
  '</div></form></section>';
}
function openDetails(catalog,workspaceId,options={}){
 const row=workspaceDetailsFor(catalog,workspaceId);
 if(!row)return;
 // This is a presentation gate, never an authorization grant. Production
 // activation also requires the reviewed signed selection RPC and DB flag.
 const canSwitch=switchingUiReady(options)&&!row.active&&
  row.verifiedScope==='SIGNED_MEMBER_RPC';
 const layer=panel(detailsContent(row,{canSwitch}),'details');
 let selecting=false;
 layer.addEventListener('click',async event=>{
  const action=event.target.closest('[data-ws01-action]')?.dataset.ws01Action;
  if(selecting)return; // Prevent overlapping requests and navigation while pending.
  if(action==='select'&&canSwitch){
   selecting=true;
   const button=layer.querySelector('[data-ws01-action="select"]');
   const feedback=layer.querySelector('[data-ws01-switch-feedback]');
   button.disabled=true;
   feedback.textContent='Rechecking your signed workspace access…';
   try{
    const known=options.selectorSession?.catalog||catalog;
    const current=known?.rows?.find(item=>item.active===true&&
      item.verifiedScope==='SIGNED_MEMBER_RPC');
    if(!current)throw Error('Current workspace unavailable');
    const receipt=await requestSignedWorkspaceSwitch({
     lifecycle:options.lifecycle,workspaceId:row.id,
     expectedWorkspaceId:current.id
    });
    // The app must discard all workspace-scoped state after the verified
    // server transition. A full page reload avoids stale board/role caches.
    await options.onWorkspaceSwitched(receipt);
   }catch(error){
    if(activeOverlay!==layer||!layer.isConnected)return;
    const code=Number.isInteger(error?.status)?error.status:0;
    feedback.textContent=code===401?
     'Your signed session expired. Sign in again before switching.':
     code===403||code===404?
     'Server access to that workspace could not be confirmed. Reload before retrying.':
     code===409?
     'Your workspace selection changed in another session. Reload and try again.':
     'The workspace switch could not be confirmed. Reload before trying again.';
    // Never automatically retry a potentially committed selection RPC.
   }
   return;
  }
  if(action==='back')openBrowse(options.selectorSession?.catalog||catalog,options);
  if(action==='configure')openConfiguration(catalog,row.id,options);
  if(action==='open-current'&&row.active){
   closeWorkspacePanels();
   options.onOpenCurrent?.();
  }
 });
 layer.querySelector('[data-ws01-action="back"]').focus();
}
function openConfiguration(catalog,workspaceId,options={}){
 const row=workspaceDetailsFor(catalog,workspaceId);
 if(!row)return;
 // Flag is supplied from the typed lifecycle module by the application shell.
 // Never infer activation from a visible owner badge or an available method.
 const live=options.configurationEnabled===true&&
  typeof options.lifecycle?.readConfiguration==='function'&&
  typeof options.lifecycle?.updateConfiguration==='function';
 const layer=panel(configurationContent(row,{live,loading:live}),'configuration');
 let signed=null,busy=false,completed=false,readRun=0;
 const active=()=>activeOverlay===layer&&layer.isConnected;
 const focusForm=()=>{
  (layer.querySelector('#ws01-config-name:not([disabled])')||
   layer.querySelector('[data-ws01-action="retry-config"]')||
   layer.querySelector('[data-ws01-action="back-details"]'))?.focus();
 };
 const load=async()=>{
  if(!live||busy||completed)return;
  const id=++readRun;
  layer.firstElementChild.outerHTML=configurationContent(row,{live,loading:true});
  try{
   const result=await options.lifecycle.readConfiguration(row.id);
   if(!active()||readRun!==id)return;
   if(result?.workspaceId!==row.id)throw Error('Unexpected signed settings scope');
   signed=result;
   layer.firstElementChild.outerHTML=configurationContent(row,{live,settings:signed});
  }catch{
   if(!active()||readRun!==id)return;
   signed=null;
   layer.firstElementChild.outerHTML=configurationContent(row,{live,
    error:'Could not verify signed workspace configuration. No changes can be saved. Retry the authorized read.'});
  }
  focusForm();
 };
 layer.addEventListener('click',event=>{
  if(event.target.closest('[data-ws01-action="back-details"]')){
   readRun++;
   openDetails(options.selectorSession?.catalog||catalog,row.id,options);
  }
  if(event.target.closest('[data-ws01-action="retry-config"]'))void load();
 });
 layer.addEventListener('submit',async event=>{
  if(!event.target.matches('#ws01-config-preview'))return;
  event.preventDefault();
  if(busy||completed)return;
  const form=event.target;
  const field=form.querySelector('#ws01-config-name');
  const data=new FormData(form);
  const proposal=validateWorkspaceProposal({name:data.get('name'),privacy:data.get('privacy')});
  field.setAttribute('aria-invalid',String(!proposal.valid));
  const feedback=form.querySelector('.ws01-config-feedback');
  if(!proposal.valid){feedback.textContent=proposal.reason;return;}
  if(!live){
   feedback.textContent='Settings draft validated. No changes were saved; workspace updates require server authorization.';
   return;
  }
  if(!signed?.canEdit||signed.workspaceId!==row.id)return;
  busy=true;
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  field.disabled=true;
  for(const radio of form.querySelectorAll('input[name="privacy"]'))radio.disabled=true;
  feedback.textContent='Requesting signed owner authorization…';
  let saved=null,confirmed=null,error=null;
  try{
   saved=await options.lifecycle.updateConfiguration({
    workspaceId:row.id,name:proposal.name,privacy:proposal.privacy,
    expectedRevision:signed.revision
   });
   // Mutation receipts alone are insufficient. Re-read the server state
   // before reporting persistence or refreshing the visible membership list.
   confirmed=await options.lifecycle.readConfiguration(row.id);
   if(confirmed?.workspaceId!==row.id||
      confirmed?.name!==saved.name||confirmed?.privacy!==saved.privacy||
      confirmed?.revision!==saved.revision)
    throw Error('Configuration commit could not be independently verified.');
  }catch(cause){error=cause;}
  busy=false;
  if(!active()||!form.isConnected)return;
  if(!error){
   completed=true;signed=confirmed;
   feedback.textContent=saved.updated?
    'Workspace settings saved and verified through the signed server.':
    'Workspace settings are already up to date and verified.';
   void options.selectorSession?.load?.();
   return;
  }
  submit.disabled=false;field.disabled=false;
  for(const radio of form.querySelectorAll('input[name="privacy"]'))radio.disabled=false;
  const code=Number.isInteger(error?.status)?error.status:0;
  feedback.textContent=code===401?
   'Your signed session expired. Sign in again before configuring workspaces.':
   code===403||code===404?
   'Your account no longer has permission to configure this workspace.':
   code===409?
   'Workspace settings changed in another session. Reopen the configuration to review the current revision.':
   code===400||code===422?
   'The server rejected these workspace settings.':
   'The server did not confirm this save. Reopen and verify current settings before trying again.';
  // On an uncertain outcome never retry automatically with a stale revision.
  submit.disabled=true;
 });
 if(live)void load();
 else focusForm();
}
function currentFootnote(catalog,options={}){
 const status=options.selectorSession?.status;
 let message='Only your current server-verified workspace is shown. Additional workspaces require signed membership discovery.';
 if(status==='loading')message='Loading workspaces authorized for this signed account…';
 else if(status==='error')message='Workspace list could not be verified. Retry the signed read; only the current workspace is shown until verification succeeds.';
 else if(catalog?.status==='SIGNED_MEMBER_DISCOVERY')
  message=catalog.rows.length+' authorized workspace'+(catalog.rows.length===1?'':'s')+
   ' for your signed account. '+(switchingUiReady(options)?
   'Switching requires signed server confirmation.':'Workspace switching is not yet activated.');
 return '<div data-ws01-feedback><p class="ws01-note" data-ws01-note role="status">'+escape(message)+'</p>'+
  (status==='error'?'<button type="button" class="ws01-retry" data-ws01-action="retry">Retry authorized workspace discovery</button>':'')+'</div>';
}
function workspaceCreateAllowed(options={}){
 return WS01_CREATION_ENABLED&&
  canCreateOrganizationalWorkspace(options.selectorSession?.creationAuthority,{
   enabled:WS03_RESTRICTED_CREATION_ENABLED
  });
}
function menuContent(catalog,options={}){
 return '<section class="ws01-menu-card" role="dialog" aria-modal="true" aria-label="Browse workspaces">'+
  '<header class="ws01-menu-heading"><strong>Workspaces</strong>'+
  '<button class="ws01-close" type="button" data-ws01-close aria-label="Close workspace selector">×</button></header>'+
  '<label class="ws01-sr-only" for="ws01-menu-search">Search workspaces</label>'+
  '<input id="ws01-menu-search" type="search" placeholder="Search workspaces" autocomplete="off" maxlength="120"/>'+
  '<p class="ws01-eyebrow">Authorized workspaces · '+visibleWorkspaces(catalog).length+'</p>'+
  '<div data-ws01-results>'+resultsMarkup(catalog,'all','',options)+'</div>'+
  '<div class="ws01-menu-actions"><button type="button" data-ws01-action="browse">Browse all</button>'+
  '<button type="button" data-ws01-action="create"'+
   (workspaceCreateAllowed(options)?'':' disabled title="Workspace creation requires verified IT Admin or organizational owner authorization"')+
   '>Add workspace</button>'+
  '<button type="button" data-ws01-action="invite">Invite members</button></div>'+
  currentFootnote(catalog,options)+'</section>';
}
function openMenu(catalog,options={}){
 const read=()=>options.selectorSession?.catalog||catalog;
 const layer=panel(menuContent(read(),options),'menu');
 const input=layer.querySelector('#ws01-menu-search');
 const redraw=()=>{
  if(activeOverlay!==layer||!layer.isConnected)return;
  layer.querySelector('[data-ws01-results]').innerHTML=resultsMarkup(read(),'all',input.value,options);
  layer.querySelector('.ws01-eyebrow').textContent='Authorized workspaces · '+visibleWorkspaces(read()).length;
  const feedback=layer.querySelector('[data-ws01-feedback]');
  if(feedback)feedback.outerHTML=currentFootnote(read(),options);
 };
 if(options.selectorSession)options.selectorSession.refresh=redraw;
 input.addEventListener('input',redraw);
 layer.addEventListener('click',event=>{
  const command=event.target.closest('[data-ws01-action]')?.dataset.ws01Action;
  if(command==='details'){
   const workspaceId=event.target.closest('[data-ws01-workspace]')?.dataset.ws01Workspace;
   openDetails(read(),workspaceId,options);
  }
  if(command==='retry')options.selectorSession?.load?.();
  if(command==='browse')openBrowse(read(),options);
  if(command==='create')openCreate(read(),options);
  if(command==='invite')openInvites(read().rows.find(row=>row.active),{
   enabled:options.invitationEnabled,sendInvitation:options.sendInvitation
  });
 });
 input.focus();
}
function browseContent(catalog,options={}){
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
  '<button type="button" data-ws01-action="create" class="ws01-add-button"'+
   (workspaceCreateAllowed(options)?'':' disabled title="Only authorized IT Admins and organizational owners can create workspaces"')+
   '>+ Add workspace</button></nav>'+
  '<div class="ws01-browser-results"><h3 data-ws01-title>All workspaces</h3>'+
  '<div data-ws01-results class="ws01-browser-grid">'+resultsMarkup(catalog,'all','',options)+'</div>'+
  currentFootnote(catalog,options)+'</div></div></section>';
}
function openBrowse(catalog,options={}){
 const read=()=>options.selectorSession?.catalog||catalog;
 const layer=panel(browseContent(read(),options),'browse');
 let tab='all';
 const input=layer.querySelector('#ws01-browser-search');
 const redraw=()=>{
  if(activeOverlay!==layer||!layer.isConnected)return;
  layer.querySelector('[data-ws01-results]').innerHTML=resultsMarkup(read(),tab,input.value,options);
  const feedback=layer.querySelector('[data-ws01-feedback]');
  if(feedback)feedback.outerHTML=currentFootnote(read(),options);
  for(const btn of layer.querySelectorAll('[data-ws01-filter]'))
   btn.setAttribute('aria-pressed',String(btn.dataset.ws01Filter===tab));
  layer.querySelector('[data-ws01-title]').textContent={
   all:'All authorized workspaces',recent:'Current workspace',owner:'Workspaces owned by me',
   member:'Workspaces I am a member of',collaborator:'Workspaces I collaborate in'
  }[tab];
 };
 if(options.selectorSession)options.selectorSession.refresh=redraw;
 input.addEventListener('input',redraw);
 layer.addEventListener('click',event=>{
  const filter=event.target.closest('[data-ws01-filter]')?.dataset.ws01Filter;
  if(TABS.has(filter)){tab=filter;redraw();}
  const detail=event.target.closest('[data-ws01-action="details"]');
  if(detail)openDetails(read(),detail.dataset.ws01Workspace,options);
  if(event.target.closest('[data-ws01-action="retry"]'))options.selectorSession?.load?.();
  if(event.target.closest('[data-ws01-action="create"]'))openCreate(read(),options);
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
function openCreate(catalog,options={}){
 const {lifecycle,selectorSession}=options;
 const enabled=workspaceCreateAllowed(options)&&typeof lifecycle?.create==='function';
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
   // Refresh only through the signed membership endpoint after server receipt.
   // A newly created workspace is never silently made active.
   void selectorSession?.load?.();
   const browse=document.createElement('button');
   browse.type='button';
   browse.textContent='Browse authorized workspaces';
   browse.addEventListener('click',()=>openBrowse(selectorSession?.catalog||catalog,options));
   form.querySelector('.ws01-create-footer').prepend(browse);
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
function inviteContent(current,{enabled=false}={}){
 const title=escape(current.name);
 return '<section class="ws02-invite-card" role="dialog" aria-modal="true"'+
  ' aria-labelledby="ws02-invite-title" aria-describedby="ws02-invite-description">'+
  '<header class="ws02-invite-heading"><div><p class="ws02-eyebrow">Workspace collaboration</p>'+
  '<h2 id="ws02-invite-title">Invite to '+title+'</h2></div>'+
  '<button type="button" data-ws01-close aria-label="Close invitations">×</button></header>'+
  '<p id="ws02-invite-description" class="ws02-invite-subtitle">Invite collaborators to this workspace. '+
  'This invitation grants workspace Member access only after the recipient signs in and accepts. '+
  'Platform and board permissions remain controlled by authorized User Role Management.</p>'+
  '<form id="ws02-invite-preview" novalidate>'+
  '<div class="ws02-invite-fields"><div class="ws02-invite-addresses">'+
  '<label for="ws02-invite-email">Recipient email address</label>'+
  '<input id="ws02-invite-email" name="email" type="email" maxlength="254" '+
   'placeholder="name@example.com" autocomplete="email" inputmode="email" spellcheck="false" required>'+
  '<small>Enter the exact email address. An existing account is reused when the recipient accepts.</small></div>'+
  '<div class="ws02-invite-role"><label for="ws02-invite-role">Workspace role</label>'+
  '<input id="ws02-invite-role" type="text" value="Member" disabled aria-describedby="ws02-invite-role-note">'+
  '<input type="hidden" name="role" value="member">'+
  '<small id="ws02-invite-role-note">Further platform or board roles require independent administrator approval.</small></div></div>'+
  '<label for="ws02-invite-message">Add a custom message <span>(optional)</span></label>'+
  '<textarea name="message" id="ws02-invite-message" rows="3" maxlength="500"'+
  ' placeholder="Tell your team what they will work on together"></textarea>'+
  '<div class="ws02-invite-context"><span>Suggested context</span><div role="group" aria-label="Message suggestions">'+
  '<button type="button" data-ws02-context="work">Track and manage work</button>'+
  '<button type="button" data-ws02-context="team">Collaborate with your team</button>'+
  '<button type="button" data-ws02-context="project">Coordinate a project</button></div></div>'+
  '<p class="ws02-invite-safety">'+(enabled?
   'Invitation sending is restricted to the Member role and independently authorized by the signed server.':
   'Invitation sending is not activated yet. Only authorized workspace owners '+
   'or delegated workspace administrators will be able to send invitations after '+
   'the signed server-side invitation and role contracts pass acceptance.')+'</p>'+
  '<p class="ws02-invite-feedback" role="status" aria-live="polite"></p>'+
  '<footer class="ws02-invite-footer">'+
  '<button type="button" class="ws02-secondary" data-ws01-close>Cancel</button>'+
  '<button type="submit" class="ws02-secondary">Review invitation</button>'+
  '<button type="button" class="ws02-send" data-ws02-action="send" '+
  (enabled?'':'disabled ')+ 'aria-describedby="ws02-invite-description">'+
  (enabled?'Send Member invitation':'Send invites — pending activation')+
  '</button></footer></form></section>';
}
function openInvites(current,options={}){
 const row=workspaceFromSignedContext(current);
 if(!row)return;
 const enabled=options.enabled===true&&typeof options.sendInvitation==='function';
 const layer=panel(inviteContent(row,{enabled}),'invite');
 const form=layer.querySelector('#ws02-invite-preview');
 const contexts={
  work:'Join us to track and manage work in our workspace.',
  team:'Join our workspace to collaborate with the team.',
  project:'Join our workspace to coordinate the project together.'
 };
 form.addEventListener('click',event=>{
  const key=event.target.closest('[data-ws02-context]')?.dataset.ws02Context;
  if(key&&Object.hasOwn(contexts,key)){
   const field=form.querySelector('#ws02-invite-message');
   field.value=contexts[key];field.focus();
  }
 });
 let busy=false,completed=false,requestId='',requestDraft='';
 const draft=()=>{
  const data=new FormData(form);
  return validateDirectEmailInvitation({
   email:data.get('email'),message:data.get('message')
  });
 };
 form.querySelector('[data-ws02-action="send"]').addEventListener('click',async()=>{
  if(!enabled||busy||completed||!layer.isConnected||activeOverlay!==layer)return;
  const result=draft();
  const feedback=form.querySelector('.ws02-invite-feedback');
  if(!result.valid){feedback.textContent=result.reason;return;}
  const fingerprint=JSON.stringify([row.id,result.email,'member',result.message]);
  if(requestDraft!==fingerprint){
   requestId=globalThis.crypto?.randomUUID?.()||'';requestDraft=fingerprint;
  }
  if(!validUuid(requestId)){feedback.textContent='Secure request ID unavailable. No invitation was submitted.';return;}
  busy=true;
  const button=form.querySelector('[data-ws02-action="send"]');
  button.disabled=true;feedback.textContent='Requesting signed invitation authorization…';
  try{
   const receipt=await options.sendInvitation({workspaceId:row.id,
    requestId,email:result.email,role:'member',message:result.message});
   if(activeOverlay!==layer||!layer.isConnected)return;
   if(!validUuid(receipt?.invitationId)||!['delivery-submitted','already-issued'].includes(receipt?.state))
    throw Error('Unconfirmed server receipt');
   completed=true;
   feedback.textContent=receipt.state==='delivery-submitted'?
    'The trusted delivery service accepted this invitation. Membership starts only after recipient acceptance.':
    'This request was already issued; no new email was sent. Contact an administrator for delivery reconciliation.';
  }catch{
   if(activeOverlay!==layer||!layer.isConnected)return;
   feedback.textContent='Invitation delivery was not confirmed. Do not start another request until an administrator reconciles this attempt.';
  }finally{
   busy=false;
   if(activeOverlay===layer&&layer.isConnected)button.disabled=completed;
  }
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const data=new FormData(form);
  const result=validateDirectEmailInvitation({
   email:data.get('email'),message:data.get('message')
  });
  form.querySelector('.ws02-invite-feedback').textContent=!result.valid?result.reason:
   'Exact email address validated for workspace Member access. No invitation was sent. '+
   (enabled?'Select Send Member invitation to request signed delivery.':
   'Secure invitation delivery remains pending activation.');
 });
 form.querySelector('#ws02-invite-email').focus();
}
export function openWorkspaceInvitationDialog(current,options={}){
 const row=workspaceFromSignedContext(current);
 if(!row)return;
 returnFocus=document.activeElement;
 openInvites(row,options);
}
export function openWorkspaceSelector(current,options={}){
 if(activeOverlay){closeWorkspacePanels();return;}
 const session={catalog:workspaceCatalog(current),status:'loading',refresh:null,load:null,creationAuthority:null};
 returnFocus=document.activeElement;
 openMenu(session.catalog,{...options,selectorSession:session});
 // Never substitute a global workspace count for the caller's signed
 // membership list. Every discovery is scoped and verified by the server.
 session.load=async()=>{
  if(session.status==='loading'&&session.started)return;
  session.started=true;
  if(!WS01_DISCOVERY_ENABLED||typeof options.lifecycle?.discover!=='function'){
   session.status='unavailable';
   session.refresh?.();
   return;
  }
  session.status='loading';
  session.refresh?.();
  try{
   const result=await options.lifecycle.discover();
   if(result?.status!=='SIGNED_MEMBER_DISCOVERY')throw Error('Invalid signed catalog');
   session.catalog=result;
   session.status='ready';
  }catch{
   session.catalog=workspaceCatalog(current);
   session.status='error';
  }
  session.refresh?.();
 };
 // Role/status is verified on the server, not inferred from personal workspace
 // ownership, profile labels, or a browser-managed role switcher.
 session.loadAuthority=async()=>{
  if(!WS03_RESTRICTED_CREATION_ENABLED||
     typeof options.authorityClient?.readCreatorAuthority!=='function')return;
  try{session.creationAuthority=await options.authorityClient.readCreatorAuthority();}
  catch{session.creationAuthority=null;}
  if(activeOverlay?.isConnected){
   for(const button of activeOverlay.querySelectorAll('[data-ws01-action="create"]')){
    button.disabled=!workspaceCreateAllowed({...options,selectorSession:session});
   }
  }
 };
 // Read-only signed RPC, no cross-user cache and no implicit workspace switch.
 void session.load();
 void session.loadAuthority();
}
