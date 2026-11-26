import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {TradeLinkDomainClient} from '../tradelink-domain-client.js';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView} from '../tradelink-draft-workspace.js';

const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspace='00000000-0000-4000-8000-000000000001';
const documentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const boardItemId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const timestamp='2026-11-08T06:23:14.478231+00:00';
const row={documentId,boardItemId,documentType:'quotation',
 documentNumber:'Q-0001',revision:5,workflowState:'draft',
 archived:false,hidden:false,clientName:'Example Client',createdAt:timestamp,
 updatedAt:timestamp,createdByActor:false,createdBy:actor,
 createdByName:'Original Document Creator',assignedStage:'primary',
 primaryAt:null,secondaryAt:null};
const page={rows:[row],hasMore:true,nextCursor:{documentId,createdAt:timestamp}};
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 items:[],groups:[],columns:[]};
function signedClient({allowed=true,rpc=async()=>page}={}){
 const calls=[];
 const client=new TradeLinkDomainClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{
   context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
   board:async()=>detail,allowed:async()=>allowed,
   rpc:async(name,params)=>{calls.push({name,params});return rpc(name,params);}
  }
 });
 return {client,calls};
}
test('signed server page sends normalized bounded filters and an exact keyset cursor',async()=>{
 const {client,calls}=signedClient();
 const result=await client.searchPage({query:'Q-0',documentType:'quotation',
  workflowState:'draft',archiveMode:'active',cursor:page.nextCursor,limit:10});
 assert.deepEqual(result,page);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0],{name:'tl03_documents_page',params:{
  p_board_id:TRADELINK_BOARD_ID,p_search:'Q-0',
  p_document_type:'quotation',p_workflow_state:'draft',
  p_archive_mode:'active',p_visibility_mode:'visible',
  p_before_at:timestamp,p_before_id:documentId,p_limit:10}});
});

test('bulk actions send only selected IDs and validate an exact atomic server receipt',async()=>{
 const selected=[
  {documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',revision:5},
  {documentId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',revision:2}
 ];
 const receipt={boardId:TRADELINK_BOARD_ID,action:'hide',applied:2,documents:[
  {documentId:selected[0].documentId,revision:5,hidden:true,deleted:false},
  {documentId:selected[1].documentId,revision:2,hidden:true,deleted:false}
 ]};
 const {client,calls}=signedClient({rpc:async()=>receipt});
 const result=await client.bulkAction({action:'hide',documents:selected});
 assert.equal(result.applied,2);
 assert.equal(result.actorId,actor);
 assert.equal(result.workspaceId,workspace);
 assert.deepEqual(calls,[{name:'tl03_documents_bulk_action',params:{
  p_board_id:TRADELINK_BOARD_ID,p_action:'hide',
  p_rows:selected.map(row=>({id:row.documentId,revision:row.revision}))
 }}]);
 for(const input of [
  {action:'hide',documents:[]},
  {action:'purge',documents:selected},
  {action:'hide',documents:[selected[0],selected[0]]},
  {action:'hide',documents:[{documentId:'bad',revision:1}]},
  {action:'hide',documents:[{documentId:selected[0].documentId,revision:0}]}
 ])await assert.rejects(()=>client.bulkAction(input),/Invalid|Select between/);
 assert.equal(calls.length,1,'invalid or duplicate selections must not reach the RPC');
});

test('bulk action receipts reject missing, extra or mismatched selected documents',async()=>{
 const selected=[{documentId,revision:5}];
 for(const bad of [
  {boardId:TRADELINK_BOARD_ID,action:'hide',applied:0,documents:[]},
  {boardId:TRADELINK_BOARD_ID,action:'hide',applied:1,documents:[
   {documentId,revision:4,hidden:true,deleted:false}]},
  {boardId:TRADELINK_BOARD_ID,action:'hide',applied:1,documents:[
   {documentId,revision:5,hidden:false,deleted:false}]},
  {boardId:TRADELINK_BOARD_ID,action:'delete',applied:1,documents:[
   {documentId,revision:5,hidden:false,deleted:true}]}
 ]){
  const {client}=signedClient({rpc:async()=>bad});
  await assert.rejects(()=>client.bulkAction({action:'hide',documents:selected}),
   /bulk-action receipt/i);
 }
});

test('malformed inputs are blocked before the network and denied Board manager never reaches RPC',async()=>{
 const {client,calls}=signedClient();
 for(const input of [{query:'x'.repeat(121)},{documentType:'forged'},
  {workflowState:'forged'},{archiveMode:'untrusted'},{visibilityMode:'untrusted'},
  {limit:0},{limit:51},
  {cursor:{createdAt:timestamp,documentId:'not-a-uuid'}},
  {cursor:{createdAt:'not-a-date',documentId}}]){
  await assert.rejects(()=>client.searchPage(input),/Invalid TradeLink server search request/);
 }
 assert.equal(calls.length,0);
 const denied=signedClient({allowed:false,rpc:()=>{throw Error('Denied client reached RPC');}});
 await assert.rejects(()=>denied.client.searchPage(),/manager scope required|Create New context is unavailable|Signed TradeLink reviewer API unavailable/);
 assert.equal(denied.calls.length,0);
});
test('assigned reviewers use the paged RPC through their existing reviewer session',async()=>{
 const calls=[];
 const board=detail.board;
 const client=new TradeLinkDomainClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{
   context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
   board:async()=>detail,allowed:async()=>false,
   nativeApplicationBoardContext:async moduleId=>({
    moduleId,userId:actor,workspaceId:workspace,role:'Reviewer',board
   }),
   rpc:async(name,args)=>{calls.push([name,args]);return page;}
  }
 });
 const result=await client.searchPage();
 assert.equal(result.rows[0].documentId,documentId);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'tl03_documents_page');
});

