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

test('TradeLink renders an accessible split workspace with document navigation and a main content pane',()=>{
 const html=renderTradeLinkApplication({...base,section:'drafts',
  draftView:{formValues:{documentType:'quotation'},mode:'create'}});
 assert.match(html,/<div class="tl-app-layout">\s*<nav class="tl-app-nav" aria-label="TradeLink document modules">/);
 assert.match(html,/<main class="tl-app-main">/);
 assert.match(html,/class="tl-app-nav-heading"/);
 assert.match(html,/data-tl-tab="documents"[^>]*>[^<]*<span aria-hidden="true">☷<\/span> All Documents<\/a>/);
 assert.match(html,/data-tl-tab="activity"[^>]*>[^<]*<span aria-hidden="true">◷<\/span> Activity<\/a>/);
 assert.match(html,/Electronic SI/);
 assert.match(html,/Packing List/);
 assert.match(html,/Delivery Receipt/);
 assert.match(html,/Payment AR/);
 assert.match(html,/Quotation/);
 assert.match(html,/PO to Suppliers/);
 assert.match(html,/href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/quotation"/);
 assert.match(html,/aria-current="page"/);
 assert.doesNotMatch(html,/class="tl-reference-document-tabs"/);
});

test('split navigation follows the active module, All Documents, and Activity routes',()=>{
 const draft=renderTradeLinkApplication({...base,section:'drafts',
  draftView:{formValues:{documentType:'packing'},mode:'create'}});
 assert.match(draft,/<a data-tl-module-nav="packing" class="tl-module-link active" href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/packing" aria-current="page"/);
 const documents=renderTradeLinkApplication({...base,section:'documents'});
 assert.match(documents,/<a data-tl-tab="documents" href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/documents" aria-current="page"/);
 const activity=renderTradeLinkApplication({...base,section:'activity'});
 assert.match(activity,/<a data-tl-tab="activity" href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/activity" aria-current="page"/);
});

test('split navigation preserves existing signed routes and refuses a foreign workspace',()=>{
 const source=readFileSync('frontend/tradelink-application.js','utf8');
 assert.match(source,/renderTradeLinkDocumentRepository\(\{detail,workspaceId,view:draftView,canManage,canReview,actorEmail\}\)/);
 assert.match(source,/renderTradeLinkDraftWorkspace\(\{detail,workspaceId,view:draftView,canManage,actorName,actorEmail,showModuleTabs:false\}\)/);
 const denied=renderTradeLinkApplication({...base,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 assert.match(denied,/signed workspace access is unavailable/);
 assert.doesNotMatch(denied,/class="tl-app-nav"|data-tradelink-draft-form/);
});


test('All Documents renders the signed list beside an honest empty preview, then places a selected preview in the adjacent pane',()=>{
 const row={documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  boardItemId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',documentType:'quotation',
  documentNumber:'Q-SPLIT-01',revision:1,workflowState:'draft',archived:false,
  updatedAt:'2026-11-13T01:00:00.000Z'};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[row]};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId,view,canManage:true});
 assert.match(html,/class="tl-document-split-view" data-tradelink-document-split/);
 assert.match(html,/class="tl-document-list-pane"/);
 assert.match(html,/class="tl-document-preview-pane" aria-label="Selected document preview"/);
 assert.match(html,/Q-SPLIT-01/);
 assert.match(html,/Select a document/);
 assert.match(html,/Preview\/Edit/);
 assert.match(html,/Preview<\/button>/);
 assert.match(html,/Choose Preview or View document from the list/);
 assert.match(html,/data-action="tradelink-document-open"/);
});


test('a verified saved document is rendered inside the adjacent preview pane without changing its signed revision',()=>{
 const documentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const boardItemId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const row={documentId,boardItemId,documentType:'quotation',documentNumber:'Q-SPLIT-02',
  revision:5,workflowState:'draft',archived:false,updatedAt:'2026-11-13T01:00:00.000Z'};
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
 const paneStart=html.indexOf('<aside class="tl-document-preview-pane"');
 const paneEnd=html.indexOf('</aside>',paneStart);
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
 assert.doesNotMatch(reviewer,/data-tl-tab="create"/);
 assert.match(reviewer,/data-tl-tab="documents"/);
 assert.match(reviewer,/data-tl-tab="activity"/);
 const activity=renderTradeLinkApplication({...base,section:'activity'});
 assert.doesNotMatch(activity,/class="tl-app-nav"/);
 assert.match(activity,/data-tl-tab="activity"[^>]*aria-current="page"/);
});

test('split view is responsive, keyboard accessible, reduced-motion aware, and CSS scoped to TradeLink',()=>{
 const css=readFileSync('frontend/tradelink-reference-ui.css','utf8');
 const fixture=readFileSync('scripts/cp-tl03d-render-reference-fixture.mjs','utf8');
 assert.match(css,/CP-TL-SPLIT-01/);
 assert.match(css,/data-tl-section=\"drafts\"\]\[data-tl-can-manage=\"true\"\] \.tl-app-layout/);
 assert.match(css,/grid-template-columns:minmax\(220px,260px\) minmax\(0,1fr\)/);
 assert.match(css,/\.tl-document-split-view/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.15fr\) minmax\(340px,\.85fr\)/);
 assert.match(css,/data-tl-section=\"drafts\"\]\[data-tl-can-manage=\"true\"\] \.tl-app-nav \.tl-module-link\{\s*display:flex/);
 assert.match(css,/\.tl-reference-portal \.tl-app-nav a:focus-visible/);
 assert.match(fixture,/moduleNavVisible/);
 assert.match(fixture,/navBeforeMain/);
 assert.match(fixture,/tl-app-nav/);
 assert.doesNotMatch(fixture,/tl-reference-document-tabs/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/data-tl-section=\"drafts\"\]\[data-tl-can-manage=\"true\"\] \.tl-app-layout\{\s*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.tl-reference-portal \.tl-app-nav/);
});
