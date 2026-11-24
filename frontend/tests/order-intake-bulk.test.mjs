import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOrderDecimals,orderTablePage,orderExportCsv} from '../order-intake-search.js';
import {filterOrderIntakeRows} from '../order-intake-read-state.js';
import {parseOrderIntakeRoute,orderIntakeHref} from '../order-intake-route.js';
import {runOrderBulk,validateBulkRequest} from '../order-intake-bulk.js';
import {renderOrderIntake} from '../order-intake-ui.js';
const native={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspace_id:'w',record_kind:'native',revision:1,archived:false,status:'Processed',po_number:'001',po_amount:'112.00',currency:'PHP',vat_rate:'12',vat_exclusive_amount:'100.00',vat_amount:'12.00',procurement_expenses:'5.00',gross_profit:'95.00',company:'A',industry:'Water'};
const legacy={...native,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',record_kind:'legacy',archived:null,po_number:'002',po_amount:'112.001',historical_client_name:'Original client',source_key:'snapshot:123',confirmation_reference:'C-42'};
test('advanced filter exact decimals, historical evidence and URL roundtrip',()=>{
 assert.equal(compareOrderDecimals('9007199254740993.001','9007199254740993.000'),1);
 assert.equal(compareOrderDecimals('1.000','1'),0);
 const f={minAmount:'112.001',maxAmount:'112.001',q:'original c-42',kind:'legacy'};
 const route=parseOrderIntakeRoute(orderIntakeHref('search',f));
 assert.deepEqual(filterOrderIntakeRows([native,legacy],route.filters),[legacy]);
 assert.deepEqual(filterOrderIntakeRows([{...legacy,po_amount:null}],f),[]);
 assert.deepEqual(filterOrderIntakeRows([native,legacy],{sort:'amount-desc'}),[legacy,native]);
});
test('pagination and selection across 909 rows',()=>{
 const rows=Array.from({length:909},(_,i)=>({...legacy,id:String(i),po_number:String(i)}));
 assert.equal(orderTablePage(rows,0).rows.length,25);
 assert.equal(orderTablePage(rows,36).rows.length,9);
 assert.equal(orderTablePage(rows,100).page,36);
 const html=renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake/search'),snapshot:{rows,hasMore:false},tableState:{page:1,selected:new Set(['25','0']),results:[],busy:false}});
 assert.match(html,/2 selected · 909 matching/);assert.match(html,/Page 2 of 37/);
 assert.equal((html.match(/data-oi-select=/g)||[]).length,25);
 assert.match(html,/data-oi-select="25"[^>]*checked/);
 const partial=renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake/search'),snapshot:{rows,hasMore:true},tableState:{page:0,selected:new Set(),results:[],busy:false}});
 assert.match(partial,/data-oi-action="select-all" disabled/);
});
test('CSV preserves exact source decimals, escaping and provenance; formulas neutralized',()=>{
 const csv=orderExportCsv([{...legacy,po_number:'=1+1',client_name:'A,"B"',gross_profit:'-1.005'}]);
 assert.match(csv,/source_key/);assert.match(csv,/112\.001/);assert.match(csv,/"'=1\+1"/);assert.match(csv,/"A,""B"""/);assert.match(csv,/"-1\.005"/);
});
test('bulk validation does not silently apply expenses across currencies',()=>{
 assert.throws(()=>validateBulkRequest('details',{procurementExpenses:'1'}),/currency/);
 assert.throws(()=>validateBulkRequest('details',{procurementExpenses:'1.001',currency:'PHP'}),/valid/);
 assert.deepEqual(validateBulkRequest('details',{company:' B ',procurementExpenses:'0.00',currency:'PHP'}),{company:'B',procurementExpenses:'0.00'});
});
test('mixed lifecycle batch uses existing RPCs, preserves revision and avoids duplicate writes',async()=>{
 const calls=[],actual=new Map();
 const client={updateStatus:async(id,rev,status)=>{calls.push([id,rev]);actual.set(id,{...native,status,revision:2});},
 changeLegacy:async(row,action,status)=>{calls.push([row.id,row.revision]);actual.set(row.id,{...row,status,revision:2});},
 detail:async id=>actual.get(id)};
 const result=await runOrderBulk({client,rows:[native,legacy,native],action:'status',values:{status:'Delivered'}});
 assert.deepEqual(result.map(r=>r.state),['verified','verified']);
 assert.equal(calls.length,2);assert.equal(actual.get(legacy.id).archived,null);
});
test('native details patch recalculates profit; historical and other currencies skipped',async()=>{
 let calls=0;
 const client={update:async(id,rev,patch)=>{calls++;assert.deepEqual(patch,{company:'B',procurementExpenses:'10.00'});},detail:async()=>({...native,revision:2,company:'B',procurement_expenses:'10.00',gross_profit:'90.00'})};
 const result=await runOrderBulk({client,rows:[native,legacy,{...native,id:'usd',currency:'USD'}],action:'details',values:{company:'B',procurementExpenses:'10.00',currency:'PHP'}});
 assert.deepEqual(result.map(r=>r.state),['verified','skipped','skipped']);assert.equal(calls,1);
});
test('unconfirmed write stops the remaining batch, with no replay',async()=>{
 let writes=0;
 const client={updateStatus:async()=>{writes++;throw Error('revision conflict');},detail:async()=>native};
 const result=await runOrderBulk({client,rows:[native,legacy],action:'status',values:{status:'Delayed'}});
 assert.deepEqual(result.map(r=>r.state),['unconfirmed','not attempted']);assert.equal(writes,1);
 const cancelled=await runOrderBulk({client,rows:[native],action:'status',values:{status:'Delayed'},isCurrent:()=>false});
 assert.equal(cancelled[0].state,'not attempted');assert.equal(writes,1);
});
