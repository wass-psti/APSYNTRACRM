import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkSavedDocumentOutput} from '../tradelink-saved-document-output.js';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView}
 from '../tradelink-draft-workspace.js';

const workspace='00000000-0000-4000-8000-000000000001';
const id='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const item='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const stamp='2026-11-08T09:35:00.098765+00:00';
const line={id:'line-1',kind:'item',description:'Filter assembly',quantity:2,
 unit:'pieces',unitPrice:300.5,serialNumber:'A-2026-001'};
const base={
 id,workspace_id:workspace,board_id:TRADELINK_BOARD_ID,board_item_id:item,
 revision:5,workflow_state:'draft',updated_at:stamp,created_at:stamp,
 archived_at:null,document_type:'quotation',document_number:'Q-QA-20261108-01',
 content:{documentType:'quotation',documentNumber:'Q-QA-20261108-01',
  customerName:'Synthetic buyer',customerAddress:'Cebu City',
  currency:'PHP',vatType:'12',discountType:'fixed',discountValue:10,
  validity:'30 days',deliveryCommitment:'14 days',paymentTerms:'Net 30',
  items:[line],remarks:'Signed record print snapshot'}
};
const docs={
 quotation:base.content,
 esi:{...base.content,documentType:'esi',documentNumber:'ESI-001',
  customerTin:'TIN-100',approvedBy:'Approver',verifiedBy:'Verifier'},
 po:{...base.content,documentType:'po',documentNumber:'PO-001',
  poNumber:'PO-SRC-001',targetDeliveryDate:'2026-12-01',approvedBy:'Approver'},
 packing:{documentType:'packing',documentNumber:'PK-001',
  customerName:'Consignee',referenceNumber:'SO-001',items:[line]},
 delivery:{documentType:'delivery',documentNumber:'DR-001',
  customerName:'Recipient',referenceNumber:'SO-001',
  checkedBy:'qc@example.test',deliveredBy:'logistics@example.test',
  receivedBy:'Recipient',items:[line]},
 payment:{documentType:'payment',documentNumber:'AR-001',
  customerName:'Payor',paymentParticulars:'Invoice settlement',
  currency:'PHP',cashAmount:50,chequeAmount:150,
  bankName:'Bank',chequeNumber:'CH-001',receivedBy:'cashier@example.test'}
};
const record=(type,content=docs[type])=>({...base,document_type:type,
 document_number:content.documentNumber,content});

