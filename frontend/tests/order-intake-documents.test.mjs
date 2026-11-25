import test from 'node:test';
import assert from 'node:assert/strict';
import {OrderIntakeDocuments,prepareOrderDocument} from '../order-intake-documents.js';
import {documentRegistryMarkup,documentUploadFields} from '../order-intake-documents-ui.js';
const row={id:'order',workspace_id:'w',record_kind:'legacy',revision:1,po_number:'<script>',po_file_reference:'Old file'};
const blob=new Blob(['%PDF-1.7\nfixture'],{type:'application/pdf'});
test('validate file size, content type, filename and exact digest',async()=>{
 const p=await prepareOrderDocument(blob,'test.pdf');
 assert.equal(p.mime,'application/pdf');assert.equal(p.byteCount,blob.size);assert.match(p.sha256,/^[a-f0-9]{64}$/);
 await assert.rejects(prepareOrderDocument(blob,'../test.pdf'),/filename/);
 await assert.rejects(prepareOrderDocument(new Blob(['<html>']), 'test.pdf'),/supported/);
 await assert.rejects(prepareOrderDocument(new Blob([new Uint8Array(5242881)]),'big.pdf'),/5 MiB/);
});
test('save uses stable receipt and exact source revision; read verifies stored bytes',async()=>{
 const p=await prepareOrderDocument(blob,'test.pdf');
 const entry={id:'id',workspace_id:'w',order_id:'order',record_kind:'legacy',sha256:p.sha256,byte_count:p.byteCount,mime_type:p.mime,filename:p.filename,stored:true};
 let corrupt=false;
 const client={workspaceId:'w',request:fn=>fn(),api:{rpc:async(name,args)=>{
  if(name==='order_intake_save_document'){assert.equal(args.p_revision,1);assert.equal(args.p_base64,p.base64);return {id:'id',sha256:p.sha256,byteCount:p.byteCount,createdAt:'now'};}
  return {id:'id',sha256:p.sha256,byteCount:p.byteCount,mimeType:p.mime,filename:p.filename,base64:corrupt?btoa('%PDF-1.7\nchanged'):p.base64};
 }}};
 const docs=new OrderIntakeDocuments(client);
 assert.equal((await docs.save(row,'client_po',p,'id')).id,'id');
 assert.equal(await (await docs.read(entry)).text(),await blob.text());
 corrupt=true;await assert.rejects(docs.read(entry),/integrity/);
 await assert.rejects(docs.read({...entry,stored:false}),/not available/);
});
test('registry distinguishes historical reference, audit-only and stored document',()=>{
 const html=documentRegistryMarkup({row,rows:[{id:'a',filename:'<script>',category:'generated_confirmation',stored:false,sha256:'abc',record_kind:'legacy',order_revision:1},{id:'b',filename:'photo.png',category:'client_po',stored:true,mime_type:'image/png',byte_count:42}],hasMore:true});
 assert.match(html,/Source references are not stored files/);assert.match(html,/Audit only — file unavailable/);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/data-oi-document-download="b"/);assert.doesNotMatch(html,/data-oi-document-download="a"/);
 assert.match(html,/Thumbnail/);assert.match(html,/Load older documents/);
 assert.match(documentUploadFields(row),/name="document"/);
});
