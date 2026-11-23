import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {
 initialTradeLinkDraftView,initialTradeLinkDraftListFilters,
 renderTradeLinkDraftWorkspace,renderTradeLinkDocumentRepository,
 renderTradeLinkSavedDocumentPreview,filterTradeLinkDraftAuthorizedRows,
 serializeTradeLinkDocumentCsv,reconcileTradeLinkSavedListing
} from '../tradelink-draft-workspace.js';

const workspace='00000000-0000-4000-8000-000000000001';
const documentId='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const boardItemId='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const createdAt='2026-11-22T08:00:00.000Z';
const updatedAt='2026-11-23T09:00:00.000Z';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const record={
 id:documentId,workspace_id:workspace,board_id:TRADELINK_BOARD_ID,
 board_item_id:boardItemId,document_type:'quotation',
 document_number:'Q-202611220001',workflow_state:'draft',revision:1,
 archived_at:null,created_at:createdAt,updated_at:updatedAt,
 content:{documentType:'quotation',documentNumber:'Q-202611220001',
  customerName:'Example Client & Partners',currency:'PHP',vatType:'12',
  discountType:'fixed',discountValue:0,items:[{
   id:'line-1',kind:'item',description:'Service',quantity:1,unitPrice:100,unit:'unit'
  }]}
};
const listed={
 documentId,boardItemId,documentType:'quotation',
 documentNumber:record.document_number,clientName:record.content.customerName,
 revision:1,workflowState:'draft',archived:false,
 createdAt,updatedAt,createdByActor:true,assignedStage:null,
 primaryAt:null,secondaryAt:null
};

test('Quotation editor replaces Prospective client with Client Name without changing customerName',()=>{
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId:workspace,view:initialTradeLinkDraftView('quotation'),canManage:true
 });
 assert.match(html,/<span>Client Name<\/span>/);
 assert.doesNotMatch(html,/Prospective client/i);
 assert.match(html,/name="customerName"/);
 assert.equal(record.content.customerName,'Example Client & Partners');
});

test('saved document preview renders persisted Client Name from content.customerName',()=>{
 const html=renderTradeLinkSavedDocumentPreview(record,workspace,documentId);
 assert.match(html,/<dt>Client Name<\/dt><dd>Example Client &amp; Partners<\/dd>/);
 assert.doesNotMatch(html,/Prospective client/i);
 assert.match(html,/<dt>Created<\/dt><dd>2026-11-22T08:00:00.000Z<\/dd>/);
});

test('All Documents displays Document Number and persisted Client Name columns',()=>{
 const html=renderTradeLinkDocumentRepository({
  detail,workspaceId:workspace,canManage:true,
  view:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[listed]}
 });
 assert.match(html,/<th scope="col">Document Number<\/th>/);
 assert.match(html,/<th scope="col">Client Name<\/th>/);
 assert.match(html,/Q-202611220001/);
 assert.match(html,/Example Client &amp; Partners/);
 assert.match(html,/data-client-name="Example Client &amp; Partners"/);
 assert.match(html,/data-created-at="2026-11-22T08:00:00.000Z"/);
});

test('default ordering is created_at DESC with deterministic document ID tie-breaking',()=>{
 assert.deepEqual(initialTradeLinkDraftListFilters(),{
  query:'',documentType:'all',workflowState:'all',archiveMode:'active',
  sortBy:'createdAt',sortDirection:'desc'
 });
 const older={...listed,documentId:'11111111-1111-4111-8111-111111111111',
  documentNumber:'Q-OLDER',createdAt:'2026-11-20T00:00:00Z'};
 const newer={...listed,documentId:'22222222-2222-4222-8222-222222222222',
  documentNumber:'Q-NEWER',createdAt:'2026-11-23T00:00:00Z'};
 const sameTime={...listed,documentId:'33333333-3333-4333-8333-333333333333',
  documentNumber:'Q-TIE',createdAt:newer.createdAt};
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows([older,newer,sameTime])
  .map(row=>row.documentNumber),['Q-TIE','Q-NEWER','Q-OLDER']);
});

test('post-save reconciliation uses the persisted creation time and avoids duplicate rows',()=>{
 const old={...listed,documentId:'11111111-1111-4111-8111-111111111111',
  boardItemId:'22222222-2222-4222-8222-222222222222',
  documentNumber:'Q-OLDER',clientName:'Older Client',
  createdAt:'2026-11-20T00:00:00Z'};
 const result=reconcileTradeLinkSavedListing(
  {status:'AUTHORIZED_READ',rows:[old]},record,
  {documentId,boardItemId,revision:1}
 );
 assert.equal(result.rows[0].documentId,documentId);
 assert.equal(result.rows[0].clientName,'Example Client & Partners');
 assert.equal(result.rows[0].createdAt,createdAt);
 assert.equal(result.rows.filter(row=>row.documentId===documentId).length,1);
});

test('selected-document CSV exports the persisted Client Name and creation timestamp',()=>{
 const csv=serializeTradeLinkDocumentCsv([listed]);
 assert.match(csv,/"Document Number","Client Name","Document Type","Created At"/);
 assert.match(csv,/"Q-202611220001","Example Client & Partners","quotation","2026-11-22T08:00:00.000Z"/);
});

test('migration keeps customerName intact and uses database creation timestamps for every list source',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261123080322_cp_tl_document_identity_order_01.sql',import.meta.url),'utf8');
 assert.match(sql,/ORDER BY s\.created_at DESC,s\.id DESC/);
 assert.match(sql,/ORDER BY d\.created_at DESC,d\.id DESC/);
 assert.match(sql,/ORDER BY a\.created_at DESC,a\.id DESC/);
 assert.match(sql,/\(d\.created_at,d\.id\)<\(p_before_at,p_before_id\)/);
 assert.match(sql,/'clientName',r\.content->>'customerName'/);
 assert.match(sql,/'createdAt',r\.created_at/);
 assert.match(sql,/private\.tl03_can_review\(p_board_id\)/);
 assert.match(sql,/CREATE INDEX IF NOT EXISTS tl03_document_created/);
 assert.doesNotMatch(sql,/ALTER TABLE public\.tradelink_documents\s+RENAME|UPDATE public\.tradelink_documents\s+SET content/i);
 assert.doesNotMatch(sql,/gradient descent|backpropagation|fine.?tun|training loop/i);
});
