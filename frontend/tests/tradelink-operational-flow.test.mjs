import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {ApiError} from '../session.js';
import {TradeLinkDomainClient,TL03_DOMAIN_READS_ENABLED,
 TL03_DOMAIN_WRITES_ENABLED} from '../tradelink-domain-client.js';
import {renderTradeLinkApplication} from '../tradelink-application.js';
import {prepareTradeLinkDraftCommand,parseTradeLinkDraftForm,
 initialTradeLinkDraftView,renderTradeLinkDraftWorkspace,
 tradeLinkDraftSaveFailureMessage,
 calculateTradeLinkDraftLocalAmounts,tradeLinkDraftLocalSummaryValues,
 renderTradeLinkSavedDocumentPreview} from '../tradelink-draft-workspace.js';

const ws='00000000-0000-4000-8000-000000000001';
const foreign='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor='11111111-1111-4111-8111-111111111111';
const docId='22222222-2222-4222-8222-222222222222';
const itemId='33333333-3333-4333-8333-333333333333';
const board={id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'};
const detail={board,groups:[],items:[{id:itemId,title:'Q-2026-01',
 status:'Draft',updated_at:'2026-11-08T02:00:00Z'}],columns:[]};
const draft={
 documentType:'quotation',documentNumber:'Q-2026-01',
 customerName:'Prospect',customerEmail:'prospect@example.test',
 validity:'30 days',deliveryCommitment:'Four weeks',
 paymentTerms:'Net 30',approvedBy:'Review manager',
 currency:'PHP',vatType:'12',discountType:'percentage',discountValue:0,
 items:[
  {id:'line-1',kind:'item',description:'Pump',quantity:1,unitPrice:50,unit:'piece'},
  {id:'line-2',kind:'item',description:'Hose',quantity:2,unitPrice:60,unit:'piece'}
 ]
};
const row={id:docId,board_id:TRADELINK_BOARD_ID,workspace_id:ws,
 board_item_id:itemId,document_type:'quotation',document_number:'Q-2026-01',
 workflow_state:'draft',revision:2,content:draft};
const listed={documentId:docId,boardItemId:itemId,documentType:'quotation',
 documentNumber:'Q-2026-01',workflowState:'draft',revision:2,archived:false};
function entries(extra={}){
 const raw={documentType:'quotation',documentNumber:'Q-2026-01',
 customerName:'Prospect',customerEmail:'prospect@example.test',
 validity:'30 days',deliveryCommitment:'Four weeks',
 paymentTerms:'Net 30',approvedBy:'Review manager',
 currency:'PHP',vatType:'12',discountType:'percentage',discountValue:'0',
 lineDescription:['Pump','Hose'],lineQuantity:['1','2'],
 lineUnitPrice:['50','60'],lineUnit:['piece','piece'],lineId:['',''],
 ...extra};
 return {get(name){const v=raw[name];return Array.isArray(v)?v[0]:v??null;},
  getAll(name){const v=raw[name];return Array.isArray(v)?v:v==null?[]:[v];}};
}

test('create payload is fixed across uncertain retries with two stable line IDs',()=>{
 const input=entries();
 const first=prepareTradeLinkDraftCommand(initialTradeLinkDraftView('quotation'),input,{
  documentId:()=>docId,lineId:i=>'line-'+i
 });
 assert.equal(first.documentId,docId);
 assert.equal(first.expectedRevision,0);
 assert.deepEqual(first.draft.items.map(x=>x.id),['line-0','line-1']);
 assert.equal(first.draft.items.length,2);
 const pending={...initialTradeLinkDraftView(),pendingCreateId:docId,
  pendingCreateDraft:first.draft};
 const second=prepareTradeLinkDraftCommand(pending,input,{
  documentId:()=>{throw Error('Wrong: issued another document ID');},
  lineId:()=>{throw Error('Wrong: issued another item ID');}
 });
 assert.equal(second.documentId,docId);
 assert.deepEqual(second.draft,first.draft);
 assert.equal(second.pendingCreateDraft,first.draft);
 const changed=entries({lineQuantity:['1','3']});
 assert.throws(()=>prepareTradeLinkDraftCommand(pending,changed),e=>
  e instanceof ApiError&&e.status===409&&/Refresh All Documents/.test(e.message));
});

test('bounded multi-item form rejects missing/negative quantities and excessive rows',()=>{
 assert.equal(parseTradeLinkDraftForm(entries(),{lineId:i=>'id-'+i}).items.length,2);
 for(const changed of [
  {lineQuantity:['1','']},
  {lineQuantity:['1','-2']},
  {lineUnitPrice:['50','0']},
  {lineDescription:['Pump','']},
  {lineDescription:Array.from({length:101},()=> 'Too many')}
 ])assert.throws(()=>parseTradeLinkDraftForm(entries(changed),{
  lineId:i=>'line-'+i
 }),/Invalid|Line item|line-item|priced/i);
});

test('edit uses persisted revision and all saved item IDs without a create request',()=>{
 const view={...initialTradeLinkDraftView(),mode:'edit',
  selected:{documentId:docId,record:row}};
 const command=prepareTradeLinkDraftCommand(view,entries({
  lineId:['line-1','line-2']
 }),{documentId:()=>{throw Error('Unexpected create');}});
 assert.equal(command.documentId,docId);
 assert.equal(command.expectedRevision,2);
 assert.equal(command.pendingCreateDraft,null);
 assert.deepEqual(command.draft.items.map(item=>item.id),['line-1','line-2']);
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:ws,view,canManage:true});
 assert.equal((html.match(/data-tradelink-line-item/g)||[]).length,2);
 assert.match(html,/value="line-1"/);
 assert.match(html,/value="line-2"/);
 assert.match(html,/Add item/);
 assert.match(html,/Remove item/);
 assert.match(html,/name="lineUnitPrice"/);
 assert.match(html,/data-action="tradelink-draft-submit"/);
});

