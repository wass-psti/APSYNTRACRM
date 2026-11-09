import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDraftWorkspace,
 TRADELINK_COMMERCIAL_SUGGESTIONS} from '../tradelink-draft-workspace.js';

const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const render=type=>renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
 view:initialTradeLinkDraftView(type),canManage:true});

test('reference options preserve user-editable commercial terms',()=>{
 const quote=render('quotation');
 const po=render('po');
 for(const html of [quote,po]){
  assert.match(html,/name="paymentTerms"[^>]+list="tl-suggest-paymentTerms"/);
  assert.match(html,/<datalist id="tl-suggest-paymentTerms">/);
  assert.match(html,/value="COD \(Cash on Delivery\)"/);
  assert.match(html,/value="90 Days Net"/);
 }
 assert.match(quote,/name="validity"[^>]+list="tl-suggest-validity"/);
 assert.match(quote,/name="deliveryCommitment"[^>]+list="tl-suggest-deliveryCommitment"/);
 assert.match(quote,/value="24 Weeks"/);
 assert.equal(TRADELINK_COMMERCIAL_SUGGESTIONS.validity.length,6);
 for(const type of ['esi','packing','delivery','payment']){
  assert.doesNotMatch(render(type),/tl-suggest-paymentTerms/);
 }
});

test('suggestions are not enabled workflow, company, or monetary actions',()=>{
 const html=render('quotation');
 assert.doesNotMatch(html,/data-action="tradelink-company-reset-counter"/);
 assert.doesNotMatch(html,/data-action="tradelink-upload-logo"/);
 assert.match(html,/PDF generation requires an authorized workflow/);
 assert.match(html,/No PDF, approval or document is generated/);
});

test('All Documents retains scrollable authorized results and responsive filters',()=>{
 const css=readFileSync('frontend/tradelink-reference-ui.css','utf8');
 assert.match(css,/CP-TL-REBUILD-03B: All Documents/);
 assert.match(css,/\.tl-reference-portal \.tl-document-repository \.tl-records-scroll\{[\s\S]*?overflow-x:auto/);
 assert.match(css,/\.tl-reference-portal \.tl-document-repository \.tl-draft-list-filters\{/);
 assert.match(css,/@media\(max-width:460px\)/);
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(source,/renderTradeLinkDraftList\(rows,view,canManage,\{readOnly:true\}\)/);
 assert.match(source,/data-action="tradelink-documents-refresh"/);
 assert.match(source,/data-action="tradelink-document-open"/);
});
