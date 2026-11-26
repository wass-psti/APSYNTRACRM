import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_APPROVAL_POLICY, GM_SALES_EXEMPT_POLICY, GM_CREATOR_APPROVAL_FREE_POLICY,
  requiredTradeLinkReviewStages, tradeLinkReviewEvidenceComplete } from '../tradelink/approval-policy.js';

const time = '2026-11-25T01:00:00Z';
test('existing and unspecified policies retain both required review stages', () => {
  assert.deepEqual(requiredTradeLinkReviewStages(), ['primary','secondary']);
  assert.equal(tradeLinkReviewEvidenceComplete(STANDARD_APPROVAL_POLICY, time, time), true);
  assert.equal(tradeLinkReviewEvidenceComplete(undefined, null, time), false);
  assert.equal(tradeLinkReviewEvidenceComplete(STANDARD_APPROVAL_POLICY, time, null), false);
});
test('explicit GM exemption requires real management evidence and no fabricated primary review', () => {
  assert.deepEqual(requiredTradeLinkReviewStages(GM_SALES_EXEMPT_POLICY), ['secondary']);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_SALES_EXEMPT_POLICY, null, time), true);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_SALES_EXEMPT_POLICY, null, null), false);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_SALES_EXEMPT_POLICY, time, time), false);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_SALES_EXEMPT_POLICY, null, 'invalid'), false);
});
test('unknown policy never silently weakens review requirements', () => {
  for (const policy of [null,'', 'approved', 'gm']) {
    assert.throws(() => requiredTradeLinkReviewStages(policy));
    assert.throws(() => tradeLinkReviewEvidenceComplete(policy, null, time));
  }
});

import {normalizeTradeLinkRevisionBundle, TradeLinkDomainClient} from '../tradelink-domain-client.js';
import {initialTradeLinkDraftView,renderTradeLinkDraftWorkspace} from '../tradelink-draft-workspace.js';
import {renderTradeLinkSavedDocumentOutput} from '../tradelink-saved-document-output.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const boardId='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const documentId='99999999-9999-4999-8999-999999999992';
const boardItemId='99999999-9999-4999-8999-999999999991';
const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const detail={board:{id:boardId,workspace_id:workspaceId,name:'TradeLink',
 description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},items:[],groups:[],columns:[]};
const content={documentType:'quotation',documentNumber:'Q-000001',customerName:'Synthetic customer',
 verifiedBy:'Sales Supervisor',verifiedByEmail:'aacsenagan@watchdogautomation.com.ph',
 approvedBy:'Management',approvedByEmail:'asenagan@watchdogautomation.com.ph',items:[],currency:'PHP'};
const saved={id:documentId,board_id:boardId,workspace_id:workspaceId,board_item_id:boardItemId,
 document_type:'quotation',document_number:content.documentNumber,workflow_state:'approved',
 revision:1,content,created_by:actorId,updated_by:actorId,created_at:time,updated_at:time,
 archived_at:null,snapshot_source:'captured',revision_at:time,approved:true,
 approval_policy:GM_SALES_EXEMPT_POLICY,primary_reviewed_at:null,secondary_reviewed_at:time};
const meta={revision:1,workflowState:'approved',approved:true,current:true,
 snapshotSource:'captured',revisionAt:time,capturedAt:time,primaryAt:null,secondaryAt:time,
 approvalPolicy:GM_SALES_EXEMPT_POLICY};
