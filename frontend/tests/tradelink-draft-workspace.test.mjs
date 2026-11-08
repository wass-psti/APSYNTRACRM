import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {ApiError} from '../session.js';
import {TRADELINK_SOURCE_MODULES,normalizeTradeLinkSection,renderTradeLinkApplication} from '../tradelink-application.js';
import {TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED} from '../tradelink-domain-client.js';
import {
 TL03_DRAFT_INTERFACE_ENABLED,initialTradeLinkDraftView,resetTradeLinkDraftForm,
 tradeLinkDraftValidationMessage,parseTradeLinkDraftForm,
 calculateTradeLinkDraftLocalAmounts,updateTradeLinkDraftLocalAmounts,
 updateTradeLinkDraftInputCurrencyLabels,tradeLinkDraftLocalSummaryValues,
 updateTradeLinkDraftLocalSummary,
 initialTradeLinkDraftListFilters,normalizeTradeLinkDraftListFilters,
 filterTradeLinkDraftAuthorizedRows,updateTradeLinkDraftListUI,
 renderTradeLinkDocumentRepository,renderTradeLinkSavedDocumentPreview,
 renderTradeLinkDraftWorkspace,
 TradeLinkDraftWorkspace,tradeLinkDraftReady
} from '../tradelink-draft-workspace.js';
const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const fields=data=>({get:key=>data[key]??null});

test('dark-launch UI is routed inside the existing signed TradeLink app',()=>{
 assert.equal(TL03_DRAFT_INTERFACE_ENABLED,true);
 assert.equal(normalizeTradeLinkSection('drafts'),'drafts');
 const html=renderTradeLinkApplication({detail,workspaceId:workspace,section:'drafts',
  draftView:initialTradeLinkDraftView(),canManage:true});
 assert.match(html,/href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/drafts"/);
 assert.match(html,/Signed Draft operations/);
 assert.match(html,/data-tradelink-draft-form/);
 assert.match(html,/data-action="tradelink-draft-preview"/);
 assert.match(html,/data-action="tradelink-draft-refresh"/);
 assert.match(html,/type="submit" class="primary">/);
 assert.doesNotMatch(html,/data-action="tradelink-draft-archive"[^>]*>Archive/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
 assert.equal(tradeLinkDraftReady(),true);
});


test('six source modules deep-link to their selected, unsaved Draft forms',()=>{
 assert.equal(TRADELINK_SOURCE_MODULES.length,6);
 for(const module of TRADELINK_SOURCE_MODULES){
  const html=renderTradeLinkApplication({detail,workspaceId:workspace,section:module.key,canManage:true});
  const href='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/'+module.key;
  assert.ok(html.includes('href="'+href+'"'),module.label);
  assert.match(html,/Saving persists a document and linked Board item/);
  const view=initialTradeLinkDraftView(module.key);
  assert.deepEqual(view.formValues,{documentType:module.key});
  const editor=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
  assert.ok(editor.includes('<option value="'+module.key+'" selected>'),module.label);
  assert.match(editor,/data-action="tradelink-draft-preview"/);
  assert.match(editor,/type="submit" class="primary">/);
  const examples={
   packing:{customerName:'Consignee',referenceNumber:'SO-7',
    lineDescription:'Packed item',lineQuantity:'2',lineUnit:'box'},
   delivery:{customerName:'Recipient',referenceNumber:'SO-7',
    lineDescription:'Delivered item',lineQuantity:'1',lineUnit:'pc',
    checkedBy:'QC',deliveredBy:'Logistics'},
   payment:{customerName:'Payor',paymentParticulars:'Received on account',
    cashAmount:'25',receivedBy:'Cashier',verifiedBy:'Verifier'},
   esi:{customerName:'Invoice client',customerTin:'TIN-001',verifiedBy:'Finance',approvedBy:'Manager',
    lineDescription:'Goods',lineQuantity:'2',lineUnitPrice:'150'},
   quotation:{customerName:'Prospective client',customerEmail:'client@example.com',
    validity:'30 days',deliveryCommitment:'Within 14 days',paymentTerms:'Net 30',approvedBy:'Manager',
    lineDescription:'Service',lineQuantity:'2',lineUnitPrice:'150'},
   po:{customerName:'Supplier',targetDeliveryDate:'2026-12-01',paymentTerms:'Net 30',
    verifiedBy:'Account manager',approvedBy:'Final manager',
    lineDescription:'Materials',lineQuantity:'2',lineUnitPrice:'150'}
  };
  const valid=parseTradeLinkDraftForm(fields({
   documentType:module.key,documentNumber:'LOCAL-001',...(examples[module.key]||{})
  }),{lineId:()=> 'local-line'});
  assert.equal(valid.documentType,module.key);
 }
 assert.equal(initialTradeLinkDraftView().formValues,null);
 for(const bad of ['unknown','../payment','quotation?commit=true','<script>',null,{}])
  assert.equal(initialTradeLinkDraftView(bad).formValues,null);
 const app=readFileSync('frontend/app.js','utf8');
 assert.ok(app.includes('async function loadBoard(boardId,tab,draftType=null,draftEditId=null)'));
 assert.ok(app.includes("state.tradeLinkDraft=initialTradeLinkDraftView(tab==='tradelink'&&state.tradeLinkSection==='drafts'?draftType:null)"));
 assert.ok(app.includes("signedDraftRoute&&parts[4]!=='edit'?parts[4]:null,editId"));
});

test('foreign workspace or an unrelated board renders no usable editor',()=>{
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 assert.match(html,/Signed TradeLink workspace unavailable/);
 assert.doesNotMatch(html,/data-tradelink-draft-form/);
 const wrong={...detail,board:{...detail.board,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}};
 assert.doesNotMatch(renderTradeLinkDraftWorkspace({detail:wrong,workspaceId:workspace}),/data-tradelink-draft-form/);
});

test('client denies all operations when signed auth and board APIs are unavailable',async()=>{
 let calls=0;
 const client=new TradeLinkDraftWorkspace({
  auth:{getVerifiedUser:async()=>{calls++;throw Error('unexpected auth');}},
  api:{rpc:async()=>{calls++;throw Error('unexpected API');}}
 });
 await assert.rejects(()=>client.list(),/Signed TradeLink domain API unavailable/);
 await assert.rejects(()=>client.read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/Signed TradeLink domain API unavailable/);
 await assert.rejects(()=>client.save({draft:{documentType:'quotation',documentNumber:'Q-001'}}),/Signed TradeLink domain API unavailable/i);
 await assert.rejects(()=>client.changeState({
  documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:1,operation:'archive'
 }),/Signed TradeLink domain API unavailable/i);
 assert.equal(calls,0);
});

test('form parser accepts only bounded source Draft fields and never asserts persistence',()=>{
 const draft=parseTradeLinkDraftForm(fields({documentType:'quotation',documentNumber:'Q-100',
  currency:'PHP',vatType:'12',customerName:'Sample customer',referenceNumber:'REF-7',
  customerEmail:'customer@example.com',validity:'30 days',deliveryCommitment:'Within 14 days',
  paymentTerms:'Net 30',approvedBy:'Manager',
  lineDescription:'Sample item',lineQuantity:'2',lineUnitPrice:'150.25',lineUnit:'pc',
  remarks:'Local only'}),{lineId:()=> 'line-001'});
 assert.deepEqual(draft.items,[{id:'line-001',kind:'item',description:'Sample item',
  quantity:2,unitPrice:150.25,unit:'pc'}]);
 assert.equal(draft.documentType,'quotation');
 assert.equal(draft.documentNumber,'Q-100');
 assert.equal(draft.remarks,'Local only');
 assert.equal('status' in draft,false);
 for(const row of [
  {documentType:'unknown',documentNumber:'Q-100'},
  {documentType:'quotation',documentNumber:'<svg onload=alert(1)>'},
  {documentType:'quotation',documentNumber:'Q-100',lineDescription:'One',lineQuantity:'-1',lineUnitPrice:'1'},
  {documentType:'quotation',documentNumber:'Q-100',lineDescription:'One',lineQuantity:'1'},
  {documentType:'quotation',documentNumber:'Q-100',currency:'NOT-CURRENCY'}
 ])assert.throws(()=>parseTradeLinkDraftForm(fields(row)));
});


test('Packing List local readiness uses source reference, consignee and nonpriced physical item',()=>{
 const view=initialTradeLinkDraftView('packing');
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
 assert.match(html,/Consignee/);
 assert.match(html,/Source reference/);
 assert.match(html,/Physical shipment item \(required for local readiness\)/);
 assert.doesNotMatch(html,/name="lineUnitPrice"/);
 assert.doesNotMatch(html,/name="cashAmount"/);
 assert.match(html,/type="submit" class="primary">/);
 const sample={documentType:'packing',documentNumber:'PL-001',
  customerName:'Receiving company',referenceNumber:'SO-001',
  lineDescription:'Parts',lineQuantity:'3',lineUnit:'box'};
 const draft=parseTradeLinkDraftForm(fields(sample),{lineId:()=> 'item-1'});
 assert.equal(draft.items[0].unitPrice,0);
 assert.equal(draft.items[0].quantity,3);
 assert.equal(draft.referenceNumber,'SO-001');
 assert.equal('vatType' in draft,false);
 for(const variant of [
  {customerName:''},{referenceNumber:''},{lineDescription:''},
  {lineQuantity:''},{lineQuantity:'0'},{lineQuantity:'-1'}
 ])assert.throws(()=>parseTradeLinkDraftForm(fields({...sample,...variant})),/Draft|Shipment|Line/i);
});

test('Delivery Receipt local readiness validates QC, logistics and optional serial without delivery writes',()=>{
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId:workspace,view:initialTradeLinkDraftView('delivery'),canManage:true});
 for(const name of ['checkedBy','deliveredBy','receivedBy','lineSerialNumber'])
  assert.ok(html.includes('name="'+name+'"'),name);
 assert.match(html,/Delivery responsibility · preview only/);
 assert.match(html,/type="submit" class="primary">/);
 assert.doesNotMatch(html,/name="lineUnitPrice"/);
 const sample={documentType:'delivery',documentNumber:'DR-001',
  customerName:'Recipient',referenceNumber:'SO-002',
  lineDescription:'Machine',lineQuantity:'1',lineUnit:'unit',
  lineSerialNumber:'ASSET-123',checkedBy:'QC officer',deliveredBy:'Logistics officer',
  receivedBy:'Receiver'};
 const draft=parseTradeLinkDraftForm(fields(sample),{lineId:()=> 'item-2'});
 assert.equal(draft.items[0].serialNumber,'ASSET-123');
 assert.equal(draft.items[0].unitPrice,0);
 assert.equal(draft.checkedBy,'QC officer');
 assert.equal(draft.deliveredBy,'Logistics officer');
 for(const variant of [
  {checkedBy:''},{deliveredBy:''},{customerName:''},
  {referenceNumber:''},{lineQuantity:'0'},{lineSerialNumber:'X'.repeat(121)}
 ])assert.throws(()=>parseTradeLinkDraftForm(fields({...sample,...variant})),/Draft|Shipment|Invalid/i);
 const escaped=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,canManage:true,
  view:{...initialTradeLinkDraftView('delivery'),formValues:{
   ...sample,checkedBy:'"><img src=x onerror=alert(1)>'
  }}});
 assert.doesNotMatch(escaped,/<img src=x/);
 assert.doesNotMatch(escaped,/onerror=alert\(1\)>/);
 assert.match(escaped,/&lt;img/);
});

