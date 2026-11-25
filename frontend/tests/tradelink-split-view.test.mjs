import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTradeLinkApplication} from '../tradelink-application.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView} from '../tradelink-draft-workspace.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const base={detail,workspaceId,canManage:true};

test('TradeLink places the full-width document selector below the document header',()=>{
 const html=renderTradeLinkApplication({...base,section:'drafts',
  draftView:{formValues:{documentType:'quotation'},mode:'create'}});
 const main=html.indexOf('<main class="tl-app-main">');
 const header=html.indexOf('class="tl-reference-document-topcard"');
 const nav=html.indexOf('class="tl-app-nav"');
 const editor=html.indexOf('class="tl-reference-editor-content"');
 assert.ok(main>=0&&header>main&&nav>header&&editor>nav);
 assert.match(html,/class="tl-app-nav-heading"/);
 assert.match(html,/TRADELINK WORKSPACE/);
 assert.match(html,/Document Types/);
 assert.match(html,/Choose a document to prepare/);
 assert.equal((html.match(/data-tl-module-nav=/g)||[]).length,6);
 assert.match(html,/data-tl-tab="documents"[^>]*>[^<]*<span aria-hidden="true">☷<\/span> All Documents<\/a>/);
 assert.match(html,/data-tl-tab="activity"[^>]*>[^<]*<span aria-hidden="true">◷<\/span> Activity<\/a>/);
 for(const label of ['Electronic SI','Packing List','Delivery Receipt','Payment AR','Quotation','PO to Suppliers'])
  assert.ok(html.includes(label),label);
 assert.match(html,/href="#\/tradelink\/drafts\/quotation"/);
 assert.match(html,/aria-current="page"/);
 assert.doesNotMatch(html,/class="tl-reference-document-tabs"/);
});

test('split navigation follows the active module, All Documents, and Activity routes',()=>{
 const draft=renderTradeLinkApplication({...base,section:'drafts',
  draftView:{formValues:{documentType:'packing'},mode:'create'}});
 assert.match(draft,/<a data-tl-module-nav="packing" class="tl-module-link active" href="#\/tradelink\/drafts\/packing" aria-current="page"/);
 const documents=renderTradeLinkApplication({...base,section:'documents'});
 assert.match(documents,/<a data-tl-tab="documents" href="#\/tradelink\/documents" aria-current="page"/);
 const activity=renderTradeLinkApplication({...base,section:'activity'});
 assert.match(activity,/<a data-tl-tab="activity" href="#\/tradelink\/activity" aria-current="page"/);
});

test('split navigation preserves existing signed routes and refuses a foreign workspace',()=>{
 const source=readFileSync('frontend/tradelink-application.js','utf8');
 assert.match(source,/renderTradeLinkDocumentRepository\(\{detail,workspaceId,view:draftView,canManage,canReview,actorEmail,canCreate,actorId\}\)/);
 assert.match(source,/renderTradeLinkDraftWorkspace\(\{detail,workspaceId,view:draftView,canManage,canCreate,actorId,actorName,actorEmail,actorModuleRole,showModuleTabs:false,moduleNavigation:workspaceNavigation\}\)/);
 const denied=renderTradeLinkApplication({...base,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 assert.match(denied,/signed workspace access is unavailable/);
 assert.doesNotMatch(denied,/class="tl-app-nav"|data-tradelink-draft-form/);
});


test('All Documents uses the full width without an empty preview and consolidates opening actions',()=>{
 const row={documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  boardItemId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',documentType:'quotation',
  documentNumber:'Q-SPLIT-01',clientName:'Split View Client',revision:1,
  workflowState:'draft',archived:false,createdAt:'2026-11-12T01:00:00.000Z',
  updatedAt:'2026-11-13T01:00:00.000Z'};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[row]};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId,view,canManage:true});
 assert.doesNotMatch(html,/tl-document-split-view|data-tradelink-document-split/);
 assert.match(html,/class="tl-document-list-pane"/);
 assert.doesNotMatch(html,/tl-document-preview-pane|tl-document-detail-view/);
 assert.match(html,/Q-SPLIT-01/);
 assert.doesNotMatch(html,/Select a document/);
 assert.match(html,/Preview\/Edit/);
 assert.doesNotMatch(html,/>Preview<\/button>/);
 assert.match(html,/Revision history &amp; details/);
 assert.match(html,/data-action="tradelink-document-open"/);
});


