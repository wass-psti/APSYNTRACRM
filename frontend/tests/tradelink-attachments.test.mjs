import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TL03_ATTACHMENTS_ENABLED,TL03_ATTACHMENT_BUCKET,TL03_MAX_ATTACHMENT_BYTES,
 TradeLinkAttachmentClient,validateTradeLinkAttachment,
 normalizeTradeLinkAttachmentIntent,normalizeTradeLinkAttachmentReceipt,
 normalizeTradeLinkAttachmentList
} from '../tradelink-attachments.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDocumentRepository,
 renderTradeLinkDocumentAttachments} from '../tradelink-draft-workspace.js';

const workspace='00000000-0000-4000-8000-000000000001';
const id='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const boardItemId='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const fileId='90000000-0000-4000-8000-000000000002';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stamp='2026-11-08T10:24:00.000Z';
const key=workspace+'/'+id+'/'+fileId+'/report.pdf';
const input={fileName:'report.pdf',mimeType:'application/pdf',sizeBytes:4096};
const intent={attachmentId:fileId,documentId:id,boardItemId,expectedRevision:5,
 ...input,attachmentRevision:1,storageKey:key};
const row={attachmentId:fileId,documentId:id,fileName:'report.pdf',
 mimeType:'application/pdf',sizeBytes:4096,checksumSha256:'a'.repeat(64),
 revision:1,storageKey:key,uploadedAt:stamp,uploadedBy:actor,status:'active'};
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},
 items:[],groups:[],columns:[]};
const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
 rows:[{documentId:id,boardItemId,documentNumber:'Q-EXAMPLE',
  documentType:'quotation',revision:5,workflowState:'draft',archived:false}]};