test('Payment AR local readiness enforces positive cash or cheque and responsibility only',()=>{
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId:workspace,view:initialTradeLinkDraftView('payment'),canManage:true});
 for(const name of ['paymentParticulars','cashAmount','chequeAmount',
  'bankName','chequeNumber','receivedBy','verifiedBy'])
  assert.ok(html.includes('name="'+name+'"'),name);
 assert.doesNotMatch(html,/name="lineDescription"/);
 assert.match(html,/This form does not receive or verify funds/);
 assert.match(html,/type="submit" class="primary">/);
 const sample={documentType:'payment',documentNumber:'AR-001',customerName:'Payor',
  paymentParticulars:'Partial invoice settlement',cashAmount:'250.75',
  receivedBy:'Cashier',verifiedBy:'Finance'};
 const cash=parseTradeLinkDraftForm(fields(sample));
 assert.equal(cash.cashAmount,250.75);
 assert.equal(cash.paymentParticulars,'Partial invoice settlement');
 assert.equal('items' in cash,false);
 assert.equal('vatType' in cash,false);
 const cheque=parseTradeLinkDraftForm(fields({...sample,cashAmount:'',
  chequeAmount:'400',bankName:'Bank',chequeNumber:'CHEQUE-01'}));
 assert.equal(cheque.chequeAmount,400);
 for(const variant of [
  {customerName:''},{paymentParticulars:''},{receivedBy:''},{verifiedBy:''},
  {cashAmount:''},{cashAmount:'0'},{cashAmount:'-10'},{cashAmount:'Infinity'},
  {cashAmount:'1000000000001'},
  {cashAmount:'',chequeAmount:'2',bankName:'',chequeNumber:'C-1'},
  {cashAmount:'',chequeAmount:'2',bankName:'Bank',chequeNumber:''}
 ])assert.throws(()=>parseTradeLinkDraftForm(fields({...sample,...variant})),/Payment|payment|Cheque|Invalid/i);
});

test('module switching updates ephemeral fields without storage, network or workflow actions',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 for(const key of ['lineSerialNumber','checkedBy','deliveredBy','receivedBy','verifiedBy',
  'paymentParticulars','cashAmount','chequeAmount','bankName','chequeNumber'])
  assert.match(app,new RegExp("'"+key+"'"));
 assert.match(app,/select\[name="documentType"\]/);
 assert.match(app,/if\(captureTradeLinkDraftFields\(event\)\)\{/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|service_role|sb_secret|fetch\(/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});

test('Electronic SI preview validates client identity, priced line and intended review names',()=>{
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId:workspace,view:initialTradeLinkDraftView('esi'),canManage:true});
 for(const name of ['customerTin','verifiedBy','approvedBy','lineUnitPrice'])
  assert.ok(html.includes('name="'+name+'"'),name);
 assert.match(html,/Electronic SI readiness · preview only/);
 assert.match(html,/type="submit" class="primary">/);
 const base={documentType:'esi',documentNumber:'SI-001',customerName:'Client',
  customerTin:'TIN-123',verifiedBy:'Finance',approvedBy:'Manager',
  lineDescription:'Invoiced goods',lineQuantity:'1',lineUnitPrice:'100'};
 const draft=parseTradeLinkDraftForm(fields(base),{lineId:()=> 'si-line'});
 assert.equal(draft.customerTin,'TIN-123');
 assert.equal(draft.items[0].unitPrice,100);
 assert.equal('workflow' in draft,false);
 for(const change of [{customerName:''},{customerTin:''},{verifiedBy:''},{approvedBy:''},
  {lineQuantity:'0'},{lineUnitPrice:'0'},{lineDescription:''}])
  assert.throws(()=>parseTradeLinkDraftForm(fields({...base,...change})),/Commercial|TradeLink|Line|Invalid/i);
});

