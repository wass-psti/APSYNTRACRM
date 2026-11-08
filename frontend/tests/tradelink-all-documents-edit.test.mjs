import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkApplication} from '../tradelink-application.js';
import {initialTradeLinkDraftView,renderTradeLinkDocumentRepository,
 renderTradeLinkDraftWorkspace,tradeLinkDraftEditHref} from '../tradelink-draft-workspace.js';
import {TradeLinkDomainClient} from '../tradelink-domain-client.js';
import {ApiError} from '../session.js';

const workspace='00000000-0000-4000-8000-000000000001';
const actor='11111111-1111-4111-8111-111111111111';
const id='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const archivedId='9be2aeba-a2cd-4f51-8ca1-8088515f591f';
const item='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const archivedItem='770d7cc7-e124-4dd3-bf6d-a8b3779a7f12';
const detail={
 board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',status:'active',
  description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],columns:[],
 items:[{id:item,title:'Q-QA-20261108-01',status:'not_started',
  updated_at:'2026-11-08T02:22:55Z'}]
};
const saved={
 id,workspace_id:workspace,board_id:TRADELINK_BOARD_ID,board_item_id:item,
 document_type:'quotation',document_number:'Q-QA-20261108-01',
 workflow_state:'draft',revision:1,archived_at:null,updated_at:'2026-11-08T02:22:55Z',
 content:{documentType:'quotation',documentNumber:'Q-QA-20261108-01',
  customerName:'Example client',currency:'PHP',vatType:'12',
  validity:'30 days',paymentTerms:'Net 30',deliveryCommitment:'Two weeks',
  approvedBy:'Example approver',items:[{id:'item-a',kind:'item',description:'Pump',
   quantity:2,unitPrice:100,unit:'piece'}]}
};
const listed={documentId:id,boardItemId:item,documentNumber:saved.document_number,
 documentType:'quotation',workflowState:'draft',revision:1,archived:false};
const archived={...listed,documentId:archivedId,boardItemId:archivedItem,
 documentNumber:'Q-OLD',revision:3,archived:true};
const authorizedView={
 ...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[listed,archived]
};
const editPath=tradeLinkDraftEditHref(id);

test('All Documents exposes signed edit, archive and restore for the matching Draft',()=>{
 assert.equal(editPath,'#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/edit/'+id);
 assert.equal(tradeLinkDraftEditHref('"><script>alert(1)</script>'),'');
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:authorizedView,canManage:true});
 assert.match(html,/Authorized TradeLink documents/);
 assert.match(html,/Edit Draft/);
 assert.match(html,/Preview saved/);
 assert.match(html,/data-action="tradelink-draft-archive"/);
 assert.match(html,/data-action="tradelink-draft-restore"/);
 assert.equal((html.match(/data-tradelink-document-edit/g)||[]).length,1);
 assert.ok(html.includes(editPath));
 assert.doesNotMatch(html,/drafts\/edit\/9be2aeba/);
});

test('verified preview offers Edit this Draft, but not when its revision is stale',()=>{
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:{...authorizedView,documentPreview:{documentId:id,record:saved}},canManage:true});
 assert.match(html,/data-tradelink-saved-preview/);
 assert.match(html,/Edit this Draft/);
 assert.match(html,/Q-QA-20261108-01/);
 assert.match(html,/Pump/);
 assert.equal((html.match(/data-tradelink-document-edit/g)||[]).length,2);
 const stale=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:{...authorizedView,documentPreview:{documentId:id,record:{...saved,revision:2}}},canManage:true});
 assert.doesNotMatch(stale,/data-tradelink-saved-preview/);
 assert.doesNotMatch(stale,/Edit this Draft/);
});

test('Board projection edits precisely the matching server-linked Draft, not arbitrary items',()=>{
 const html=renderTradeLinkApplication({detail,workspaceId:workspace,
  section:'documents',draftView:authorizedView,canManage:true});
 assert.match(html,/data-tradelink-board-edit/);
 assert.match(html,/data-tradelink-document-edit/);
 assert.match(html,/Open document/);
 assert.ok(html.includes(editPath));
 const unrelated={...detail,items:[{...detail.items[0],id:archivedItem}]};
 const missing=renderTradeLinkApplication({detail:unrelated,workspaceId:workspace,
  section:'documents',draftView:authorizedView,canManage:true});
 assert.doesNotMatch(missing,/data-tradelink-board-edit/);
});

