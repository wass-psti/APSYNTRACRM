import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 initialTradeLinkDraftView,resetTradeLinkDraftForm,tradeLinkDraftHasUnsavedChanges
} from '../tradelink-draft-workspace.js';

const documentId='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const initial=initialTradeLinkDraftView('quotation');

test('new and selected Drafts begin clean and typed input is treated as unsaved',()=>{
 assert.equal(initial.unsavedChanges,false);
 assert.equal(tradeLinkDraftHasUnsavedChanges(initial),false);
 assert.equal(tradeLinkDraftHasUnsavedChanges({...initial,unsavedChanges:true}),true);
 const edit={...initial,mode:'edit',selected:{documentId,record:{
  id:documentId,revision:5,content:{documentType:'quotation'}}}};
 assert.equal(tradeLinkDraftHasUnsavedChanges(edit),false);
 assert.equal(tradeLinkDraftHasUnsavedChanges({...edit,unsavedChanges:true}),true);
 assert.equal(tradeLinkDraftHasUnsavedChanges({...edit,selected:null,unsavedChanges:true}),false);
 assert.equal(tradeLinkDraftHasUnsavedChanges({...edit,
  selected:{documentId:'invalid'},unsavedChanges:true}),false);
});
test('explicit Clear resets local dirty state but preserves no backend record',()=>{
 const modified={...initial,unsavedChanges:true,formValues:{
  documentType:'quotation',documentNumber:'Q-012',remarks:'Private draft notes'},
  lineDrafts:[{description:'Unsaved item',quantity:2,unitPrice:10}]};
 const cleared=resetTradeLinkDraftForm(modified);
 assert.equal(tradeLinkDraftHasUnsavedChanges(cleared),false);
 assert.equal(cleared.pendingCreateId,null);
 assert.equal(cleared.lineDrafts,null);
 assert.deepEqual(cleared.formValues,{documentType:'quotation'});
});
test('hash and refresh guards do not leak draft content or block signed access revocation',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/state\.tradeLinkDraft\.unsavedChanges=true/);
 assert.match(source,/unsavedChanges:false,error:'',message:'Signed Draft loaded/);
 assert.match(source,/tradeLinkDraftHasUnsavedChanges\(state\.tradeLinkDraft\)/);
 assert.match(source,/location\.replace\(approvedRouteHash\)/);
 assert.match(source,/rejectedRouteHash===nextHash/);
 assert.match(source,/addEventListener\('beforeunload',event=>/);
 assert.match(source,/event\.preventDefault\(\);\s*event\.returnValue=''/);
 assert.match(source,/if\(!state\.context\)\{\s*approvedRouteHash=nextHash;/);
 assert.match(source,/state\.tradeLinkDraft=resetTradeLinkDraftForm\(state\.tradeLinkDraft\)/);
 assert.doesNotMatch(source,/localStorage\.setItem\('TradeLink Draft/);
});
