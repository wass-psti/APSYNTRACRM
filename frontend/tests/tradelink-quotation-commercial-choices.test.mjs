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
const render=(view=initialTradeLinkDraftView('quotation'))=>renderTradeLinkDraftWorkspace({detail,workspaceId:ws,view,canManage:true});
const fields=values=>new Map(Object.entries({documentType:'quotation',documentNumber:'Q-TEST-TERMS',customerName:'Synthetic client',...values}));
const parse=values=>parseTradeLinkDraftForm(fields(values),{purpose:'save'});
const choices={
 paymentTerms:['Select payment terms...','Due on Receipt','COD (Cash on Delivery)','15 Days PDC','30 Days PDC','50% DP-Balance upon completion','Advance payment prior to delivery','installment plans','30 Days Net','45 Days Net','60 Days Net','90 Days Net','Other (Custom)'],
 deliveryCommitment:['Select delivery time...','3 Days (in stock)','4 Weeks','6 Weeks','8 Weeks','12 Weeks','16 Weeks','20 Weeks','24 Weeks','Others (Custom)'],
 validity:['Select validity period...','15 Days','30 Days','60 Days','120 Days','6 Months','1 Year','Others (Custom Date)']
};

test('exact requested dropdown labels and order, optional custom input initially hidden',()=>{
 const html=render();
 assert.match(html,/Validity of Quotation/);
 for(const [name,expected] of Object.entries(choices)){
  const select=html.match(new RegExp('<select[^>]*name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))[1];
  assert.deepEqual([...select.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map(x=>x[1]),expected);
  assert.match(html,new RegExp('id="tl-quotation-'+name+'-custom" data-tl-commercial-custom hidden'));
 }
});
test('standard options and all custom values serialize to canonical fields, not UI sentinel or helper fields',()=>{
 for(const [key,values] of Object.entries(choices)){
  for(const value of values.slice(1,-1))assert.equal(parse({[key]:value,[key+'Custom']:'stale'})[key],value);
  assert.equal(parse({[key]:'__custom__',[key+'Custom']:'  custom value  '})[key],'custom value');
  assert.equal(parse({[key]:'__custom__',[key+'Custom']:''})[key],undefined);
  assert.throws(()=>parse({[key]:'__custom__',[key+'Custom']:'x'.repeat(5001)}),/Invalid TradeLink/);
 }
 const input={paymentTerms:'__custom__',paymentTermsCustom:'40% deposit',deliveryCommitment:'__custom__',deliveryCommitmentCustom:'10 working days',validity:'__custom__',validityCustom:'2027-01-15'};
 const command=prepareTradeLinkDraftCommand(initialTradeLinkDraftView('quotation'),fields(input),{documentId:()=>id});
 assert.equal(command.draft.paymentTerms,'40% deposit');
 assert.equal(command.draft.deliveryCommitment,'10 working days');
 assert.equal(command.draft.validity,'2027-01-15');
 assert.ok(!JSON.stringify(command.draft).includes('__custom__'));
 for(const key of Object.keys(choices))assert.equal(key+'Custom' in command.draft,false);
 assert.equal(captureRecoveryFields(fields(input)).validityCustom,'2027-01-15');
 const record={id,board_id:TRADELINK_BOARD_ID,workspace_id:ws,board_item_id:item,revision:1,workflow_state:'draft',document_type:'quotation',document_number:command.draft.documentNumber,content:command.draft,archived_at:null,created_at:'2026-11-25T00:00:00Z',updated_at:'2026-11-25T00:00:00Z'};
 const output=renderTradeLinkSavedDocumentOutput(record,ws,id);
 for(const value of ['40% deposit','10 working days','2027-01-15'])assert.ok(output.includes(value));
});
test('older free-text terms and standard values reopen without altering their saved meaning',()=>{
 const old=parse({paymentTerms:'Net 30 after installation',validity:'45 days',deliveryCommitment:'4 Weeks'});
 const record={id,board_id:TRADELINK_BOARD_ID,workspace_id:ws,board_item_id:item,revision:1,workflow_state:'draft',document_type:'quotation',document_number:old.documentNumber,content:old};
 const html=render({...initialTradeLinkDraftView('quotation'),mode:'edit',selected:{documentId:id,record}});
 assert.match(html,/name="paymentTermsCustom" value="Net 30 after installation"/);
 assert.match(html,/name="validityCustom" value="45 days"/);
 assert.match(html,/value="4 Weeks" selected/);
 assert.match(html,/id="tl-quotation-paymentTerms-custom" data-tl-commercial-custom>/);
 assert.match(html,/id="tl-quotation-deliveryCommitment-custom" data-tl-commercial-custom hidden/);
 assert.doesNotMatch(render(initialTradeLinkDraftView('po')),/data-tl-commercial-choice/);
});