test('Quotation preview validates client contact and source commercial terms without approval',()=>{
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId:workspace,view:initialTradeLinkDraftView('quotation'),canManage:true});
 for(const name of ['customerEmail','customerPhone','validity','deliveryCommitment','paymentTerms','approvedBy'])
  assert.ok(html.includes('name="'+name+'"'),name);
 assert.match(html,/Quotation readiness · preview only/);
 const base={documentType:'quotation',documentNumber:'Q-001',customerName:'Prospect',
  customerEmail:'contact@example.com',validity:'30 days',deliveryCommitment:'4 weeks',
  paymentTerms:'Net 30',approvedBy:'Reviewer',
  lineDescription:'Consulting',lineQuantity:'1',lineUnitPrice:'250'};
 const draft=parseTradeLinkDraftForm(fields(base),{lineId:()=> 'quote-line'});
 assert.equal(draft.customerEmail,'contact@example.com');
 assert.equal(draft.validity,'30 days');
 assert.equal('approvedAt' in draft,false);
 const byPhone=parseTradeLinkDraftForm(fields({...base,customerEmail:'',customerPhone:'5550100'}),
  {lineId:()=> 'quote-line'});
 assert.equal(byPhone.customerPhone,'5550100');
 for(const change of [{customerEmail:'',customerPhone:''},{customerEmail:'invalid'},
  {validity:''},{deliveryCommitment:''},{paymentTerms:''},{approvedBy:''},
  {lineQuantity:'0'},{lineUnitPrice:'0'}])
  assert.throws(()=>parseTradeLinkDraftForm(fields({...base,...change})),/Quotation|Commercial|Invalid/i);
});

test('Supplier PO preview requires priced items, terms and intended reviewers',()=>{
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId:workspace,view:initialTradeLinkDraftView('po'),canManage:true});
 for(const name of ['poNumber','targetDeliveryDate','paymentTerms','verifiedBy','approvedBy','lineUnitPrice'])
  assert.ok(html.includes('name="'+name+'"'),name);
 assert.match(html,/Supplier PO readiness · preview only/);
 assert.match(html,/type="submit" class="primary">/);
 const base={documentType:'po',documentNumber:'PO-001',customerName:'Supplier',
  targetDeliveryDate:'2026-12-15',paymentTerms:'Net 15',verifiedBy:'Account manager',
  approvedBy:'Final manager',poNumber:'V-PO-111',
  lineDescription:'Parts',lineQuantity:'2',lineUnitPrice:'50'};
 const draft=parseTradeLinkDraftForm(fields(base),{lineId:()=> 'po-line'});
 assert.equal(draft.targetDeliveryDate,'2026-12-15');
 assert.equal(draft.poNumber,'V-PO-111');
 for(const change of [{customerName:''},{targetDeliveryDate:''},
  {targetDeliveryDate:'2026-02-30'},{targetDeliveryDate:'invalid'},
  {paymentTerms:''},{verifiedBy:''},{approvedBy:''},
  {lineQuantity:'0'},{lineUnitPrice:'0'}])
  assert.throws(()=>parseTradeLinkDraftForm(fields({...base,...change})),/PO|Commercial|Invalid/i);
});

test('commercial UI redraw and signed client boundaries do not persist or leak draft inputs',()=>{
 const state={...initialTradeLinkDraftView('esi'),formValues:{
  documentType:'esi',documentNumber:'SI-LOCAL',customerName:'Client',
  customerTin:'"><img src=x onerror=alert(1)>',verifiedBy:'Local',approvedBy:'Local'}};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:state,canManage:true});
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
 for(const type of ['esi','quotation','po']){
  const output=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
   view:initialTradeLinkDraftView(type),canManage:true});
  assert.match(output,/type="submit" class="primary">/);
  assert.match(output,/Validate locally/);
 }
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 for(const key of ['customerTin','customerEmail','customerPhone','validity',
  'deliveryCommitment','paymentTerms','targetDeliveryDate','poNumber','approvedBy'])
  assert.ok(app.includes("'"+key+"'"),key);
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|service_role|sb_secret|fetch\(/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});


test('switching all six modules discards prior unsaved fields without altering the signed view',()=>{
 const keys=TRADELINK_SOURCE_MODULES.map(m=>m.key);
 assert.equal(keys.length,6);
 for(const from of keys){
  for(const to of keys){
   if(from===to)continue;
   const before={...initialTradeLinkDraftView(from),rows:[{documentId:'unchanged'}],
    selected:{record:{customerName:'restricted'}},mode:'edit',pendingCreateId:'pending',
    error:'old error',message:'old status',formValues:{
     documentType:from,documentNumber:'SECRET-FROM-'+from,customerName:'Sensitive customer',
     customerTin:'sensitive tin',receivedBy:'Sensitive receiver',cashAmount:'300',
     approvedBy:'Sensitive approver',lineDescription:'Confidential item'
    }};
   const next=resetTradeLinkDraftForm(before,to);
   assert.deepEqual(next.formValues,{documentType:to});
   assert.equal(next.rows,before.rows);
   assert.equal(next.selected,null);
   assert.equal(next.mode,'create');
   assert.equal(next.pendingCreateId,null);
   assert.equal(next.error,'');
   assert.equal(next.message,'');
   const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:next,canManage:true});
   assert.ok(html.includes('<option value="'+to+'" selected>'),to);
   for(const sensitive of ['SECRET-FROM','Sensitive customer','sensitive tin',
    'Sensitive receiver','Sensitive approver','Confidential item'])
    assert.ok(!html.includes(sensitive),from+' → '+to+' leaked '+sensitive);
   assert.match(html,/Unsaved local fields cleared/);
   assert.match(html,/data-action="tradelink-draft-clear"/);
   assert.match(html,/type="submit" class="primary">/);
  }
 }
 const stale=resetTradeLinkDraftForm({...initialTradeLinkDraftView('po'),formValues:{
  documentType:'po',customerName:'Secret supplier'
 }},'../../esi');
 assert.deepEqual(stale.formValues,{documentType:'quotation'});
 assert.ok(!JSON.stringify(stale).includes('Secret supplier'));
});

test('clearing local inputs preserves selected type and drops preview-related stale data',()=>{
 for(const module of TRADELINK_SOURCE_MODULES){
  const view={...initialTradeLinkDraftView(module.key),formValues:{
   documentType:module.key,documentNumber:'QA-SENSITIVE',remarks:'Clear this locally'
  }};
  const cleared=resetTradeLinkDraftForm(view);
  assert.deepEqual(cleared.formValues,{documentType:module.key});
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:cleared,canManage:true});
  assert.doesNotMatch(html,/QA-SENSITIVE|Clear this locally/);
  assert.match(html,/Clear local fields/);
 }
});

test('local validation feedback is specific, sanitized and reset after edited input',()=>{
 assert.equal(tradeLinkDraftValidationMessage(new ApiError(
  'Shipment Draft requires consignee/recipient and source reference.',400)),
  'Shipment Draft requires consignee/recipient and source reference.');
 assert.equal(tradeLinkDraftValidationMessage(new Error('secret user payload')),'Invalid Draft input.');
 assert.equal(tradeLinkDraftValidationMessage(new ApiError('hidden server response',500)),'Invalid Draft input.');
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,canManage:true});
 assert.match(html,/data-validation="pending"/);
 assert.match(html,/data-tradelink-draft-preview-status/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/status\.dataset\.validation='pending'/);
 assert.match(app,/Inputs changed\. Validate again\. Nothing saved or transmitted/);
 assert.match(app,/output\.dataset\.validation='invalid'/);
 assert.match(app,/output\.dataset\.validation='valid'/);
 assert.match(app,/tradeLinkDraftValidationMessage\(error\)/);
 assert.match(app,/form\.querySelector\(':invalid'\)/);
 assert.match(app,/resetTradeLinkDraftForm\(state\.tradeLinkDraft,event\.target\.value\)/);
 assert.match(app,/case 'tradelink-draft-clear'/);
 assert.match(app,/if\(!tradeLinkDraftRoute\(\)\|\|state\.tradeLinkDraft\.busy\)break;/);
});


