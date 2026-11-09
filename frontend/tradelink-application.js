/** CP-TL-APP01 — TradeLink source-aligned, signed-board application shell.
 * Source: uploaded TradeLink 0.1.74, src/domain/document-modules.ts,
 * src/domain/types.ts, src/domain/workflow.ts and src/domain/constants.ts.
 * No standalone auth, browser persistence, synthetic documents or writes.
 */
import {isTradeLinkBoard,tradeLinkSetupStatus,TRADELINK_BOARD_ID} from './tradelink-board-items.js';
import {renderTradeLinkActivity} from './tradelink-activity.js';
import {renderTradeLinkFinancePreview} from './tradelink-finance.js';
import {renderTradeLinkWorkflowReference} from './tradelink-workflow-reference.js';
import {renderTradeLinkDraftWorkspace,renderTradeLinkDocumentRepository,
 initialTradeLinkDraftView,tradeLinkDraftEditHref} from './tradelink-draft-workspace.js';
import {TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED} from './tradelink-domain-client.js';

export const TRADELINK_SOURCE_MODULES=Object.freeze([
 Object.freeze({key:'esi',label:'Electronic SI',short:'ESI',
  purpose:'Prepare a priced sales invoice record with client tax identity, VAT treatment, finance verification, and management approval.',
  readiness:'Client identity, invoiceable value, finance verifier, and management approver must be ready before submission.'}),
 Object.freeze({key:'packing',label:'Packing List',short:'PL',
  purpose:'Describe the physical contents of a shipment against a source reference without introducing financial approval requirements.',
  readiness:'A source reference, consignee, and at least one physical item are required. Submission completes the lightweight lifecycle.'}),
 Object.freeze({key:'delivery',label:'Delivery Receipt',short:'DR',
  purpose:'Record delivered goods, serial/asset identifiers, QC responsibility, logistics responsibility, and delivery evidence.',
  readiness:'Recipient, source reference, deliverable items, QC assignee, and logistics assignee must be present before submission.'}),
 Object.freeze({key:'payment',label:'Payment AR',short:'AR',
  purpose:'Acknowledge a received payment with instrument details, payor identity, receipt responsibility, and verification responsibility.',
  readiness:'Payor, payment particulars, a positive received amount, receiver, and verifier must be ready before submission.'}),
 Object.freeze({key:'quotation',label:'Quotation',short:'Q',
  purpose:'Prepare a commercial offer with pricing, validity, delivery commitment, payment terms, and controlled review/approval routing.',
  readiness:'Client contactability, commercial value, validity/delivery terms, and the configured approval path must be complete.'}),
 Object.freeze({key:'po',label:'PO to Suppliers',short:'PO',
  purpose:'Issue a supplier purchase order with commercial value, supplier identity, delivery expectation, reviewer, and final approver.',
  readiness:'Supplier identity, priced items, purchase terms, Account Manager review, and final approval routing must be ready.'})
]);
export const TRADELINK_SOURCE_WORKFLOW_STATES=Object.freeze([
 'Draft','Submitted','Under Review','Revision Required',
 'Approved','Rejected','Completed','Cancelled'
]);
// Original quotation commercial stages are independent of board Quote Status options.
export const TRADELINK_SOURCE_QUOTE_STATUSES=Object.freeze([
 'Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed'
]);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
}[c]));
const modules=new Set(TRADELINK_SOURCE_MODULES.map(m=>m.key));
export function normalizeTradeLinkSection(value){
 return value==='documents'||value==='activity'||value==='drafts'||modules.has(value)?value:'drafts';
}
export function tradeLinkBoardSummary(detail){
 if(!isTradeLinkBoard(detail?.board))return null;
 const items=Array.isArray(detail?.items)?detail.items:[];
 const active=items.filter(i=>!i?.archived_at);
 const groups=Array.isArray(detail?.groups)?detail.groups:[];
 const setup=tradeLinkSetupStatus(detail);
 return Object.freeze({boardItems:items.length,activeBoardItems:active.length,
  groups:groups.length,operationalColumns:5-setup.missing.length,
  setupReady:setup.ready});
}
export function searchTradeLinkBoardItems(detail,query=''){
 if(!tradeLinkBoardSummary(detail))return [];
 const term=String(query).trim().toLocaleLowerCase().slice(0,120);
 const items=(Array.isArray(detail.items)?detail.items:[])
  .filter(i=>i&&!i.archived_at&&typeof i.id==='string');
 return term?items.filter(i=>String(i.title||'').toLocaleLowerCase().includes(term)):items;
}
function summaryCard(label,value,help){
 return '<div class="tl-stat"><span class="tl-stat-label">'+esc(label)+'</span>'+
  '<strong class="tl-stat-value">'+esc(value)+'</strong>'+
  '<span class="tl-stat-foot">'+esc(help)+'</span></div>';
}
function moduleLink(m,section){
 const href='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/'+m.key;
 const active=section===m.key;
 return '<a class="tl-module-link'+(active?' active':'')+'" href="'+href+'"'+
  (active?' aria-current="page"':'')+'><span class="tl-module-short">'+esc(m.short)+'</span>'+
  '<span><strong>'+esc(m.label)+'</strong><small>Document module</small></span></a>';
}
function renderDocuments(detail,workspaceId,draftView,canManage){
 // One authoritative document surface; linked Board items remain accessible
 // in the main APSYNTRA Board, not duplicated as a second TradeLink table.
 return renderTradeLinkDocumentRepository({detail,workspaceId,view:draftView,canManage});
}
function renderModule(m){
 return '<section class="tl-content-panel" aria-labelledby="tl-module-title">'+
  '<p class="tl-eyebrow">Source-defined document module</p><h2 id="tl-module-title">'+esc(m.label)+'</h2>'+
  '<p class="tl-module-purpose">'+esc(m.purpose)+'</p>'+
  '<h3>Submission readiness</h3><p>'+esc(m.readiness)+'</p>'+
  '<h3>Original document lifecycle</h3><div class="tl-states">'+
  TRADELINK_SOURCE_WORKFLOW_STATES.map(s=>'<span class="tl-state">'+esc(s)+'</span>').join('')+'</div>'+renderTradeLinkWorkflowReference(m.key)+
  (m.key==='quotation'?'<h3>Original quotation commercial stages</h3>'+
   '<div class="tl-states">'+TRADELINK_SOURCE_QUOTE_STATUSES.map(s=>'<span class="tl-state">'+esc(s)+'</span>').join('')+'</div>'+
   '<p class="muted">These stages differ from the APSYNTRA board Quote Status choices. No automatic mapping is enabled.</p>':'')+
  (['esi','quotation','po'].includes(m.key)?renderTradeLinkFinancePreview():'')+
  '<p><a class="secondary" href="#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/'+esc(m.key)+'">Prepare a local '+esc(m.label)+' Draft</a></p>'+
  '<p class="muted">Opens the signed Draft editor for this module. Saving persists a document and linked Board item; workflow submission needs separate backend activation. Use All Documents to print a saved revision.</p>'+
  '<div class="tl-module-boundary" role="status"><strong>Integration boundary</strong>'+
  '<p>Signed Draft creation and editing are enabled through the existing authorized domain API. Print / Save PDF is available for saved records through All Documents. Advanced workflow transitions require their separate backend activation; secured attachments remain unavailable. Unsaved previews are never presented as persisted documents.</p></div></section>';
}
/** Reference-led TradeLink portal is presentation-only.
 * Links preserve the existing signed-board routes and disabled domain gates. */
