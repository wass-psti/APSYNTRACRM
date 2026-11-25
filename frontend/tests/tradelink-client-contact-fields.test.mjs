import test from 'node:test';
import assert from 'node:assert/strict';
import {initialTradeLinkDraftView,renderTradeLinkDraftWorkspace,parseTradeLinkDraftForm,prepareTradeLinkDraftCommand} from '../tradelink-draft-workspace.js';
import {captureRecoveryFields} from '../tradelink/draft-recovery-state.js';
import {renderTradeLinkSavedDocumentOutput} from '../tradelink-saved-document-output.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const ws='00000000-0000-4000-8000-000000000001';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
const base={documentType:'quotation',documentNumber:'Q-TEST-CONTACT',customerName:'Synthetic client'};
const fields=values=>new Map(Object.entries({...base,...values}));
const parse=values=>parseTradeLinkDraftForm(fields(values),{purpose:'save'});
const render=view=>renderTradeLinkDraftWorkspace({detail,workspaceId:ws,view,canManage:true});
const record=content=>({id,board_id:TRADELINK_BOARD_ID,workspace_id:ws,board_item_id:item,revision:1,workflow_state:'draft',document_type:'quotation',document_number:content.documentNumber,content,archived_at:null,created_at:'2026-11-25T00:00:00Z',updated_at:'2026-11-25T00:00:00Z'});
const edit=content=>({...initialTradeLinkDraftView('quotation'),mode:'edit',selected:{documentId:id,record:record(content)}});

test('quotation contact controls have distinct labels, native types and autocomplete',()=>{
 const html=render(initialTradeLinkDraftView('quotation'));
 assert.match(html,/<span>Client email<\/span><input name="customerEmail"[^>]*type="email" autocomplete="email"/);
 assert.match(html,/<span>Client phone<\/span><input name="customerPhone"[^>]*type="tel" inputmode="tel" autocomplete="tel"/);
 assert.doesNotMatch(html,/Client (email|phone) \(or (email|phone)\)/);
});
test('Save accepts valid email and common local/international phone formatting without swapping or numeric coercion',()=>{
 for(const customerEmail of ['buyer@example.test','Buyer+sales@sub.example.test','a-b@example.test']){
  assert.equal(parse({customerEmail}).customerEmail,customerEmail);
 }
 for(const customerPhone of ['09171234567','+63 917 123 4567','(032) 123-4567','5550100','+63 (32) 123-4567 ext. 12','02 1234 5678 / 09171234567']){
  assert.equal(parse({customerPhone}).customerPhone,customerPhone);
 }
 const contacts={customerEmail:'buyer@example.test',customerPhone:'09171234567'};
 const command=prepareTradeLinkDraftCommand(initialTradeLinkDraftView('quotation'),fields(contacts),{documentId:()=>id});
 for(const key of Object.keys(contacts)){
  assert.equal(command.draft[key],contacts[key]);
  assert.equal(command.pendingCreateDraft[key],contacts[key]);
 }
 assert.equal(parse({}).customerEmail,undefined);
 assert.equal(parse({}).customerPhone,undefined);
});
test('Save rejects swapped, malformed or arbitrary text contact values',()=>{
 for(const customerEmail of ['09171234567','not an email','buyer@','buyer@example','a@-example.test','a@@example.test','a@exam!ple.test']){
  assert.throws(()=>parse({customerEmail}),/Invalid Quotation contact email/);
 }
 for(const customerPhone of ['buyer@example.test','Call office','N/A','---','+','123abc','123+456','123 ext.']){
  assert.throws(()=>parse({customerPhone}),/Invalid Quotation contact phone/);
 }
});
test('legacy records and unsaved recovery remain intact; correction is explicit on the next Save',()=>{
 const legacy={...base,customerEmail:'buyer@example.test',customerPhone:'old-contact@example.test'};
 const html=render(edit(legacy));
 assert.match(html,/name="customerPhone" value="old-contact@example.test"/);
 assert.ok(renderTradeLinkSavedDocumentOutput(record(legacy),ws,id).includes('old-contact@example.test'));
 assert.throws(()=>prepareTradeLinkDraftCommand(edit(legacy),fields(legacy)),/Invalid Quotation contact phone/);
 const corrected={...legacy,customerPhone:'09171234567'};
 const command=prepareTradeLinkDraftCommand(edit(legacy),fields(corrected));
 assert.equal(command.documentId,id);assert.equal(command.expectedRevision,1);
 assert.equal(command.draft.customerPhone,corrected.customerPhone);
 assert.equal(legacy.customerPhone,'old-contact@example.test');
 const raw={customerEmail:'  wrong value  ',customerPhone:'old-contact@example.test'};
 for(const key of Object.keys(raw))assert.equal(captureRecoveryFields(fields(raw))[key],raw[key]);
});
