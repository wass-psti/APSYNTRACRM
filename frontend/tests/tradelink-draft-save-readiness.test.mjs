import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTradeLinkDraftForm,prepareTradeLinkDraftCommand,
 initialTradeLinkDraftView,renderTradeLinkDraftWorkspace}
 from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const fields=values=>({get:key=>values[key]??'',getAll:key=>[values[key]??'']});
const basic={documentType:'quotation',documentNumber:'Q-CP-TL-FUNC02-QA',
 customerName:'Synthetic pending customer'};
const ws='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,
 name:'TradeLink',description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},
 items:[],groups:[],columns:[]};

test('quotation Save Draft accepts incomplete commercial readiness without inventing fields',()=>{
 assert.throws(()=>parseTradeLinkDraftForm(fields(basic),{lineId:()=> 'l1'}),
  /Line item requires|Quotation readiness|Commercial Draft/);
 const saved=parseTradeLinkDraftForm(fields(basic),{purpose:'save',lineId:()=> 'l1'});
 assert.equal(saved.documentType,'quotation');
 assert.equal(saved.documentNumber,basic.documentNumber);
 assert.equal(saved.customerName,basic.customerName);
 assert.equal('items' in saved,false);
 assert.equal('validity' in saved,false);
 assert.equal('deliveryCommitment' in saved,false);
 assert.equal('approvedBy' in saved,false);
 const prepared=prepareTradeLinkDraftCommand(initialTradeLinkDraftView('quotation'),
  fields(basic),{documentId:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',lineId:()=> 'l1'});
 assert.equal(prepared.draft.documentNumber,basic.documentNumber);
 assert.equal(prepared.pendingCreateDraft.documentNumber,basic.documentNumber);
});

test('partial quotation never suppresses malformed nonempty values or disallowed fields',()=>{
 for(const override of [
  {customerEmail:'bad-email'},
  {lineDescription:'Unpriced item'},
  {lineDescription:'Item',lineQuantity:'1',lineUnitPrice:'0'},
  {lineDescription:'Item',lineQuantity:'-2',lineUnitPrice:'4'},
  {discountValue:'not-a-number'},
  {currency:'INVALID'},
  {documentNumber:'<script>'}
 ])assert.throws(()=>parseTradeLinkDraftForm(fields({...basic,...override}),
  {purpose:'save',lineId:()=> 'l1'}));
});

test('only quotation Draft save bypasses HTML submission-readiness; Preview remains strict',()=>{
 const view=initialTradeLinkDraftView('quotation');
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:ws,view,canManage:true});
 assert.match(html,/<form data-tradelink-draft-form novalidate>/);
 assert.match(html,/Save Draft can preserve incomplete Quotation details/);
 assert.match(html,/name="paymentTerms"[^>]*required/);
 assert.match(html,/name="lineQuantity"[^>]*required/);
 for(const type of ['esi','po','packing','delivery','payment']){
  const other=renderTradeLinkDraftWorkspace({detail,workspaceId:ws,
   view:initialTradeLinkDraftView(type),canManage:true});
  assert.match(other,/<form data-tradelink-draft-form>/);
  assert.doesNotMatch(other,/<form data-tradelink-draft-form novalidate>/);
 }
});

test('client Draft-save never bypasses signed commit or reviewer assignment validation',()=>{
 const complete={...basic,customerPhone:'09170000001',
  validity:'30 days',deliveryCommitment:'14 days',paymentTerms:'Net 30',
  approvedBy:'Management',
  lineDescription:'Synthetic item',lineQuantity:'2',lineUnitPrice:'10'};
 const save=parseTradeLinkDraftForm(fields(complete),{purpose:'save',lineId:()=> 'l1'});
 const preview=parseTradeLinkDraftForm(fields(complete),{lineId:()=> 'l1'});
 assert.deepEqual(save,preview);
 assert.equal(preview.items.length,1);
});