test('All Documents displays the original creator name from the signed page response',()=>{
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[{
  ...row,createdByName:'Original Document Creator'
 }],listFilters:{query:'',documentType:'all',workflowState:'all',archiveMode:'active',
  visibilityMode:'visible',sortBy:'createdAt',sortDirection:'desc'}};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,view,canManage:true});
 assert.match(html,/<th(?: class="[^"]+")? scope="col">Created By<\/th>/);
 assert.match(html,/Original Document Creator/);
 assert.match(html,/class="tl-ref-created-by"/);
});
test('untrusted page envelopes, revisions, times, and cursors fail closed',async()=>{
 const invalid=[
  {...page,rows:[{...row,documentId:'bad'}]},
  {...page,rows:[{...row,revision:0}]},
  {...page,rows:[{...row,workflowState:'forged'}]},
  {...page,rows:[{...row,updatedAt:'bad'}]},
  {...page,rows:[{...row,archived:'false'}]},
  {...page,rows:[{...row,hidden:'false'}]},
  {...page,nextCursor:{...page.nextCursor,documentId:boardItemId}},
  {...page,hasMore:false},
  {...page,rows:[]},
  null,[],{rows:[row],hasMore:false,nextCursor:null,other:'ok'} // valid below
 ];
 for(const bad of invalid.slice(0,-1)){
  const {client}=signedClient({rpc:async()=>bad});
  await assert.rejects(()=>client.searchPage(),/Invalid authorized TradeLink server page response/);
 }
 const {client}=signedClient({rpc:async()=>invalid.at(-1)});
 assert.equal((await client.searchPage()).rows[0].documentId,documentId);
});
test('server-paged All Documents shows actionable search, previous and next without leaking other rows',()=>{
 const view={...initialTradeLinkDraftView(),
  status:'AUTHORIZED_READ',rows:[row],
  listFilters:{query:'Q-',documentType:'quotation',workflowState:'draft',
   archiveMode:'active',sortBy:'createdAt',sortDirection:'desc'},
  listPage:{server:true,hasMore:true,nextCursor:page.nextCursor,
   cursor:{documentId,createdAt:timestamp},
   history:[null],pageIndex:1,
   appliedFilters:{query:'',documentType:'all',workflowState:'all',
    archiveMode:'active',sortBy:'createdAt',sortDirection:'desc'}}};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:true});
 assert.match(html,/Search documents/);
 assert.match(html,/Next page/);
 assert.match(html,/Previous page/);
 assert.match(html,/Page 2/);
 assert.match(html,/Search and filters cover all TradeLink documents in this workspace/);
 assert.match(html,/Q-0001/);
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:false});
 assert.doesNotMatch(denied,/Q-0001|Search documents|Next page/);
 const legacy=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:{...view,listPage:null},canManage:true});
 assert.doesNotMatch(legacy,/Next page|Search documents/);
 assert.match(legacy,/current signed TradeLink workspace response/);
});
test('manager action menu takes precedence over reviewer summary while reviewer-only actions stay unchanged',()=>{
 const assigned={...row,workflowState:'for-approval',assignedStage:'primary',
  primaryAt:null,secondaryAt:null};
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[assigned]};
 const manager=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:true,canReview:true});
 assert.match(manager,/class="tl-ref-actions-menu"/);
 assert.match(manager,/Preview\/Edit/);
 assert.match(manager,/Revision history &amp; details/);
 assert.match(manager,/Print PDF/);
 assert.match(manager,/PDF printing is available only after approval/);
 assert.match(manager,/Change status/);
 assert.match(manager,/data-tradelink-status-select/);
 assert.match(manager,/Save status/);
 assert.doesNotMatch(manager,/Sales Supervisor approval exempted|Primary: Exempted|>View document</);
 const reviewer=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:false,canReview:true});
 assert.match(reviewer,/View document/);
 assert.match(reviewer,/Primary:/);
 assert.match(reviewer,/Secondary:/);
 assert.doesNotMatch(reviewer,/Preview\/Edit|Change status|Save status/);
 const css=readFileSync(new URL('../tradelink-reference-ui.css',import.meta.url),'utf8');
 assert.match(css,/position-area:bottom span-left;position-try-fallbacks:flip-block,flip-inline/);
 assert.match(css,/width:min\(205px,calc\(100vw - 24px\)\)/);
 assert.match(css,/\.tl-ref-actions-menu \.tl-reference-status-action>select/);
});
test('source integrates route-safe signed pagination and exact record recovery beyond list window',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 for(const action of ['tradelink-documents-next','tradelink-documents-previous',
  'tradelink-documents-search']){
  assert.match(source,new RegExp("case '"+action+"'"));
 }
 assert.match(source,/await tradeLinkDraftWorkspace\.searchPage/);
 assert.match(source,/await tradeLinkDraftWorkspace\.read\(target\)/);
 assert.match(source,/err\?\.code!=='PGRST202'/);
 assert.match(source,/if\(!state\.tradeLinkDraft\.listPage\?\.server\)/);
 assert.doesNotMatch(source,/localStorage\.setItem\('tradelink/);
});
test('scoped RPC does not replace existing domain read API or expose unauthenticated access',()=>{
 const sql=readFileSync('sql/tradelink-documents-page-candidate.sql','utf8');
 assert.match(sql,/CREATE FUNCTION public\.tl03_documents_page/);
 assert.match(sql,/SECURITY INVOKER SET search_path=''/);
 assert.match(sql,/private\.tl03_can_manage\(p_board_id\)/);
 assert.match(sql,/d\.workspace_id=public\.current_workspace_id\(auth\.uid\(\)\)/);
 assert.match(sql,/ORDER BY d\.updated_at DESC,d\.id DESC/);
 assert.match(sql,/LIMIT \(p_limit\+1\)/);
 assert.match(sql,/pg_catalog\.strpos/);
 assert.match(sql,/p_before_at IS NULL OR \(d\.updated_at,d\.id\)</);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO authenticated/);
 assert.doesNotMatch(sql,/SECURITY DEFINER|DROP TABLE|ALTER TABLE|CREATE ROLE|service_role/);
});


