import test from 'node:test';
import assert from 'node:assert/strict';
import {TRADELINK_ELECTRONIC_PDF_ISSUANCE_ENABLED,TRADELINK_PDF_TEMPLATE_ACTIVATED,
 validateTradeLinkPdfIssuanceReceipt,requestTradeLinkApprovedPdf}
 from '../tradelink-pdf-approval-contract.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkSavedDocumentOutput} from '../tradelink-saved-document-output.js';
const ws='00000000-0000-4000-8000-000000000001';
const doc='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const stamp='2026-11-09T11:11:00Z';
const record={id:doc,workspace_id:ws,board_id:TRADELINK_BOARD_ID,
 board_item_id:'8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10',
 revision:5,document_type:'quotation',document_number:'Q-005',
 workflow_state:'approved',archived_at:null,created_at:stamp,updated_at:stamp,
 content:{documentType:'quotation',documentNumber:'Q-005',items:[],
 verifiedByEmail:'aacsenagan@watchdogautomation.com.ph',
 approvedByEmail:'asenagan@watchdogautomation.com.ph'}};
const stage=(name,i)=>({name,actorId:i===0?'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee':'ffffffff-ffff-4fff-8fff-ffffffffffff',
 actorEmail:i===0?'aacsenagan@watchdogautomation.com.ph':'asenagan@watchdogautomation.com.ph',
 eventId:i===0?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 recordedAt:i===0?'2026-11-09T11:00:00Z':'2026-11-09T11:05:00Z',revision:5});
const receipt={documentId:doc,workspaceId:ws,revision:5,documentType:'quotation',
 documentNumber:'Q-005',state:'issued-approved',
 issuanceId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 templateId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 templateSha256:'a'.repeat(64),pdfSha256:'b'.repeat(64),
 pdfStoragePath:ws+'/tradelink/Q-005.pdf',issuedAt:'2026-11-09T11:10:00Z',
 stages:[stage('primary',0),stage('secondary',1)]};
test('issuance receipt contract binds every stage, template and hash to current saved revision',()=>{
 assert.equal(validateTradeLinkPdfIssuanceReceipt(receipt,record,ws),receipt);
 for(const altered of [
  {documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  {revision:4},{documentType:'esi'},{documentNumber:'Q-006'},
  {workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  {state:'approved'}, {templateId:'unknown'},
  {templateSha256:'notahash'}, {pdfSha256:'c'.repeat(63)},
  {pdfStoragePath:'foreign/tradelink/Q-005.pdf'},
  {issuedAt:'2026-11-09T11:04:00Z'},
  {stages:[stage('secondary',1),stage('primary',0)]},
  {stages:[stage('primary',0)]},
  {stages:[stage('primary',0),{...stage('secondary',1),revision:4}]},
  {stages:[stage('primary',0),{...stage('secondary',1),actorEmail:'OTHER@example.com'}]},
  {stages:[stage('primary',0),{...stage('secondary',1),recordedAt:'2026-11-09T10:00:00Z'}]}
 ])assert.throws(()=>validateTradeLinkPdfIssuanceReceipt({...receipt,...altered},record,ws),/approval evidence/);
 for(const altered of [{revision:6},{content:{...record.content,approvedByEmail:'dsenagan@watchdogautomation.com.ph'}},{archived_at:stamp},{workspace_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}])
  assert.throws(()=>validateTradeLinkPdfIssuanceReceipt(receipt,{...record,...altered},ws),/approval evidence/);
});
test('packing list is not given artificial approval stages',()=>{
 assert.throws(()=>validateTradeLinkPdfIssuanceReceipt({...receipt,documentType:'packing',stages:[]},
  {...record,document_type:'packing'},ws),/approval evidence/);
});
test('PDF issuance stays closed before template and backend activation',async()=>{
 assert.equal(TRADELINK_ELECTRONIC_PDF_ISSUANCE_ENABLED,false);
 assert.equal(TRADELINK_PDF_TEMPLATE_ACTIVATED,false);
 await assert.rejects(()=>requestTradeLinkApprovedPdf(),/awaits verified backend and template/);
});
test('workflow-approved print cannot claim electronic PDF approval',()=>{
 const html=renderTradeLinkSavedDocumentOutput(record,ws,doc);
 assert.match(html,/WORKFLOW APPROVED · PDF NOT ISSUED/);
 assert.match(html,/Electronic PDF approval and issuance have NOT been verified/);
 assert.doesNotMatch(html,/data-tradelink-electronic-pdf-approved|Digital signature verified/);
});
