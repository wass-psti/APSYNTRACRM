import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTradeLinkDraftForm,TradeLinkDraftWorkspace} from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {tradeLinkSavedDraftMatches} from '../tradelink-domain-client.js';

const fields=data=>({
 get:key=>data[key]??null,
 getAll:key=>data[key]==null?[]:[data[key]]
});
const moduleInputs={
 esi:{customerName:'Invoice client',customerTin:'TIN-001',verifiedBy:'msenagan@watchdogautomation.com.ph',approvedBy:'asenagan@watchdogautomation.com.ph',
  currency:'USD',exchangeRate:'58',lineDescription:'Goods',lineQuantity:'2',lineUnitPrice:'150'},
 quotation:{customerName:'Prospective client',customerEmail:'client@example.com',
  validity:'30 days',deliveryCommitment:'Within 14 days',paymentTerms:'Net 30',
  approvedBy:'asenagan@watchdogautomation.com.ph',lineDescription:'Service',lineQuantity:'2',lineUnitPrice:'150'},
 packing:{customerName:'Consignee',referenceNumber:'SO-7',
  verifiedBy:'msenagan@watchdogautomation.com.ph',approvedBy:'asenagan@watchdogautomation.com.ph',
  lineDescription:'Packed item',lineQuantity:'2',lineUnit:'box'},
 delivery:{customerName:'Recipient',referenceNumber:'SO-7',
  lineDescription:'Delivered item',lineQuantity:'1',lineUnit:'pc',
  lineSerialNumber:'A-00012',checkedBy:'dsenagan@watchdogautomation.com.ph',deliveredBy:'rogang@watchdogautomation.com.ph'},
 payment:{customerName:'Payor',paymentParticulars:'Received on account',
  cashAmount:'25',chequeAmount:'400',bankName:'Bank',chequeNumber:'CHEQUE-01',
  receivedBy:'msenagan@watchdogautomation.com.ph',verifiedBy:'asenagan@watchdogautomation.com.ph'},
 po:{customerName:'Supplier',targetDeliveryDate:'2026-12-01',paymentTerms:'Net 30',
  verifiedBy:'aacsenagan@watchdogautomation.com.ph',approvedBy:'asenagan@watchdogautomation.com.ph',
  lineDescription:'Materials',lineQuantity:'2',lineUnitPrice:'150'}
};
const sortedJson=value=>Array.isArray(value)?value.map(sortedJson):
 value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>
  [key,sortedJson(value[key])])):value;
const row=(content)=>({document_type:content.documentType,
 document_number:content.documentNumber,content});

test('every signed document module verifies entire persisted envelope, not just revision and number',()=>{
 for(const [type,input] of Object.entries(moduleInputs)){
  const submitted=parseTradeLinkDraftForm(fields({documentType:type,
   documentNumber:type.toUpperCase()+'-001',remarks:'Initial field values',...input}),
  {lineId:()=>type+'-line'});
  // PostgreSQL jsonb canonicalizes object keys; represent that reordering.
  const persisted=sortedJson(submitted);
  assert.equal(tradeLinkSavedDraftMatches(row(persisted),submitted),true,type);
  // Different persisted content with the *same* document identity and metadata
  // must not be acknowledged as a successful save.
  assert.equal(tradeLinkSavedDraftMatches(row({...persisted,remarks:'Old remarks'}),submitted),
   false,type);
  assert.equal(tradeLinkSavedDraftMatches(row({...persisted,unapprovedField:'unexpected'}),submitted),
   false,type);
  const missing={...persisted};delete missing.customerName;
  assert.equal(tradeLinkSavedDraftMatches(row(missing),submitted),false,type);
  const forged={...row(persisted),document_type:'quotation'===type?'esi':'quotation'};
  assert.equal(tradeLinkSavedDraftMatches(forged,submitted),false,type);
  if(submitted.items?.length){
   const changed={...persisted,items:persisted.items.map((item,i)=>i===0?
    {...item,quantity:item.quantity+1}:item)};
   assert.equal(tradeLinkSavedDraftMatches(row(changed),submitted),false,type);
   assert.equal(tradeLinkSavedDraftMatches(row({...persisted,
    items:[...persisted.items,{...persisted.items[0],id:'unexpected-line'}]}),submitted),false,type);
  }
  if(type==='payment'){
   assert.equal(tradeLinkSavedDraftMatches(row({...persisted,chequeAmount:401}),submitted),false);
   assert.equal(tradeLinkSavedDraftMatches(row({...persisted,bankName:'Other bank'}),submitted),false);
  }
  if(type==='delivery')
   assert.equal(tradeLinkSavedDraftMatches(row({...persisted,items:[
    {...persisted.items[0],serialNumber:'A-00013'}]}),submitted),false);
 }
});
test('array order is exact, object order is not, and malformed responses fail closed',()=>{
 const payload={documentType:'quotation',documentNumber:'Q-100',
  items:[{id:'line-a',kind:'item',description:'A',quantity:2,unitPrice:10},
   {id:'line-b',kind:'item',description:'B',quantity:3,unitPrice:20}]};
 assert.equal(tradeLinkSavedDraftMatches(row(sortedJson(payload)),payload),true);
 assert.equal(tradeLinkSavedDraftMatches(row({...payload,items:[...payload.items].reverse()}),payload),false);
 for(const bad of [null,undefined,{content:null},{content:[]},{content:{}},
  {content:payload,document_number:'OTHER',document_type:'quotation'},
  {content:payload,document_number:'Q-100',document_type:'other'}])
  assert.equal(tradeLinkSavedDraftMatches(bad,payload),false);
});
test('signed post-commit success requires persisted content parity before showing success toast',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const guard=source.indexOf('!tradeLinkSavedDraftMatches(record,draft)');
 const receipt=source.indexOf('const receipt=await tradeLinkDraftWorkspace.save(');
 const success=source.indexOf("toast('Document saved. Board item and All Documents verified.')");
 assert.ok(receipt>0&&guard>receipt&&success>guard);
 assert.match(source,/tradeLinkDraftSaveFailureMessage\(err,\{committed\}\)/);
 assert.doesNotMatch(source,/JSON\.stringify\(record\.content\)===JSON\.stringify\(draft\)/);
});


