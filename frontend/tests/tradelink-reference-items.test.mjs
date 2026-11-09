import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {
 renderTradeLinkDraftLineItem,renderTradeLinkDraftWorkspace,
 parseTradeLinkDraftForm,calculateTradeLinkDraftLocalAmounts,
 updateTradeLinkLineRowTotals,tradeLinkLineAmount,initialTradeLinkDraftView
} from '../tradelink-draft-workspace.js';

const ws='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
const entries=overrides=>{
 const data={documentType:'quotation',documentNumber:'Q-011',
  customerName:'Client',customerEmail:'client@example.com',validity:'30 days',
  paymentTerms:'Net 30',deliveryCommitment:'Four weeks',approvedBy:'Supervisor',
  currency:'PHP',vatType:'12',discountType:'percentage',discountValue:'5',
  lineKind:['item','note','item'],lineDescription:['Pump','Handle carefully','Seal'],
  lineQuantity:['2','','3'],lineUnitPrice:['100','','50'],
  lineUnit:['pc','','pc'],lineId:['a','b','c'],...overrides};
 return {
  get:key=>{const v=data[key];return Array.isArray(v)?v[0]:v??null;},
  getAll:key=>{const v=data[key];return Array.isArray(v)?v:v==null?[]:[v];}
 };
};

test('item, note, item serialize in order without giving the note a price',()=>{
 const payload=parseTradeLinkDraftForm(entries(),{lineId:()=>{throw Error('unexpected new id');}});
 assert.deepEqual(payload.items.map(item=>item.kind),['item','note','item']);
 assert.deepEqual(payload.items.map(item=>item.id),['a','b','c']);
 assert.deepEqual(payload.items[1],{id:'b',kind:'note',description:'Handle carefully'});
 assert.equal(payload.items[0].quantity,2);
 assert.equal(payload.items[2].unitPrice,50);
 const estimate=calculateTradeLinkDraftLocalAmounts(entries());
 assert.equal(estimate.subtotal,350);
 assert.equal(estimate.discount,17.5);
 assert.equal(estimate.vat,39.9);
 assert.equal(estimate.total,372.4);
});

test('notes must not carry financial values and invalid kinds are rejected',()=>{
 for(const changed of [
  {lineKind:['item','note','item'],lineQuantity:['2','99','3']},
  {lineKind:['item','note','item'],lineUnitPrice:['100','20','50']},
  {lineKind:['item','note','item'],lineUnit:['pc','pc','pc']},
  {lineKind:['item','invalid','item']},
  {lineKind:['item','note','item'],lineDescription:['Pump','','Seal']}
 ])assert.throws(()=>parseTradeLinkDraftForm(entries(changed)),/note|line/i);
 assert.equal(tradeLinkLineAmount({kind:'note',quantity:50,unitPrice:9999}),null);
 assert.equal(tradeLinkLineAmount({kind:'item',quantity:3,unitPrice:25}),75);
 assert.equal(tradeLinkLineAmount({kind:'item',quantity:Infinity,unitPrice:1}),null);
});

test('reference row markup provides controls, escaping, and note price isolation',()=>{
 const item=renderTradeLinkDraftLineItem({kind:'item',id:'one',description:'<unsafe>',
   quantity:2,unitPrice:100,unit:'pc'},'quotation','PHP',0);
 assert.match(item,/data-tradelink-line-item/);
 assert.match(item,/data-tradelink-line-total/);
 assert.match(item,/200\.00 PHP/);
 assert.match(item,/name="lineKind" value="item"/);
 assert.match(item,/name="lineQuantity"/);
 assert.match(item,/name="lineUnitPrice"/);
 assert.match(item,/data-action="tradelink-draft-move-line"/);
 assert.match(item,/data-action="tradelink-draft-remove-line"/);
 assert.match(item,/&lt;unsafe&gt;/);
 assert.doesNotMatch(item,/<unsafe>/);
 const note=renderTradeLinkDraftLineItem({kind:'note',id:'two',
  description:'<script>alert(1)</script>'},'quotation','PHP',1);
 assert.match(note,/name="lineKind" value="note"/);
 assert.match(note,/name="lineQuantity" value=""/);
 assert.match(note,/name="lineUnitPrice" value=""/);
 assert.doesNotMatch(note,/data-tradelink-line-total/);
 assert.match(note,/&lt;script&gt;/);
 assert.doesNotMatch(note,/<script>/);
 const physical=renderTradeLinkDraftLineItem({kind:'note',description:'Care'},'delivery','PHP',0);
 assert.doesNotMatch(physical,/name="lineUnitPrice"/);
 assert.match(physical,/name="lineSerialNumber" value=""/);
});

test('new and saved Draft editors have reference toolbar; sourcing remains nonoperative',()=>{
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:ws,
  view:initialTradeLinkDraftView('quotation'),canManage:true});
 assert.match(html,/data-action="tradelink-draft-add-line"/);
 assert.match(html,/Add Blank/);
 assert.match(html,/data-action="tradelink-draft-add-note"/);
 assert.match(html,/Add Note/);
 assert.match(html,/Add from Sourcing Board · pending integration/);
 assert.match(html,/class="tl-ref-sourcing" disabled/);
 assert.match(html,/data-tradelink-draft-finance/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tradelink-draft-add-note':/);
 assert.match(app,/case 'tradelink-draft-move-line':/);
 assert.match(app,/addEventListener\('dragstart'/);
 assert.match(app,/captureTradeLinkDraftFields\(\{target:/);
});

test('line amounts update through textContent only and do not mutate persistence',()=>{
 let text='initial';
 const output={set textContent(value){text=value;},get textContent(){return text;}};
 const row={querySelector:selector=>({
  '[data-tradelink-line-total]':output,
  '[name="lineKind"]':{value:'item'},
  '[name="lineQuantity"]':{value:'2'},
  '[name="lineUnitPrice"]':{value:'15'}
 })[selector]};
 const form={querySelector:()=>({value:'PHP'}),querySelectorAll:()=>[row]};
 updateTradeLinkLineRowTotals(form);
 assert.equal(text,'30.00 PHP');
});


test('source-aligned totals replace the legacy card and keep one VAT input',()=>{
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:ws,
  view:initialTradeLinkDraftView('quotation'),canManage:true});
 assert.match(html,/tl-draft-finance tl-reference-totals/);
 assert.match(html,/Subtotal After Discount:/);
 assert.match(html,/TOTAL:/);
 assert.match(html,/Discount:/);
 assert.match(html,/data-tradelink-draft-exchange hidden/);
 assert.equal((html.match(/name="vatType"/g)||[]).length,1);
 assert.equal((html.match(/name="discountType"/g)||[]).length,1);
 assert.doesNotMatch(html,/Local commercial estimate/);
 assert.doesNotMatch(html,/One priced item using the source discount/);
 const foreign={...initialTradeLinkDraftView('quotation'),formValues:{documentType:'quotation',currency:'USD'}};
 const other=renderTradeLinkDraftWorkspace({detail,workspaceId:ws,view:foreign,canManage:true});
 assert.match(other,/data-tradelink-draft-exchange>/);
 assert.match(other,/PHP equivalent \(PHP\)/);
});