test('financial estimate uses all persisted items including PHP conversion',()=>{
 const f=entries({exchangeRate:'60',currency:'USD'});
 const calculated=calculateTradeLinkDraftLocalAmounts(f);
 assert.equal(calculated.subtotal,170);
 assert.equal(calculated.total,190.4);
 assert.equal(calculated.phpEquivalent,11424);
 const summary=tradeLinkDraftLocalSummaryValues({...draft,currency:'PHP'});
 assert.equal(summary.localSubtotal,'170.00 PHP');
 assert.equal(summary.localTotal,'190.40 PHP');
 const html=renderTradeLinkSavedDocumentPreview(row,ws,docId);
 assert.match(html,/170\.00 PHP/);
 assert.match(html,/190\.40 PHP/);
 assert.match(html,/Pump/);
 assert.match(html,/Hose/);
});

test('signed list/read uses authoritative RPC and can be reloaded in a new session client',async()=>{
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
 const calls=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async(id)=>{assert.equal(id,TRADELINK_BOARD_ID);return detail;},
  allowed:async(id,required)=>{assert.equal(id,TRADELINK_BOARD_ID);
   assert.equal(required,'manage');return true;},
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='tl03_documents_list')return [listed];
   if(name==='tl03_document_read')return {...row};
   throw Error('Unauthorized test call '+name);
  }
 };
 for(let cycle=0;cycle<2;cycle++){
  const client=new TradeLinkDomainClient({auth,api});
  assert.deepEqual(await client.list(),[listed]);
  assert.deepEqual(await client.read(docId),row);
 }
 assert.deepEqual(calls.map(x=>x.name),[
  'tl03_documents_list','tl03_document_read',
  'tl03_documents_list','tl03_document_read'
 ]);
 assert.ok(calls.every(x=>x.args.p_board_id===TRADELINK_BOARD_ID));
 const html=renderTradeLinkApplication({detail,workspaceId:ws,section:'documents',
  draftView:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
   rows:[listed],documentPreview:{documentId:docId,record:row}},canManage:true});
 assert.match(html,/All Documents/);
 assert.match(html,/Preview\/Edit/);
 assert.match(html,/data-tradelink-saved-preview/);
 assert.match(html,/Q-2026-01/);
});

test('unauthorized actor, wrong workspace and invalid response cannot reveal saved data',async()=>{
 let rpcCount=0;
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>detail,
  allowed:async()=>false,
  rpc:async()=>{rpcCount++;return [listed];}
 };
 const client=new TradeLinkDomainClient({auth,api});
 await assert.rejects(()=>client.list(),/manager scope required/);
 await assert.rejects(()=>client.read(docId),/manager scope required/);
 assert.equal(rpcCount,0);
 const wrong=new TradeLinkDomainClient({auth,api:{...api,
  allowed:async()=>true,rpc:async()=>{rpcCount++;return {...row,workspace_id:foreign};}}});
 await assert.rejects(()=>wrong.read(docId),/Invalid authorized TradeLink document response/);
 const wrongBoard=new TradeLinkDomainClient({auth,api:{...api,
  context:async()=>({user_id:actor,workspace_id:foreign,profile:{status:'active'}}),
  allowed:async()=>true}});
 await assert.rejects(()=>wrongBoard.list(),/manager scope required/);
 const signed={...auth,userId:foreign};
 await assert.rejects(()=>new TradeLinkDomainClient({auth:signed,api}).list(),
  /identity or workspace changed/);
 assert.equal(rpcCount,1);
});