test('original TradeLink attachment sizes, extensions and MIME mapping are preserved',()=>{
 assert.equal(TL03_MAX_ATTACHMENT_BYTES,20*1024*1024);
 assert.equal(TL03_ATTACHMENT_BUCKET,'tradelink-attachments');
 const cases=[
  ['invoice.pdf','application/pdf'],['file.jpeg','image/jpeg'],
  ['file.jpg','image/jpeg'],['image.png','image/png'],
  ['image.webp','image/webp'],['data.csv','text/csv'],
  ['notes.txt','text/plain'],['letter.doc','application/msword'],
  ['letter.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['sheet.xls','application/vnd.ms-excel'],
  ['sheet.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 ];
 for(const [name,type] of cases){
  const file={name,type,size:TL03_MAX_ATTACHMENT_BYTES,
   arrayBuffer:async()=>new ArrayBuffer(1)};
  assert.equal(validateTradeLinkAttachment(file).mimeType,type);
 }
 const clean=validateTradeLinkAttachment({
  name:'../../<danger>.pdf',type:'application/pdf',size:1024,
  arrayBuffer:async()=>new ArrayBuffer(1024)
 });
 assert.equal(clean.fileName,'-danger-.pdf'.replace(/^-/,'')); // normalized leaf, no path
});
test('invalid file types, sizes, names, MIME spoofing and empty data fail before uploading',()=>{
 const base={name:'report.pdf',type:'application/pdf',size:4096,
  arrayBuffer:async()=>new ArrayBuffer(4096)};
 for(const file of [
  {...base,size:0},{...base,size:TL03_MAX_ATTACHMENT_BYTES+1},
  {...base,size:NaN},{...base,type:'image/png'},
  {...base,name:'unsafe.html',type:'text/html'},
  {...base,name:'hidden.exe',type:'application/octet-stream'},
  {...base,name:'../'},{...base,name:'😈.pdf'},
  {...base,arrayBuffer:null},null
 ])assert.throws(()=>validateTradeLinkAttachment(file),/attachment|file|Unsupported|Invalid/i);
});
test('signed upload intent is path-bound to exact workspace, document, generated UUID, MIME and CAS',()=>{
 assert.equal(normalizeTradeLinkAttachmentIntent(intent,workspace,id,5,input),intent);
 for(const forged of [
  {...intent,storageKey:'other/other/'+fileId+'/report.pdf'},
  {...intent,storageKey:key+'?download=true'},
  {...intent,documentId:actor},{...intent,boardItemId:'wrong'},
  {...intent,expectedRevision:4},{...intent,attachmentRevision:0},
  {...intent,fileName:'different.pdf'},{...intent,mimeType:'text/html'},
  {...intent,sizeBytes:1},{...intent,attachmentId:'incorrect'},null
 ])assert.throws(()=>normalizeTradeLinkAttachmentIntent(forged,
   workspace,id,5,input),/mismatch/);
});
test('signed attachment action receipts enforce exact state, identity and revision',()=>{
 const added={documentId:id,boardItemId,attachmentId:fileId,revision:6,
  attachmentRevision:1,state:'active',operation:'attachment-added'};
 const removed={...added,state:'removed',operation:'attachment-removed'};
 assert.equal(normalizeTradeLinkAttachmentReceipt(added,id,fileId,5,'attachment-added'),added);
 assert.equal(normalizeTradeLinkAttachmentReceipt(removed,id,fileId,5,'attachment-removed'),removed);
 for(const r of [
  {...added,revision:5},{...added,revision:7},{...added,state:'pending'},
  {...added,attachmentId:actor},{...added,operation:'attachment-removed'},
  {...added,attachmentRevision:0},{...added,boardItemId:'wrong'},null
 ])assert.throws(()=>normalizeTradeLinkAttachmentReceipt(
  r,id,fileId,5,'attachment-added'),/mismatch/);
});
test('signed list accepts only active document-bound, safe, hash-verified metadata',()=>{
 assert.equal(normalizeTradeLinkAttachmentList([row],workspace,id)[0],row);
 for(const bad of [
  {...row,status:'removed'},
  {...row,storageKey:'../private/report.pdf'},
  {...row,storageKey:key.replace(id,actor)},
  {...row,documentId:actor},
  {...row,fileName:'<img src=x>.pdf'},
  {...row,mimeType:'text/html'},
  {...row,checksumSha256:'not-a-checksum'},
  {...row,uploadedBy:'user'},
  {...row,sizeBytes:0},
  {...row,sizeBytes:20971521},
  {...row,revision:0},
  {...row,uploadedAt:'not-a-date'}
 ])assert.throws(()=>normalizeTradeLinkAttachmentList([bad],workspace,id));
 assert.throws(()=>normalizeTradeLinkAttachmentList([row,row],workspace,id),/mismatched/);
 assert.throws(()=>normalizeTradeLinkAttachmentList(Array(26).fill(row),workspace,id));
});
test('disabled production attachment client performs no network calls or user lookup',async()=>{
 assert.equal(TL03_ATTACHMENTS_ENABLED,false);
 let attempts=0;
 const client=new TradeLinkAttachmentClient({
  api:{rpc:async()=>{attempts++;throw Error('unexpected backend');}},
  auth:{getVerifiedUser:async()=>{attempts++;throw Error('unexpected signed user');},
   token:async()=>{attempts++;throw Error('unexpected token');}},
  fetchImpl:async()=>{attempts++;throw Error('unexpected external fetch');}
 });
 await assert.rejects(()=>client.list(id),/pending backend activation/);
 await assert.rejects(()=>client.upload({documentId:id,expectedRevision:5,
  file:{name:'report.pdf',type:'application/pdf',size:1,
   arrayBuffer:async()=>new ArrayBuffer(1)}}),/pending backend activation/);
 await assert.rejects(()=>client.remove({documentId:id,attachmentId:fileId,
  expectedRevision:5,reason:'File superseded'}),/pending backend activation/);
 await assert.rejects(()=>client.download({documentId:id,attachmentId:fileId}),
  /pending backend activation/);
 assert.equal(attempts,0);
});
test('TradeLink UI does not expose upload/remove/download actions without Storage activation',()=>{
 const authorized=renderTradeLinkDocumentRepository({
  detail,workspaceId:workspace,view,canManage:true});
 assert.doesNotMatch(authorized,/data-action="tradelink-attachment-/);
 const denied=renderTradeLinkDocumentRepository({
  detail,workspaceId:workspace,view,canManage:false});
 assert.doesNotMatch(denied,/data-action="tradelink-attachment-/);
 assert.equal(renderTradeLinkDocumentAttachments([row],{
  documentId:id,workspaceId:workspace,editable:true}),'');
});
test('source limits transport to auth JWT, private bucket, no shared-Board fallback or upsert',()=>{
 const client=readFileSync('frontend/tradelink-attachments.js','utf8');
 for(const pattern of [
  /TL03_ATTACHMENTS_ENABLED=false/,
  /this\.domain\.session\(\)/,
  /p_expected_revision:expectedRevision/,
  /p_replaces_id:replacesId/,
  /this\.auth\.token\(\)/,
  /'x-upsert':'false'/,
  /Authorization:'Bearer '\+token/,
  /SHA-256/,
  /tl03_attachment_prepare/,
  /tl03_attachment_finish/,
  /tl03_attachment_remove/,
  /tl03_attachment_list/,
  /response\.arrayBuffer\(\)/,
  /await sha256\(buffer\)!==attachment\.checksumSha256/,
  /credentials:'omit'/
 ])assert.match(client,pattern);
 assert.doesNotMatch(client,/service_role|work-board-files|localStorage|sessionStorage|createSignedUrl/);
 const ui=readFileSync('frontend/app.js','utf8');
 for(const pattern of [
  /case 'tradelink-attachment-upload'/,
  /case 'tradelink-attachment-download'/,
  /case 'tradelink-attachment-remove'/,
  /const receipt=file\?await tradeLinkAttachments\.upload/,
  /tradeLinkDraftWorkspace\.history\(documentId\)/,
  /verifyTradeLinkAttachmentCommit/,
  /i\.updated_at===record\.updated_at/,
  /latest\.metadata\?\.attachmentId!==receipt\.attachmentId/,
  /window\.setTimeout\(\(\)=>URL\.revokeObjectURL\(url\),1000\)/
 ])assert.match(ui,pattern);
});
test('SQL candidate creates no public Storage bucket, grants only signed files and validates CAS',()=>{
 const sql=readFileSync('sql/tradelink-document-attachments-candidate.sql','utf8');
 for(const pattern of [
  /SOURCE-ONLY/,
  /b\.id='tradelink-attachments'/,
  /b\.public=false/,
  /b\.file_size_limit=20971520/,
  /CREATE TABLE private\.tl03_attachments/,
  /ALTER TABLE private\.tl03_attachments ENABLE ROW LEVEL SECURITY/,
  /REVOKE ALL ON TABLE private\.tl03_attachments FROM PUBLIC,anon,authenticated/,
  /private\.tl03_can_manage/,
  /a\.workspace_id=public\.current_workspace_id\(caller\)/,
  /a\.prepared_by=caller/,
  /p_action='read' AND a\.status='active'/,
  /CREATE POLICY "tl03 attachment signed upload" ON storage\.objects/,
  /CREATE POLICY "tl03 attachment signed read" ON storage\.objects/,
  /storage\.allow_any_operation\(ARRAY\[/,
  /owner_id=auth\.uid\(\)::text/,
  /p_expected_revision/,
  /a\.prepared_by<>actor/,
  /o\.metadata->>'size'/,
  /o\.metadata->>'mimetype'/,
  /total>=25 OR \(total>=20 AND p_replaces_id IS NULL\)/,
  /INSERT INTO public\.tradelink_document_events/,
  /UPDATE public\.work_board_items SET updated_by=actor,updated_at=modified_at/,
  /TRIGGER|trigger|append-only|append_preserving/i
 ])assert.match(sql,pattern);
 assert.doesNotMatch(sql,/\bINSERT INTO storage\.buckets\b|\bDELETE FROM storage\.objects\b|\bDROP POLICY\b|TO service_role|GRANT (?:UPDATE|DELETE) ON storage\.objects/);
 const workflow=readFileSync('.github/workflows/cp-tl03b-disposable-postgres.yml','utf8');
 assert.match(workflow,/cp-tl03-attachment-storage-fixture\.sql/);
 assert.match(workflow,/cp-tl03-attachments-disposable\.sql/);
 assert.match(workflow,/tradelink-document-attachments-candidate\.sql/);
});
