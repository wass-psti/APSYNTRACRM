import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSalesIntelligence} from '../order-intake-analytics.js';
import {renderSalesDashboard} from '../order-intake-dashboard.js';
import {createOrderIntakeReadState,filterOrderIntakeRows} from '../order-intake-read-state.js';
import {parseOrderIntakeRoute} from '../order-intake-route.js';
import {readOrderIntakePreference,saveOrderIntakePreference} from '../order-intake-preference.js';

const native={id:'native',record_kind:'native',archived:false,currency:'PHP',po_amount:'112.00',
 procurement_expenses:'5.00',gross_profit:'95.00',status:'Delivered',date_received:'2026-11-01',
 fiscal_year:2026,company:'Company A',industry:'Water',account_manager:'Manager A'};
const historical={id:'historical',record_kind:'legacy',archived:null,currency:'USD',po_amount:'1.009',
 procurement_expenses:null,gross_profit:'1.008',status:'Please select',date_received:null,
 fiscal_year:2025,company:'Company B',industry:null,account_manager:null};
test('analytics preserve exact decimals, currency, basis and unknown coverage',()=>{
 const rows=[native,historical,{...historical,id:'h2',po_amount:'0.001',gross_profit:null,status:'Collected'},
  {...historical,id:'h3',currency:null,status:'Working on it',po_amount:'9999'},
  {...native,id:'archived',archived:true}];
 const p=projectSalesIntelligence(rows);
 assert.equal(p.total,4);assert.equal(p.native,1);assert.equal(p.legacy,3);
 assert.equal(p.open,2);assert.equal(p.openArchiveUnknown,1);assert.equal(p.collected,1);
 assert.equal(p.unknownStatus,1);assert.equal(p.unknownCurrency,1);assert.equal(p.unknownArchive,3);
 assert.equal(p.unknownReceived,3);assert.deepEqual(p.months,[{label:'2026-11',count:1}]);
 const h=p.finance.find(g=>g.basis==='historical');
 assert.equal(h.amount,'1.010');assert.equal(h.expenses,null);assert.equal(h.expensesCount,0);
 assert.equal(h.profit,'1.008');assert.equal(h.profitCount,1);assert.equal(h.count,2);
 assert.equal(p.finance.find(g=>g.basis==='native').profit,'95.00');
 assert.equal(p.managers.reduce((n,g)=>n+g.count,0),p.total);
 assert.equal(projectSalesIntelligence(filterOrderIntakeRows(rows,{year:'2026',company:'Company A'})).total,1);
 assert.throws(()=>projectSalesIntelligence([native,native]),/Duplicate/);
});
test('dashboard labels provisional totals and distinguishes unknown data from zero',()=>{
 const html=renderSalesDashboard([native,historical],{complete:false});
 assert.match(html,/provisional/);assert.match(html,/not recognized accounting revenue/);
 assert.match(html,/0 \/ 1 with value/);assert.match(html,/Account distribution/);
 assert.match(html,/Monthly orders/);
 assert.match(renderSalesDashboard([native],{complete:true}),/All available registry pages retrieved/);
 assert.doesNotMatch(renderSalesDashboard([{...native,company:'<script>'}]),/<script>/);
});
test('complete mode uses bounded sequential pages and reuses a completed collection',async()=>{
 const offsets=[],updates=[];
 const rows=Array.from({length:909},(_,i)=>({id:String(i)}));
 const state=createOrderIntakeReadState({clientFor:()=>({list:async({offset,limit})=>{
  offsets.push(offset);return {items:rows.slice(offset,offset+limit),hasMore:offset+limit<rows.length};
 }}),isCurrent:()=>true,onChange:()=>updates.push(1)});
 await Promise.all([state.open('a',true),state.open('a',true)]);
 assert.deepEqual(offsets,[0,100,200,300,400,500,600,700,800,900]);
 assert.equal(state.read('a').rows.length,909);assert.equal(state.read('a').hasMore,false);
 assert.equal(updates.length,2);
 await state.open('a');await state.open('a',true);assert.equal(offsets.length,10);
});
test('refresh failure preserves previous collection but does not publish partial completion',async()=>{
 let fail=false;
 const state=createOrderIntakeReadState({clientFor:()=>({list:async({offset})=>{
  if(fail&&offset)throw Error('network failed');
  return {items:[{id:String(offset)}],hasMore:offset===0};
 }}),isCurrent:()=>true,onChange:()=>{}});
 await state.open('a',true);assert.equal(state.read('a').rows.length,2);
 fail=true;await state.refresh('a',true);
 assert.equal(state.read('a').rows.length,2);assert.match(state.read('a').error,/network failed/);
});
test('complete load supersedes a partial scan and drops stale workspace responses',async()=>{
 let current='a',release;
 const state=createOrderIntakeReadState({clientFor:scope=>({list:async()=>scope==='a'?new Promise(r=>{release=r;}):{items:[{id:'b'}],hasMore:false}}),isCurrent:s=>s===current,onChange:()=>{}});
 const pending=state.open('a',true);await Promise.resolve();
 current='b';state.clear();await state.open('b',true);release({items:[{id:'a'}],hasMore:true});await pending;
 assert.deepEqual(state.read('b').rows,[{id:'b'}]);assert.equal(state.read('a'),null);
});
test('preferences restore structured filters per user/workspace; no search terms or record IDs',()=>{
 const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa|bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const b=a.replace(/^a+/,'cccccccc');const data=new Map();
 const storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)};
 const route=parseOrderIntakeRoute('#/order-intake/search?year=2026&company=A&q=private');
 assert.equal(saveOrderIntakePreference(a,route,storage),true);
 assert.equal(readOrderIntakePreference(a,storage),'#/order-intake/search?year=2026&company=A');
 assert.equal(readOrderIntakePreference(b,storage),null);
 assert.equal(saveOrderIntakePreference(a,{...route,recordId:'id'},storage),false);
 assert.equal(readOrderIntakePreference(a,{getItem(){throw Error('blocked');}}),null);
});
