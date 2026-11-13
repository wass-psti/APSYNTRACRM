import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TradeLinkDomainClient,TL03_WORKFLOW_SUBMIT_ENABLED,
 normalizeTradeLinkSubmitReceipt} from '../tradelink-domain-client.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDocumentRepository} from '../tradelink-draft-workspace.js';

const board=TRADELINK_BOARD_ID;
const documentId='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const item='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const ws='00000000-0000-4000-8000-000000000001';
const receipt={documentId,boardItemId:item,revision:6,state:'submitted',operation:'submit',from:'draft'};
const detail={board:{id:board,workspace_id:ws,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};

test('source submission receipt increments revision and enforces the module-specific destination',()=>{
 assert.deepEqual(normalizeTradeLinkSubmitReceipt(receipt,documentId,'quotation',5),receipt);
 assert.equal(normalizeTradeLinkSubmitReceipt({...receipt,state:'completed'},
  documentId,'packing',5).state,'completed');
 for(const wrong of [
  {...receipt,state:'approved'}, // never infer an authorized approval
  {...receipt,revision:5}, // revision must advance
  {...receipt,documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  {...receipt,boardItemId:'wrong'},
  {...receipt,operation:'update'}, {...receipt,from:'submitted'}
 ])assert.throws(()=>normalizeTradeLinkSubmitReceipt(wrong,documentId,'quotation',5),/mismatch/);
 assert.throws(()=>normalizeTradeLinkSubmitReceipt(receipt,documentId,'packing',5),/mismatch/);
 assert.throws(()=>normalizeTradeLinkSubmitReceipt(receipt,documentId,'invalid',5),/mismatch/);
});
test('until exact SQL activation, client cannot submit or trigger an unexpected network action',async()=>{
 assert.equal(TL03_WORKFLOW_SUBMIT_ENABLED,false);
 const client=new TradeLinkDomainClient({
  auth:{getVerifiedUser:async()=>{throw Error('Never call auth when feature disabled');}},
  api:{rpc:async()=>{throw Error('Unexpected RPC');}}
 });
 await assert.rejects(()=>client.submit({
  documentId,expectedRevision:5,documentType:'quotation'}),/not been activated/);
});
test('signed All Documents shows inert Submit affordance only for active authorized Drafts',()=>{
 const draft={documentId,boardItemId:item,documentType:'quotation',
  documentNumber:'Q-QA-20261108-01',revision:5,
  workflowState:'draft',archived:false};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[draft,{...draft,documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   workflowState:'approved'},
   {...draft,documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',archived:true}]};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:ws,view,canManage:true});
 assert.equal((html.match(/data-action="tradelink-document-submit"/g)||[]).length,1);
 assert.match(html,/data-action="tradelink-document-submit"[^>]+disabled title="Submission backend not activated"/);
 assert.match(html,/Submit \(pending activation\)/);
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:ws,view,canManage:false});
 assert.doesNotMatch(denied,/data-action="tradelink-document-submit"|Q-QA-20261108-01/);
});
test('source SQL candidate enforces CAS, workspace, session, Board lock, append-only event and no approvals',()=>{
 const sql=readFileSync('sql/tradelink-document-submit-candidate.sql','utf8');
 for(const match of [/private\.tl03_can_manage\(p_board_id\)/,
  /FOR UPDATE/,/d\.workspace_id IS DISTINCT FROM public\.current_workspace_id\(actor\)/,
  /d\.revision IS DISTINCT FROM p_expected_revision/,/d\.workflow_state NOT IN \('draft','revision-required'\)/,
  /Board submit projection changed/,/INSERT INTO public\.tradelink_document_events/,
  /operation IN \('created','updated','archived','restored','submitted','completed'\)/,
  /SECURITY INVOKER SET search_path=''/,
  /REVOKE ALL ON FUNCTION public\.tl03_document_submit/,
  /FROM PUBLIC,anon,authenticated/,
  /has_function_privilege\('anon'/,
  /SELECT private\.tl03_submit\(p_board_id,p_document_id,p_expected_revision\)/])
  assert.match(sql,match);
 assert.doesNotMatch(sql,/\bGRANT\s+(?:INSERT|UPDATE|DELETE)\b|\bservice_role\b/);
});
test('UI wiring refuses optimistic success and verifies signed workflow, Board and document revision',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/case 'tradelink-document-submit'/);
 assert.match(source,/const receipt=await tradeLinkDraftWorkspace\.submit/);
 assert.match(source,/record\.workflow_state!==receipt\.state/);
 assert.match(source,/tradeLinkBoardProjectionMatches\(item,\{[\s\S]*?boardItemId:receipt\.boardItemId,documentNumber:listed\.documentNumber/);
 assert.match(source,/if\(!TL03_WORKFLOW_SUBMIT_ENABLED/);
 assert.match(source,/committed\?\s*'The server committed a submission/);
});
