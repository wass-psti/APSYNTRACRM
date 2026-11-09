import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTradeLinkDraftForm} from '../tradelink-draft-workspace.js';
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
 const success=source.indexOf("toast('Saved Draft. Document and Board item verified.')");
 assert.ok(receipt>0&&guard>receipt&&success>guard);
 assert.match(source,/tradeLinkDraftSaveFailureMessage\(err,\{committed\}\)/);
 assert.doesNotMatch(source,/JSON\.stringify\(record\.content\)===JSON\.stringify\(draft\)/);
});
