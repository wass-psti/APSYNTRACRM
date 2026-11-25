/** CP-TL-APP01 — TradeLink source-aligned, signed-board application shell.
 * Source: uploaded TradeLink 0.1.74, src/domain/document-modules.ts,
 * src/domain/types.ts, src/domain/workflow.ts and src/domain/constants.ts.
 * No standalone auth, browser persistence, synthetic documents or writes.
 */
import {isTradeLinkBoard,tradeLinkSetupStatus} from './tradelink-board-items.js';
import {renderTradeLinkActivity} from './tradelink-activity.js';
import {renderTradeLinkFinancePreview} from './tradelink-finance.js';
import {renderTradeLinkWorkflowReference} from './tradelink-workflow-reference.js';
import {renderTradeLinkAnalytics} from './tradelink-analytics.js';
import {renderTradeLinkDraftWorkspace,renderTradeLinkDocumentRepository,
 initialTradeLinkDraftView,tradeLinkDraftEditHref} from './tradelink-draft-workspace.js';
import {TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED} from './tradelink-domain-client.js';
import {TRADELINK_APPLICATION_ROUTE,tradeLinkApplicationHref} from './tradelink-application-route.js';

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
 'Draft','Submitted','For Approval','Under Review','Revision Required',
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

const TRADELINK_MANUAL_SECTIONS=Object.freeze([
 {id:'lifecycle',number:'01',title:'Document lifecycle',summary:'Choose the right starting status and understand what happens when a document is submitted.',points:[['Save status','Save defaults to For Approval. Select Draft explicitly when you want a Draft.'],['Submit Draft','The separate legacy Submit Draft action is available in All Documents for saved Draft or Revision Required records. ESI, Quotation, Purchase Order, Delivery Receipt and Payment AR transition to Submitted; Packing List transitions directly to Completed.'],['Approval route','The legacy Submit Draft action does not replace the For Approval two-reviewer route.']]},
 {id:'review',number:'02',title:'Review and approval',summary:'Understand the two independent reviewer validations and printing availability.',points:[['Two reviewers','Each document has two assigned reviewers. Each reviewer uses Use Time Now to record an independent signed validation.'],['Approval result','The first validation leaves a standard document For Approval. The second automatically changes it to Approved. An explicitly exempt General Manager revision needs only the applicable management validation.'],['Printing','Only Approved documents can be printed. Other status options become available after approval, while cancellation remains available before approval.']]},
 {id:'create',number:'03',title:'Create documents and numbering',summary:'Select the correct company, use the official templates and retain stable document numbers.',points:[['Company templates','The official v1.42.0 company templates are available for all six modules. Select the correct company/legal entity when creating a document.'],['Document numbers','New document numbers are assigned automatically and atomically by the signed server on first save. Existing document numbers remain unchanged, including across revisions.'],['Company assignment','Existing company assignments remain fixed when revising a saved document. Older records without a company assignment use the historical Watchdog Automation Sales & Services default and show a preview warning.']]},
 {id:'dates',number:'04',title:'Document dates',summary:'Use the actual document date and add a due date when it applies.',points:[['Document date','Record the actual document date for the transaction.'],['Due date','A due date is optional. Analytics aging excludes invoices without due dates.']]},
 {id:'quotation',number:'05',title:'Quotation status',summary:'Commercial progress is tracked separately from internal approval.',points:[['Commercial statuses','Quotation commercial status can be Working on it, Sent, Client Review, Accepted, Declined, On Hold or Closed.'],['Separate workflows','Quotation commercial status is separate from the approval workflow status.']]},
 {id:'pdf',number:'06',title:'Print and PDF',summary:'Print only the saved, approved revision.',points:[['Saved revision','Use Print / Save as PDF for the saved revision.'],['Issuance distinction','The browser print copy is not an electronically issued PDF.']]},
 {id:'analytics',number:'07',title:'Analytics and receivables',summary:'Read workspace totals without combining currencies or inferring exchange rates.',points:[['Data source','Analytics uses the existing signed, read-only aggregate RPC. Figures reflect the current TradeLink workspace.'],['Currency treatment','Currencies are never combined and foreign-exchange rates are never inferred.'],['Receivables aging','Aging uses approved ESI invoices with due dates. Only completed cash Payment AR receipts with an exact ESI document-number reference and matching currency reduce receivables.'],['Other receipts','Unmatched and excess cash are reported separately. Cheques remain pending bank clearance. Invoices without due dates are excluded, and no FX conversion is inferred.']]}
]);
export function renderTradeLinkUserManual(){
 const cards=TRADELINK_MANUAL_SECTIONS.map(section=>'<article class="tl-manual-section" id="tl-manual-'+section.id+'"><div class="tl-manual-section-number">'+section.number+'</div><div class="tl-manual-section-content"><h3>'+section.title+'</h3><p class="tl-manual-section-summary">'+section.summary+'</p><div class="tl-manual-points">'+section.points.map(point=>'<div class="tl-manual-point"><strong>'+point[0]+'</strong><p>'+point[1]+'</p></div>').join('')+'</div></div></article>').join('');
 return '<section class="tl-content-panel tl-user-manual" data-tl-screen="manual" aria-labelledby="tl-manual-title">'+
  '<header class="tl-manual-hero"><div class="tl-manual-hero-copy">'+
   '<p class="tl-eyebrow">TRADELINK · HELP CENTER</p><h2 id="tl-manual-title">User Manual</h2>'+
   '<p>A practical guide to preparing documents, completing reviews, printing approved revisions and reading analytics.</p>'+
   '<div class="tl-manual-meta"><span>7 topics</span><span>Document workflow reference</span></div>'+
   '<div class="tl-manual-hero-actions"><a class="tl-manual-primary-link" href="#/tradelink/manual" data-tl-manual-target="lifecycle">Start with the basics <span aria-hidden="true">→</span></a>'+
    '<a class="tl-manual-secondary-link" href="#/tradelink/documents">Open All Documents</a></div></div>'+
   '<div class="tl-manual-hero-art" aria-hidden="true"><span class="tl-manual-art-sheet">▤</span><span class="tl-manual-art-check">✓</span></div></header>'+
  '<section class="tl-manual-quickstart" aria-labelledby="tl-manual-quickstart-title">'+
   '<div class="tl-manual-quickstart-heading"><p class="tl-eyebrow">QUICK START</p><h3 id="tl-manual-quickstart-title">From document to approval</h3><p>Three steps to begin a TradeLink document workflow.</p></div>'+
   '<ol class="tl-manual-steps">'+
    '<li><span>01</span><div><strong>Choose a document</strong><p>Select one of the six available document types.</p></div></li>'+
    '<li><span>02</span><div><strong>Complete the details</strong><p>Enter client information, items, dates and applicable terms.</p></div></li>'+
    '<li><span>03</span><div><strong>Save and review</strong><p>Save as Draft or For Approval, then follow the applicable review route.</p></div></li>'+
   '</ol></section>'+
  '<div class="tl-manual-browse-heading"><div><p class="tl-eyebrow">REFERENCE LIBRARY</p><h3>Browse the guide</h3><p>Jump to a topic or search the guidance by keyword.</p></div>'+
   '<div class="tl-manual-search"><label for="tl-manual-search-input">Search topics</label><div class="tl-manual-search-control"><span aria-hidden="true">⌕</span><input id="tl-manual-search-input" data-tl-manual-search type="search" placeholder="Search approvals, numbering, PDF..." autocomplete="off"/><button type="button" data-tl-manual-clear aria-label="Clear manual search">Clear</button></div>'+
    '<p data-tl-manual-results aria-live="polite">7 topics</p></div></div>'+
  '<div class="tl-manual-layout"><nav class="tl-manual-index" aria-label="Manual topics"><strong>IN THIS GUIDE</strong>'+
   TRADELINK_MANUAL_SECTIONS.map(section=>'<a href="#/tradelink/manual" data-tl-manual-target="'+section.id+'"><span>'+section.number+'</span>'+section.title+'</a>').join('')+
  '</nav><div class="tl-manual-content">'+cards+
   '<p class="tl-manual-empty" data-tl-manual-empty hidden>No topics match that search. Try another keyword or clear the search.</p>'+
   '<p class="tl-manual-footnote">This guide describes the current TradeLink workflow and reporting behavior. Use the document’s saved revision and signed application data as the authoritative record.</p>'+
  '</div></div></section>';
}

