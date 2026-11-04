import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TRADELINK_VAT_CODES,TRADELINK_CURRENCIES,tradeLinkVatRate,
 calculateTradeLinkAmounts,formatTradeLinkAmount,renderTradeLinkFinancePreview,
 updateTradeLinkFinancePreview
} from '../tradelink-finance.js';
import {renderTradeLinkApplication} from '../tradelink-application.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
const ws='11111111-1111-4111-8111-111111111111';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',status:'active',
 description:'[APSYNTRA:MODULE:tradelink:v1] Source fixture'},
 columns:[],items:[],groups:[]};
test('VAT, discount, currency and exchange rules agree with original model calculate',()=>{
 assert.deepEqual(TRADELINK_VAT_CODES,['15_tkm','15_ksa','12','exempt','zero']);
 assert.deepEqual(TRADELINK_CURRENCIES,['PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR']);
 assert.equal(tradeLinkVatRate('15_tkm'),0.15);
 assert.equal(tradeLinkVatRate('15_ksa'),0.15);
 assert.equal(tradeLinkVatRate('12'),0.12);
 assert.equal(tradeLinkVatRate('exempt'),0);
 assert.equal(tradeLinkVatRate('zero'),0);
 assert.equal(tradeLinkVatRate('__proto__'),0);
 const values=calculateTradeLinkAmounts({
  items:[{kind:'item',quantity:2,unitPrice:100},{kind:'note',quantity:10,unitPrice:9999}],
  discountType:'percentage',discountValue:10,vatType:'12',currency:'USD',exchangeRate:56
 });
 assert.equal(values.subtotal,200);
 assert.equal(values.discount,20);
 assert.equal(values.taxable,180);
 assert.ok(Math.abs(values.vat-21.6)<1e-8);
 assert.ok(Math.abs(values.total-201.6)<1e-8);
 assert.ok(Math.abs(values.phpEquivalent-11289.6)<1e-8);
});
test('fixed discount is clamped and invalid financial input never produces Infinity',()=>{
 const values=calculateTradeLinkAmounts({items:[{kind:'item',quantity:1,unitPrice:50}],
  discountType:'fixed',discountValue:1000,vatType:'15_ksa',currency:'PHP',exchangeRate:100});
 assert.equal(values.discount,50);
 assert.equal(values.total,0);
 assert.equal(values.phpEquivalent,0);
 const invalid=calculateTradeLinkAmounts({items:[{kind:'item',quantity:'Infinity',unitPrice:-10}],
  discountType:'percentage',discountValue:'oops',vatType:'bad',currency:'USD',exchangeRate:'oops'});
 assert.ok(Object.values(invalid).every(Number.isFinite));
 assert.equal(invalid.total,0);
 assert.equal(formatTradeLinkAmount(Number.POSITIVE_INFINITY),'—');
});
test('only source commercial modules display a nonpersistent preview',()=>{
 for(const module of ['esi','quotation','po']){
  const html=renderTradeLinkApplication({detail,section:module,workspaceId:ws});
  assert.match(html,/Commercial calculation preview/);
  assert.match(html,/Unsaved estimate/);
  assert.doesNotMatch(html,/data-action="save-document"|type="submit"/);
 }
 for(const module of ['packing','delivery','payment']){
  const html=renderTradeLinkApplication({detail,section:module,workspaceId:ws});
  assert.doesNotMatch(html,/Commercial calculation preview/);
 }
});
test('native preview updates only textContent and cannot make network or DB mutations',()=>{
 const fields={quantity:'2',unitPrice:'100',discountType:'percentage',discountValue:'10',
  vatType:'12',currency:'USD',exchangeRate:'56'};
 const currencyLabel={textContent:''};
 const outputs=Object.fromEntries(['subtotal','discount','taxable','vat','total','phpEquivalent']
  .map(key=>[key,{textContent:''}]));
 const container={querySelector(query){
  const key=query.match(/\[name="([^"]+)"\]/)?.[1];
  return key?{value:fields[key]}:null;
 },parentElement:{querySelector(query){
  if(query==='[data-tradelink-finance-currency]')return currencyLabel;
  const key=query.match(/data-tradelink-finance-result="([^"]+)"/)?.[1];
  return outputs[key]||null;
 }}};
 const result=updateTradeLinkFinancePreview(container);
 assert.equal(result.subtotal,200);
 assert.equal(outputs.total.textContent,'201.60');
 assert.equal(currencyLabel.textContent,'USD');
 assert.equal(outputs.phpEquivalent.textContent,'11,289.60');
 assert.equal(updateTradeLinkFinancePreview(null),null);
 const js=readFileSync('frontend/tradelink-finance.js','utf8');
 assert.doesNotMatch(js,/fetch\(|\.rpc\(|localStorage|sessionStorage|indexedDB|\.innerHTML\s*=/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/function syncTradeLinkFinanceInput\(event\)/);
 assert.match(app,/state\.boardId!==TRADELINK_BOARD_ID/);
 assert.match(app,/updateTradeLinkFinancePreview\(panel\)/);
 assert.match(app,/root\.addEventListener\('input',event=>\{\s*if\(syncTradeLinkFinanceInput\(event\)\)return/);
 assert.match(app,/root\.addEventListener\('change',event=>\{\s*if\(syncTradeLinkFinanceInput\(event\)\)return/);
});
test('rendered control set remains semantic, accessible and source VAT complete',()=>{
 const html=renderTradeLinkFinancePreview();
 for(const name of ['quantity','unitPrice','discountType','discountValue','vatType','currency','exchangeRate'])
  assert.match(html,new RegExp('name="'+name+'"'));
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/15% TKM VAT/);
 assert.match(html,/15% KSA VAT/);
 assert.match(html,/0% Zero Rated/);
 assert.doesNotMatch(html,/onchange=|oninput=|<script/);
});
