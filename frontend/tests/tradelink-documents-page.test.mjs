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
 archived:false,updatedAt:timestamp};
const page={rows:[row],hasMore:true,nextCursor:{documentId,updatedAt:timestamp}};
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
  p_archive_mode:'active',p_before_at:timestamp,p_before_id:documentId,
  p_limit:10}});
});
test('malformed inputs are blocked before the network and denied Board manager never reaches RPC',async()=>{
 const {client,calls}=signedClient();
 for(const input of [{query:'x'.repeat(121)},{documentType:'forged'},
  {workflowState:'forged'},{archiveMode:'untrusted'},{limit:0},{limit:51},
  {cursor:{updatedAt:timestamp,documentId:'not-a-uuid'}},
  {cursor:{updatedAt:'not-a-date',documentId}}]){
  await assert.rejects(()=>client.searchPage(input),/Invalid TradeLink server search request/);
 }
 assert.equal(calls.length,0);
 const denied=signedClient({allowed:false,rpc:()=>{throw Error('Denied client reached RPC');}});
 await assert.rejects(()=>denied.client.searchPage(),/manager scope required/);
 assert.equal(denied.calls.length,0);
});
test('untrusted page envelopes, revisions, times, and cursors fail closed',async()=>{
 const invalid=[
  {...page,rows:[{...row,documentId:'bad'}]},
  {...page,rows:[{...row,revision:0}]},
  {...page,rows:[{...row,workflowState:'forged'}]},
  {...page,rows:[{...row,updatedAt:'bad'}]},
  {...page,rows:[{...row,archived:'false'}]},
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
   archiveMode:'active',sortBy:'updatedAt',sortDirection:'desc'},
  listPage:{server:true,hasMore:true,nextCursor:page.nextCursor,
   cursor:{documentId,updatedAt:timestamp},
   history:[null],pageIndex:1,
   appliedFilters:{query:'',documentType:'all',workflowState:'all',
    archiveMode:'active',sortBy:'updatedAt',sortDirection:'desc'}}};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:true});
 assert.match(html,/Search documents/);
 assert.match(html,/Next page/);
 assert.match(html,/Previous page/);
 assert.match(html,/Page 2/);
 assert.match(html,/server search and filters cover all authorized documents/);
 assert.match(html,/Q-0001/);
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:false});
 assert.doesNotMatch(denied,/Q-0001|Search documents|Next page/);
 const legacy=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:{...view,listPage:null},canManage:true});
 assert.doesNotMatch(legacy,/Next page|Search documents/);
 assert.match(legacy,/current signed, authorized response/);
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


test('All Documents distinguishes an authorized empty result from pending, failed, and loading reads',()=>{
 const renderState=(view,canReview=true)=>renderTradeLinkDocumentRepository({
  detail,workspaceId:workspace,canManage:!canReview,canReview,view
 });
 const base=initialTradeLinkDraftView();
 const pending=renderState(base);
 assert.match(pending,/The signed document list has not been loaded/);
 const loading=renderState({...base,busy:true});
 assert.match(loading,/Loading the signed TradeLink document list/);
 const failed=renderState({...base,status:'READ_FAILED',error:'Signed list unavailable'});
 assert.match(failed,/Signed list unavailable/);
 assert.match(failed,/could not be loaded\. Refresh to retry/);
 const empty=renderState({...base,status:'AUTHORIZED_READ',rows:[]});
 assert.match(empty,/No documents are currently assigned to this signed account/);
 assert.match(empty,/0 of 0 assigned documents/);
 const managerEmpty=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  canManage:true,view:{...base,status:'AUTHORIZED_READ',rows:[]}});
 assert.match(managerEmpty,/No documents were returned for this authorized repository page/);
});
