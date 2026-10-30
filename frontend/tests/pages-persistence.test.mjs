import test from 'node:test';
import assert from 'node:assert/strict';
import {runPagesPersistenceAcceptance,AcceptanceError,QA_BOARD_NAME} from '../pages-persistence.js';
const U='11111111-1111-4111-8111-111111111111',W='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
const ctx={user_id:U,workspace_id:W,profile:{status:'active'}};
const qa={id:B,name:QA_BOARD_NAME};
function fake({editable=true,conflict=true,ledger=true}={}){
 const rows=new Map(),events=new Map(),calls=[];
 const api={auth:{userId:U},calls,
  async allowed(b,mode){calls.push('edit');assert.equal(b,B);assert.equal(mode,'edit');return editable},
  async createIssue(b,w,data,actor){
   calls.push('create');assert.equal(actor,U);
   const id='qa-'+crypto.randomUUID(),doc='huly.issue.'+id;
   rows.set(doc,{document_id:doc,revision:1,payload:{snapshot:{title:data.title}}});
   events.set(doc,[{event_type:'create',actor_id:U}]);return id;
  },
  async issues(){calls.push('read');return [...rows.values()].map(x=>structuredClone(x))},
  async updateIssue(b,w,row,changes){
   calls.push('update');rows.set(row.document_id,{...row,revision:2,
    payload:{snapshot:{...row.payload.snapshot,...changes}}});
   events.get(row.document_id).push({event_type:'update',actor_id:U});
  },
  async commit(){calls.push('cas');if(conflict)throw Object.assign(new Error('conflict'),{status:409})},
  async removeIssue(b,w,row){calls.push('remove');rows.delete(row.document_id);
   events.get(row.document_id).push({event_type:'remove',actor_id:U});},
  async issueEvents(b,w,id){calls.push('events');return ledger?events.get(id):[]}
 };return api;
}
test('signed Pages QA transaction accepts create/update/conflict/remove/audit',async()=>{
 const api=fake(),result=await runPagesPersistenceAcceptance(api,{board:qa,context:ctx});
 assert.equal(result.status,'pass');assert.equal(result.passed,6);
 assert.deepEqual(result.steps.map(x=>x.status),Array(6).fill('pass'));
 assert.equal(api.calls.filter(x=>x==='remove').length,1);
});
test('non-QA board is rejected before performing ANY backend action',async()=>{
 const api=fake();await assert.rejects(()=>runPagesPersistenceAcceptance(api,{board:{...qa,name:'Contacts'},context:ctx}),AcceptanceError);
 assert.deepEqual(api.calls,[]);
});
test('mismatched authentication identity fails before writes',async()=>{
 const api=fake();api.auth.userId=W;
 await assert.rejects(()=>runPagesPersistenceAcceptance(api,{board:qa,context:ctx}),AcceptanceError);
 assert.deepEqual(api.calls,[]);
});
test('lack of edit authorization returns failed, zero successful writes',async()=>{
 const api=fake({editable:false});
 const result=await runPagesPersistenceAcceptance(api,{board:qa,context:ctx});
 assert.equal(result.status,'fail');assert.equal(result.passed,0);assert.deepEqual(api.calls,['edit']);
});
test('stale CAS unexpectedly accepted fails and cleans up the QA issue',async()=>{
 const api=fake({conflict:false});
 const result=await runPagesPersistenceAcceptance(api,{board:qa,context:ctx});
 assert.equal(result.status,'fail');assert.equal(result.passed,3);
 assert.equal(result.cleanupConfirmed,true);
 assert.equal(api.calls.includes('remove'),true);
});
test('missing audit rows fails closed without fabricating success',async()=>{
 const api=fake({ledger:false});
 const result=await runPagesPersistenceAcceptance(api,{board:qa,context:ctx});
 assert.equal(result.status,'fail');assert.equal(result.passed,5);
});
