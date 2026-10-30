import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeIssueTx,issueRowId,NativeIssueClient} from '../native-client.js';
const BOARD='11111111-1111-4111-8111-111111111111',WORK='22222222-2222-4222-8222-222222222222',ACTOR='33333333-3333-4333-8333-333333333333',ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('native browser adapter emits established native Issue classes and author fields',()=>{
 const tx=nativeIssueTx({kind:'create',actor:ACTOR,id:ID,attributes:{title:'Ready',status:'todo',priority:2}});
 assert.equal(tx._class,'core:class:TxCreateDoc');assert.equal(tx.modifiedBy,ACTOR);
 assert.equal(tx.objectClass,'tracker:class:Issue');
 const updated=nativeIssueTx({kind:'update',actor:ACTOR,id:ID,operations:{$inc:{priority:1}}});
 assert.equal(updated._class,'core:class:TxUpdateDoc');
 assert.deepEqual(updated.operations,{$inc:{priority:1}});
 assert.equal(nativeIssueTx({kind:'remove',actor:ACTOR,id:ID})._class,'core:class:TxRemoveDoc');
});
test('native browser adapter fails closed on protected fields and unknown operations',()=>{
 assert.throws(()=>nativeIssueTx({kind:'create',actor:ACTOR,id:ID,attributes:{_id:'spoof'}}));
 assert.throws(()=>nativeIssueTx({kind:'update',actor:ACTOR,id:ID,operations:{'evil.dotted':1}}));
 assert.throws(()=>nativeIssueTx({kind:'unknown',actor:ACTOR,id:ID}));
});
test('native client sends only bearer-authorized Supabase Edge RPC contract',async()=>{
 const calls=[];const api={nativeTransactions:async(b,w,txes)=>{
  calls.push({b,w,txes});return{receipts:[{id:'huly.issue.'+txes[0].objectId,boardId:b,workspaceId:w,revision:1}],applied:1};
 }};
 const client=new NativeIssueClient(api);
 const {id}=await client.create(BOARD,WORK,ACTOR,{title:'Safe'});
 assert.equal(calls[0].b,BOARD);assert.equal(calls[0].w,WORK);
 assert.equal(calls[0].txes[0].objectId,id);
 const row={document_id:'huly.issue.'+ID,payload:{snapshot:{_id:ID}}};
 assert.equal(issueRowId(row),ID);
 assert.throws(()=>issueRowId({document_id:'other',payload:row.payload}));
 const u=await client.update(BOARD,WORK,ACTOR,row,{title:'Updated'});
 assert.equal(u.id,row.document_id);
 const d=await client.remove(BOARD,WORK,ACTOR,row);
 assert.equal(d.id,row.document_id);
});
test('a failed receipt never reports native transaction success',async()=>{
 const client=new NativeIssueClient({nativeTransactions:async()=>({receipts:[{id:'wrong'}],applied:1})});
 await assert.rejects(()=>client.create(BOARD,WORK,ACTOR,{title:'No'}));
});