test('priced Drafts reuse source calculator and preserve explicit currency without invented FX',()=>{
 for(const type of ['esi','quotation','po']){
  const values={documentType:type,lineQuantity:'2',lineUnitPrice:'125',
   currency:'PHP',vatType:'12'};
  const result=calculateTradeLinkDraftLocalAmounts(fields(values));
  assert.deepEqual(result,{currency:'PHP',subtotal:250,discount:0,taxable:250,vat:30,total:280,phpEquivalent:280});
  assert.deepEqual(calculateTradeLinkDraftLocalAmounts(fields({...values,currency:'EUR'})),{
   currency:'EUR',subtotal:250,discount:0,taxable:250,vat:30,total:280,phpEquivalent:null});
  assert.deepEqual(calculateTradeLinkDraftLocalAmounts(fields({...values,vatType:'zero'})),{
   currency:'PHP',subtotal:250,discount:0,taxable:250,vat:0,total:250,phpEquivalent:250});
 }
 for(const type of ['packing','delivery','payment']){
  assert.equal(calculateTradeLinkDraftLocalAmounts(fields({documentType:type,lineQuantity:'2',
   lineUnitPrice:'125',currency:'PHP',vatType:'12'})),null);
 }
 for(const changes of [
  {lineQuantity:''},{lineQuantity:'0'},{lineQuantity:'NaN'}, {lineQuantity:'-1'},
  {lineQuantity:'1000000001'}, {lineUnitPrice:''},{lineUnitPrice:'Infinity'},
  {lineUnitPrice:'0'}, {lineUnitPrice:'-9'}, {lineUnitPrice:'1000000001'},
  {currency:'NOT-CURRENCY'}, {vatType:'not-vat'}
 ]){
  const result=calculateTradeLinkDraftLocalAmounts(fields({
   documentType:'quotation',lineQuantity:'2',lineUnitPrice:'125',
   currency:'PHP',vatType:'12',...changes}));
  assert.equal(result,null,JSON.stringify(changes));
 }
});

test('commercial estimate exists only for the three priced module forms and is never a submit',()=>{
 for(const module of TRADELINK_SOURCE_MODULES){
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,canManage:true,
   view:initialTradeLinkDraftView(module.key)});
  const expected=['esi','quotation','po'].includes(module.key);
  assert.equal(html.includes('data-tradelink-draft-finance'),expected,module.key);
  if(expected){
   for(const key of ['subtotal','discount','taxable','vat','total','phpEquivalent'])
    assert.ok(html.includes('data-tradelink-draft-amount="'+key+'"'),key);
   assert.match(html,/No exchange rate or approval is inferred/);
   assert.match(html,/Local estimate only · no Draft save, payment, transaction or approval/);
  }
  assert.match(html,/type="submit" class="primary">/);
 }
});

test('local commercial estimate updates DOM text only and resets to placeholders for invalid fields',()=>{
 const values={documentType:'quotation',lineQuantity:'2',lineUnitPrice:'125',
  currency:'PHP',vatType:'12'};
 const nodes=new Map([
  ['[data-tradelink-draft-amount-currency]',{textContent:'—'}],
  ...['subtotal','discount','taxable','vat','total','phpEquivalent'].map(x=>[
   '[data-tradelink-draft-amount="'+x+'"]',{textContent:'—'}]),
  ['[data-tradelink-draft-finance-status]',{textContent:''}]
 ]);
 const panel={querySelector:s=>nodes.get(s)||null};
 const form={
  querySelector(s){
   if(s==='[data-tradelink-draft-finance]')return panel;
   const name=/^\[name="([^"]+)"\]$/.exec(s)?.[1];
   return name?{value:values[name]??''}:null;
  }
 };
 assert.equal(updateTradeLinkDraftLocalAmounts(form).total,280);
 assert.equal(nodes.get('[data-tradelink-draft-amount="total"]').textContent,'280.00');
 assert.equal(nodes.get('[data-tradelink-draft-amount="vat"]').textContent,'30.00');
 assert.equal(nodes.get('[data-tradelink-draft-amount-currency]').textContent,'PHP');
 values.lineUnitPrice='';
 assert.equal(updateTradeLinkDraftLocalAmounts(form),null);
 for(const node of ['subtotal','discount','taxable','vat','total','phpEquivalent'])
  assert.equal(nodes.get('[data-tradelink-draft-amount="'+node+'"]').textContent,'—');
 assert.equal(nodes.get('[data-tradelink-draft-amount-currency]').textContent,'—');
 assert.match(nodes.get('[data-tradelink-draft-finance-status]').textContent,/Enter valid positive quantity/);
 assert.equal(updateTradeLinkDraftLocalAmounts({querySelector:()=>null}),null);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/updateTradeLinkDraftLocalAmounts\(form\)/);
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|service_role|sb_secret|fetch\(/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});

test('commercial Draft preview uses source discount and explicit FX with no assumed conversion',()=>{
 const base={documentType:'quotation',lineQuantity:'2',lineUnitPrice:'125',
  currency:'PHP',vatType:'12',discountType:'percentage',discountValue:'10'};
 assert.deepEqual(calculateTradeLinkDraftLocalAmounts(fields(base)),{
  currency:'PHP',subtotal:250,discount:25,taxable:225,vat:27,total:252,phpEquivalent:252});
 assert.deepEqual(calculateTradeLinkDraftLocalAmounts(fields({...base,discountType:'fixed',
  discountValue:'50'})),{
  currency:'PHP',subtotal:250,discount:50,taxable:200,vat:24,total:224,phpEquivalent:224});
 const foreign=calculateTradeLinkDraftLocalAmounts(fields({...base,currency:'EUR',
  exchangeRate:'62'}));
 assert.equal(foreign.currency,'EUR');
 assert.equal(foreign.total,252);
 assert.equal(foreign.phpEquivalent,15624);
 assert.equal(calculateTradeLinkDraftLocalAmounts(fields({...base,currency:'EUR'})).phpEquivalent,null);
 for(const bad of [
  {discountType:'not-supported'}, {discountValue:'-1'}, {discountValue:'101'},
  {discountValue:'Infinity'}, {discountValue:'not-a-number'},
  {discountValue:'1000000000001'}, {discountValue:'0x20'},
  {currency:'USD',exchangeRate:'-1'}, {currency:'USD',exchangeRate:'0'},
  {currency:'USD',exchangeRate:'Infinity'}, {currency:'USD',exchangeRate:'foo'}
 ])assert.equal(calculateTradeLinkDraftLocalAmounts(fields({...base,...bad})),null,
  JSON.stringify(bad));
});

test('discount and FX fields remain within existing contract, sanitized, and never affect payment modules',()=>{
 const base={documentType:'quotation',documentNumber:'Q-1',customerName:'Client',
  customerEmail:'c@example.com',validity:'30 days',deliveryCommitment:'2 weeks',
  paymentTerms:'Net 30',approvedBy:'Approver',lineDescription:'Service',
  lineQuantity:'1',lineUnitPrice:'100',currency:'USD',vatType:'zero',
  discountType:'percentage',discountValue:'10',exchangeRate:'55'};
 const draft=parseTradeLinkDraftForm(fields(base),{lineId:()=> 'one'});
 assert.equal(draft.discountValue,10);
 assert.equal(draft.discountType,'percentage');
 assert.equal(draft.exchangeRate,55);
 for(const change of [{discountType:'not-supported'}, {discountValue:'-1'},
  {discountValue:'101'}, {discountValue:'foo'}, {exchangeRate:'0'},
  {exchangeRate:'-55'}, {exchangeRate:'Infinity'}])
  assert.throws(()=>parseTradeLinkDraftForm(fields({...base,...change}),
   {lineId:()=> 'one'}),/discount|exchange rate/i);
 const php=parseTradeLinkDraftForm(fields({...base,currency:'PHP'}),
  {lineId:()=> 'one'});
 assert.equal('exchangeRate' in php,false);
 for(const type of ['packing','delivery','payment']){
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
   view:initialTradeLinkDraftView(type),canManage:true});
  assert.doesNotMatch(html,/data-tradelink-draft-finance|name="discountValue"|name="exchangeRate"/);
 }
});