export function renderTradeLinkApplication({detail,section='drafts',workspaceId=null,activity=null,draftView=initialTradeLinkDraftView(),canManage=false}={}){
 if(!isTradeLinkBoard(detail?.board)||
     typeof workspaceId!=='string'||detail.board.workspace_id!==workspaceId)
  return '<section role="alert" class="error-banner">TradeLink signed workspace access is unavailable.</section>';
 const current=normalizeTradeLinkSection(section);
 const m=TRADELINK_SOURCE_MODULES.find(x=>x.key===current);
 const base='#/boards/'+TRADELINK_BOARD_ID+'/tradelink';
 const currentAttr=key=>current===key?' aria-current="page"':'';
 return '<div class="aps-tradelink-app tl-reference-portal" data-tl-section="'+esc(current)+'">'+
  '<header class="tl-reference-topbar" aria-label="TradeLink portal">'+
   '<a class="tl-reference-brand" href="'+base+'/drafts/quotation" aria-label="TradeLink Create New">'+
    '<span class="tl-reference-logo" aria-hidden="true">▦</span>'+
    '<span><strong>TradeLink</strong><small>PORTAL</small></span></a>'+
   '<nav class="tl-reference-portal-links" aria-label="TradeLink actions">'+
    '<span class="tl-reference-active-indicator" aria-hidden="true" hidden></span>'+
    '<a data-tl-tab="create" class="tl-reference-create'+(current==='drafts'?' active':'')+'"'+currentAttr('drafts')+' href="'+base+'/drafts/quotation">'+
     '<span aria-hidden="true">＋</span> Create New</a>'+
    '<a data-tl-tab="documents" href="'+base+'/documents"'+currentAttr('documents')+'>'+
     '<span aria-hidden="true">☷</span> All Documents</a>'+
    '<details class="tl-reference-manual"><summary data-tl-tab="manual">User Manual</summary>'+
     '<div class="tl-reference-manual-panel" role="note"><strong>TradeLink document guide</strong>'+
      '<p>Choose a document module, complete its required fields, then select Save Draft. '+
      'The same signed server record appears in All Documents and its linked Board. '+
      'Open a saved Draft and select Edit Draft to save an authorized revision. '+
      'Archive and Restore are reversible Draft actions. All Documents can print '+
      'a freshly verified saved revision or use the browser Save as PDF option. '+
      'Workflow submission/review/approval needs separately activated server functions; '+
      'secured attachments are not yet enabled.</p>'+
     '</div></details>'+
   '</nav>'+
  '</header>'+
  '<div class="tl-app-layout">'+
   '<div class="tl-app-main">'+
    (m?renderModule(m):current==='drafts'?renderTradeLinkDraftWorkspace({detail,workspaceId,view:draftView,canManage}):current==='documents'?renderDocuments(detail,workspaceId,draftView,canManage):current==='activity'?renderTradeLinkActivity(activity||{}):renderTradeLinkDraftWorkspace({detail,workspaceId,view:draftView,canManage}))+
   '</div></div></div>';
}
/** Pure DOM filtering of already-authorized board rows; no additional network
 * request, privilege check bypass, cached identity or persistence mutation. */
