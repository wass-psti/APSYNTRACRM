import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeTradeLinkRevisionBundle,TradeLinkDomainClient} from '../tradelink-domain-client.js';
const workspace='00000000-0000-4000-8000-000000000001';
const board='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const documentId='99999999-9999-4999-8999-999999999992';
const itemId='99999999-9999-4999-8999-999999999991';
const manager='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stamp='2026-11-17T08:00:00.000Z';
const record=(revision,approved,remarks=null)=>({
 id:documentId,board_id:board,workspace_id:workspace,board_item_id:itemId,
 document_type:'quotation',document_number:'Q-REV-HISTORY-001',
 workflow_state:approved?'approved':'for-approval',revision,
 content:{documentType:'quotation',documentNumber:'Q-REV-HISTORY-001',remarks,items:[]},
 created_by:manager,updated_by:manager,created_at:stamp,updated_at:stamp,
 archived_at:null,snapshot_source:revision===1?'baseline':'captured',revision_at:stamp,
 approved,primary_reviewed_at:approved?stamp:null,secondary_reviewed_at:approved?stamp:null
});
const metadata=(revision,approved,current)=>({
 revision,workflowState:approved?'approved':'for-approval',approved,current,
 snapshotSource:revision===1?'baseline':'captured',revisionAt:stamp,capturedAt:stamp,
 primaryAt:approved?stamp:null,secondaryAt:approved?stamp:null
});
const bundle=(selected=record(2,false,'current'))=>({
 documentId,boardItemId:itemId,currentRevision:2,
 revisions:[metadata(2,false,true),metadata(1,true,false)],selected
});
test('revision bundle normalizes exact selected payload and signed approval metadata',()=>{
 const value=normalizeTradeLinkRevisionBundle(bundle(),workspace,documentId,2);
 assert.equal(value.currentRevision,2);assert.equal(value.selected.revision,2);
 assert.equal(value.selected.approved,false);assert.equal(value.revisions[1].approved,true);
 assert.equal(value.revisions[1].snapshotSource,'baseline');
});
test('historical approved snapshot normalizes independently of the current pending revision',()=>{
 const value=normalizeTradeLinkRevisionBundle(bundle(record(1,true,null)),workspace,documentId,1);
 assert.equal(value.currentRevision,2);assert.equal(value.selected.revision,1);
 assert.equal(value.selected.workflow_state,'approved');
 assert.equal(value.revisions.find(row=>row.revision===1).approved,true);
});
test('revision history rejects duplicate, unordered, missing-current and malformed approval metadata',()=>{
 const invalid=[
  {...bundle(),revisions:[metadata(2,false,true),metadata(2,true,false)]},
  {...bundle(),revisions:[metadata(1,true,false),metadata(2,false,true)]},
  {...bundle(),revisions:[metadata(1,true,false)]},
  {...bundle(),revisions:[{...metadata(2,true,true),primaryAt:null},metadata(1,true,false)]},
  {...bundle(),selected:{...record(2,false),workspace_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}
 ];
 for(const value of invalid)assert.throws(()=>normalizeTradeLinkRevisionBundle(value,workspace,documentId,2));
});
test('revision bundle client calls the existing signed TradeLink revision RPC with the exact requested revision',async()=>{
 const calls=[];
 const client=new TradeLinkDomainClient({auth:{userId:manager},
  api:{rpc:async(name,args)=>{calls.push({name,args});return bundle(record(1,true,null));}}});
 client.session=async()=>({workspaceId:workspace,actorId:manager});
 const result=await client.revisionBundle(documentId,1);
 assert.equal(result.selected.revision,1);
 assert.deepEqual(calls,[{name:'tl03_document_revision_bundle',args:{
  p_board_id:board,p_document_id:documentId,p_revision:1
 }}]);
});
test('revision bundle rejects invalid document and revision identifiers before network access',async()=>{
 let calls=0;
 const client=new TradeLinkDomainClient({auth:{userId:manager},api:{rpc:async()=>{calls++;}}});
 client.session=async()=>({workspaceId:workspace,actorId:manager});
 await assert.rejects(()=>client.revisionBundle('not-a-uuid',1));
 await assert.rejects(()=>client.revisionBundle(documentId,0));
 assert.equal(calls,0);
});
test('All Documents loads exact revision bundles and reprints only a verified approved historical revision',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/tradeLinkDraftWorkspace\.revisionBundle\(documentId\)/);
 assert.match(app,/async function openTradeLinkDocumentRevision\(documentId,revision\)/);
 assert.match(app,/tradeLinkDraftWorkspace\.revisionBundle\(documentId,revision\)/);
 assert.match(app,/revisionMeta\?\.approved!==true/);
 assert.match(app,/record\.approved!==true/);
 assert.match(app,/case 'tradelink-document-revision-open'/);
 assert.match(app,/case 'tradelink-document-revision-print'/);
});
