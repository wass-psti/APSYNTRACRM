/** CP-WS-01A — signed-workspace shell, read-only until backend lifecycle activation.
 * Design reference: workspace selector, browse, search, owner/member filters and
 * create dialog. No independent auth, fabricated workspaces or browser persistence.
 * All workspace records presented here come from the signed access context.
 */
import {validUuid} from './data.js';

export const WS01_DISCOVERY_ENABLED=false;
export const WS01_CREATION_ENABLED=false;
export const WS01_SWITCHING_ENABLED=false;
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
  const allowed=[...layer.querySelectorAll('button:not([disabled]),input:not([disabled]),[href]')]
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
  '<button type="button" data-ws01-action="create">Add workspace</button></div>'+
  currentFootnote()+'</section>';
}
function openMenu(catalog){
 const layer=panel(menuContent(catalog),'menu');
 const input=layer.querySelector('#ws01-menu-search');
 input.addEventListener('input',()=>{layer.querySelector('[data-ws01-results]').innerHTML=
  resultsMarkup(catalog,'recent',input.value);});
 layer.addEventListener('click',event=>{
  const command=event.target.closest('[data-ws01-action]')?.dataset.ws01Action;
  if(command==='browse')openBrowse(catalog);
  if(command==='create')openCreate(catalog);
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
function openBrowse(catalog){
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
  if(event.target.closest('[data-ws01-action="create"]'))openCreate(catalog);
 });
 input.focus();
}
function createContent(){
 return '<section class="ws01-create-card" role="dialog" aria-modal="true" aria-labelledby="ws01-create-title">'+
 '<header><h2 id="ws01-create-title">Add new workspace</h2>'+
 '<button type="button" class="ws01-close" data-ws01-close aria-label="Close create workspace">×</button></header>'+
 '<div class="ws01-create-symbol" aria-hidden="true">N</div>'+
 '<form id="ws01-proposal"><label for="ws01-name">Workspace name</label>'+
 '<input id="ws01-name" name="name" maxlength="80" minlength="2" autocomplete="off" required placeholder="New Workspace"/>'+
 '<fieldset><legend>Privacy</legend><label><input type="radio" name="privacy" value="open" checked/> Open</label>'+
 '<label><input type="radio" name="privacy" value="closed"/> Closed</label></fieldset>'+
 '<p class="ws01-note">Privacy requires server-enforced workspace visibility and admission rules. '+
 'Creation is disabled until the production workspace lifecycle contract is approved.</p>'+
 '<p class="ws01-form-feedback" role="status"></p>'+
 '<footer><button type="button" data-ws01-close>Cancel</button>'+
 '<button type="submit" class="ws01-primary">Review readiness</button></footer></form></section>';
}
function openCreate(catalog){
 const layer=panel(createContent(),'create');
 const form=layer.querySelector('#ws01-proposal');
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const values=new FormData(form);
  const proposed=validateWorkspaceProposal({name:values.get('name'),privacy:values.get('privacy')});
  const label=layer.querySelector('.ws01-form-feedback');
  label.textContent=!proposed.valid?proposed.reason:
   'Configuration checked. Workspace creation remains unavailable until an authorized server lifecycle is activated. No workspace was created.';
 });
 form.querySelector('#ws01-name').focus();
}
export function openWorkspaceSelector(current){
 if(activeOverlay){closeWorkspacePanels();return;}
 const catalog=workspaceCatalog(current);
 returnFocus=document.activeElement;
 openMenu(catalog);
}