export function filterTradeLinkRenderedRows(container,query){
 const q=String(query||'').toLocaleLowerCase().trim().slice(0,120);
 const rows=[...container.querySelectorAll('[data-tradelink-record]')];
 let visible=0;
 for(const row of rows){
  const show=String(row.getAttribute('data-title')||'').includes(q);
  row.hidden=!show;if(show)visible++;
 }
 const empty=container.querySelector('[data-tradelink-empty]');
 if(empty){empty.hidden=visible!==0;empty.textContent=rows.length?'No matching board items.':'No authorized board items have been persisted.';}
 const count=container.querySelector('[data-tradelink-count]');
 if(count)count.textContent=visible+' board record'+(visible===1?'':'s');
 return visible;
}

// Preserve the active-tab geometry across APSYNTRA shell rerenders. The nav is
// destroyed and recreated on routes; a normal CSS transition alone cannot
// interpolate between old and new DOM nodes.
let previousTradeLinkTab=null;
function tradeLinkTabGeometry(nav,target){
 const rect=target.getBoundingClientRect(), parent=nav.getBoundingClientRect();
 return {left:rect.left-parent.left+nav.scrollLeft,
  top:rect.top-parent.top+nav.scrollTop,width:rect.width,height:rect.height};
}
function tradeLinkSelectedTab(nav){
 return nav.querySelector('.tl-reference-manual[open] > summary')||
  nav.querySelector(':scope > a[data-tl-tab][aria-current="page"]');
}
export function captureTradeLinkTabMotion(container){
 const nav=container?.querySelector('.tl-reference-portal-links');
 const selected=nav&&tradeLinkSelectedTab(nav);
 if(selected){
  previousTradeLinkTab={key:selected.dataset.tlTab,
   geometry:tradeLinkTabGeometry(nav,selected)};
 }
}
export function mountTradeLinkTabMotion(container){
 const nav=container?.querySelector('.tl-reference-portal-links');
 if(!nav)return;
 const indicator=nav.querySelector('.tl-reference-active-indicator');
 const reduced=()=>typeof matchMedia==='function'&&
  matchMedia('(prefers-reduced-motion: reduce)').matches;
 function activate(animate=true){
  const selected=tradeLinkSelectedTab(nav);
  for(const tab of nav.querySelectorAll('[data-tl-tab]'))
   tab.classList.toggle('is-highlighted',tab===selected);
  indicator.getAnimations?.().forEach(animation=>animation.cancel());
  if(!selected){indicator.hidden=true;nav.removeAttribute('data-motion-ready');return;}
  const key=selected.dataset.tlTab;
  const next=tradeLinkTabGeometry(nav,selected);
  const prev=previousTradeLinkTab;
  indicator.hidden=false;
  Object.assign(indicator.style,Object.fromEntries(
   Object.entries(next).map(([property,value])=>[property,value+'px'])));
  if(animate&&!reduced()&&prev&&prev.key!==key&&
   typeof indicator.animate==='function'){
   indicator.animate([prev.geometry,next].map(geometry=>Object.fromEntries(
    Object.entries(geometry).map(([property,value])=>[property,value+'px']))),{
    duration:280,easing:'cubic-bezier(0.22, 1, 0.36, 1)'});
  }
  previousTradeLinkTab={key,geometry:next};
  nav.dataset.motionReady='true';
 }
 activate();
 const manual=nav.querySelector('.tl-reference-manual');
 manual?.addEventListener('toggle',()=>activate());
 nav.addEventListener('scroll',()=>activate(false),{passive:true});
}
