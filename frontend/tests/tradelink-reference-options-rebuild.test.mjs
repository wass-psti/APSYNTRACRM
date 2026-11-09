import test from 'node:test';
import assert from 'node:assert/strict';
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
