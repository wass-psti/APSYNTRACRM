import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TradeLinkDomainClient} from '../tradelink-domain-client.js';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView} from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const workspace='00000000-0000-4000-8000-000000000001';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherActor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const firstId='11111111-1111-4111-8111-111111111111';
const secondId='22222222-2222-4222-8222-222222222222';
const board={
 id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
 status:'active',archived_at:null,trashed_at:null,
 description:'[APSYNTRA:MODULE:tradelink:v1]'
};
const row=(documentId,documentNumber,createdByName)=>({
 documentId,boardItemId:'33333333-3333-4333-8333-333333333333',
 documentType:'quotation',documentNumber,revision:1,workflowState:'draft',
 archived:false,hidden:false,clientName:'Shared Client',
 createdAt:'2026-11-26T01:00:00.000Z',
 updatedAt:'2026-11-26T01:00:00.000Z',
 createdByActor:false,createdBy:otherActor,createdByName,
 assignedStage:null,primaryAt:null,secondaryAt:null
});
const page={
 rows:[row(firstId,'Q-SHARED-001','Original Creator One'),
  row(secondId,'Q-SHARED-002','Original Creator Two')],
 hasMore:false,nextCursor:null
};

test('ordinary TradeLink users render the shared All Documents collection without manager bulk actions',()=>{
 const view={
  ...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:page.rows,sharedVisibility:true,assignedOnly:false,
  message:'Showing all TradeLink documents in this workspace.'
 };
 const html=renderTradeLinkDocumentRepository({
  detail:{board,groups:[],columns:[],items:[]},
  workspaceId:workspace,view,canManage:false,canReview:true,canCreate:false,
  actorEmail:'ordinary@example.test'
 });
 assert.match(html,/All Documents/);
 assert.match(html,/Q-SHARED-001/);
 assert.match(html,/Q-SHARED-002/);
 assert.match(html,/Original Creator One/);
 assert.match(html,/Original Creator Two/);
 assert.match(html,/Preview\/Edit/);
 assert.doesNotMatch(html,/View document/);
 assert.match(html,/Revision history &amp; details/);
 assert.match(html,/Print PDF/);
 assert.match(html,/Change status/);
 assert.match(html,/data-tradelink-status-select[^>]*disabled/);
 assert.match(html,/data-action="tradelink-document-status-update"[^>]*disabled/);
 assert.match(html,/Save status/);
 assert.match(html,/tl-ref-row-action-trigger/);
 assert.match(html,/popovertarget="tl-doc-menu-/);
 assert.doesNotMatch(html,/tl-reviewer-menu-actions/);
 assert.doesNotMatch(html,/tl-reviewer-stage-summary/);
 assert.doesNotMatch(html,/Delete Selected/);
 assert.doesNotMatch(html,/Hide Selected/);
 assert.doesNotMatch(html,/Unhide Selected/);
 assert.doesNotMatch(html,/My Assigned Documents/);
 assert.doesNotMatch(html,/Only documents assigned to the signed account/);
 assert.match(html,/data-action="tradelink-document-print"[^>]*disabled/);
});

test('ordinary assigned reviewers receive the standard document menu while retaining their validation action',()=>{
 const assigned={...row(firstId,'Q-REVIEW-001','Original Creator One'),
  assignedStage:'secondary',primaryAt:null,secondaryAt:null,workflowState:'for-approval'};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[assigned],sharedVisibility:true,assignedOnly:false};
 const html=renderTradeLinkDocumentRepository({
  detail:{board,groups:[],columns:[],items:[]},
  workspaceId:workspace,view,canManage:false,canReview:true,canCreate:false,
  actorEmail:'reviewer@example.test'
 });
 assert.match(html,/tl-ref-row-action-trigger/);
 assert.match(html,/data-action="tradelink-document-open"/);
 assert.match(html,/Revision history &amp; details/);
 assert.match(html,/Print PDF/);
 assert.match(html,/Change status/);
 assert.match(html,/Save status/);
 assert.match(html,/data-action="tradelink-document-review-stage"/);
 assert.match(html,/Use Time Now/);
 assert.match(html,/data-tradelink-status-select[^>]*disabled/);
 assert.doesNotMatch(html,/data-action="tradelink-review-document-open"/);
 assert.doesNotMatch(html,/tl-reviewer-menu-actions/);
 assert.doesNotMatch(html,/tl-reviewer-stage-summary/);
});

