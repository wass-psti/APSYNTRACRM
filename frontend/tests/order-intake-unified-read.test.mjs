import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedOrderIntakeReader,projectUnifiedOrders} from '../order-intake-unified-read.js';
import {filterOrderIntakeRows} from '../order-intake-read-state.js';
import {renderOrderIntake} from '../order-intake-ui.js';
import {parseOrderIntakeRoute,orderIntakeHref} from '../order-intake-route.js';

const native={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspace_id:'w',po_number:'PO-1',date_received:'2026-01-02',currency:'PHP',po_amount:'100.00',procurement_expenses:'5.00',gross_profit:'84.29',status:'Processed',archived:false};
const historical={...native,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',record_kind:'legacy',source_key:'monday:1:2',client_name:null,currency:'USD',po_amount:'12.345',gross_profit:'12.345',procurement_expenses:null,archived:null,status:'Please select'};
const unknown={...historical,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',source_key:'monday:1:3',currency:null,po_amount:'200',date_received:null};
test('combined paging preserves repeated PO numbers, stable IDs and details',async()=>{
 const reader=createUnifiedOrderIntakeReader({workspaceId:'w',nativeRows:[native],legacyRows:[historical,unknown]});
 const a=await reader.list({limit:2}),b=await reader.list({offset:2,limit:2});
 assert.equal(a.hasMore,true);assert.equal(b.hasMore,false);
 assert.equal(new Set([...a.items,...b.items].map(r=>r.id)).size,3);
 assert.deepEqual(await reader.detail(historical.id),historical);
 assert.equal(await reader.detail('missing'),null);
});
test('duplicate identities and invalid scopes fail rather than inflate the registry',()=>{
 assert.throws(()=>createUnifiedOrderIntakeReader({workspaceId:'w',nativeRows:[native],legacyRows:[historical,historical]}),/identity/);
 assert.throws(()=>createUnifiedOrderIntakeReader({workspaceId:'other',nativeRows:[native],legacyRows:[]}),/identity/);
 assert.throws(()=>createUnifiedOrderIntakeReader({workspaceId:'w',nativeRows:[],legacyRows:[historical,{...unknown,source_key:historical.source_key}]}),/Duplicate legacy/);
});
test('legacy totals preserve precision, unknown currency and separate profit basis',()=>{
 const p=projectUnifiedOrders([native,historical,unknown,{...historical,id:'archived',archived:true}]);
 assert.equal(p.totalOrders,3);assert.equal(p.legacyCount,2);assert.equal(p.legacyUnknownCurrency,1);assert.equal(p.legacyUnknownArchive,2);
 assert.deepEqual(p.currencyTotals,[{currency:'PHP',amount:'100.00',expenses:'5.00',grossProfit:'84.29'}]);
 assert.deepEqual(p.legacyTotals,[{currency:'USD',rows:1,amountCount:1,amount:'12.345'}]);
 assert.equal(p.workflow.find(s=>s.status==='Please select').orders.length,2);
});
test('unknown currency filter and detail provenance render without inventing values',()=>{
 assert.deepEqual(filterOrderIntakeRows([native,historical,unknown],{currency:'Unknown currency'}),[unknown]);
 const snapshot={rows:[native,historical,unknown],hasMore:false};
 const html=renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake'),snapshot});
 assert.match(html,/Historical source figures/);assert.match(html,/12.345/);assert.match(html,/1 unknown currency/);
 assert.match(html,/84.29/);
 const detail=renderOrderIntake({route:parseOrderIntakeRoute(orderIntakeHref('all-orders',{},historical.id)),snapshot,record:{row:historical}});
 assert.match(detail,/Historical record/);assert.match(detail,/12.345/);assert.match(detail,/Please select/);
});
