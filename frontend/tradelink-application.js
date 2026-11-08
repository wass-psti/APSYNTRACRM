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
 return value==='documents'||value==='activity'||value==='drafts'||modules.has(value)?value:'overview';
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
 const rows=searchTradeLinkBoardItems(detail);
 const verified=TL03_DOMAIN_READS_ENABLED&&canManage&&
  draftView.status==='AUTHORIZED_READ'&&Array.isArray(draftView.rows);
 const documentByItem=new Map((verified?draftView.rows:[]).filter(row=>
  typeof row.boardItemId==='string'&&typeof row.documentId==='string')
  .map(row=>[row.boardItemId,row]));
 return '<div class="tl-documents-workspace">'+
  renderTradeLinkDocumentRepository({detail,workspaceId,view:draftView,canManage})+
  '<section class="tl-content-panel" aria-labelledby="tl-documents-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Authorized board projection</p>'+
  '<h2 id="tl-documents-title">Board records</h2></div>'+
  '<a class="secondary" href="#/boards/'+TRADELINK_BOARD_ID+'">Open Board Items</a></div>'+
  '<p class="muted">Board items are linked to the same authorized TradeLink documents listed above. Preview an authorized saved document, or edit a Draft using the same revisioned server record. Approvals and attachments remain separate workflows.</p>'+
  '<label class="tl-search-label" for="tradelink-document-search">Search board item titles</label>'+
  '<input class="search-input tl-record-search" type="search" id="tradelink-document-search" data-tradelink-search maxlength="120" autocomplete="off" placeholder="Search authorized records…"/>'+
  '<div class="tl-records-scroll"><table class="tl-records-table"><thead><tr>'+
  '<th scope="col">Board item</th><th scope="col">Board status</th>'+
  '<th scope="col">Last updated</th><th scope="col">TradeLink document</th>'+
  '</tr></thead><tbody>'+
  rows.map(item=>'<tr data-tradelink-record data-title="'+esc(String(item.title||'').toLocaleLowerCase())+'"><td><a href="#/boards/'+TRADELINK_BOARD_ID+'">'+esc(item.title||'Untitled')+'</a></td>'+
    '<td>'+esc(item.status||'—')+'</td><td>'+esc(item.updated_at||'—')+'</td><td>'+
    (documentByItem.get(item.id)?.documentNumber===item.title?
     '<button type="button" class="secondary" data-action="tradelink-document-open" '+
      'data-id="'+esc(documentByItem.get(item.id).documentId)+'">Open document</button>'+
      (canManage&&TL03_DOMAIN_WRITES_ENABLED&&
       documentByItem.get(item.id).workflowState==='draft'&&
       !documentByItem.get(item.id).archived?
       ' <a class="secondary" data-tradelink-board-edit href="'+
       esc(tradeLinkDraftEditHref(documentByItem.get(item.id).documentId))+
       '">Edit Draft</a>':''):
     '<span class="muted">—</span>')+'</td></tr>').join('')+
  '</tbody></table></div>'+
  '<p class="tl-empty-records" data-tradelink-empty'+(rows.length?' hidden':'')+'>'+
   (rows.length?'No matching board items.':'No authorized board items have been persisted.')+'</p>'+
  '<p class="tl-search-count" data-tradelink-count role="status" aria-live="polite">'+rows.length+' board record'+(rows.length===1?'':'s')+'</p></section></div>';
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
  '<p class="muted">Opens the staged, locally validated Draft form for this module. Nothing is saved or submitted, and the full module workflow remains disabled.</p>'+
  '<div class="tl-module-boundary" role="status"><strong>Integration boundary</strong>'+
  '<p>Document creation, changes, approvals, PDFs, and attachments are unavailable here until the central signed domain API and its server-side authorization are verified. No local-only draft will be presented as saved.</p></div></section>';
}
/** Reference-led TradeLink portal is presentation-only.
 * Links preserve the existing signed-board routes and disabled domain gates. */
