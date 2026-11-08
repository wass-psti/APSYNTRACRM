import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TradeLinkDomainClient,TL03_WORKFLOW_REVIEW_ENABLED,
 normalizeTradeLinkReviewReceipt,normalizeTradeLinkSignedHistory,
 normalizeTradeLinkDomainReceipt,normalizeTradeLinkSubmitReceipt
} from '../tradelink-domain-client.js';
import {
 initialTradeLinkDraftView,parseTradeLinkDraftForm,
 renderTradeLinkDocumentRepository,renderTradeLinkDraftWorkspace,
 renderTradeLinkSavedWorkflowHistory
} from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const documentId='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const boardItemId='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const actor='11111111-1111-4111-8111-111111111111';
const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
 description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},items:[],groups:[],columns:[]};
const reviewReceipt={documentId,boardItemId,revision:4,state:'under-review',
 from:'submitted',operation:'review'};
const revisionReceipt={...reviewReceipt,revision:5,state:'revision-required',
 from:'under-review',operation:'request-revision'};
const formFields=data=>({get:key=>data[key]??null,getAll:key=>data[key]===undefined?[]:[data[key]]});

test('review action accepts only signed correct CAS, state and operation, no synthetic approval',()=>{
 assert.equal(normalizeTradeLinkReviewReceipt(reviewReceipt,documentId,3,'review','submitted'),reviewReceipt);
 assert.equal(normalizeTradeLinkReviewReceipt(revisionReceipt,documentId,4,
  'request-revision','under-review'),revisionReceipt);
 assert.equal(normalizeTradeLinkReviewReceipt({...revisionReceipt,from:'submitted'},
  documentId,4,'request-revision','submitted').state,'revision-required');
 for(const forged of [
  {...reviewReceipt,revision:3},{...reviewReceipt,revision:5},
  {...reviewReceipt,state:'approved'},{...reviewReceipt,operation:'approve'},
  {...reviewReceipt,from:'draft'},{...reviewReceipt,boardItemId:'wrong'},
  {...reviewReceipt,documentId:'not-a-uuid'},null
 ])assert.throws(()=>normalizeTradeLinkReviewReceipt(forged,documentId,3,
  'review','submitted'),/mismatch/);
 assert.throws(()=>normalizeTradeLinkReviewReceipt(reviewReceipt,documentId,3,
  'review','under-review'),/mismatch/);
});
test('revision-required Draft save and signed resubmit retain exact workflow ownership',()=>{
 const editReceipt={documentId,boardItemId,revision:5,state:'revision-required',
  operation:'update',idempotent:false};
 assert.equal(normalizeTradeLinkDomainReceipt(editReceipt,documentId,'update',
  4,'revision-required'),editReceipt);
 assert.throws(()=>normalizeTradeLinkDomainReceipt(editReceipt,documentId,'update',4),
  /mismatch/);
 const resubmitReceipt={documentId,boardItemId,revision:6,state:'submitted',
  operation:'submit',from:'revision-required'};
 assert.equal(normalizeTradeLinkSubmitReceipt(resubmitReceipt,
  documentId,'quotation',5,'revision-required'),resubmitReceipt);
 assert.throws(()=>normalizeTradeLinkSubmitReceipt(resubmitReceipt,
  documentId,'quotation',5,'draft'),/mismatch/);
});
test('review and history do not call the network until signed backend is activated',async()=>{
 assert.equal(TL03_WORKFLOW_REVIEW_ENABLED,false);
 const client=new TradeLinkDomainClient({auth:{getVerifiedUser:async()=>{throw Error('Unexpected sign-in call');}},
  api:{rpc:async()=>{throw Error('Unexpected network request');}}});
 await assert.rejects(()=>client.review({
  documentId,expectedRevision:3,action:'review',fromState:'submitted'}),/not activated/);
 await assert.rejects(()=>client.history(documentId),/not activated/);
});
test('signed audit rows are bounded, newest-first, actor-linked and never fabricate history',()=>{
 const events=[{revision:4,operation:'revision-requested',actorId:actor,
  at:'2026-11-08T08:20:00Z',metadata:{action:'request-revision',from:'under-review',
   to:'revision-required',reason:'Revise quantity <script>alert(1)</script>'}},
  {revision:3,operation:'reviewed',actorId:actor,
   at:'2026-11-08T08:19:00Z',metadata:{from:'submitted',to:'under-review',reason:''}}];
 assert.deepEqual(normalizeTradeLinkSignedHistory(events),events);
 assert.throws(()=>normalizeTradeLinkSignedHistory([...events].reverse()),/Invalid/);
 assert.throws(()=>normalizeTradeLinkSignedHistory([{...events[0],actorId:'bad'}]),/Invalid/);
 assert.throws(()=>normalizeTradeLinkSignedHistory([{...events[0],metadata:{reason:'x'.repeat(1501)}}]),/Invalid/);
 assert.throws(()=>normalizeTradeLinkSignedHistory(events,1),/Invalid/);
 assert.throws(()=>normalizeTradeLinkSignedHistory(null),/Invalid/);
 const html=renderTradeLinkSavedWorkflowHistory(events);
 assert.match(html,/Signed document history/);
 assert.match(html,/revision-requested/);
 assert.match(html,/Revise quantity &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>|onerror=|eval\(/);
 assert.equal(renderTradeLinkSavedWorkflowHistory([]),'');
});
test('verified reviewer identity is persisted as a Draft field, not a free-text grant',()=>{
 const draft=parseTradeLinkDraftForm(formFields({
  documentType:'quotation',documentNumber:'Q-REVIEW-99',
  customerName:'Prospect',customerEmail:'client@example.test',
  validity:'30 days',deliveryCommitment:'Within two weeks',paymentTerms:'Net 30',
  approvedBy:'Approver',verifiedBy:'Reviewer',
  verifiedByEmail:'reviewer@example.test',approvedByEmail:'approver@example.test',
  lineDescription:'Pump',lineQuantity:'2',lineUnitPrice:'150'
 }),{lineId:()=> 'line-item'});
 assert.equal(draft.verifiedByEmail,'reviewer@example.test');
 assert.equal(draft.approvedByEmail,'approver@example.test');
 assert.equal(draft.verifiedBy,'Reviewer');
 assert.equal(Object.hasOwn(draft,'workflow'),false);
 for(const invalid of ['wrong','x'.repeat(255)+'@example.test'])
  assert.throws(()=>parseTradeLinkDraftForm(formFields({
   ...draft,verifiedByEmail:invalid,
   lineDescription:'Pump',lineQuantity:'2',lineUnitPrice:'150'
  })),/Invalid assigned TradeLink account email/);
 const view={...initialTradeLinkDraftView(),mode:'edit',
  selected:{documentId,record:{document_type:'quotation',
   document_number:draft.documentNumber,workflow_state:'revision-required',
   revision:4,content:draft}}};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
 assert.match(html,/Revision Required/);
 assert.match(html,/name="verifiedByEmail"/);
 assert.match(html,/name="approvedByEmail"/);
 assert.match(html,/value="reviewer@example\.test"/);
 assert.match(html,/type="submit" class="primary"/);
});
test('All Documents actions remain authorization-gated for signed submitted/revision states',()=>{
 const listed={documentId,boardItemId,documentType:'quotation',
  documentNumber:'Q-REVIEW-99',revision:3,workflowState:'submitted',archived:false};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[listed,{...listed,documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   workflowState:'revision-required',revision:5}]};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,view,canManage:true});
 assert.doesNotMatch(html,/data-action="tradelink-document-review"|data-action="tradelink-document-request-revision"/);
 assert.match(html,/Edit Draft/);
 assert.match(html,/Submit \(pending activation\)/);
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,view,canManage:false});
 assert.doesNotMatch(denied,/Q-REVIEW-99|Edit Draft|data-action="tradelink-document-review"/);
});
test('SQL source keeps exact signed actor matching, scopes, immutable audit, old grants and pinning',()=>{
 const candidate=readFileSync('sql/tradelink-document-review-revision-candidate.sql','utf8');
 for(const pattern of [
  /pg_catalog\.md5\(pg_catalog\.pg_get_functiondef\(f\.oid\)\)<>'022f93c81d7e315891e9596e24335350'/,
  /email_confirmed_at IS NOT NULL/,/private\.tl03_can_manage\(p_board_id\)/,
  /email IS DISTINCT FROM reviewer_email/,
  /email IS DISTINCT FROM approver_email/,
  /d\.revision IS DISTINCT FROM p_expected_revision/,
  /d\.workflow_state NOT IN \('submitted','under-review'\)/,
  /pg_catalog\.char_length\(reason\) NOT BETWEEN 3 AND 1500/,
  /FOR UPDATE/,/UPDATE public\.work_board_items/,
  /INSERT INTO public\.tradelink_document_events/,
  /WHERE e\.board_id=p_board_id AND e\.document_id=p_document_id/,
  /AND e\.workspace_id=public\.current_workspace_id\(auth\.uid\(\)\)/,
  /GRANT EXECUTE ON FUNCTION public\.tl03_document_history/,
  /GRANT EXECUTE ON FUNCTION public\.tl03_document_review/,
  /has_function_privilege\('anon'/
 ])assert.match(candidate,pattern);
 assert.doesNotMatch(candidate,/GRANT (?:INSERT|UPDATE|DELETE) ON TABLE|DROP POLICY|CREATE ROLE|service_role/);
});
test('UI uses server-confirmed revision, signed actor and audit reason before success',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/async function reviewTradeLinkDocument\(documentId,action\)/);
 assert.match(source,/case 'tradelink-document-review'/);
 assert.match(source,/case 'tradelink-document-request-revision'/);
 assert.match(source,/const receipt=await tradeLinkDraftWorkspace\.review/);
 assert.match(source,/tradeLinkDraftWorkspace\.history\(documentId\)/);
 assert.match(source,/events\[0\]\.metadata\?\.reason!==reason/);
 assert.match(source,/item\.id===receipt\.boardItemId&&/);
 assert.match(source,/record\.workflow_state!==workflowState/);
 assert.match(source,/fromState:listed\.workflowState/);
 assert.doesNotMatch(source,/localStorage\.setItem\('tradelink_review/);
});