test('denied manager, foreign workspace, and non-Draft statuses offer no Edit',()=>{
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:authorizedView,canManage:false});
 assert.doesNotMatch(denied,/data-tradelink-document-edit|tradelink-draft-archive/);
 const foreign=renderTradeLinkDocumentRepository({detail,
  workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  view:authorizedView,canManage:true});
 assert.doesNotMatch(foreign,/data-tradelink-document-edit/);
 assert.match(foreign,/workspace unavailable/);
 const final=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:{...authorizedView,rows:[{...listed,workflowState:'approved'}]},canManage:true});
 assert.doesNotMatch(final,/data-tradelink-document-edit|tradelink-draft-archive/);
});

test('direct edit reload cannot expose an unrelated blank Draft form',()=>{
 const view={...initialTradeLinkDraftView(),editRequestId:id,busy:true};
 const loading=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
 assert.match(loading,/Verifying the signed document and its latest revision/);
 assert.match(loading,/Back to All Documents/);
 assert.doesNotMatch(loading,/data-tradelink-draft-form/);
 const rejected=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
  view:{...view,busy:false,error:'Draft revision changed'},canManage:true});
 assert.match(rejected,/Draft revision changed/);
 assert.doesNotMatch(rejected,/data-tradelink-draft-form/);
 const loaded=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
  view:{...authorizedView,editRequestId:id,mode:'edit',
   selected:{documentId:id,record:saved}},canManage:true});
 assert.match(loaded,/data-tradelink-draft-form/);
 assert.match(loaded,/Save revision/);
 assert.match(loaded,/Back to All Documents/);
 assert.match(loaded,/Q-QA-20261108-01/);
 assert.match(loaded,/value="item-a"/);
});

test('signed deep-link loading uses real revision and Board checks and no local fallback',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/parts\[4\]==='edit'&&validUuid\(parts\[5\]\)/);
 assert.match(source,/state\.tradeLinkDraft\.editRequestId=draftEditId/);
 assert.match(source,/await openTradeLinkDraft\(target\)/);
 assert.match(source,/record\.revision!==listed\.revision/);
 assert.match(source,/listed\.archived\|\|listed\.workflowState!=='draft'/);
 assert.match(source,/no longer an editable Draft/);
 assert.match(source,/record\.board_item_id!==listed\.boardItemId/);
 assert.match(source,/tradeLinkDraftWorkspace\.changeState/);
 assert.match(source,/state\.board=board/);
 assert.match(source,/tradeLinkDraftWorkspace\.read\(documentId\)/);
 assert.match(source,/tradeLinkDraftWorkspace\.list\(\)/);
 assert.doesNotMatch(source,/localStorage\.setItem\('tradelink/);
});

test('stale save is rejected by the signed RPC, denied user never calls read RPC',async()=>{
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 let calls=0;
 const api={context:async()=>({user_id:actor,workspace_id:workspace,
  profile:{status:'active'}}),board:async()=>detail,allowed:async()=>true,
  rpc:async(name)=>{
   calls++;
   if(name==='tl03_document_read')return {...saved,revision:2};
   throw new ApiError('Revision conflict',409,'40001');
  }};
 const client=new TradeLinkDomainClient({api,auth});
 assert.equal((await client.read(id)).revision,2);
 await assert.rejects(()=>client.commit({
  documentId:id,expectedRevision:1,operation:'update',draft:saved.content
 }),err=>err instanceof ApiError&&err.status===409);
 assert.equal(calls,2);
 const denied=new TradeLinkDomainClient({api:{...api,
  allowed:async()=>false,rpc:async()=>{throw Error('must not call');}},auth});
 await assert.rejects(()=>denied.read(id),/manager scope required/);
});
