import test from 'node:test';
import assert from 'node:assert/strict';
import {orderEditorDraft,validateOrderDraft,orderEditorMarkup,createOrderEditorSave,nativeEditable} from '../order-intake-editor.js';
import {renderOrderIntake} from '../order-intake-ui.js';
import {parseOrderIntakeRoute} from '../order-intake-route.js';
const draft={...orderEditorDraft(),poNumber:'00001',clientName:'Client <A>',company:'Company',industry:'Water',
 poDate:'2026-11-24',dateReceived:'2026-11-24',deliveryDate:'2026-12-01',poAmount:'112.00',procurementExpenses:'5.00'};
const record={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspace_id:'w',record_kind:'native',archived:false,revision:1,
 po_number:'00001',client_name:'Client <A>',company:'Company',industry:'Water',po_date:draft.poDate,date_received:draft.dateReceived,
 delivery_date:draft.deliveryDate,currency:'PHP',po_amount:'112.00',vat_rate:'12.0000',procurement_expenses:'5.00',status:'Working on it',
 account_manager:'Unassigned',buyer_in_charge:'',end_user_in_charge:'',notes:'',vat_exclusive_amount:'100.00',vat_amount:'12.00',gross_profit:'95.00'};
test('editor validates all backend fields and computes exact financials',()=>{
 const {order,preview}=validateOrderDraft(draft);
 assert.equal(Object.keys(order).length,16);
 assert.equal(order.poNumber,'00001');
 assert.deepEqual(preview,{vatExclusiveAmount:'100.00',vatAmount:'12.00',grossProfit:'95.00'});
 assert.equal(validateOrderDraft({...draft,vatRate:'0',procurementExpenses:'150'}).preview.grossProfit,'-38.00');
 for(const patch of [{poNumber:' '},{poAmount:'1.234'},{poAmount:'0'},{vatRate:'-1'},{procurementExpenses:'-1'},
  {deliveryDate:'2026-11-23'},{dateReceived:'2026-02-30'},{currency:'JPY'},{poAmount:'9999999999999999.01'}])assert.throws(()=>validateOrderDraft({...draft,...patch}));
 assert.doesNotThrow(()=>validateOrderDraft({...draft,poAmount:'9999999999999999.00'}));
});
test('native editor only; historical detail stays read-only and form content escaped',()=>{
 assert.equal(nativeEditable(record),true);
 assert.throws(()=>orderEditorDraft({...record,record_kind:'legacy'}));
 assert.match(orderEditorMarkup(draft),/Client &lt;A&gt;/);
 assert.match(orderEditorMarkup(draft),/name="poAmount"/);
 const route=parseOrderIntakeRoute('#/order-intake/all-orders/record/'+record.id);
 const render=row=>renderOrderIntake({route,snapshot:{rows:[],hasMore:false},record:{row}});
 assert.match(render(record),/data-oi-action="edit"/);
 assert.doesNotMatch(render({...record,record_kind:'legacy'}),/data-oi-action="edit"/);
 assert.match(render(record),/New purchase order/);
});
test('ambiguous create retains request ID and original values, confirms exact readback',async()=>{
 const calls=[];
 const client={create:async(order,id)=>{calls.push(id);if(calls.length===1)throw Object.assign(new Error('timeout'),{status:0});return record;},detail:async()=>record};
 const save=createOrderEditorSave({client,newId:()=> 'stable'});
 await assert.rejects(save(draft),/timeout/);
 assert.equal(save.pendingDraft().poNumber,'00001');
 await assert.rejects(save({...draft,notes:'changed'}),/uncertain/);
 assert.equal(await save(draft),record);
 assert.deepEqual(calls,['stable','stable']);
 assert.equal(save.pendingDraft(),null);
});
test('acknowledged write plus failed readback retries read only',async()=>{
 let writes=0,reads=0;
 const save=createOrderEditorSave({client:{create:async()=>{writes++;return record;},detail:async()=>{if(++reads===1)throw Error('read failed');return record;}},newId:()=> 'stable'});
 await assert.rejects(save(draft),/read failed/);
 assert.equal(await save(draft),record);
 assert.equal(writes,1);
});
test('revision-checked update and lost response reconciliation',async()=>{
 const next={...record,revision:2,notes:'updated'};
 let writes=0;
 const client={update:async(id,revision,order)=>{writes++;assert.equal(id,record.id);assert.equal(revision,1);assert.equal(order.notes,'updated');throw Object.assign(Error('timeout'),{status:0});},detail:async()=>next};
 assert.equal(await createOrderEditorSave({client,row:record})({...draft,notes:'updated'}),next);
 assert.equal(writes,1);
});
test('conflicts do not overwrite newer data; changed session never writes',async()=>{
 const client={update:async()=>{throw Object.assign(Error('ORDER_INTAKE_REVISION_CONFLICT'),{status:409});},detail:async()=>({...record,revision:2,notes:'someone else'})};
 await assert.rejects(createOrderEditorSave({client,row:record})({...draft,notes:'updated'}),/REVISION_CONFLICT/);
 await assert.rejects(createOrderEditorSave({client,isCurrent:()=>false})(draft),/session changed/);
});
test('simultaneous submit produces only one write',async()=>{
 let release;
 const save=createOrderEditorSave({client:{create:()=>new Promise(resolve=>{release=resolve;}),detail:async()=>record},newId:()=> 'stable'});
 const pending=save(draft);
 await assert.rejects(save(draft),/already in progress/);
 release(record);
 assert.equal(await pending,record);
});