test('app wiring keeps server receipt -> exact Board item -> All Documents and logs no fake writes',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/prepareTradeLinkDraftCommand\(state\.tradeLinkDraft,fields\)/);
 assert.match(source,/const receipt=await tradeLinkDraftWorkspace\.save/);
 assert.match(source,/tradeLinkDraftWorkspace\.read\(documentId\)/);
 assert.match(source,/tradeLinkDraftWorkspace\.list\(\)/);
 assert.match(source,/item\.id===receipt\.boardItemId/);
 assert.match(source,/location\.hash='#\/boards\/'\+TRADELINK_BOARD_ID\+'\/tradelink\/documents'/);
 assert.match(source,/case 'tradelink-draft-add-line'/);
 assert.match(source,/case 'tradelink-draft-remove-line'/);
 assert.doesNotMatch(source,/localStorage\.setItem\('tradelink|service_role.*tradelink/i);
});


test('save failures classify permission, conflict, timeout and confirmed-commit states',()=>{
 assert.match(tradeLinkDraftSaveFailureMessage(new ApiError('private role detail',403,'42501')),/not authorized/i);
 assert.match(tradeLinkDraftSaveFailureMessage(new ApiError('internal error',409,'40001')),/conflict/i);
 assert.match(tradeLinkDraftSaveFailureMessage(new ApiError('network',0,'REQUEST_TIMEOUT')),/Retry unchanged inputs/i);
 const confirmed=tradeLinkDraftSaveFailureMessage(new Error('runtime'),{committed:true});
 assert.match(confirmed,/Document saved/);
 for(const msg of [
  tradeLinkDraftSaveFailureMessage(new ApiError('private document content',403)),
  tradeLinkDraftSaveFailureMessage(new ApiError('private document content',409)),
  tradeLinkDraftSaveFailureMessage(new Error('private document content'))
 ])assert.doesNotMatch(msg,/private document content/);
});
test('saved multi-item content and UI save feedback remain escaped',()=>{
 const malicious={...row,content:{...draft,items:[...draft.items,{
  id:'line-3',kind:'item',description:'"><img src=x onerror=alert(1)>',
  quantity:1,unitPrice:1}]}};
 const html=renderTradeLinkSavedDocumentPreview(malicious,ws,docId);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img src=x onerror=alert/);
 const editor=renderTradeLinkDraftWorkspace({detail,workspaceId:ws,
  view:{...initialTradeLinkDraftView(),mode:'edit',
   selected:{documentId:docId,record:malicious},
   error:'<script>alert(1)</script>',
   message:'Saving Draft to database'},canManage:true});
 assert.doesNotMatch(editor,/<script>alert/);
 assert.match(editor,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(editor,/Saving Draft to database/);
 assert.equal((editor.match(/data-tradelink-line-item/g)||[]).length,3);
});

test('Stage B signed create/retry/update invoke only guarded RPC with authoritative receipts',async()=>{
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
 const calls=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>detail,
  allowed:async()=>true,
  rpc:async(name,args)=>{
   calls.push({name,args});
   assert.equal(name,'tl03_document_commit');
   assert.equal(args.p_board_id,TRADELINK_BOARD_ID);
   assert.equal(args.p_document_id,docId);
   return {documentId:docId,boardItemId:itemId,revision:args.p_expected_revision+1,
    state:'draft',operation:args.p_operation,idempotent:false};
  }
 };
 const client=new TradeLinkDomainClient({api,auth});
 const create=await client.commit({documentId:docId,expectedRevision:0,operation:'create',draft});
 assert.equal(create.revision,1);
 const updated=await client.commit({documentId:docId,expectedRevision:1,operation:'update',draft});
 assert.equal(updated.revision,2);
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(c=>c.args.p_expected_revision),[0,1]);
 assert.deepEqual(calls.map(c=>c.args.p_operation),['create','update']);
 assert.deepEqual(calls[0].args.p_data,draft);
 let deniedCalls=0;
 const noAccess=new TradeLinkDomainClient({auth,api:{...api,
  allowed:async()=>false,rpc:async()=>{deniedCalls++;throw Error('Write must be denied');}}});
 await assert.rejects(()=>noAccess.commit({
  documentId:docId,expectedRevision:0,operation:'create',draft
 }),/manager scope required/);
 assert.equal(deniedCalls,0);
});
