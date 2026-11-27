import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TL03_DUAL_REVIEW_ENABLED,TradeLinkDomainClient} from '../tradelink-domain-client.js';
import {TRADELINK_DOCUMENT_STATUS_OPTIONS} from '../tradelink-draft-workspace.js';

const root=new URL('../../',import.meta.url);
const source=async path=>readFile(new URL(path,root),'utf8');

test('application imports the dual-review capability before using reviewer actions',async()=>{
 const app=await source('frontend/app.js');
 assert.match(app,/import\s*\{[^}]*\bTL03_DUAL_REVIEW_ENABLED\b[^}]*\}\s*from\s*['\"]\.\/tradelink-native\.js\?v=cp-tl-opt-01-20261127-01['\"]/s);
});

test('dual-review capability is enabled and all existing status labels remain present',()=>{
 assert.equal(TL03_DUAL_REVIEW_ENABLED,true);
 assert.deepEqual(TRADELINK_DOCUMENT_STATUS_OPTIONS.map(([,label])=>label),[
  'For Approval','Approved','Submitted','Under Negotiation','Expired','On-hold',
  'Won','Lost','Cancelled','Delivered','Closed','Draft'
 ]);
});

test('new document save defaults to For Approval and accepts explicit Draft only',async()=>{
 const client=await source('frontend/tradelink-domain-client.js');
 const workspace=await source('frontend/tradelink-draft-workspace.js');
 const app=await source('frontend/app.js');
 assert.match(workspace,/async save\(\{documentId,expectedRevision=0,draft,initialState='for-approval',reviseApproved=false,approvalFreePreview=false\}/);
 assert.match(app,/fields\.get\('documentStatus'\)\|\|'for-approval'/);
 assert.match(app,/!\['draft','for-approval'\]\.includes\(initialState\)/);
 assert.match(client,/p_initial_state:initialState/);
});

test('assigned reviewer validation is a signed RPC with independent stage identifiers',async()=>{
 const client=await source('frontend/tradelink-domain-client.js');
 const sql=await source('supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql');
 assert.match(client,/async recordReviewStage\(\{documentId,expectedRevision,stage\}/);
 assert.match(client,/tl03_record_review_stage/);
 assert.match(sql,/UNIQUE\(document_id,document_revision,stage\)/);
 assert.match(sql,/Only the assigned reviewer account can record this stage/);
 assert.match(sql,/actor_id uuid NOT NULL REFERENCES auth\.users\(id\)/);
 assert.match(sql,/recorded_at timestamptz NOT NULL DEFAULT pg_catalog\.clock_timestamp\(\)/);
});

test('second independent reviewer atomically changes For Approval to Approved',async()=>{
 const sql=await source('supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql');
 assert.match(sql,/SELECT \* INTO d FROM public\.tradelink_documents[\s\S]*?FOR UPDATE/);
 assert.match(sql,/target_state:=CASE WHEN review_count=2 THEN 'approved' ELSE 'for-approval' END/);
 assert.match(sql,/UPDATE public\.tradelink_documents SET[\s\S]*?workflow_state=target_state/);
});

test('status updates cannot set Approved or bypass two-reviewer completion',async()=>{
 const sql=await source('supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql');
 const domain=await source('frontend/tradelink-domain-client.js');
 assert.match(sql,/p_target_state NOT IN[\s\S]*?'submitted'[\s\S]*?'closed'/);
 assert.match(sql,/Both assigned reviewers must approve before this status transition/);
 assert.match(domain,/const allowed=new Set\(\['submitted','under-negotiation','expired','on-hold'/);
 assert.doesNotMatch(domain,/allowed=new Set\(\[[^\]]*'approved'/);
});

test('PDF printing requires a freshly verified Approved revision; no official template is added',async()=>{
 const app=await source('frontend/app.js');
 const ui=await source('frontend/tradelink-draft-workspace.js');
 const print=app.slice(app.indexOf('async function printTradeLinkDocument'),app.indexOf('async function commitTradeLinkDraft'));
 assert.match(print,/targetRevision===listed\.revision&&listed\.workflowState!=='approved'/);
 assert.match(print,/record\.workflow_state!=='approved'/);
 assert.match(ui,/status==='approved'&&validUuid\(documentId\)/);
 assert.match(ui,/row\.workflowState==='approved'/);
 assert.match(ui,/view\.busy\|\|!canPrint/);
 assert.match(ui,/PDF printing is available only after approval/);
 assert.doesNotMatch(ui,/@page|jsPDF|pdf-lib|pdfmake/);
});

test('assigned reviewer client uses signed native application context and records only the requested stage',async()=>{
 const actor='11111111-1111-4111-8111-111111111111';
 const documentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const boardItemId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const workspaceId='00000000-0000-4000-8000-000000000001';
 const calls=[];
 const detail={board:{id:'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  workspace_id:workspaceId,name:'TradeLink',status:'active',
  description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
 const client=new TradeLinkDomainClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{context:async()=>({user_id:actor,workspace_id:workspaceId,profile:{status:'active'}}),
   nativeApplicationBoardContext:async moduleId=>({
    contract:'native-app-board-v1',moduleId,userId:actor,workspaceId,role:'User',board:detail.board
   }),
   board:async()=>detail,allowed:async(_id,action)=>action==='view',
   rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='tl03_assigned_documents')return [{documentId,boardItemId,
     documentType:'quotation',documentNumber:'Q-ASSIGNED-01',revision:3,
     workflowState:'for-approval',archived:false,clientName:'Assigned Client',
     createdAt:'2026-11-11T08:00:00Z',updatedAt:'2026-11-12T08:00:00Z',
     primaryEmail:'reviewer@example.test',secondaryEmail:'manager@example.test',
     primaryAt:null,secondaryAt:null,assignedStage:'primary'}];
    if(name==='tl03_record_review_stage')return {documentId,boardItemId,
     revision:3,stage:'primary',recordedAt:'2026-11-12T08:10:00Z',
     primaryAt:'2026-11-12T08:10:00Z',secondaryAt:null,
     state:'for-approval',idempotent:false};
    throw new Error('Unexpected RPC '+name);
   }}
 });
 const assigned=await client.assignedDocuments();
 assert.equal(assigned.length,1);
 assert.equal(assigned[0].assignedStage,'primary');
 assert.equal(assigned[0].actorId,actor);
 const receipt=await client.recordReviewStage({documentId,expectedRevision:3,stage:'primary'});
 assert.equal(receipt.state,'for-approval');
 assert.equal(receipt.actorId,actor);
 assert.deepEqual(calls.map(call=>call.name),[
  'tl03_assigned_documents','tl03_record_review_stage'
 ]);
 assert.equal(calls[1].args.p_expected_revision,3);
 assert.equal(calls[1].args.p_stage,'primary');
});

test('review-stage approval receipts require both authoritative reviewer timestamps',async()=>{
 const actor='11111111-1111-4111-8111-111111111111';
 const documentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const boardItemId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const workspaceId='00000000-0000-4000-8000-000000000001';
 const stamp='2026-11-12T08:10:00Z';
 const receipt={documentId,boardItemId,revision:3,stage:'secondary',
  recordedAt:stamp,primaryAt:null,secondaryAt:stamp,state:'approved',idempotent:false};
 const client=new TradeLinkDomainClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{context:async()=>({user_id:actor,workspace_id:workspaceId,profile:{status:'active'}}),
   nativeApplicationBoardContext:async()=>({userId:actor,workspaceId,
    board:{id:'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',workspace_id:workspaceId,
     name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'}}),
   rpc:async()=>receipt}
 });
 await assert.rejects(()=>client.recordReviewStage({documentId,expectedRevision:3,
  stage:'secondary'}),/review receipt mismatch/);
 receipt.primaryAt='2026-11-12T08:05:00Z';
 assert.equal((await client.recordReviewStage({documentId,expectedRevision:3,
  stage:'secondary'})).state,'approved');
 receipt.secondaryAt=null;
 await assert.rejects(()=>client.recordReviewStage({documentId,expectedRevision:3,
  stage:'secondary'}),/review receipt mismatch/);
});

test('assigned reviewer can read assigned TradeLink documents without generic Board VIEW',async()=>{
 const actor='11111111-1111-4111-8111-111111111111';
 const workspaceId='00000000-0000-4000-8000-000000000001';
 let rpcCalls=0,nativeCalls=0,genericCalls=0;
 const board={id:'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  workspace_id:workspaceId,name:'TradeLink',status:'active',
  description:'[APSYNTRA:MODULE:tradelink:v1]'};
 const client=new TradeLinkDomainClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{context:async()=>({user_id:actor,workspace_id:workspaceId,profile:{status:'active'}}),
   nativeApplicationBoardContext:async moduleId=>{
    nativeCalls++;return {contract:'native-app-board-v1',moduleId,userId:actor,
     workspaceId,role:'User',board};
   },
   board:async()=>{genericCalls++;throw new Error('Generic board read must not run');},
   allowed:async()=>{genericCalls++;throw new Error('Generic board view must not run');},
   rpc:async name=>{rpcCalls++;if(name==='tl03_assigned_documents')return [];
    throw new Error('Unexpected RPC '+name);}
  }
 });
 assert.deepEqual(await client.assignedDocuments(),[]);
 assert.equal(nativeCalls,1);
 assert.equal(rpcCalls,1);
 assert.equal(genericCalls,0);
});

test('new editor exposes Save, not the former Preview action, and preserves current legacy status labels',async()=>{
 const ui=await source('frontend/tradelink-draft-workspace.js');
 const sql=await source('supabase/migrations/20261112093727_tradelink_revision_required_edit_compat.sql');
 assert.match(ui,/data-action="tradelink-draft-submit"/);
 assert.match(ui,/Save Changes/);
 assert.match(ui,/Not saved\. Save creates a For Approval document/);
 assert.match(ui,/workflowState&&!TRADELINK_DOCUMENT_STATUS_OPTIONS\.some/);
 assert.match(sql,/workflow_state NOT IN \('draft','for-approval','revision-required'\)/);
 assert.match(sql,/f\.prosecdef/);
 assert.match(sql,/has_function_privilege\('authenticated'/);
 assert.match(sql,/has_function_privilege\('anon'/);
});
