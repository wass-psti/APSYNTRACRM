import test from 'node:test';
import assert from 'node:assert/strict';
import {initialTradeLinkDraftView,renderTradeLinkDraftWorkspace,parseTradeLinkDraftForm,prepareTradeLinkDraftCommand} from '../tradelink-draft-workspace.js';
import {captureRecoveryFields} from '../tradelink/draft-recovery-state.js';
import {renderTradeLinkSavedDocumentOutput} from '../tradelink-saved-document-output.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const ws='00000000-0000-4000-8000-000000000001';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const address='12 Test Street & Suite 4\nCebu City';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
const form=(value)=>new Map(Object.entries({documentType:'quotation',documentNumber:'Q-TEST-ADDRESS',customerName:'Synthetic client',customerAddress:value}));
const render=view=>renderTradeLinkDraftWorkspace({detail,workspaceId:ws,view,canManage:true});
const parse=value=>parseTradeLinkDraftForm(form(value),{purpose:'save'});
test('optional multiline Client Address appears immediately after Client Name only in Quotation',()=>{
 const html=render(initialTradeLinkDraftView('quotation'));
 assert.match(html,/Client Information[\s\S]*name="customerName"[\s\S]*Client Address<\/span><textarea name="customerAddress" rows="2" maxlength="5000">/);
 assert.doesNotMatch(render(initialTradeLinkDraftView('po')),/<textarea name="customerAddress"/);
});
test('address is optional, validated and included in exact Save command',()=>{
 assert.equal(parse(address).customerAddress,address);
 assert.equal(parse('   ').customerAddress,undefined);
 assert.throws(()=>parse('x'.repeat(5001)),/customerAddress/);
 const command=prepareTradeLinkDraftCommand(initialTradeLinkDraftView('quotation'),form(address),{documentId:()=>id});
 assert.equal(command.draft.customerAddress,address);
 assert.equal(command.pendingCreateDraft.customerAddress,address);
});
test('saved address reopens, escapes markup, prints and remains editable',()=>{
 const content=parse(address);
 const record={id,board_id:TRADELINK_BOARD_ID,workspace_id:ws,board_item_id:item,revision:1,workflow_state:'draft',document_type:'quotation',document_number:content.documentNumber,content,archived_at:null,created_at:'2026-11-25T00:00:00Z',updated_at:'2026-11-25T00:00:00Z'};
 const view={...initialTradeLinkDraftView('quotation'),mode:'edit',selected:{documentId:id,record}};
 assert.ok(render(view).includes('12 Test Street &amp; Suite 4\nCebu City'));
 assert.ok(renderTradeLinkSavedDocumentOutput(record,ws,id).includes('12 Test Street &amp; Suite 4\nCebu City'));
 const edited=prepareTradeLinkDraftCommand(view,form('New Address'),{documentId:()=>{throw Error('must reuse ID');}});
 assert.equal(edited.documentId,id);assert.equal(edited.expectedRevision,1);assert.equal(edited.draft.customerAddress,'New Address');
 assert.equal(prepareTradeLinkDraftCommand(view,form('')).draft.customerAddress,undefined);
 const malicious='</textarea><script>alert(1)</script>';
 assert.doesNotMatch(render({...view,formValues:{customerAddress:malicious}}),/<script>alert/);
});
test('local input preservation retains raw address including whitespace',()=>{
 const raw='  '+address+'  ';
 assert.equal(captureRecoveryFields(form(raw)).customerAddress,raw);
 assert.ok(render({...initialTradeLinkDraftView('quotation'),formValues:{customerAddress:raw}}).includes('  12 Test Street &amp; Suite 4\nCebu City  '));
});
