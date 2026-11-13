import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TradeLinkDomainClient,TL03_WORKFLOW_DECISION_ENABLED,
 normalizeTradeLinkDecisionReceipt,normalizeTradeLinkSignedHistory
} from '../tradelink-domain-client.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDocumentRepository,
 renderTradeLinkSavedWorkflowHistory} from '../tradelink-draft-workspace.js';

const id='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const item='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ws='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
const approved={documentId:id,boardItemId:item,revision:6,
 state:'approved',operation:'approve',from:'under-review'};
const rejected={...approved,state:'rejected',operation:'reject'};

test('final signed decision receipts reject forged approval, wrong revision and state',()=>{
 assert.deepEqual(normalizeTradeLinkDecisionReceipt(
  approved,id,5,'approve','under-review'),approved);
 assert.deepEqual(normalizeTradeLinkDecisionReceipt(
  rejected,id,5,'reject','under-review'),rejected);
 assert.deepEqual(normalizeTradeLinkDecisionReceipt({
  ...rejected,from:'submitted'},id,5,'reject','submitted'),{
   ...rejected,from:'submitted'});
 for(const invalid of [
  {...approved,state:'completed'},{...approved,state:'submitted'},
  {...approved,operation:'reject'},{...approved,revision:5},
  {...approved,revision:7},{...approved,from:'draft'},
  {...approved,documentId:'invalid'},{...approved,boardItemId:'wrong'},
  null,[],{}
 ])assert.throws(()=>normalizeTradeLinkDecisionReceipt(
  invalid,id,5,'approve','under-review'),/mismatch/);
 for(const [action,from] of [['invalid','under-review'],['approve','draft'],
  ['reject','approved']])
  assert.throws(()=>normalizeTradeLinkDecisionReceipt(
   approved,id,5,action,from),/mismatch/);
});
test('production-disabled decision client fails closed without network calls or session lookup',async()=>{
 assert.equal(TL03_WORKFLOW_DECISION_ENABLED,false);
 let calls=0;
 const client=new TradeLinkDomainClient({
  auth:{getVerifiedUser:async()=>{calls++;throw Error('auth reached');}},
  api:{rpc:async()=>{calls++;throw Error('unexpected network');}}
 });
 await assert.rejects(()=>client.decide({documentId:id,expectedRevision:5,
  action:'approve',fromState:'under-review'}),/not activated/);
 await assert.rejects(()=>client.decide({documentId:id,expectedRevision:5,
  action:'reject',fromState:'under-review',reason:'Wrong quote'}),/not activated/);
 assert.equal(calls,0);
});
test('signed history supports final decisions, reason and audit timestamp without HTML execution',()=>{
 const rows=[{revision:6,operation:'rejected',actorId:actor,
  at:'2026-11-08T08:30:00Z',
  metadata:{action:'reject',reason:'Wrong <script>alert(1)</script>',
   from:'under-review',to:'rejected',decidedAt:'2026-11-08T08:30:00Z'}},
  {revision:5,operation:'approved',actorId:actor,
   at:'2026-11-08T08:27:00Z',
   metadata:{action:'approve',from:'submitted',to:'approved',
    decidedAt:'2026-11-08T08:27:00Z'}}];
 assert.equal(normalizeTradeLinkSignedHistory(rows),rows);
 assert.throws(()=>normalizeTradeLinkSignedHistory(
  [{...rows[0],revision:0}]),/Invalid/);
 const html=renderTradeLinkSavedWorkflowHistory(rows);
 assert.match(html,/rejected/);
 assert.match(html,/approved/);
 assert.match(html,/Wrong &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
test('All Documents never exposes approval/rejection to nonmanager or before activation',()=>{
 const base={documentId:id,boardItemId:item,documentNumber:'Q-DECIDE',
  documentType:'quotation',workflowState:'submitted',revision:5,archived:false};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[base,{...base,documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    documentType:'payment'},
   {...base,documentId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    documentType:'packing',workflowState:'completed'}]};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:ws,
  view,canManage:true});
 assert.doesNotMatch(html,
  /data-action="tradelink-document-approve"|data-action="tradelink-document-reject"/);
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:ws,
  view,canManage:false});
 assert.doesNotMatch(denied,
  /Q-DECIDE|data-action="tradelink-document-approve"|data-action="tradelink-document-reject"/);
});
test('SQL approval/rejection candidate retains signed CAS, actor binding, source readiness and Board consistency',()=>{
 const sql=readFileSync('sql/tradelink-document-decision-candidate.sql','utf8');
 for(const pattern of [
  /source-only/i,/p_action NOT IN \('approve','reject'\)/,
  /private\.tl03_can_manage\(p_board_id\)/,
  /u\.email_confirmed_at IS NOT NULL/,
  /reviewer\.email_confirmed_at IS NOT NULL/,
  /email IS DISTINCT FROM approver_email/,
  /email IS DISTINCT FROM reviewer_email/,
  /d\.revision IS DISTINCT FROM p_expected_revision/,
  /d\.workflow_state NOT IN \('submitted','under-review'\)/,
  /d\.document_type NOT IN \('quotation','po','esi'\)/,
  /d\.document_type='packing'/,
  /pg_catalog\.char_length\(reason\) NOT BETWEEN 3 AND 1500/,
  /e\.operation='reviewed'/,
  /e\.revision=d\.revision/,
  /FOR UPDATE/,
  /SET updated_by=actor,updated_at=modified_at/,
  /INSERT INTO public\.tradelink_document_events/,
  /decidedAt/,
  /SECURITY DEFINER SET search_path=''/,
  /SECURITY INVOKER SET search_path=''/,
  /REVOKE ALL ON FUNCTION public\.tl03_document_decide/,
  /FROM PUBLIC,anon,authenticated/,
  /has_function_privilege\('anon'/
 ])assert.match(sql,pattern);
 assert.doesNotMatch(sql,
  /\bGRANT\s+(?:INSERT|UPDATE|DELETE)\b|DROP POLICY|CREATE ROLE|service_role/);
});
test('source UI waits for verified signed decision, immutable audit reason and synced Board record',()=>{
 const s=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 for(const match of [
  /async function decideTradeLinkDocument\(documentId,action\)/,
  /case 'tradelink-document-approve'/,
  /case 'tradelink-document-reject'/,
  /const receipt=await tradeLinkDraftWorkspace\.decide/,
  /tradeLinkDraftWorkspace\.history\(documentId\)/,
  /event\.metadata\?\.from!==listed\.workflowState/,
  /event\.metadata\?\.reason!==reason/,
  /event\.metadata\.decidedAt/,
  /tradeLinkBoardProjectionMatches\(item,\{[\s\S]*?boardItemId:receipt\.boardItemId,documentNumber:listed\.documentNumber/,
  /if\(!TL03_WORKFLOW_DECISION_ENABLED\|\|!TL03_WORKFLOW_REVIEW_ENABLED/,
  /committed\?\s*'The server committed the decision/
 ])assert.match(s,match);
 assert.doesNotMatch(s,/localStorage\.setItem\('tradelink_decision/);
});
