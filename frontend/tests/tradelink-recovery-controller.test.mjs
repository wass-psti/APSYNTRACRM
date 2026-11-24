import test from 'node:test';
import assert from 'node:assert/strict';
import {TradeLinkRecoveryController} from '../tradelink/draft-recovery-controller.js';
const identity={userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspaceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',documentType:'quotation',instanceId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'};
function harness(){
 let now=10000,seq=0;const timers=new Map(),writes=[],statuses=[];
 const store={async save(s){writes.push(s);},async remove(){return true;}};
 const controller=new TradeLinkRecoveryController({store,now:()=>now,schedule:(fn,ms)=>{timers.set(++seq,{fn,at:now+ms});return seq;},cancel:id=>timers.delete(id),onStatus:(id,status)=>statuses.push(status)});
 async function advance(ms){const end=now+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await new Promise(setImmediate);}now=end;}
 const capture=text=>controller.capture(identity,{documentType:'quotation',remarks:text},[]);
 return {controller,store,writes,statuses,advance,capture,timers};
}
test('750ms debounce and unchanged snapshots produce no idle writes',async()=>{
 const h=harness();h.capture('a');await h.advance(500);h.capture('b');await h.advance(749);assert.equal(h.writes.length,0);await h.advance(1);assert.equal(h.writes.length,1);assert.equal(h.writes[0].fields.remarks,'b');h.capture('b');await h.advance(10000);assert.equal(h.writes.length,1);assert.equal(h.timers.size,0);
});
test('continuous editing checkpoints at 3 seconds',async()=>{
 const h=harness();h.capture('0');for(let i=1;i<=5;i++){await h.advance(500);h.capture(String(i));}await h.advance(500);assert.equal(h.writes.length,1);assert.equal(h.writes[0].fields.remarks,'5');
});
test('failed transaction reports failure and explicit retry preserves latest input',async()=>{
 const h=harness();const save=h.store.save;h.store.save=async()=>{throw Error('abort');};h.capture('a');await h.advance(750);assert.equal(h.statuses.at(-1),'failed');assert.equal(h.timers.size,0);h.store.save=save;await h.controller.flushAll();assert.equal(h.statuses.at(-1),'saved');assert.equal(h.writes[0].version,1);
});
test('input arriving during a write is serialized and not lost',async()=>{
 const h=harness();let release;const save=h.store.save;h.store.save=async s=>{await save(s);if(s.version===1)await new Promise(r=>release=r);};h.capture('a');const first=h.controller.flush(identity.instanceId);h.capture('b');await new Promise(setImmediate);release();await first;await h.advance(750);assert.deepEqual(h.writes.map(s=>[s.version,s.fields.remarks]),[[1,'a'],[2,'b']]);
});