test('active TradeLink document RPCs use persisted created_at ordering and expose client identity',()=>{
 const migration=readFileSync(new URL('../../supabase/migrations/20261123080322_cp_tl_document_identity_order_01.sql',import.meta.url),'utf8');
 assert.match(migration,/ORDER BY s\.created_at DESC,s\.id DESC/);
 assert.match(migration,/ORDER BY d\.created_at DESC,d\.id DESC/);
 assert.match(migration,/ORDER BY a\.created_at DESC,a\.id DESC/);
 assert.match(migration,/\(d\.created_at,d\.id\)<\(p_before_at,p_before_id\)/);
 assert.match(migration,/'clientName',r\.content->>'customerName'/);
 assert.match(migration,/'createdAt',r\.created_at/);
 assert.match(migration,/private\.tl03_can_review\(p_board_id\)/);
 assert.match(migration,/CREATE INDEX IF NOT EXISTS tl03_document_created/);
 assert.doesNotMatch(migration,/ALTER TABLE public\.tradelink_documents\s+RENAME|UPDATE public\.tradelink_documents\s+SET content/i);
 assert.doesNotMatch(migration,/gradient descent|backpropagation|fine.?tun|training loop/i);
});

test('All Documents distinguishes an authorized empty result from pending, failed, and loading reads',()=>{
 const renderState=(view,canReview=true)=>renderTradeLinkDocumentRepository({
  detail,workspaceId:workspace,canManage:!canReview,canReview,view
 });
 const base=initialTradeLinkDraftView();
 const pending=renderState(base);
 assert.match(pending,/<p class="muted" role="status" aria-live="polite">The signed document list has not been loaded/);
 const loading=renderState({...base,busy:true});
 assert.match(loading,/<p class="muted" role="status" aria-live="polite">Loading the signed TradeLink document list/);
 const refreshingEmpty=renderState({...base,status:'AUTHORIZED_READ',rows:[],busy:true});
 assert.match(refreshingEmpty,/Loading the signed TradeLink document list/);
 assert.doesNotMatch(refreshingEmpty,/No documents are currently assigned/);
 const failed=renderState({...base,status:'READ_FAILED',error:'Signed list unavailable'});
 assert.match(failed,/Signed list unavailable/);
 assert.match(failed,/could not be loaded\. Refresh to retry/);
 const empty=renderState({...base,status:'AUTHORIZED_READ',rows:[]});
 assert.match(empty,/No documents match the current TradeLink workspace filters/);
 assert.match(empty,/0 of 0 documents in this response/);
 const managerEmpty=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  canManage:true,view:{...base,status:'AUTHORIZED_READ',rows:[]}});
 assert.match(managerEmpty,/No documents match the current TradeLink workspace filters/);
});