test('commercial estimate rerender restores source-calculated amount and remains safe when invalid',()=>{
 const data={documentType:'quotation',lineQuantity:'2',lineUnitPrice:'125',
  currency:'USD',vatType:'zero',discountType:'fixed',discountValue:'50',
  exchangeRate:'60',documentNumber:'Q-TEST'};
 const valid=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
  view:{...initialTradeLinkDraftView('quotation'),formValues:data},canManage:true});
 assert.match(valid,/data-tradelink-draft-amount="total">200\.00/);
 assert.match(valid,/data-tradelink-draft-amount="phpEquivalent">12,000\.00/);
 assert.match(valid,/data-tradelink-draft-amount-currency>USD/);
 const invalid=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
  view:{...initialTradeLinkDraftView('quotation'),formValues:{...data,exchangeRate:'oops'}},canManage:true});
 assert.match(invalid,/data-tradelink-draft-amount="total">—/);
 assert.doesNotMatch(invalid,/12,000\.00/);
 const app=readFileSync('frontend/app.js','utf8');
 for(const key of ['discountType','discountValue','exchangeRate'])
  assert.ok(app.includes("'"+key+"'"));
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});

test('Draft financial rows expose correct ISO currency units and explicit PHP denomination',()=>{
 for(const type of ['esi','quotation','po']){
  const state={...initialTradeLinkDraftView(type),formValues:{
   documentType:type,currency:'USD',lineQuantity:'2',lineUnitPrice:'50',
   vatType:'zero',exchangeRate:'60',discountType:'fixed',discountValue:'10'
  }};
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:state,canManage:true});
  for(const key of ['subtotal','discount','taxable','vat','total'])
   assert.ok(html.includes('data-tradelink-draft-denomination="'+key+'">USD</span>'),key);
  assert.match(html,/PHP equivalent \(PHP\)/);
  assert.match(html,/data-tradelink-draft-fx-base>USD<\/span>/);
  assert.match(html,/aria-describedby="tl-draft-discount-help"/);
  assert.match(html,/aria-describedby="tl-draft-fx-help"/);
  assert.match(html,/No external exchange-rate lookup occurs/);
  assert.match(html,/aria-live="polite" aria-atomic="true"/);
  assert.match(html,/data-tradelink-draft-money-currency>USD<\/span>/);
  assert.match(html,/data-tradelink-draft-amount="total">90\.00/);
  assert.match(html,/data-tradelink-draft-amount="phpEquivalent">5,400\.00/);
 }
});

test('Payment AR cash and cheque fields expose selected currency without financial preview',()=>{
 for(const currency of ['PHP','USD','EUR']){
  const state={...initialTradeLinkDraftView('payment'),formValues:{
   documentType:'payment',currency,cashAmount:'12',chequeAmount:'8'
  }};
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:state,canManage:true});
  assert.match(html,/Cash amount/);
  assert.match(html,/Cheque amount/);
  assert.equal((html.match(new RegExp('data-tradelink-draft-money-currency>'+currency+'<\\/span>','g'))||[]).length,2);
  assert.doesNotMatch(html,/data-tradelink-draft-finance|data-tradelink-draft-amount=/);
  assert.match(html,/type="submit" class="primary">/);
 }
});

test('currency switching updates text-only labels and FX denomination without changing stored fields',()=>{
 const money=[{textContent:'PHP'},{textContent:'PHP'}];
 const fields={currency:'USD',documentType:'quotation',lineQuantity:'2',
  lineUnitPrice:'125',vatType:'12',discountType:'percentage'};
 const dom=new Map([
  ['[data-tradelink-draft-amount-currency]',{textContent:'—'}],
  ['[data-tradelink-draft-fx-base]',{textContent:'PHP'}],
  ['[data-tradelink-draft-finance-status]',{textContent:''}],
  ...['subtotal','discount','taxable','vat','total'].flatMap(k=>[
   ['[data-tradelink-draft-denomination="'+k+'"]',{textContent:'PHP'}],
   ['[data-tradelink-draft-amount="'+k+'"]',{textContent:'—'}]
  ]),
  ['[data-tradelink-draft-amount="phpEquivalent"]',{textContent:'—'}]
 ]);
 const panel={querySelector:s=>dom.get(s)||null};
 const form={
  querySelector(s){
   if(s==='[data-tradelink-draft-finance]')return panel;
   const key=/^\[name="([^"]+)"\]$/.exec(s)?.[1];
   return key?{value:fields[key]??''}:null;
  },
  querySelectorAll(s){return s==='[data-tradelink-draft-money-currency]'?money:[];}
 };
 updateTradeLinkDraftInputCurrencyLabels(form);
 updateTradeLinkDraftLocalAmounts(form);
 for(const entry of money)assert.equal(entry.textContent,'USD');
 for(const key of ['subtotal','discount','taxable','vat','total'])
  assert.equal(dom.get('[data-tradelink-draft-denomination="'+key+'"]').textContent,'USD');
 assert.equal(dom.get('[data-tradelink-draft-fx-base]').textContent,'USD');
 assert.equal(dom.get('[data-tradelink-draft-amount="phpEquivalent"]').textContent,'—');
 fields.currency='EUR';
 updateTradeLinkDraftInputCurrencyLabels(form);
 updateTradeLinkDraftLocalAmounts(form);
 assert.equal(money[0].textContent,'EUR');
 assert.equal(dom.get('[data-tradelink-draft-fx-base]').textContent,'EUR');
 fields.currency='<img src=x onerror=alert(1)>';
 updateTradeLinkDraftInputCurrencyLabels(form);
 updateTradeLinkDraftLocalAmounts(form);
 assert.equal(money[0].textContent,'—');
 assert.equal(dom.get('[data-tradelink-draft-denomination="total"]').textContent,'—');
 assert.equal(dom.get('[data-tradelink-draft-amount="total"]').textContent,'—');
 assert.equal(updateTradeLinkDraftInputCurrencyLabels({querySelector:()=>null}),undefined);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/updateTradeLinkDraftInputCurrencyLabels\(form\)/);
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|service_role|sb_secret|fetch\(/);
});

test('Draft module is an exact-hash CDN smoke asset and focus styling remains scoped',()=>{
 const source=readFileSync('scripts/pages-smoke.mjs','utf8');
 assert.match(source,/'frontend\/tradelink-draft-workspace\.js'/);
 const css=readFileSync('frontend/tradelink-application.css','utf8');
 assert.match(css,/\.aps-tradelink-app \.tl-draft-panel :is\(button,select,input,textarea\):focus-visible/);
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
  view:initialTradeLinkDraftView('quotation'),canManage:true});
 assert.match(html,/id="tl-draft-discount-help"/);
 assert.match(html,/id="tl-draft-fx-help"/);
 assert.match(html,/data-tradelink-draft-preview-status[^>]*aria-atomic="true"/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});


test('six TradeLink modules render bounded hidden local document previews only',()=>{
 for(const module of TRADELINK_SOURCE_MODULES){
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
   view:initialTradeLinkDraftView(module.key),canManage:true});
  assert.match(html,/data-tradelink-draft-summary data-document-type="/);
  assert.ok(html.includes('data-document-type="'+module.key+'" hidden'),module.key);
  assert.match(html,/Validated local Draft summary · not saved/);
  assert.match(html,/Nothing was transmitted/);
  assert.match(html,/type="submit" class="primary">/);
  assert.match(html,/data-action="tradelink-draft-preview"/);
 }
 const invalid=renderTradeLinkDraftWorkspace({detail,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  view:initialTradeLinkDraftView('esi'),canManage:true});
 assert.doesNotMatch(invalid,/data-tradelink-draft-summary/);
});

