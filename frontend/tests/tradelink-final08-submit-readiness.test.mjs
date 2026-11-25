import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectTradeLinkSubmitReadiness,summarizeTradeLinkSubmitReadiness}
 from '../tradelink-submit-readiness.js';
import {initialTradeLinkDraftView,renderTradeLinkDocumentRepository}
 from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const fixtures={
 esi:{customerTin:'TIN',verifiedBy:'Finance',approvedBy:'Manager'},
 quotation:{customerEmail:'client@example.test',validity:'30 days',deliveryCommitment:'FOB',paymentTerms:'Net 30',approvedBy:'Manager'},
 po:{targetDeliveryDate:'2026-12-01',paymentTerms:'Net 30',verifiedBy:'Finance',approvedBy:'Manager'},
 delivery:{referenceNumber:'SO-12',checkedBy:'QC',deliveredBy:'Courier'},
 packing:{referenceNumber:'SO-12'},
 payment:{paymentParticulars:'Invoice',receivedBy:'Cashier',verifiedBy:'Finance',cashAmount:1,chequeAmount:0}
};
const priced=new Set(['esi','quotation','po']);
const make=type=>({document_type:type,document_number:'TEST-'+type,
 content:{documentType:type,documentNumber:'TEST-'+type,customerName:'Customer',
  items:[{description:'Product',quantity:1,unitPrice:priced.has(type)?10:0}],...fixtures[type]}});

test('six module signed-source readiness reports expected Submit/Completed destination',()=>{
 for(const type of Object.keys(fixtures)){
  const report=inspectTradeLinkSubmitReadiness(make(type));
  assert.deepEqual(report,{ready:true,destination:type==='packing'?'completed':'submitted',missing:[]},type);
  assert.match(summarizeTradeLinkSubmitReadiness(make(type)),/read-only|Read-only/i);
 }
});
test('missing source-specific fields are advisory, precise, and do not reveal values',()=>{
 for(const type of Object.keys(fixtures)){
  const row=make(type);
  const key=Object.keys(fixtures[type])[0];delete row.content[key];
  if(type==='quotation')delete row.content.customerPhone;
  if(type==='payment')row.content.cashAmount=0;
  const result=inspectTradeLinkSubmitReadiness(row);
  assert.equal(result.ready,false,type);
  assert.ok(result.missing.length>0,type);
  const summary=summarizeTradeLinkSubmitReadiness(row);
  assert.match(summary,/No changes were saved/);
  assert.doesNotMatch(summary,/client@example\.test|TIN-123|SO-12/); // Never disclose field values.
 }
});

test('signed submit readiness accepts 250 items and rejects item or 2 MiB capacity overflow',()=>{
 const large=make('quotation');
 large.content.items=Array.from({length:250},(_,index)=>({
  id:'line-'+(index+1),kind:'item',description:'Item '+(index+1),quantity:1,unitPrice:10
 }));
 assert.equal(inspectTradeLinkSubmitReadiness(large).ready,true);
 large.content.items.push({...large.content.items[0],id:'line-251'});
 assert.match(inspectTradeLinkSubmitReadiness(large).missing.join(' '),/Valid line items/);
 const tooLarge=make('quotation');
 tooLarge.content.items[0].unit='x'.repeat(2*1024*1024);
 assert.match(inspectTradeLinkSubmitReadiness(tooLarge).missing.join(' '),/2 MiB capacity/);
});

test('malformed items, stale identity, and cheque instructions are flagged without persistence',()=>{
 const esi=make('esi');esi.content.items=[{description:'',quantity:1,unitPrice:10}];
 assert.match(inspectTradeLinkSubmitReadiness(esi).missing.join(),/Valid line items/);
 const po=make('po');po.content.documentNumber='changed';
 assert.match(inspectTradeLinkSubmitReadiness(po).missing.join(),/consistency/);
 const payment=make('payment');payment.content.cashAmount=0;payment.content.chequeAmount=40;
 assert.ok(inspectTradeLinkSubmitReadiness(payment).missing.includes('Cheque bank'));
 assert.ok(inspectTradeLinkSubmitReadiness(payment).missing.includes('Cheque number'));
 assert.equal(inspectTradeLinkSubmitReadiness({document_type:'other',content:{}}).ready,false);
});
test('readiness affordance only accompanies eligible signed active Submit actions',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const ws='00000000-0000-4000-8000-000000000001';
 const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
 const row={documentId:id,boardItemId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',documentType:'esi',documentNumber:'ESI-T',revision:1,workflowState:'draft',archived:false};
 for(const [workflowState,archived,expected] of [
  ['draft',false,1],['revision-required',false,1],['for-approval',false,0],
  ['submitted',false,0],['approved',false,0],['draft',true,0]
 ]){
  const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[{...row,workflowState,archived}]};
  const html=renderTradeLinkDocumentRepository({detail,workspaceId:ws,view,canManage:true});
  assert.equal((html.match(/data-action="tradelink-document-check-readiness"/g)||[]).length,expected);
  const denied=renderTradeLinkDocumentRepository({detail,workspaceId:ws,view,canManage:false});
  assert.doesNotMatch(denied,/data-action="tradelink-document-check-readiness"/);
 }
});
test('host handles read-only readiness through exact authorized record read, not a mutation RPC',()=>{
 const host=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const begin=host.indexOf('async function checkTradeLinkDocumentReadiness(');
 const end=host.indexOf('/** Genuine source workflow submit',begin);
 assert.ok(begin>0&&end>begin);
 const body=host.slice(begin,end);
 assert.match(body,/tradeLinkDraftWorkspace\.read\(documentId\)/);
 assert.match(body,/record\.revision!==listed\.revision/);
 assert.match(body,/record\.archived_at!==null/);
 assert.doesNotMatch(body,/\.submit\(|\.rpc\(|\.commit\(|\.save\(/);
 assert.match(host,/case 'tradelink-document-check-readiness':/);
});