export function renderTradeLinkApplication({detail,section='overview',workspaceId=null,activity=null,draftView=initialTradeLinkDraftView(),canManage=false}={}){
 if(!isTradeLinkBoard(detail?.board)||
     typeof workspaceId!=='string'||detail.board.workspace_id!==workspaceId)
  return '<section role="alert" class="error-banner">TradeLink signed workspace access is unavailable.</section>';
 const current=normalizeTradeLinkSection(section);
 const sum=tradeLinkBoardSummary(detail);
 const m=TRADELINK_SOURCE_MODULES.find(x=>x.key===current);
 const base='#/boards/'+TRADELINK_BOARD_ID+'/tradelink';
 const activeNav=(key)=>current===key?' active':'';
 const currentAttr=key=>current===key?' aria-current="page"':'';
 return '<div class="aps-tradelink-app tl-reference-portal" data-tl-section="'+esc(current)+'">'+
  '<header class="tl-reference-topbar" aria-label="TradeLink portal">'+
   '<a class="tl-reference-brand" href="'+base+'" aria-label="TradeLink overview">'+
    '<span class="tl-reference-logo" aria-hidden="true">▦</span>'+
    '<span><strong>TradeLink</strong><small>PORTAL</small></span></a>'+
   '<nav class="tl-reference-portal-links" aria-label="TradeLink actions">'+
    '<a class="tl-reference-create'+(current==='drafts'?' active':'')+'" href="'+base+'/drafts/quotation">'+
     '<span aria-hidden="true">＋</span> Create New</a>'+
    '<a href="'+base+'/documents"'+currentAttr('documents')+'>'+
     '<span aria-hidden="true">☷</span> All Documents</a>'+
    '<details class="tl-reference-manual"><summary>User Manual</summary>'+
     '<div class="tl-reference-manual-panel" role="note"><strong>TradeLink document guide</strong>'+
      '<p>Choose a document module, complete its required fields, then select Save Draft. '+
      'The same signed server record appears in All Documents and its linked Board. '+
      'Open a saved Draft and select Edit Draft to save an authorized revision. '+
      'Archive and Restore are reversible Draft actions. Formal review, '+
      'approvals and PDF export are not yet available.</p>'+
     '</div></details>'+
   '</nav>'+
   '<div class="tl-reference-workspace" title="Uses the existing APSYNTRA signed workspace">'+
    '<span aria-hidden="true">▤</span> Signed workspace</div>'+
  '</header>'+
  '<p class="tl-reference-access-note" role="status">'+
   'Signed Draft operations. '+
   'Uses your existing APSYNTRA signed authorization.</p>'+
  (current==='overview'?
   '<div class="tl-reference-overview">'+
    '<header class="tl-app-hero"><p class="tl-eyebrow">APSYNTRA CRM / TradeLink</p>'+
     '<h2>Commercial operations</h2>'+
     '<p>Six TradeLink document modules within the existing signed APSYNTRA workspace.</p>'+
     '<span class="tl-hero-status">Signed Draft operations</span>'+
    '</header>'+
    '<div class="tl-stat-grid">'+
     summaryCard('Authorized board records',sum.activeBoardItems,'Current signed board response')+
     summaryCard('Document modules',TRADELINK_SOURCE_MODULES.length,'Defined by uploaded source')+
     summaryCard('Configured board fields',sum.operationalColumns+' / 5','Five supported typed columns')+
     summaryCard('Draft persistence','Enabled','Signed server authorization required')+
    '</div></div>':'')+
  '<div class="tl-app-layout"><nav class="tl-app-nav" aria-label="TradeLink application navigation">'+
   '<a class="tl-section-link'+activeNav('overview')+'" href="'+base+'"'+currentAttr('overview')+'>Overview</a>'+
   '<a class="tl-section-link'+activeNav('documents')+'" href="'+base+'/documents"'+currentAttr('documents')+'>Board records <span>'+sum.activeBoardItems+'</span></a>'+
   '<a class="tl-section-link'+activeNav('activity')+'" href="'+base+'/activity"'+currentAttr('activity')+'>Activity</a>'+
   '<a class="tl-section-link'+activeNav('drafts')+'" href="'+base+'/drafts"'+currentAttr('drafts')+'>Draft workspace <span>Save enabled</span></a>'+
   '<h3>Document modules</h3>'+
   TRADELINK_SOURCE_MODULES.map(entry=>moduleLink(entry,current)).join('')+'</nav>'+
   '<div class="tl-app-main">'+
    (m?renderModule(m):current==='drafts'?renderTradeLinkDraftWorkspace({detail,workspaceId,view:draftView,canManage}):current==='documents'?renderDocuments(detail,workspaceId,draftView,canManage):current==='activity'?renderTradeLinkActivity(activity||{}):
      '<section class="tl-content-panel"><p class="tl-eyebrow">TradeLink application</p><h2>Source-aligned workspace</h2>'+
       '<p class="muted">Open a document module to review its source-defined business purpose and submission requirements. Authorized Board Items can be inspected without creating duplicate records.</p>'+
       '<div class="tl-overview-tiles">'+TRADELINK_SOURCE_MODULES.map(entry=>
        '<a href="'+base+'/'+entry.key+
        '" class="tl-overview-tile"><strong>'+esc(entry.label)+'</strong><span>'+esc(entry.purpose)+'</span></a>').join('')+'</div>'+
       '<a class="secondary" href="'+base+'/documents">View authorized board records</a>'+
       '</section>')+
    '<p class="tl-app-caution">No standalone authentication, synthetic records, browser-only document persistence, or unsupported backend writes.</p>'+
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