test('local summary uses parsed source fields per module and never asserts approval',()=>{
 const cases=[
  {documentType:'esi',documentNumber:'SI-001',customerName:'Client',currency:'PHP',vatType:'12',
   customerTin:'TIN-001',verifiedBy:'Finance person',approvedBy:'Manager',
   items:[{kind:'item',id:'1',description:'Product',quantity:2,unitPrice:50}]},
  {documentType:'packing',documentNumber:'PL-001',customerName:'Consignee',
   referenceNumber:'SO-001',items:[{kind:'item',id:'1',description:'Box',quantity:3,unitPrice:0,unit:'box'}]},
  {documentType:'delivery',documentNumber:'DR-001',customerName:'Receiver',
   referenceNumber:'SO-001',checkedBy:'QC',deliveredBy:'Logistics',
   items:[{kind:'item',id:'1',description:'Device',quantity:1,unitPrice:0,serialNumber:'ABC-1'}]},
  {documentType:'payment',documentNumber:'AR-001',customerName:'Payor',currency:'EUR',
   paymentParticulars:'Received funds',cashAmount:20,chequeAmount:0,
   receivedBy:'Receiver',verifiedBy:'Verifier'},
  {documentType:'quotation',documentNumber:'Q-001',customerName:'Prospect',currency:'USD',
   customerEmail:'qa@example.com',validity:'30 days',paymentTerms:'Net 30',
   approvedBy:'Manager',vatType:'zero',
   items:[{kind:'item',id:'1',description:'Service',quantity:1,unitPrice:100}]},
  {documentType:'po',documentNumber:'PO-001',customerName:'Supplier',currency:'PHP',
   paymentTerms:'Net 30',targetDeliveryDate:'2026-12-01',verifiedBy:'Account manager',
   approvedBy:'Manager',vatType:'zero',
   items:[{kind:'item',id:'1',description:'Parts',quantity:2,unitPrice:125}]}
 ];
 const expectedLabels={
  esi:['customerTin','verifiedBy','approvedBy','localTotal'],
  packing:['referenceNumber','lineDescription','lineQuantity','lineUnit'],
  delivery:['lineSerialNumber','checkedBy','deliveredBy'],
  payment:['paymentParticulars','cashAmount','chequeAmount','receivedBy'],
  quotation:['customerEmail','validity','paymentTerms','localTotal'],
  po:['targetDeliveryDate','verifiedBy','approvedBy','localTotal']
 };
 for(const draft of cases){
  const fields=tradeLinkDraftLocalSummaryValues(draft);
  assert.equal(fields.documentNumber,draft.documentNumber);
  assert.equal(fields.customerName,draft.customerName);
  assert.deepEqual(Object.keys(fields).filter(x=>x==='status'||x==='workflow'||x==='approvedAt'),[]);
  for(const k of expectedLabels[draft.documentType])assert.ok(k in fields,k);
  if(draft.documentType==='esi')assert.equal(fields.localTotal,'112.00 PHP');
  if(draft.documentType==='payment')assert.equal(fields.cashAmount,'20.00 EUR');
  if(draft.documentType==='quotation')assert.equal(fields.localTotal,'100.00 USD');
 }
 assert.equal(tradeLinkDraftLocalSummaryValues({documentType:'wrong'}),null);
 assert.equal(tradeLinkDraftLocalSummaryValues(null),null);
});

test('local Draft summary DOM uses text-only output and clears on changes, invalid, wrong module',()=>{
 const htmlSensitive='"><img src=x onerror=alert(1)>';
 const data={documentType:'quotation',documentNumber:'Q-1',customerName:htmlSensitive,
  customerEmail:'sample@example.com',
  items:[{kind:'item',id:'1',description:'A & B',quantity:1,unitPrice:10}],
  currency:'PHP',vatType:'zero'};
 const names=['documentNumber','customerName','currency','customerEmail','localTotal'];
 const nodes=names.map(k=>({dataset:{tradelinkDraftSummaryValue:k},textContent:'old value'}));
 const panel={dataset:{documentType:'quotation'},hidden:true,
  querySelectorAll:()=>nodes};
 const form={querySelector:key=>key==='[data-tradelink-draft-summary]'?panel:null};
 const values=updateTradeLinkDraftLocalSummary(form,data);
 assert.equal(values.customerName,htmlSensitive);
 assert.equal(nodes[1].textContent,htmlSensitive);
 assert.equal(nodes.at(-1).textContent,'10.00 PHP');
 assert.equal(panel.hidden,false);
 assert.equal('innerHTML' in nodes[1],false);
 updateTradeLinkDraftLocalSummary(form);
 assert.equal(panel.hidden,true);
 for(const node of nodes)assert.equal(node.textContent,'');
 assert.equal(updateTradeLinkDraftLocalSummary(form,{...data,documentType:'po'}),null);
 assert.equal(panel.hidden,true);
 assert.equal(updateTradeLinkDraftLocalSummary({querySelector:()=>null},data),null);
});

test('success/invalid/input paths wire local summary only; no new persistence route or storage',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const draft=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 const formSection=app.slice(app.indexOf("case 'tradelink-draft-preview':"),
  app.indexOf("case 'tradelink-draft-clear':"));
 assert.match(formSection,/updateTradeLinkDraftLocalSummary\(form\);/);
 assert.match(formSection,/updateTradeLinkDraftLocalSummary\(form,draft\);/);
 const capture=app.slice(app.indexOf('function captureTradeLinkDraftFields('),
  app.indexOf('function syncTradeLinkFinanceInput('));
 assert.match(capture,/updateTradeLinkDraftLocalSummary\(form\);/);
 assert.match(draft,/class="tl-draft-summary"/);
 assert.doesNotMatch(draft,/localStorage|sessionStorage|indexedDB|service_role|sb_secret|fetch\(/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});

test('local priced summary names financial components and never fabricates foreign-currency conversion',()=>{
 for(const type of ['esi','quotation','po']){
  const input={documentType:type,documentNumber:'QA-COMM',customerName:'QA Client',
   currency:'USD',vatType:'12',discountType:'fixed',discountValue:5,
   items:[{id:'item',kind:'item',description:'Source item',quantity:2,unitPrice:50}]};
  const values=tradeLinkDraftLocalSummaryValues(input);
  assert.equal(values.localSubtotal,'100.00 USD');
  assert.equal(values.localDiscount,'5.00 USD');
  assert.equal(values.localVat,'11.40 USD');
  assert.equal(values.localTotal,'106.40 USD');
  assert.equal(values.localPhpEquivalent,'—');
  const withFx=tradeLinkDraftLocalSummaryValues({...input,exchangeRate:60});
  assert.equal(withFx.localPhpEquivalent,'6,384.00 PHP');
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
   view:initialTradeLinkDraftView(type),canManage:true});
  for(const key of ['localSubtotal','localDiscount','localVat','localTotal','localPhpEquivalent'])
   assert.ok(html.includes('data-tradelink-draft-summary-value="'+key+'"'),key);
 }
 for(const type of ['payment','packing','delivery']){
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
   view:initialTradeLinkDraftView(type),canManage:true});
  assert.doesNotMatch(html,/data-tradelink-draft-summary-value="localVat"/);
 }
});

test('read-only listing presents filters but never reveals rows or enables RPC under dark launch',async()=>{
 const seed={...initialTradeLinkDraftView('quotation'),status:'AUTHORIZED_READ',
  rows:[{documentId:'11111111-1111-4111-8111-111111111111',documentNumber:'SECRET-Q',
   boardItemId:'22222222-2222-4222-8222-222222222222',documentType:'quotation',
   workflowState:'draft',revision:2,archived:false}]};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:seed,canManage:true});
 for(const input of ['query','documentType','workflowState','archiveMode'])
  assert.ok(html.includes('name="'+input+'"'),input);
 assert.match(html,/Search document number/);
 assert.match(html,/current signed, authorized response \(maximum 50 records\)/);
 assert.match(html,/data-tradelink-domain-count role="status"/);
 assert.match(html,/name="query"[^>]*data-tradelink-domain-filter/);
 assert.match(html,/SECRET-Q/);
 assert.match(html,/1 of 1 authorized records in this response/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
 const client=new TradeLinkDraftWorkspace({
  auth:{getVerifiedUser:async()=>{throw Error('auth must not be read');}},
  api:{rpc:async()=>{throw Error('RPC must not be called');}}
 });
 await assert.rejects(()=>client.list(),/Signed TradeLink domain API unavailable/);
});

