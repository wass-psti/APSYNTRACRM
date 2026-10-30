import test from 'node:test';
import assert from 'node:assert/strict';
import {runDeniedQaWrite} from '../board-negative-write.js';
const U='11111111-1111-4111-8111-111111111111';
const WS='00000000-0000-4000-8000-000000000001';
const a={userId:U,getVerifiedUser:async()=>({id:U})};
const accepted={status:'pass',passed:12,scenario:'unassigned_nonadmin'};
function backend(extra={}){
 let calls=[];
 return {calls,
 context:async()=>({user_id:U,workspace_id:WS,profile:{status:'active',platform_role:'employee'}}),
 allowed:async()=>false,
 async addItem(...args){calls.push('add');throw Object.assign(new Error('denied'),{status:403,code:'42501'})},
 async deleteBoardItem(){calls.push('delete')},...extra};
}
test('signed unauthorized QA create is actually rejected with HTTP 403 / 42501',async()=>{
 const b=backend();
 const r=await runDeniedQaWrite(a,b,{verifiedReadOnlyResult:accepted});
 assert.equal(r.status,'pass');assert.deepEqual(b.calls,['add']);
});
test('ineligible report never submits any change',async()=>{
 const b=backend();
 const r=await runDeniedQaWrite(a,b,{verifiedReadOnlyResult:{status:'fail',passed:0}});
 assert.equal(r.status,'not_eligible');assert.deepEqual(b.calls,[]);
});
test('unexpected successful QA write attempts targeted cleanup and fails',async()=>{
 const b=backend({async addItem(){this.calls.push('add');return '33333333-3333-4333-8333-333333333333'}});
 const r=await runDeniedQaWrite(a,b,{verifiedReadOnlyResult:accepted});
 assert.equal(r.status,'fail');assert.equal(r.cleanupConfirmed,true);
 assert.deepEqual(b.calls,['add','delete']);
});
test('non-403 API errors never count as authorization success',async()=>{
 const b=backend({async addItem(){throw Object.assign(new Error('server error'),{status:500,code:'XX000'})}});
 const r=await runDeniedQaWrite(a,b,{verifiedReadOnlyResult:accepted});
 assert.equal(r.status,'fail');
});
test('cross-workspace scenario cannot silently reuse primary workspace auth session',async()=>{
 const b=backend();const r=await runDeniedQaWrite(a,b,{verifiedReadOnlyResult:{...accepted,scenario:'cross_workspace'}});
 assert.equal(r.status,'blocked');assert.deepEqual(b.calls,[]);
});