test('all six saved TradeLink modules produce genuine printable records, no mock content',()=>{
 for(const [type,content] of Object.entries(docs)){
  const html=renderTradeLinkSavedDocumentOutput(record(type,content),workspace,id);
  assert.match(html,/data-tradelink-signed-output/);
  assert.match(html,/Signed saved document|authenticated saved document revision/i);
  assert.match(html,new RegExp(content.documentNumber));
  assert.match(html,/Saved revision/);
  assert.match(html,/>5<\/dd>/);
  assert.match(html,/>DRAFT</);
  assert.match(html,/DRAFT — not approved or issued by printing/);
  assert.match(html,/Linked Board item ID/);
  assert.match(html,/Synthetic|Consignee|Recipient|Payor/);
  assert.doesNotMatch(html,/onclick=|<script|<iframe|src="https?:\/\//i);
 }
});
test('commercial print totals use full saved line set, source VAT, discount and currency',()=>{
 const multi={...docs.quotation,items:[
  {...line,quantity:2,unitPrice:300.5},
  {...line,id:'line-2',description:'Second service',quantity:3,unitPrice:100}
 ]};
 const html=renderTradeLinkSavedDocumentOutput(record('quotation',multi),workspace,id);
 // 601+300=901 subtotal, 10 discount, 12% VAT of 891 = 106.92, total 997.92.
 assert.match(html,/901\.00 PHP/);
 assert.match(html,/10\.00 PHP/);
 assert.match(html,/106\.92 PHP/);
 assert.match(html,/997\.92 PHP/);
 assert.match(html,/Second service/);
 assert.equal((html.match(/class="tl-print-lines"/g)||[]).length,1);
 const foreign={...multi,currency:'USD',exchangeRate:58};
 const fx=renderTradeLinkSavedDocumentOutput(record('quotation',foreign),workspace,id);
 assert.match(fx,/997\.92 USD/);
 assert.match(fx,/57,879\.36 PHP/);
});
test('valid saved incomplete Drafts and note-only lines print truthfully without inventing values',()=>{
 const content={documentType:'packing',documentNumber:'PK-INCOMPLETE',
  items:[{id:'note-1',kind:'note'},{...line,kind:'item',description:'Packed cartons'}]};
 const html=renderTradeLinkSavedDocumentOutput(record('packing',content),workspace,id);
 assert.match(html,/PK-INCOMPLETE/);
 assert.match(html,/Packed cartons/);
 assert.match(html,/DRAFT — not approved or issued by printing/);
 assert.doesNotMatch(html,/undefined|null/);
});
test('Payment AR shows recorded payment values without generating a funds receipt',()=>{
 const html=renderTradeLinkSavedDocumentOutput(record('payment'),workspace,id);
 assert.match(html,/Cash amount/);
 assert.match(html,/Cheque reference/);
 assert.match(html,/CH-001/);
 assert.match(html,/Total recorded amount/);
 assert.match(html,/200\.00 PHP/);
 assert.match(html,/No approval, shipment, payment receipt, or document change is made by printing/);
 assert.doesNotMatch(html,/Commercial amounts|VAT/);
});
test('saved printable content and attributes escape user text, including notes and lines',()=>{
 const content={...docs.quotation,
  customerName:'<script>alert(1)</script> & "Acme"',
  remarks:'Close </article><script>alert("x")</script>',
  items:[{...line,description:'"><img src=x onerror=alert(1)>'}]
 };
 const html=renderTradeLinkSavedDocumentOutput(record('quotation',content),workspace,id);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Acme&quot;/);
 assert.match(html,/&lt;\/article&gt;&lt;script&gt;/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<script>|<img|<\/article><script/);
 assert.doesNotMatch(html,/<img[^>]*onerror=/);
});
test('no verified print for mismatched, stale, cross-workspace or malformed signed rows',()=>{
 const broken=[
  {...base,workspace_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  {...base,board_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
  {...base,board_item_id:'broken'},
  {...base,revision:0},
  {...base,updated_at:'bad'},
  {...base,content:{...base.content,documentNumber:'OTHER'}},
  {...base,content:{...base.content,documentType:'esi'}},
  {...base,content:{...base.content,items:[{...line,quantity:NaN}]}},
  {...base,content:{...base.content,items:Array.from({length:101},()=>line)}},
  {...base,content:{...base.content,customerName:null}},
  null
 ];
 for(const candidate of broken){
  assert.throws(()=>renderTradeLinkSavedDocumentOutput(candidate,workspace,id),/Invalid|mismatch|cannot be verified/i);
 }
 assert.throws(()=>renderTradeLinkSavedDocumentOutput(base,workspace,'invalid'),/Invalid/);
});
test('archived and non-Draft states show actual state without fabricated approval',()=>{
 const approved={...base,workflow_state:'approved'};
 const html=renderTradeLinkSavedDocumentOutput(approved,workspace,id);
 assert.match(html,/WORKFLOW APPROVED · PDF NOT ISSUED/);
 assert.doesNotMatch(html,/DRAFT — not approved/);
 assert.match(html,/not a signed PDF/);
 const archived={...base,archived_at:stamp,workflow_state:'completed'};
 assert.match(renderTradeLinkSavedDocumentOutput(archived,workspace,id),/ARCHIVED · COMPLETED/);
});
test('All Documents presents print action only to authorized manager, no storage or signed grants',()=>{
 const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
  groups:[],columns:[],items:[]};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[{documentId:id,boardItemId:item,documentType:'quotation',
   documentNumber:base.document_number,revision:5,workflowState:'draft',archived:false}]};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:true});
 assert.match(html,/data-action="tradelink-document-print"/);
 assert.match(html,/Print PDF/);
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:false});
 assert.doesNotMatch(denied,/data-action="tradelink-document-print"/);
 const foreign=renderTradeLinkDocumentRepository({detail,
  workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',view,canManage:true});
 assert.doesNotMatch(foreign,/data-action="tradelink-document-print"/);
});
test('print action explicitly reloads signed record and matching Board before mounting preview',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=source.indexOf('async function printTradeLinkDocument(');
 const end=source.indexOf('async function commitTradeLinkDraft(',start);
 assert.ok(start>0&&end>start);
 const flow=source.slice(start,end);
 for(const pattern of [
  /tradeLinkDraftWorkspace\.read\(documentId\)/,/db\.board\(TRADELINK_BOARD_ID\)/,
  /record\.revision!==listed\.revision/,
  /record\.workflow_state!==listed\.workflowState/,
  /record\.board_item_id!==listed\.boardItemId/,
  /board\.board\.workspace_id!==ws/,
  /item\.title===listed\.documentNumber/,
  /renderTradeLinkSavedDocumentOutput\(record,ws,documentId\)/,
  /mountTradeLinkSavedDocumentOutput\(markup\)/,
  /if\(!same\(\)\)return/
 ])assert.match(flow,pattern);
 assert.match(source,/case 'tradelink-document-print'/);
 assert.match(source,/window\.addEventListener\('pagehide',closeTradeLinkSavedDocumentOutput\)/);
 assert.match(source,/if\(!state\.context\)\{closeTradeLinkSavedDocumentOutput\(\)/);
 const markup=readFileSync('frontend/tradelink-saved-document-output.js','utf8');
 assert.match(markup,/data-tradelink-print-action="print"/);
 assert.match(markup,/Print \/ Save as PDF/);
 assert.match(markup,/windowRef\.print\(\)/);
 assert.doesNotMatch(markup,/localStorage|sessionStorage|window[.]open|new Blob|createObjectURL/);
 const css=readFileSync('frontend/tradelink-application.css','utf8');
 assert.match(css,/@media print/);
 assert.match(css,/body>\*:not\(#tradelink-saved-print\)/);
 assert.match(css,/@page\{size:A4/);
});
