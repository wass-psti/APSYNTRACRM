import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TradeLinkDomainClient,TL03_WORKFLOW_OPERATIONAL_ENABLED,
 normalizeTradeLinkOperationalReceipt,normalizeTradeLinkSignedHistory
} from '../tradelink-domain-client.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDocumentRepository,
 renderTradeLinkSavedWorkflowHistory} from '../tradelink-draft-workspace.js';

const id='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const item='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const ws='00000000-0000-4000-8000-000000000001';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const at='2026-11-08T09:33:00.141Z';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 items:[],groups:[],columns:[]};
const record={documentId:id,boardItemId:item,revision:6,state:'submitted',
 operation:'record-checked',from:'submitted',field:'checkedAt',recordedAt:at};

test('signed timestamp receipts are exact and enforce type/state/actor-bound action',()=>{
 assert.deepEqual(normalizeTradeLinkOperationalReceipt(
  record,id,5,'delivery','record-checked','submitted'),record);
 for(const [type,action,field] of [
  ['delivery','record-delivered','deliveredAt'],
  ['payment','record-received','receivedAt']
 ]){
  const receipt={...record,operation:action,field};
  assert.deepEqual(normalizeTradeLinkOperationalReceipt(
   receipt,id,5,type,action,'submitted'),receipt);
 }
 const completed={...record,state:'completed',
  operation:'complete',field:null,from:'approved'};
 assert.deepEqual(normalizeTradeLinkOperationalReceipt(
  completed,id,5,'quotation','complete','approved'),completed);
 const reopen={...record,state:'draft',operation:'reopen',field:null,from:'completed'};
 assert.deepEqual(normalizeTradeLinkOperationalReceipt(
  reopen,id,5,'packing','reopen','completed'),reopen);
 for(const bad of [
  {...record,field:'receivedAt'}, {...record,recordedAt:'invalid'},
  {...record,revision:5},{...record,revision:7},
  {...record,documentId:'invalid'},{...record,boardItemId:'invalid'},
  {...record,from:'draft'},{...record,state:'completed'},
  {...record,operation:'approve'},null,{}
 ])assert.throws(()=>normalizeTradeLinkOperationalReceipt(
   bad,id,5,'delivery','record-checked','submitted'),/mismatch/);
 for(const [type,action,from] of [
  ['quotation','record-checked','submitted'],
  ['packing','complete','completed'],
  ['payment','complete','approved'],
  ['quotation','complete','submitted'],
  ['delivery','reopen','draft']
 ])assert.throws(()=>normalizeTradeLinkOperationalReceipt(
  record,id,5,type,action,from),/mismatch/);
});
test('operational controls are disabled until production SQL authorization and signed verification',async()=>{
 assert.equal(TL03_WORKFLOW_OPERATIONAL_ENABLED,false);
 let calls=0;
 const client=new TradeLinkDomainClient({
  auth:{getVerifiedUser:async()=>{calls++;throw Error('auth should not run');}},
  api:{rpc:async()=>{calls++;throw Error('network should not run');}}
 });
 await assert.rejects(()=>client.operate({documentId:id,
  expectedRevision:5,documentType:'delivery',action:'record-checked',
  fromState:'submitted'}),/not been activated/);
 assert.equal(calls,0);
});
test('server-origin timestamps and reasoned reopening are represented only by signed audit events',()=>{
 const events=[
  {revision:8,operation:'reopened',actorId:actor,at,
   metadata:{action:'reopen',from:'completed',to:'draft',
    at,field:null,reason:'Package checked again <script>alert(1)</script>'}},
  {revision:7,operation:'completed',actorId:actor,at,
   metadata:{action:'complete',from:'submitted',to:'completed',
    at,field:null,reason:''}},
  {revision:6,operation:'operational-record',actorId:actor,at,
   metadata:{action:'record-delivered',from:'submitted',to:'submitted',
    at,field:'deliveredAt',reason:''}}
 ];
 assert.deepEqual(normalizeTradeLinkSignedHistory(events),events);
 const html=renderTradeLinkSavedWorkflowHistory(events);
 assert.match(html,/operational-record/);
 assert.match(html,/reopened/);
 assert.match(html,/Package checked again &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
test('source-only operations are hidden from nonmanager, never enabled on live frontend',()=>{
 const row={documentId:id,boardItemId:item,documentType:'delivery',
  documentNumber:'DR-SIGNED-001',revision:5,workflowState:'submitted',archived:false};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[row,{...row,documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   documentType:'quotation',workflowState:'approved'},
   {...row,documentId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    documentType:'payment',workflowState:'rejected'}]};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:ws,
  view,canManage:true});
 assert.doesNotMatch(html,/data-action="tradelink-operational-/);
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:ws,
  view,canManage:false});
 assert.doesNotMatch(denied,/DR-SIGNED-001|data-action="tradelink-operational-/);
});
test('SQL signs timestamps, protects current submission cycle and validates exact assignee email',()=>{
 const sql=readFileSync('sql/tradelink-document-operational-candidate.sql','utf8');
 for(const pattern of [
  /SOURCE-ONLY/i,/private\.tl03_can_manage\(p_board_id\)/,
  /u\.email_confirmed_at IS NOT NULL/,
  /email IS DISTINCT FROM assigned/,
  /d\.revision IS DISTINCT FROM p_expected_revision/,
  /d\.workspace_id IS DISTINCT FROM public\.current_workspace_id\(actor\)/,
  /FOR UPDATE/,
  /e\.revision>cycle_start/,
  /e\.operation='operational-record'/,
  /e\.metadata->>'field'='checkedAt'/,
  /e\.metadata->>'field'='deliveredAt'/,
  /e\.metadata->>'field'='receivedAt'/,
  /e\.operation='reviewed'/,
  /e\.operation='approved'/,
  /p_action='reopen' AND pg_catalog\.char_length\(reason\) NOT BETWEEN 3 AND 1500/,
  /operation:='reopened'/,
  /pg_catalog\.clock_timestamp\(\)/,
  /SET updated_by=actor,updated_at=modified_at/,
  /INSERT INTO public\.tradelink_document_events/,
  /SECURITY DEFINER SET search_path=''/,
  /SECURITY INVOKER SET search_path=''/,
  /REVOKE ALL ON FUNCTION public\.tl03_document_operate/,
  /FROM PUBLIC,anon,authenticated/,
  /has_function_privilege\('anon'/
 ])assert.match(sql,pattern);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE) ON TABLE|DROP POLICY|CREATE ROLE|service_role/);
});
test('operational frontend success waits on saved document, Board and immutable event',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 for(const regex of [
  /async function operateTradeLinkDocument\(documentId,action\)/,
  /case 'tradelink-operational-checked'/,
  /case 'tradelink-operational-delivered'/,
  /case 'tradelink-operational-received'/,
  /case 'tradelink-operational-complete'/,
  /case 'tradelink-operational-reopen'/,
  /const receipt=await tradeLinkDraftWorkspace\.operate/,
  /event\.metadata\?\.field!==receipt\.field/,
  /Date\.parse\(receipt\.recordedAt\)!==Date\.parse\(record\.updated_at\)/,
  /tradeLinkBoardProjectionMatches\(item,\{[\s\S]*?boardItemId:receipt\.boardItemId,documentNumber:listed\.documentNumber/,
  /if\(!TL03_WORKFLOW_OPERATIONAL_ENABLED\|\|!TL03_WORKFLOW_REVIEW_ENABLED/,
  /committed\?\s*'The server committed the operational action/
 ])assert.match(app,regex);
 assert.doesNotMatch(app,/localStorage\.setItem\('tradelink_operational/);
});