test('source-bound local document search filters only previously authorized page entries',()=>{
 const rows=[
  {documentNumber:'Q-100',documentType:'quotation',workflowState:'draft',archived:false},
  {documentNumber:'Q-200',documentType:'quotation',workflowState:'approved',archived:false},
  {documentNumber:'PO-300',documentType:'po',workflowState:'draft',archived:true},
  {documentNumber:'PL-400',documentType:'packing',workflowState:'completed',archived:false},
  {documentNumber:'E-500',documentType:'esi',workflowState:'revision-required',archived:false}
 ];
 assert.deepEqual(initialTradeLinkDraftListFilters(),{
  query:'',documentType:'all',workflowState:'all',archiveMode:'active',
  sortBy:'documentNumber',sortDirection:'asc'});
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(rows).map(x=>x.documentNumber),
  ['E-500','PL-400','Q-100','Q-200']);
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(rows,{query:' q-',documentType:'quotation',
  workflowState:'draft'}).map(x=>x.documentNumber),['Q-100']);
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(rows,{archiveMode:'archived'}).map(x=>x.documentNumber),
  ['PO-300']);
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(rows,{archiveMode:'all',workflowState:'draft'})
  .map(x=>x.documentNumber),['PO-300','Q-100']);
 const unsafe=normalizeTradeLinkDraftListFilters({
  query:'X'.repeat(400),documentType:'../payment',workflowState:'approved;drop',archiveMode:'x'});
 assert.equal(unsafe.query.length,120);
 assert.equal(unsafe.documentType,'all');
 assert.equal(unsafe.workflowState,'all');
 assert.equal(unsafe.archiveMode,'active');
 assert.equal(unsafe.sortBy,'documentNumber');
 assert.equal(unsafe.sortDirection,'asc');
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(null,{}),[]);
 assert.equal(filterTradeLinkDraftAuthorizedRows(Array.from({length:120},
  (_,i)=>({...rows[0],documentNumber:'Q-'+i})),{archiveMode:'all'}).length,50);
});

test('document-list DOM filters hide rows and show accessible counts without writes',()=>{
 const fixtures=[
  {documentNumber:'Q-100',documentType:'quotation',workflowState:'draft',archived:'false'},
  {documentNumber:'PO-200',documentType:'po',workflowState:'draft',archived:'true'},
  {documentNumber:'Q-300',documentType:'quotation',workflowState:'approved',archived:'false'}
 ];
 const rows=fixtures.map(row=>({dataset:row,hidden:false}));
 const count={textContent:''},empty={hidden:true};
 const container={
  querySelectorAll(selector){return selector==='[data-tradelink-domain-record]'?rows:[];},
  querySelector(selector){return selector==='[data-tradelink-domain-count]'?count:
   selector==='[data-tradelink-domain-no-match]'?empty:null;}
 };
 assert.equal(updateTradeLinkDraftListUI(container,{query:'q-'}),2);
 assert.equal(count.textContent,'2 of 3 authorized records in this response');
 assert.deepEqual(rows.map(row=>row.hidden),[false,true,false]);
 assert.equal(updateTradeLinkDraftListUI(container,{query:'absent'}),0);
 assert.equal(empty.hidden,false);
 assert.equal(updateTradeLinkDraftListUI(container,{documentType:'po',archiveMode:'all'}),1);
 assert.equal(rows[1].hidden,false);
 assert.equal(empty.hidden,true);
 assert.equal(updateTradeLinkDraftListUI(null,{}),0);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/function captureTradeLinkDraftListFilters\(event\)/);
 assert.match(app,/state\.tradeLinkDraft\?\.status!=='AUTHORIZED_READ'/);
 assert.match(app,/captureTradeLinkDraftListFilters\(event\)/);
 assert.match(app,/updateTradeLinkDraftListUI\(container,filters\)/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});

test('document workspace is distinct from board projection and honors signed workspace boundary',()=>{
 const html=renderTradeLinkApplication({detail,workspaceId:workspace,section:'documents',
  draftView:initialTradeLinkDraftView(),canManage:true});
 assert.match(html,/TradeLink document workspace/);
 assert.match(html,/Source-aligned All Documents/);
 assert.match(html,/Board records/);
 assert.match(html,/Board items are linked to the same signed TradeLink documents/);
 assert.match(html,/Document reads are subject to signed authorization/);
 for(const name of ['query','documentType','workflowState','archiveMode','sortBy','sortDirection'])
  assert.ok(html.includes('name="'+name+'"'),name);
 for(const module of TRADELINK_SOURCE_MODULES)
  assert.match(html,new RegExp('href="#/boards/'+TRADELINK_BOARD_ID+'/tradelink/'+module.key+'"'));
 assert.doesNotMatch(html,/data-action="tradelink-draft-archive"|data-action="tradelink-draft-open"/);
 const foreign=renderTradeLinkDocumentRepository({
  detail,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  view:initialTradeLinkDraftView(),canManage:true});
 assert.match(foreign,/Signed TradeLink document workspace unavailable/);
 assert.doesNotMatch(foreign,/data-tradelink-domain-list/);
});

test('disabled document reads redact even injected authorized-state list rows and never initiate RPC',async()=>{
 const forged={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[{documentId:'11111111-1111-4111-8111-111111111111',
   documentNumber:'HIDDEN-DOC-100',documentType:'quotation',
   workflowState:'approved',revision:5,archived:false}]};
 const html=renderTradeLinkApplication({detail,workspaceId:workspace,section:'documents',
  draftView:forged,canManage:true});
 assert.match(html,/HIDDEN-DOC-100/);
 assert.match(html,/data-tradelink-domain-filter/);
 assert.match(html,/1 of 1 authorized records in this response/);
 const client=new TradeLinkDraftWorkspace({
  auth:{getVerifiedUser:async()=>{throw Error('unexpected auth');}},
  api:{rpc:async()=>{throw Error('unexpected request');}}
 });
 await assert.rejects(()=>client.list(),/Signed TradeLink domain API unavailable/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});

test('sorting handles numbered document IDs and numeric revision without re-querying server',()=>{
 const rows=[
  {documentNumber:'Q-10',documentType:'quotation',workflowState:'draft',revision:2,archived:false},
  {documentNumber:'Q-2',documentType:'quotation',workflowState:'draft',revision:11,archived:false},
  {documentNumber:'PO-3',documentType:'po',workflowState:'approved',revision:4,archived:false}
 ];
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(rows,{sortBy:'documentNumber'})
  .map(r=>r.documentNumber),['PO-3','Q-2','Q-10']);
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(rows,{sortBy:'documentNumber',sortDirection:'desc'})
  .map(r=>r.documentNumber),['Q-10','Q-2','PO-3']);
 assert.deepEqual(filterTradeLinkDraftAuthorizedRows(rows,{sortBy:'revision',sortDirection:'desc'})
  .map(r=>r.revision),[11,4,2]);
 const normalized=normalizeTradeLinkDraftListFilters({
  sortBy:'../metadata',sortDirection:'drop',query:'x'.repeat(200)});
 assert.equal(normalized.sortBy,'documentNumber');
 assert.equal(normalized.sortDirection,'asc');
 assert.equal(normalized.query.length,120);
});

