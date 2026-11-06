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
 renderTradeLinkDraftWorkspace,TradeLinkDraftWorkspace,tradeLinkDraftReady
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
 assert.match(html,/Controlled dark launch/);
 assert.match(html,/data-tradelink-draft-form/);
 assert.match(html,/data-action="tradelink-draft-preview"/);
 assert.match(html,/data-action="tradelink-draft-refresh" disabled/);
 assert.match(html,/type="submit" class="primary" disabled/);
 assert.doesNotMatch(html,/data-action="tradelink-draft-archive"[^>]*>Archive/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,false);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,false);
 assert.equal(tradeLinkDraftReady(),false);
});


test('six source modules deep-link to their selected, unsaved Draft forms',()=>{
 assert.equal(TRADELINK_SOURCE_MODULES.length,6);
 for(const module of TRADELINK_SOURCE_MODULES){
  const html=renderTradeLinkApplication({detail,workspaceId:workspace,section:module.key,canManage:true});
  const href='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/'+module.key;
  assert.ok(html.includes('href="'+href+'"'),module.label);
  assert.match(html,/Nothing is saved or submitted/);
  const view=initialTradeLinkDraftView(module.key);
  assert.deepEqual(view.formValues,{documentType:module.key});
  const editor=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
  assert.ok(editor.includes('<option value="'+module.key+'" selected>'),module.label);
  assert.match(editor,/data-action="tradelink-draft-preview"/);
  assert.match(editor,/type="submit" class="primary" disabled/);
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
 assert.ok(app.includes('async function loadBoard(boardId,tab,draftType=null)'));
 assert.ok(app.includes("state.tradeLinkDraft=initialTradeLinkDraftView(tab==='tradelink'&&state.tradeLinkSection==='drafts'?draftType:null)"));
 assert.ok(app.includes("requested==='tradelink'&&state.tradeLinkSection==='drafts'?parts[4]:null"));
});

test('foreign workspace or an unrelated board renders no usable editor',()=>{
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 assert.match(html,/Signed TradeLink workspace unavailable/);
 assert.doesNotMatch(html,/data-tradelink-draft-form/);
 const wrong={...detail,board:{...detail.board,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}};
 assert.doesNotMatch(renderTradeLinkDraftWorkspace({detail:wrong,workspaceId:workspace}),/data-tradelink-draft-form/);
});

test('client never contacts auth, boards or RPC while both production flags are disabled',async()=>{
 let calls=0;
 const client=new TradeLinkDraftWorkspace({
  auth:{getVerifiedUser:async()=>{calls++;throw Error('unexpected auth');}},
  api:{rpc:async()=>{calls++;throw Error('unexpected API');}}
 });
 assert.deepEqual(await client.list(),{status:'DARK_LAUNCH',rows:[]});
 await assert.rejects(()=>client.read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/dark launch/i);
 await assert.rejects(()=>client.save({draft:{documentType:'quotation',documentNumber:'Q-001'}}),/dark launch/i);
 await assert.rejects(()=>client.changeState({
  documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:1,operation:'archive'
 }),/dark launch/i);
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
 assert.match(html,/type="submit" class="primary" disabled/);
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
 assert.match(html,/type="submit" class="primary" disabled/);
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
 assert.match(html,/type="submit" class="primary" disabled/);
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
 assert.equal(TL03_DOMAIN_READS_ENABLED,false);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,false);
});

test('Electronic SI preview validates client identity, priced line and intended review names',()=>{
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId:workspace,view:initialTradeLinkDraftView('esi'),canManage:true});
 for(const name of ['customerTin','verifiedBy','approvedBy','lineUnitPrice'])
  assert.ok(html.includes('name="'+name+'"'),name);
 assert.match(html,/Electronic SI readiness · preview only/);
 assert.match(html,/type="submit" class="primary" disabled/);
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
 assert.match(html,/type="submit" class="primary" disabled/);
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
  assert.match(output,/type="submit" class="primary" disabled/);
  assert.match(output,/Validate locally/);
 }
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 for(const key of ['customerTin','customerEmail','customerPhone','validity',
  'deliveryCommitment','paymentTerms','targetDeliveryDate','poNumber','approvedBy'])
  assert.ok(app.includes("'"+key+"'"),key);
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|service_role|sb_secret|fetch\(/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,false);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,false);
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
   assert.match(html,/type="submit" class="primary" disabled/);
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

test('dark launch never renders stale selected document content after read access is disabled',()=>{
 const malicious='"><img src=x onerror=alert(1)>';
 const view={...initialTradeLinkDraftView(),mode:'edit',
  selected:{documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   record:{workflow_state:'draft',revision:2,content:{
    documentType:'quotation',documentNumber:'Q-100',customerName:malicious}}}};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
 assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotMatch(html,/onerror=alert/);
 assert.match(html,/Prepare a Draft/);
 assert.match(html,/type="submit" class="primary" disabled/);
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
