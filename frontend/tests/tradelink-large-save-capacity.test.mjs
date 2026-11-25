import test from 'node:test';
import assert from 'node:assert/strict';
import {TRADELINK_MAX_ITEMS,TRADELINK_MAX_PAYLOAD_BYTES,tradeLinkJsonbTextByteLength} from '../tradelink/limits.js';
import {RECOVERY_MAX_BYTES,createRecoverySnapshot} from '../tradelink/draft-recovery-state.js';
import {restoreTradeLinkPendingSave} from '../tradelink-draft-workspace.js';

const userId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const instanceId='33333333-3333-4333-8333-333333333333';
const documentId='44444444-4444-4444-8444-444444444444';

test('250-item 2 MiB pending save is compacted once and restored without loss',()=>{
 const lines=Array.from({length:TRADELINK_MAX_ITEMS},(_,index)=>({
  id:'line-'+(index+1),kind:'item',description:'Item '+(index+1),
  quantity:'1',unitPrice:'10',unit:index===0?'':'pc'
 }));
 const items=lines.map(line=>({
  id:line.id,kind:line.kind,description:line.description,
  quantity:1,unitPrice:10,...(line.unit?{unit:line.unit}:{})
 }));
 items[0].unit='';
 const draft={documentType:'quotation',documentNumber:'Q-LARGE-250',items};
 const baseBytes=tradeLinkJsonbTextByteLength(draft);
 const unit='x'.repeat(TRADELINK_MAX_PAYLOAD_BYTES-baseBytes);
 lines[0].unit=unit;
 items[0].unit=unit;
 assert.equal(tradeLinkJsonbTextByteLength(draft),TRADELINK_MAX_PAYLOAD_BYTES);

 const pendingSave={
  command:{documentId,expectedRevision:0,draft,initialState:'draft',reviseApproved:false},
  receipt:null,uncertain:true
 };
 const snapshot=createRecoverySnapshot({
  userId,workspaceId,documentType:'quotation',instanceId,
  fields:{documentType:'quotation',documentNumber:'Q-LARGE-250'},
  lines,pendingSave
 });

 assert.equal(snapshot.lines.length,250);
 assert.equal(snapshot.pendingSave.itemsStoredInLines,true);
 assert.equal(Object.hasOwn(snapshot.pendingSave.command.draft,'items'),false);
 assert.ok(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength<RECOVERY_MAX_BYTES);

 const restored=restoreTradeLinkPendingSave(snapshot.pendingSave,snapshot.lines);
 assert.equal(restored.itemsStoredInLines,undefined);
 assert.deepEqual(restored.command.draft.items,items);
 assert.equal(restored.command.draft.items[0].unit.length,unit.length);
});

test('recovery refuses more than 250 line snapshots and duplicate line identities',()=>{
 const lines=Array.from({length:TRADELINK_MAX_ITEMS+1},(_,index)=>({
  id:'line-'+(index+1),kind:'item',description:'Item '+(index+1),
  quantity:'1',unitPrice:'10',unit:'pc'
 }));
 const pendingSave={
  command:{documentId,expectedRevision:0,
   draft:{documentType:'quotation',documentNumber:'Q-251',
    items:lines.map(line=>({id:line.id,kind:'item',description:line.description,quantity:1,unitPrice:10,unit:line.unit}))},
   initialState:'draft',reviseApproved:false},
  receipt:null,uncertain:true
 };
 assert.throws(()=>createRecoverySnapshot({
  userId,workspaceId,documentType:'quotation',instanceId,
  fields:{documentType:'quotation'},lines,pendingSave
 }),/Invalid recovery snapshot\./);
 const duplicateLines=lines.slice(0,2).map(line=>({...line}));
 duplicateLines[1].id=duplicateLines[0].id;
 const duplicatePending={
  ...pendingSave,
  command:{...pendingSave.command,draft:{...pendingSave.command.draft,
   items:pendingSave.command.draft.items.slice(0,2).map(item=>({...item,id:duplicateLines[0].id}))}}
 };
 assert.throws(()=>createRecoverySnapshot({
  userId,workspaceId,documentType:'quotation',instanceId,
  fields:{documentType:'quotation'},lines:duplicateLines,pendingSave:duplicatePending
 }),/Invalid recovery snapshot\.|Pending save items do not match/);
});
