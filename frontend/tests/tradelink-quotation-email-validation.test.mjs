import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseTradeLinkDraftForm,initialTradeLinkDraftView,renderTradeLinkDraftWorkspace,
 tradeLinkDraftFieldForError,tradeLinkDraftSaveFailureMessage
} from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const EMAIL_ERROR='Invalid Quotation contact email. Enter an email address in Client email.';
const SERVER_EMAIL_ERROR='Invalid Quotation contact email.';
const fields=values=>({get:key=>values[key]??'',getAll:key=>[values[key]??'']});
const base={documentType:'quotation',documentNumber:'Q-EMAIL-VALIDATION-QA',
 customerName:'Synthetic quotation customer'};
const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,
 name:'TradeLink',description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},
 items:[],groups:[],columns:[]};

test('quotation email accepts the established local and international address formats',()=>{
 for(const customerEmail of ['client@example.com','Buyer+sales@sub.example.test','a-b@example.test',
  'a@b.c','buyer'+String.fromCharCode(96)+'name@example.com']){
  const draft=parseTradeLinkDraftForm(fields({...base,customerEmail}),{purpose:'save'});
  assert.equal(draft.customerEmail,customerEmail);
 }
 const phoneOnly=parseTradeLinkDraftForm(fields({...base,customerEmail:'',customerPhone:'09170000001'}),
  {purpose:'save'});
 assert.equal(phoneOnly.customerPhone,'09170000001');
 assert.equal(phoneOnly.customerEmail,undefined);
 const incomplete=parseTradeLinkDraftForm(fields({...base,customerEmail:''}),{purpose:'save'});
 assert.equal(incomplete.customerEmail,undefined);
});

test('quotation email rejects malformed and swapped contact values consistently with the current frontend contract',()=>{
 for(const customerEmail of ['test@email','bad-email','client @example.com','client@example .com',
  'a@@example.com','a@-example.test','a@exam!ple.test','buyer@example']){
  assert.throws(()=>parseTradeLinkDraftForm(fields({...base,customerEmail}),{purpose:'save'}),
   error=>error?.message===EMAIL_ERROR&&error.status===400);
 }
});

test('backend quotation email rejection maps to the same field-level error',()=>{
 const serverError={message:SERVER_EMAIL_ERROR,status:400,code:'22023'};
 assert.equal(tradeLinkDraftSaveFailureMessage(serverError),EMAIL_ERROR);
 assert.equal(tradeLinkDraftFieldForError(serverError),'customerEmail');
 assert.equal(tradeLinkDraftFieldForError(EMAIL_ERROR),'customerEmail');
 assert.equal(tradeLinkDraftFieldForError('Invalid TradeLink currency.'),null);
});

test('quotation email error renders beside the separate Client email field accessibly',()=>{
 const view={...initialTradeLinkDraftView('quotation'),error:EMAIL_ERROR};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId,view,canManage:true});
 assert.match(html,/<span>Client email<\/span><input name="customerEmail"[^>]*aria-invalid="true" aria-describedby="tl-quotation-contact-email-error"/);
 assert.match(html,/id="tl-quotation-contact-email-error" class="tl-draft-field-error" role="alert">Enter a valid email address in Client email\./);
 assert.doesNotMatch(html,/class="tl-draft-feedback" role="alert">Invalid Quotation contact email/);
 assert.match(html,/<span>Client phone<\/span><input name="customerPhone"[^>]*type="tel"/);
});

test('unrelated quotation errors keep the existing general alert without marking email invalid',()=>{
 const view={...initialTradeLinkDraftView('quotation'),error:'Invalid TradeLink currency.'};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId,view,canManage:true});
 assert.match(html,/class="tl-draft-feedback" role="alert">Invalid TradeLink currency\./);
 assert.doesNotMatch(html,/name="customerEmail"[^>]*aria-invalid="true"/);
 assert.doesNotMatch(html,/tl-quotation-contact-email-error/);
});