test('ordinary TradeLink users without reviewer or creator roles can still view the shared All Documents collection',()=>{
 const view={
  ...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:page.rows,sharedVisibility:true,assignedOnly:false,
  message:'Showing all TradeLink documents in this workspace.'
 };
 const html=renderTradeLinkDocumentRepository({
  detail:{board,groups:[],columns:[],items:[]},
  workspaceId:workspace,view,canManage:false,canReview:false,canCreate:false,
  actorEmail:'viewer@example.test'
 });
 assert.match(html,/Q-SHARED-001/);
 assert.match(html,/Q-SHARED-002/);
 assert.match(html,/Preview\/Edit/);
 assert.doesNotMatch(html,/View document/);
 assert.match(html,/tl-ref-row-action-trigger/);
 assert.match(html,/popovertarget="tl-doc-menu-/);
 assert.doesNotMatch(html,/Delete Selected/);
 assert.doesNotMatch(html,/Hide Selected/);
 assert.doesNotMatch(html,/Unhide Selected/);
});

test('General Manager retains existing bulk controls over the same shared rows',()=>{
 const view={
  ...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:page.rows,sharedVisibility:true,assignedOnly:false
 };
 const html=renderTradeLinkDocumentRepository({
  detail:{board,groups:[],columns:[],items:[]},
  workspaceId:workspace,view,canManage:true,canReview:false,canCreate:true,
  actorEmail:'manager@example.test'
 });
 assert.match(html,/All Documents/);
 assert.match(html,/Q-SHARED-001/);
 assert.match(html,/Delete Selected/);
 assert.match(html,/Hide Selected/);
 assert.match(html,/Unhide Selected/);
 assert.match(html,/Preview\/Edit/);
 assert.match(html,/Revision history &amp; details/);
 assert.match(html,/Change status/);
 assert.match(html,/data-action="tradelink-document-status-update"/);
 assert.doesNotMatch(html,/data-tradelink-status-select[^>]*disabled/);
});

test('all TradeLink module roles use the signed shared-document read session for list, page, detail and revisions',async()=>{
 const calls=[];
 const client=new TradeLinkDomainClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{
   context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
   allowed:async()=>false,
   nativeApplicationBoardContext:async()=>({
    moduleId:'tradelink',role:'Reviewer',userId:actor,workspaceId:workspace,board
   }),
   rpc:async(name,params)=>{
    calls.push({name,params});
    if(name==='tl03_documents_page')return {rows:[],hasMore:false,nextCursor:null};
    if(name==='tl03_documents_list')return [];
    return null;
   }
  }
 });
 const result=await client.searchPage();
 assert.deepEqual(result.rows,[]);
 assert.deepEqual(await client.list(),[]);
 assert.equal(await client.read(firstId),null);
 assert.equal(await client.revisionBundle(firstId),null);
 assert.deepEqual(calls.map(call=>call.name),[
  'tl03_documents_page','tl03_documents_list',
  'tl03_document_read','tl03_document_revision_bundle'
 ]);
});

test('the shared-read migration preserves manager-only bulk mutation and existing write boundaries',()=>{
 const migration=readFileSync(new URL(
  '../../supabase/migrations/20261126093000_cp_tl_shared_document_visibility_01.sql',
  import.meta.url),'utf8');
 assert.match(migration,/CREATE FUNCTION private\.tl03_can_view_documents/);
 assert.match(migration,/public\.has_module_access\('tradelink',v_actor\)/);
 assert.match(migration,/wm\.active IS TRUE/);
 assert.match(migration,/b\.workspace_id=public\.current_workspace_id\(v_actor\)/);
 assert.match(migration,/CREATE POLICY tl03_docs_read[\s\S]*USING\(private\.tl03_can_view_documents\(board_id\) IS TRUE\)/);
 assert.match(migration,/p_archive_mode and p_visibility_mode/);
 assert.match(migration,/private\.tl03_documents_bulk_action\(uuid,text,jsonb\)/);
 assert.match(migration,/46734221a0b71b347b750093ae781136/);
 assert.match(migration,/290410fc64f574dbbff729307c62d946/);
 assert.doesNotMatch(migration,/CREATE POLICY[^;]*FOR UPDATE/i);
 assert.doesNotMatch(migration,/CREATE POLICY[^;]*FOR DELETE/i);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION private\.tl03_documents_bulk_action/);
 assert.doesNotMatch(migration,/gradient descent|backpropagation|fine.?tun|training loop/i);
});

test('application loads shared document visibility while keeping bulk actions manager-gated',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/sharedVisibility:true/);
 assert.match(app,/Showing all TradeLink documents in this workspace/);
 const openHandler=app.match(/async function openTradeLinkDocument\([\s\S]*?async function printTradeLinkDocument/);
 assert.ok(openHandler);
 assert.doesNotMatch(openHandler[0],/listed\.createdByActor!==true/);
 const bulk=app.match(/async function applyTradeLinkDocumentBulkAction\([\s\S]*?\n\}/);
 assert.ok(bulk);
 assert.match(bulk[0],/!state\.boardManage/);
 assert.match(app,/state\.tradeLinkDraft\?\.sharedVisibility!==true/);
});

test('executive exemption suppresses only intermediate menu action',()=>{
 for(const [stage,recorded,expected] of [['primary',false,false],['secondary',false,true],['secondary',true,false]]){
  const assigned={...row(firstId,'Q-EXEC-001','Creator'),assignedStage:stage,
   approvalPolicy:'gm-sales-supervisor-exempt-v1',workflowState:'for-approval',
   secondaryAt:recorded?'2026-11-26T01:00:00Z':null};
  const html=renderTradeLinkDocumentRepository({detail:{board,groups:[],columns:[],items:[]},
   workspaceId:workspace,view:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[assigned],sharedVisibility:true},
   canManage:false,canReview:true,canCreate:false,actorEmail:'reviewer@example.test'});
  assert.equal(html.includes('data-action="tradelink-document-review-stage"'),expected,stage);
 }
});

test('TradeLink document menu correction is delivered through versioned application and renderer module URLs',()=>{
 const index=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../tradelink-ui.js',import.meta.url),'utf8');
 const application=readFileSync(new URL('../tradelink-application.js',import.meta.url),'utf8');
 const version='cp-tl-universal-edit-01k-20261126-01';
 assert.match(index,new RegExp('app\\.js\\?v='+version));
 assert.match(app,new RegExp('tradelink-ui\\.js\\?v='+version));
 assert.match(app,new RegExp('tradelink-draft-workspace\\.js\\?v='+version));
 assert.match(ui,new RegExp('tradelink-application\\.js\\?v='+version));
 assert.match(application,new RegExp('tradelink-draft-workspace\\.js\\?v='+version));
});