test('a verified saved document is rendered inside the on-demand detail view without changing its signed revision',()=>{
 const documentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const boardItemId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const row={documentId,boardItemId,documentType:'quotation',documentNumber:'Q-SPLIT-02',
  revision:5,workflowState:'draft',archived:false,clientName:'Verified preview customer',
  createdAt:'2026-11-12T01:00:00.000Z',updatedAt:'2026-11-13T01:00:00.000Z'};
 const record={id:documentId,workspace_id:workspaceId,board_id:TRADELINK_BOARD_ID,
  board_item_id:boardItemId,revision:5,workflow_state:'draft',archived_at:null,
  updated_at:'2026-11-13T01:00:00.000Z',created_at:'2026-11-12T01:00:00.000Z',
  document_type:'quotation',document_number:'Q-SPLIT-02',
  content:{documentType:'quotation',documentNumber:'Q-SPLIT-02',
   customerName:'Verified preview customer',currency:'PHP',vatType:'zero',
   items:[{id:'line-1',kind:'item',description:'Verified item',quantity:1,
    unit:'each',unitPrice:25}]}};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[row],
  documentPreview:{documentId,record,attachments:[],events:[]}};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId,view,canManage:true});
 const paneStart=html.indexOf('<section class="tl-document-detail-view"');
 const paneEnd=html.lastIndexOf('</section>');
 assert.ok(paneStart>=0&&paneEnd>paneStart);
 const pane=html.slice(paneStart,paneEnd);
 assert.match(pane,/data-tradelink-saved-preview/);
 assert.match(pane,/Saved document · Q-SPLIT-02/);
 assert.match(pane,/Revision 5/);
 assert.match(pane,/Verified preview customer/);
 assert.match(pane,/Edit this Draft/);
 assert.match(pane,/Close document preview/);
 assert.doesNotMatch(pane,/Select a document/);
});

test('reviewer and activity routes retain their existing entry points without exposing the manager module editor',()=>{
 const reviewer=renderTradeLinkApplication({...base,section:'drafts',canManage:false});
 assert.doesNotMatch(reviewer,/class="tl-app-nav"|data-tl-module-nav/);
 assert.match(reviewer,/data-tl-tab="create"[^>]*aria-disabled="true"/);
 assert.doesNotMatch(reviewer,/data-tl-tab="create"[^>]*href=/);
 assert.match(reviewer,/data-tl-tab="documents"/);
 assert.match(reviewer,/data-tl-tab="activity"/);
 const activity=renderTradeLinkApplication({...base,section:'activity'});
 assert.doesNotMatch(activity,/class="tl-app-nav"/);
 assert.match(activity,/data-tl-tab="activity"[^>]*aria-current="page"/);
});

test('document selector is full-width, responsive, keyboard accessible and scoped to TradeLink',()=>{
 const baseCss=readFileSync('frontend/tradelink-reference-ui.css','utf8');
 const css=readFileSync('frontend/tradelink-ui-refresh.css','utf8');
 const fixture=readFileSync('scripts/cp-tl03d-render-reference-fixture.mjs','utf8');
 assert.match(baseCss,/CP-TL-SPLIT-01/);
 assert.doesNotMatch(baseCss,/\.tl-document-split-view|\.tl-document-preview-empty/);
 assert.match(css,/CP-TL-DOCUMENT-TYPE-UI-01/);
 assert.match(css,/data-tl-section="drafts"\]\[data-tl-can-create="true"\] \.tl-app-layout\{\s*display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.tl-app-nav-links\{\s*display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:1050px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:620px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:360px\)[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.tl-reference-portal \.tl-app-nav a:focus-visible/);
 assert.match(fixture,/moduleNavVisible/);
 assert.match(fixture,/selectorBelowHeader/);
 assert.match(fixture,/selectorFullWidth/);
 assert.match(fixture,/tl-app-nav/);
 assert.doesNotMatch(fixture,/navBeforeMain|tl-reference-document-tabs/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