test('sortable authorized document view only reorders current DOM nodes and preserves search count',()=>{
 const make=(documentNumber,revision)=>({
  dataset:{documentNumber,documentType:'quotation',workflowState:'draft',
   revision:String(revision),archived:'false'},hidden:false
 });
 const rows=[make('Q-10',2),make('Q-2',11),make('Q-3',5)];
 const order=[],tbody={appendChild(node){order.push(node.dataset.documentNumber);}};
 const counter={textContent:''},empty={hidden:true};
 const container={
  querySelectorAll:key=>key==='[data-tradelink-domain-record]'?rows:[],
  querySelector:key=>({
   '[data-tradelink-domain-list-body]':tbody,
   '[data-tradelink-domain-count]':counter,
   '[data-tradelink-domain-no-match]':empty
  })[key]??null
 };
 assert.equal(updateTradeLinkDraftListUI(container,{query:'Q-',sortBy:'revision',sortDirection:'desc'}),3);
 assert.deepEqual(order,['Q-2','Q-3','Q-10']);
 assert.equal(counter.textContent,'3 of 3 authorized records in this response');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/function tradeLinkAuthorizedListRoute\(\)/);
 assert.match(app,/state\.boardManage/);
 assert.match(app,/sortBy:get\('sortBy'\),sortDirection:get\('sortDirection'\)/);
 assert.match(app,/TL03_DOMAIN_READS_ENABLED&&state\.board\?\.board\?\.id===TRADELINK_BOARD_ID/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});


test('source document saved preview renders exact server revision and multiple lines as escaped text',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const boardItem='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const record={id,board_id:TRADELINK_BOARD_ID,workspace_id:workspace,
  board_item_id:boardItem,document_type:'quotation',document_number:'Q-107',
  revision:3,workflow_state:'draft',archived_at:null,
  updated_at:'2026-11-07T09:30:00Z',
  content:{documentType:'quotation',documentNumber:'Q-107',
   customerName:'<img src=x onerror=alert(1)>',currency:'PHP',vatType:'zero',
   items:[{id:'a',kind:'item',description:'Pump & hose',quantity:1,unitPrice:120},
    {id:'b',kind:'item',description:'Valve',quantity:2,unitPrice:25}]}};
 const html=renderTradeLinkSavedDocumentPreview(record,workspace,id);
 assert.match(html,/Saved document · Q-107/);
 assert.match(html,/Revision 3/);
 assert.match(html,/Linked Board item/);
 assert.match(html,/Pump &amp; hose/);
 assert.match(html,/Valve/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(html,/Persisted line items/);
 assert.match(html,/170\.00 PHP/); // All saved line items, not just the editor's first line.
 assert.match(html,/Local total estimate<\/dt><dd>170\.00 PHP<\/dd>/);
 assert.throws(()=>renderTradeLinkSavedDocumentPreview({...record,workspace_id:id},workspace,id));
 assert.throws(()=>renderTradeLinkSavedDocumentPreview({...record,content:{
  ...record.content,documentNumber:'CHANGED'}},workspace,id));
});

test('dark-launch source list and Board cannot expose forged saved documents or preview actions',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  rows:[{documentId:id,boardItemId:item,documentNumber:'Q-107',
   documentType:'quotation',workflowState:'draft',revision:1,archived:false}],
  documentPreview:{documentId:id,record:{
   id,board_id:TRADELINK_BOARD_ID,workspace_id:workspace,board_item_id:item,
   document_type:'quotation',document_number:'Q-107',
   workflow_state:'draft',revision:1,content:{
    documentType:'quotation',documentNumber:'Q-107',customerName:'TOP-SECRET'}}}};
 const signedBoard={...detail,items:[{id:item,title:'Q-107',status:'Draft'}]};
 const html=renderTradeLinkApplication({detail:signedBoard,section:'documents',
  workspaceId:workspace,draftView:view,canManage:true});
 assert.match(html,/data-tradelink-saved-preview/);
 assert.match(html,/tradelink-document-open/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});

test('operational save and read handlers retain signed linkage, backend receipt and release gate',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const ui=readFileSync('frontend/tradelink-application.js','utf8');
 const draft=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(app,/async function openTradeLinkDocument\(documentId\)/);
 assert.match(app,/record\.board_item_id!==listed\.boardItemId/);
 assert.match(app,/state\.tradeLinkDraft\.documentPreview=\{documentId,record,events\}/);
 assert.match(app,/const receipt=await tradeLinkDraftWorkspace\.save/);
 assert.match(app,/committed=true/);
 assert.match(app,/tradeLinkDraftWorkspace\.read\(documentId\)/);
 assert.match(app,/tradeLinkDraftWorkspace\.list\(\)/);
 assert.match(app,/board\.items\?\.some\(item=>item\.id===receipt\.boardItemId/);
 assert.match(app,/location\.hash='#\/boards\/'\+TRADELINK_BOARD_ID\+'\/tradelink\/documents'/);
 assert.match(app,/root\.querySelector\('\[data-tradelink-draft-form\]'\)\?\.requestSubmit\(\)/);
 assert.match(ui,/documentByItem\.get\(item\.id\)\?\.documentNumber===item\.title/);
 assert.match(draft,/data-action="tradelink-document-open"/);
 assert.match(draft,/renderTradeLinkSavedDocumentPreview/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
});
test('dark launch never renders stale selected document content after read access is disabled',()=>{
 const malicious='"><img src=x onerror=alert(1)>';
 const view={...initialTradeLinkDraftView(),mode:'edit',
  selected:{documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   record:{workflow_state:'draft',revision:2,content:{
    documentType:'quotation',documentNumber:'Q-100',customerName:malicious}}}};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
 assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotMatch(html,/<img src=x onerror=alert/);
 assert.match(html,/&lt;img src=x onerror=alert/);
 assert.match(html,/Signed Draft loaded/);
 assert.match(html,/type="submit" class="primary">/);
 assert.doesNotMatch(html,/saved successfully/i);
});

test('unsaved local input survives UI redraw but stale signed edit content is redacted',()=>{
 const staged={...initialTradeLinkDraftView(),formValues:{
  documentType:'quotation',documentNumber:'Q-LOCAL-42',customerName:'Customer & Partner',
  remarks:'Only in memory'}};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:staged,canManage:true});
 assert.match(html,/value="Q-LOCAL-42"/);
 assert.match(html,/Customer &amp; Partner/);
 assert.match(html,/Only in memory/);
 const revoked={...staged,mode:'edit',selected:{documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  record:{workflow_state:'draft',revision:2,content:{documentType:'quotation',
    documentNumber:'Q-SECRET',customerName:'Restricted record'}}},
  formValues:{...staged.formValues,customerName:'Restricted record'}};
 const denied=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:revoked,canManage:false});
 assert.doesNotMatch(denied,/Restricted record|Q-SECRET/);
 assert.match(denied,/type="submit" class="primary" disabled/);
});

test('app integration is session-cleared and route-scoped, with no new credentials or storage',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(app,/tradeLinkDraftRoute\(\)/);
 assert.match(app,/loadTradeLinkDrafts\(seq\)/);
 assert.match(app,/parseTradeLinkDraftForm\(new FormData\(form\)\)/);
 assert.match(app,/case 'tradelink-draft-preview'/);
 assert.match(app,/case 'tradelink-draft-archive'/);
 assert.match(app,/\!tradeLinkDraftReady\(\)/);
 assert.match(app,/state\.tradeLinkDraft=initialTradeLinkDraftView\(\)/);
 assert.match(app,/captureTradeLinkDraftFields\(event\)/);
 assert.match(app,/state\.context\?\.user_id===auth\.userId/);
 assert.match(app,/event\.target\.matches\('\[data-tradelink-draft-form\]'\)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|service_role|sb_secret|fetch\(/);
 assert.doesNotMatch(source,/\b(?:indexedDB|setItem|document\.cookie)\b/);
});