test('signed historical exemption normalizes and prints without representing the supervisor as an approving reviewer',()=>{
 const bundle={documentId,boardItemId,currentRevision:1,revisions:[meta],selected:saved};
 const normalized=normalizeTradeLinkRevisionBundle(bundle,workspaceId,documentId,1);
 assert.equal(normalized.selected.approved,true);
 const markup=renderTradeLinkSavedDocumentOutput(normalized.selected,workspaceId,documentId);
 assert.match(markup,/Sales Supervisor approval — Exempted/);
 assert.match(markup,/WORKFLOW APPROVED/);
 assert.throws(()=>normalizeTradeLinkRevisionBundle({...bundle,selected:{...saved,approval_policy:STANDARD_APPROVAL_POLICY}},workspaceId,documentId,1));
 assert.throws(()=>normalizeTradeLinkRevisionBundle({...bundle,revisions:[{...meta,approvalPolicy:undefined}]},workspaceId,documentId,1));
});
test('signed receipt permits a single real secondary review only with explicit exemption',async()=>{
 const base={documentId,boardItemId,revision:1,stage:'secondary',state:'approved',
 recordedAt:time,primaryAt:null,secondaryAt:time,idempotent:false};
 let response={...base,approvalPolicy:GM_SALES_EXEMPT_POLICY};
 const client=new TradeLinkDomainClient({auth:{userId:actorId},api:{rpc:async()=>response}});
 client.reviewerSession=async()=>({actorId,workspaceId});
 const command={documentId,expectedRevision:1,stage:'secondary'};
 assert.equal((await client.recordReviewStage(command)).state,'approved');
 response={...base};await assert.rejects(()=>client.recordReviewStage(command));
 response={...base,approvalPolicy:GM_SALES_EXEMPT_POLICY,primaryAt:time};await assert.rejects(()=>client.recordReviewStage(command));
});
test('named GM new quotation shows prospective exemption; other accounts retain normal UI',()=>{
 const render=(actorEmail,actorModuleRole)=>renderTradeLinkDraftWorkspace({detail,workspaceId,
  view:initialTradeLinkDraftView('quotation'),canManage:true,actorEmail,actorModuleRole});
 const gm=render('asenagan@watchdogautomation.com.ph','General Manager');
 assert.match(gm,/Sales Supervisor approval — Exemption on save/);
 assert.doesNotMatch(gm,/data-tl-review-stage="primary"/);
 assert.match(gm,/name="verifiedByEmail"/);
 assert.match(gm,/data-tl-review-stage="secondary"/);
 for(const [email,role] of [['other@example.test','General Manager'],['asenagan@watchdogautomation.com.ph','User']]){
  const other=render(email,role);assert.match(other,/Primary approver — Sales Supervisor/);
  assert.match(other,/data-tl-review-stage="primary"/);
  assert.doesNotMatch(other,/Exemption on save/);
 }
});

test('executive PO optional intermediate reviewer is scoped to preview and own final assignment',async()=>{
 const {validateTradeLinkModuleAccountAssignments}=await import('../tradelink-draft-workspace.js');
 const po={documentType:'po',approvedBy:'asenagan@watchdogautomation.com.ph'};
 assert.doesNotThrow(()=>validateTradeLinkModuleAccountAssignments({...po},{executivePreview:true}));
 assert.throws(()=>validateTradeLinkModuleAccountAssignments({...po}));
 assert.throws(()=>validateTradeLinkModuleAccountAssignments({...po,approvedBy:'dsenagan@watchdogautomation.com.ph'},{executivePreview:true}));
});

test('explicit creator approval-free policy requires no reviewer evidence', () => {
  assert.deepEqual(requiredTradeLinkReviewStages(GM_CREATOR_APPROVAL_FREE_POLICY), []);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_CREATOR_APPROVAL_FREE_POLICY, null, null), true);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_CREATOR_APPROVAL_FREE_POLICY, time, null), false);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_CREATOR_APPROVAL_FREE_POLICY, null, time), false);
  assert.equal(tradeLinkReviewEvidenceComplete(GM_SALES_EXEMPT_POLICY, null, null), false);
});

test('approval-free revision normalizes and prints without reviewer evidence',()=>{
 const free={...saved,approval_policy:GM_CREATOR_APPROVAL_FREE_POLICY,primary_reviewed_at:null,secondary_reviewed_at:null};
 const freeMeta={...meta,approvalPolicy:GM_CREATOR_APPROVAL_FREE_POLICY,primaryAt:null,secondaryAt:null};
 const bundle={documentId,boardItemId,currentRevision:1,revisions:[freeMeta],selected:free};
 const normalized=normalizeTradeLinkRevisionBundle(bundle,workspaceId,documentId,1);
 assert.equal(normalized.selected.approved,true);
 const markup=renderTradeLinkSavedDocumentOutput(normalized.selected,workspaceId,documentId);
 assert.equal((markup.match(/Not Applicable/g)||[]).length,2);
 assert.doesNotMatch(markup,/Recorded validation on/);
 assert.throws(()=>normalizeTradeLinkRevisionBundle({...bundle,selected:{...free,secondary_reviewed_at:time}},workspaceId,documentId,1));
});

test('saved approval-free quotation and PO render no reviewer controls',()=>{
 for(const type of ['quotation','po']){
  const record={...saved,document_type:type,content:{...content,documentType:type},approval_policy:GM_CREATOR_APPROVAL_FREE_POLICY};
  const view={...initialTradeLinkDraftView(type),mode:'edit',selected:{documentId,record},reviewStages:{approvalPolicy:GM_CREATOR_APPROVAL_FREE_POLICY,primary:null,secondary:null}};
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId,view,canManage:true});
  assert.match(html,/Reviewer approval — Not Applicable/);
  assert.match(html,/Management approval — Not Applicable/);
  assert.doesNotMatch(html,/data-tl-review-stage="(?:primary|secondary)"/);
 }
});