export function filterTradeLinkManualSections(container,query=''){
 const manual=container?.matches?.('.tl-user-manual')?container:
  container?.querySelector?.('.tl-user-manual');
 if(!manual)return 0;
 const search=String(query||'').toLocaleLowerCase().trim().slice(0,120);
 const sections=[...manual.querySelectorAll('.tl-manual-section')];
 let visible=0;
 for(const section of sections){
  const matches=!search||String(section.textContent||'').toLocaleLowerCase().includes(search);
  section.hidden=!matches;
  if(matches)visible++;
 }
 for(const link of manual.querySelectorAll('[data-tl-manual-target]')){
  const targetId='tl-manual-'+String(link.getAttribute('data-tl-manual-target')||'');
  const section=sections.find(item=>item.id===targetId);
  link.hidden=Boolean(section?.hidden);
 }
 const count=manual.querySelector('[data-tl-manual-results]');
 if(count)count.textContent=search?visible+' of '+sections.length+' topics match':sections.length+' topics';
 const empty=manual.querySelector('[data-tl-manual-empty]');
 if(empty)empty.hidden=visible!==0;
 return visible;
}

export function normalizeTradeLinkSection(value){
 return value==='documents'||value==='activity'||value==='analytics'||value==='manual'||value==='drafts'||modules.has(value)?value:'drafts';
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
function moduleLink(m,activeType){
 const href=tradeLinkApplicationHref('drafts/'+m.key);
 const active=activeType===m.key;
 return '<a data-tl-module-nav="'+esc(m.key)+'" class="tl-module-link'+(active?' active':'')+'" href="'+href+'"'+
  (active?' aria-current="page"':'')+'><span class="tl-module-short" aria-hidden="true">'+esc(m.short)+'</span>'+
  '<span class="tl-module-link-copy"><strong>'+esc(m.label)+'</strong><small>Document module</small></span>'+
  '<span class="tl-module-chevron" aria-hidden="true">›</span></a>';
}
function renderDocuments(detail,workspaceId,draftView,canManage,canReview=false,actorEmail='',canCreate=false,actorId=''){
 // One authoritative document surface; linked Board items remain accessible
 // in the main APSYNTRA Board, not duplicated as a second TradeLink table.
 return renderTradeLinkDocumentRepository({detail,workspaceId,view:draftView,canManage,canReview,actorEmail,canCreate,actorId});
}
function renderModule(m,canCreate=true){
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
  (canCreate?'<p><a class="secondary" href="'+tradeLinkApplicationHref('drafts/'+m.key)+'">Prepare a '+esc(m.label)+' document</a></p>':'')+
  (canCreate?'<p class="muted">Opens the existing signed document editor. Save defaults to For Approval; choose Draft explicitly when needed. Saved Drafts remain editable by their creator. Assigned reviewers validate independently with Use Time Now. The second validation automatically sets Approved.</p>':'<p class="muted">Assigned reviewers can open their documents from All Documents, inspect the saved content and record their own validation time.</p>')+
  '<div class="tl-module-boundary" role="status"><strong>Integration boundary</strong>'+
  '<p>Signed document creation and editing are enabled through the existing authorized domain API. For Approval is the default saved status; the two assigned reviewers independently validate the current revision. Print PDF is available only after both validations set Approved. The recovered official company templates are available for all six modules. Browser Print / Save as PDF uses the saved document revision; electronic PDF issuance is separate. Unsaved previews are never presented as persisted documents.</p></div></section>';
}
/** Reference-led TradeLink portal is presentation-only.
 * Links preserve the existing signed-board routes and disabled domain gates. */
export function renderTradeLinkApplication({detail,section='drafts',workspaceId=null,activity=null,analytics=null,analyticsBusy=false,analyticsError='',analyticsEnabled=false,draftView=initialTradeLinkDraftView(),canManage=false,canReview=false,canCreate=canManage,actorId='',actorName='',actorEmail='',actorModuleRole=''}={}){
 if(!isTradeLinkBoard(detail?.board)||
     typeof workspaceId!=='string'||detail.board.workspace_id!==workspaceId)
  return '<section role="alert" class="error-banner">TradeLink signed workspace access is unavailable.</section>';
 const current=normalizeTradeLinkSection(section);
 const m=TRADELINK_SOURCE_MODULES.find(x=>x.key===current);
 const base=TRADELINK_APPLICATION_ROUTE;
 const currentAttr=key=>current===key?' aria-current="page"':'';
 const requestedType=draftView?.formValues?.documentType||
  draftView?.selected?.record?.document_type||
  draftView?.selected?.record?.content?.documentType||'quotation';
 const selectedType=modules.has(requestedType)?requestedType:'quotation';
 const workspaceNavigation=current==='drafts'&&canCreate?
  '<nav class="tl-app-nav" aria-label="TradeLink document modules">'+
   '<div class="tl-app-nav-heading"><span>TRADELINK WORKSPACE</span><strong>Document Types</strong><small>Choose a document to prepare</small></div>'+
   '<div class="tl-app-nav-links">'+
    TRADELINK_SOURCE_MODULES.map(module=>moduleLink(module,selectedType)).join('')+
   '</div></nav>':'';
 return '<div class="aps-tradelink-app tl-reference-portal" data-tl-section="'+esc(current)+'" data-tl-can-manage="'+(canManage?'true':'false')+'" data-tl-can-create="'+(canCreate?'true':'false')+'">'+
  '<header class="tl-reference-topbar" aria-label="TradeLink portal">'+
   '<a class="tl-reference-brand" href="'+base+(canCreate?'/drafts/quotation':'/documents')+'" aria-label="'+(canCreate?'TradeLink Create New':'TradeLink All Documents')+'">'+
    '<span class="tl-reference-logo" aria-hidden="true">▦</span>'+
    '<span><strong>TradeLink</strong><small>PORTAL</small></span></a>'+
   '<nav class="tl-reference-portal-links" aria-label="TradeLink actions">'+
    '<span class="tl-reference-active-indicator" aria-hidden="true" hidden></span>'+
    (canCreate?'<a data-tl-tab="create" class="tl-reference-create'+(current==='drafts'?' active':'')+'"'+currentAttr('drafts')+' href="'+base+'/drafts/quotation">'+
     '<span aria-hidden="true">＋</span> Create New</a>':
     '<span data-tl-tab="create" class="tl-reference-create" aria-disabled="true" title="Create New is available to the existing TradeLink User module role. Board management and approval controls remain separate.">'+
     '<span aria-hidden="true">＋</span> Create New</span>')+
    '<a data-tl-tab="documents" href="'+base+'/documents"'+currentAttr('documents')+'>'+
     '<span aria-hidden="true">☷</span> All Documents</a>'+
    '<a data-tl-tab="activity" href="'+base+'/activity"'+currentAttr('activity')+'>'+
     '<span aria-hidden="true">◷</span> Activity</a>'+
    '<a data-tl-tab="analytics" href="'+base+'/analytics"'+currentAttr('analytics')+'>'+
     '<span aria-hidden="true">▥</span> Analytics</a>'+
    '<a data-tl-tab="manual" href="'+base+'/manual"'+currentAttr('manual')+'><span aria-hidden="true">▤</span> User Manual</a>'+
   '</nav>'+
  '</header>'+
  '<div class="tl-app-layout">'+
   '<main class="tl-app-main">'+
    (m?renderModule(m,canCreate):current==='drafts'&&!canCreate?'<section class="tl-content-panel" aria-labelledby="tl-reviewer-access-title"><h2 id="tl-reviewer-access-title">Create New is unavailable for this signed account</h2><p>This signed TradeLink account does not have the existing document-creation capability. Open All Documents to inspect documents assigned to your account and use the available reviewer actions.</p><p><a class="secondary" href="'+tradeLinkApplicationHref('documents')+'">Open All Documents</a></p></section>':current==='drafts'?renderTradeLinkDraftWorkspace({detail,workspaceId,view:draftView,canManage,canCreate,actorId,actorName,actorEmail,actorModuleRole,showModuleTabs:false,moduleNavigation:workspaceNavigation}):current==='documents'?renderDocuments(detail,workspaceId,draftView,canManage,canReview,actorEmail,canCreate,actorId):current==='activity'?renderTradeLinkActivity(activity||{}):current==='analytics'?renderTradeLinkAnalytics({summary:analytics,busy:analyticsBusy,error:analyticsError,enabled:analyticsEnabled}):current==='manual'?renderTradeLinkUserManual():renderTradeLinkDraftWorkspace({detail,workspaceId,view:draftView,canManage,actorName,actorEmail,actorModuleRole,showModuleTabs:false}))+
   '</main></div></div>';
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
 const manualScreen=container.querySelector('.tl-user-manual');
 const manualSearch=manualScreen?.querySelector('[data-tl-manual-search]');
 if(manualScreen&&!manualScreen.dataset.navigationMounted){
  for(const link of manualScreen.querySelectorAll('[data-tl-manual-target]')){
   link.addEventListener('click',event=>{
    event.preventDefault();
    const targetId='tl-manual-'+String(link.getAttribute('data-tl-manual-target')||'');
    const target=manualScreen.querySelector('#'+targetId);
    if(!target||target.hidden)return;
    for(const section of manualScreen.querySelectorAll('.tl-manual-section'))
     section.classList.toggle('is-targeted',section===target);
    target.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});
   });
  }
  manualScreen.dataset.navigationMounted='true';
 }
 if(manualSearch&&!manualSearch.dataset.mounted){
  const updateManualResults=()=>filterTradeLinkManualSections(manualScreen,manualSearch.value);
  manualSearch.addEventListener('input',updateManualResults);
  manualScreen.querySelector('[data-tl-manual-clear]')?.addEventListener('click',()=>{
   manualSearch.value='';
   updateManualResults();
   manualSearch.focus();
  });
  manualSearch.dataset.mounted='true';
 }
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
