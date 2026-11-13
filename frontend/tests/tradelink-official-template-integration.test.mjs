import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTradeLinkDraftForm,prepareTradeLinkDraftCommand,
 renderTradeLinkDraftWorkspace,initialTradeLinkDraftView}
 from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {TRADELINK_DEFAULT_TERMS,TRADELINK_DEFAULT_COMPANY_PROFILE_ID,
 TRADELINK_COMPANY_PROFILE_OPTIONS,
 tradeLinkCompanyTemplateSnapshot}
 from '../tradelink-official-templates.js';
const workspace='00000000-0000-4000-8000-000000000001';
const documentId='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const boardItemId='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const board={id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'};
const fields=data=>({get:key=>data[key]??null,getAll:key=>data[key]==null?[]:[data[key]]});
const minimal={documentType:'quotation',documentNumber:'Q-100'};
const moduleInputs={
 esi:{customerName:'Client',customerTin:'TIN-001',verifiedBy:'msenagan@watchdogautomation.com.ph',
  approvedBy:'asenagan@watchdogautomation.com.ph',lineDescription:'Goods',lineQuantity:'1',lineUnitPrice:'10'},
 quotation:{customerName:'Client',customerEmail:'client@example.test',validity:'30 days',
  deliveryCommitment:'14 days',paymentTerms:'Net 30',approvedBy:'asenagan@watchdogautomation.com.ph'},
 po:{customerName:'Supplier',targetDeliveryDate:'2026-12-01',paymentTerms:'Net 30',
  verifiedBy:'asenagan@watchdogautomation.com.ph',approvedBy:'asenagan@watchdogautomation.com.ph',
  lineDescription:'Materials',lineQuantity:'1',lineUnitPrice:'10'},
 packing:{customerName:'Consignee',referenceNumber:'SO-1',
  verifiedBy:'msenagan@watchdogautomation.com.ph',approvedBy:'asenagan@watchdogautomation.com.ph',
  lineDescription:'Packed item',lineQuantity:'1',lineUnit:'box'},
 delivery:{customerName:'Recipient',referenceNumber:'SO-1',
  checkedBy:'dsenagan@watchdogautomation.com.ph',deliveredBy:'rogang@watchdogautomation.com.ph',
  lineDescription:'Delivered item',lineQuantity:'1',lineUnit:'pc'},
 payment:{customerName:'Payor',paymentParticulars:'Settlement',cashAmount:'10',
  receivedBy:'msenagan@watchdogautomation.com.ph',verifiedBy:'asenagan@watchdogautomation.com.ph'}
};

test('six module save envelopes bind the legacy company/template IDs and module-specific terms',()=>{
 for(const type of ['esi','quotation','po','packing','delivery','payment']){
  const draft=parseTradeLinkDraftForm(fields({...minimal,documentType:type,...moduleInputs[type]}),{purpose:'save'});
  assert.equal(draft.vendorId,TRADELINK_DEFAULT_COMPANY_PROFILE_ID,type);
  assert.equal(draft.templateId,tradeLinkCompanyTemplateSnapshot(TRADELINK_DEFAULT_COMPANY_PROFILE_ID).id,type);
  assert.equal(draft.terms,TRADELINK_DEFAULT_TERMS[type],type);
  assert.equal(draft.terms.length<=5000,true,type);
  assert.equal(Object.hasOwn(draft,'companyProfileSnapshot'),false,type);
  assert.equal(Object.hasOwn(draft,'templateSnapshot'),false,type);
 }
});
test('explicit legal entity selection binds its matching profile and visual template',()=>{
 const draft=parseTradeLinkDraftForm(fields({...minimal,vendorId:'plc-systems'}),{purpose:'save'});
 assert.equal(draft.vendorId,'plc-systems');
 assert.equal(draft.templateId,'plc-systems-reference-v1');
});
test('user-edited terms are revision-bound; an intentionally empty terms field remains empty',()=>{
 const custom=parseTradeLinkDraftForm(fields({...minimal,terms:'Custom negotiated terms'}),{purpose:'save'});
 assert.equal(custom.terms,'Custom negotiated terms');
 const empty=parseTradeLinkDraftForm(fields({...minimal,terms:''}),{purpose:'save'});
 assert.equal(empty.terms,'');
});
test('invalid company profile IDs are rejected before save preparation',()=>{
 assert.throws(()=>parseTradeLinkDraftForm(fields({...minimal,vendorId:'other-company'}),
  {purpose:'save'}),/valid TradeLink company profile/i);
});
test('existing saved company assignment cannot be rebound during revision update',()=>{
 const record={id:documentId,board_item_id:boardItemId,revision:3,
  content:{...minimal,vendorId:'watchdog-opc',templateId:'watchdog-opc-reference-v1'}};
 const view={mode:'edit',selected:{documentId,record}};
 assert.throws(()=>prepareTradeLinkDraftCommand(view,fields({...minimal,
  vendorId:'watchdog-sales'})),/cannot be rebound/i);
 const command=prepareTradeLinkDraftCommand(view,fields({...minimal,
  vendorId:'watchdog-opc'}));
 assert.equal(command.draft.vendorId,'watchdog-opc');
 assert.equal(command.draft.templateId,'watchdog-opc-reference-v1');
});
test('legacy saved record without company association may be assigned once during its next revision',()=>{
 const record={id:documentId,board_item_id:boardItemId,revision:3,
  content:{...minimal}};
 const view={mode:'edit',selected:{documentId,record}};
 const command=prepareTradeLinkDraftCommand(view,fields({...minimal,
  vendorId:'plc-systems'}));
 assert.equal(command.draft.vendorId,'plc-systems');
 assert.equal(command.draft.templateId,'plc-systems-reference-v1');
});
test('Create New form exposes the three recovered company profiles and editable official terms',()=>{
 const html=renderTradeLinkDraftWorkspace({detail:{board},workspaceId:workspace,
  view:{...initialTradeLinkDraftView('quotation'),formValues:{documentType:'quotation'}},
  canManage:true});
 assert.match(html,/Company \/ legal entity/);
 for(const [id,name] of TRADELINK_COMPANY_PROFILE_OPTIONS){
  assert.match(html,new RegExp('value="'+id+'"'));
  assert.ok(html.includes(name.replace('&','&amp;')));
 }
 assert.match(html,/name="terms"/);
 assert.match(html,/QUOTATION TERMS AND CONDITIONS/);
 assert.match(html,/v1\.42\.0/);
});
test('saved company association is locked in edit form while a legacy unbound record remains assignable',()=>{
 const bound={id:documentId,board_item_id:boardItemId,revision:3,
  workflow_state:'draft',content:{...minimal,vendorId:'watchdog-opc',templateId:'watchdog-opc-reference-v1'}};
 const boundHtml=renderTradeLinkDraftWorkspace({detail:{board},workspaceId:workspace,
  view:{...initialTradeLinkDraftView(),mode:'edit',selected:{documentId,record:bound}},
  canManage:true});
 assert.match(boundHtml,/name="vendorId" disabled/);
 assert.match(boundHtml,/name="vendorId" value="watchdog-opc"/);
 const legacy={...bound,content:{...minimal}};
 const legacyHtml=renderTradeLinkDraftWorkspace({detail:{board},workspaceId:workspace,
  view:{...initialTradeLinkDraftView(),mode:'edit',selected:{documentId,record:legacy}},
  canManage:true});
 assert.doesNotMatch(legacyHtml,/name="vendorId" disabled/);
});


test('TradeLink overview and User Manual describe the recovered official templates and print boundary',()=>{
 const app=readFileSync(new URL('../tradelink-application.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/official PDF template remains pending|will be integrated separately when supplied/i);
 assert.match(app,/recovered official company templates are available for all six modules/i);
 assert.match(app,/official v1\.42\.0 company templates are available for all six modules/i);
 assert.match(app,/browser print copy is not an electronically issued PDF/i);
 assert.match(app,/Older records without a company assignment use the historical Watchdog Automation Sales & Services default/i);
});