test('six modules use the genuine signed manager save RPC and return revision-one receipts',async()=>{
 const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const workspace='00000000-0000-4000-8000-000000000001';
 const boardItems=Object.fromEntries(Object.keys(moduleInputs).map((type,index)=>[
  type,('bbbbbbbb-bbbb-4bbb-8bbb-'+String(index+1).padStart(12,'0'))
 ]));
 const writes=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  board:async boardId=>({board:{id:boardId,workspace_id:workspace,name:'TradeLink',
   status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'}}),
  allowed:async(boardId,permission)=>boardId===TRADELINK_BOARD_ID&&permission==='manage',
  rpc:async(name,args)=>{
   writes.push({name,args});
   assert.equal(name,'tl03_document_save');
   return {documentId:args.p_document_id,boardItemId:boardItems[args.p_data.documentType],
    revision:1,state:args.p_initial_state,operation:args.p_operation,idempotent:false};
  }
 };
 const service=new TradeLinkDraftWorkspace({auth,api});
 for(const [type,input] of Object.entries(moduleInputs)){
  const draft=parseTradeLinkDraftForm(fields({documentType:type,
   documentNumber:'CP-TL-10A-'+type.toUpperCase(),...input}),
   {lineId:()=>type+'-line',purpose:'save'});
  const documentId='cccccccc-cccc-4ccc-8ccc-'+
   String(Object.keys(moduleInputs).indexOf(type)+1).padStart(12,'0');
  const receipt=await service.save({documentId,expectedRevision:0,draft});
  assert.deepEqual(receipt,{documentId,boardItemId:boardItems[type],
   revision:1,state:'for-approval',operation:'create',idempotent:false},type);
  const write=writes.at(-1);
  assert.equal(write.name,'tl03_document_save',type);
  assert.equal(write.args.p_board_id,TRADELINK_BOARD_ID,type);
  assert.equal(write.args.p_document_id,documentId,type);
  assert.equal(write.args.p_expected_revision,0,type);
  assert.equal(write.args.p_operation,'create',type);
  assert.equal(write.args.p_initial_state,'for-approval',type);
  const expected=type==='quotation'?{
   ...draft,verifiedBy:'Sales Supervisor',
   verifiedByEmail:'aacsenagan@watchdogautomation.com.ph',
   approvedBy:'Management',
   approvedByEmail:draft.approvedByEmail||'asenagan@watchdogautomation.com.ph'
  }:draft;
  assert.deepEqual(write.args.p_data,expected,type);
 }
 assert.equal(writes.length,6);
 assert.deepEqual(writes.map(({args})=>args.p_data.documentType),
  ['esi','quotation','packing','delivery','payment','po']);
});

test('signed manager denial prevents every six-module save RPC before any production write',async()=>{
 const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const workspace='00000000-0000-4000-8000-000000000001';
 let writes=0;
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  board:async boardId=>({board:{id:boardId,workspace_id:workspace,name:'TradeLink',
   status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'}}),
  allowed:async()=>false,
  rpc:async()=>{writes++;throw Error('A denied manager must never reach the write RPC');}
 };
 const service=new TradeLinkDraftWorkspace({auth,api});
 for(const [type,input] of Object.entries(moduleInputs)){
  const draft=parseTradeLinkDraftForm(fields({documentType:type,
   documentNumber:'CP-TL-10A-DENIED-'+type.toUpperCase(),...input}),
   {lineId:()=>type+'-line',purpose:'save'});
  await assert.rejects(()=>service.save({
   documentId:'dddddddd-dddd-4ddd-8ddd-'+
    String(Object.keys(moduleInputs).indexOf(type)+1).padStart(12,'0'),
   expectedRevision:0,draft
  }),/board manager scope required/,type);
 }
 assert.equal(writes,0);
});
