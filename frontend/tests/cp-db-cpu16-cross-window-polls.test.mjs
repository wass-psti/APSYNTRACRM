import test from 'node:test';
import assert from 'node:assert/strict';
import {PlatformSync,SYNC_RECONCILE_INTERVAL_MS,SYNC_POLL_RECOVERY_MS} from '../platform-sync.js';

const uid='20000000-0000-4000-8000-000000000001';
const workspace='10000000-0000-4000-8000-000000000001';
const otherWorkspace='10000000-0000-4000-8000-000000000002';
const board='30000000-0000-4000-8000-000000000001';

function shared(){
 const map=new Map();
 const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value);}};
 let locked=false;
 const locks={async request(name,options,callback){
  assert.equal(options.mode,'exclusive');
  assert.equal(options.ifAvailable,true);
  if(locked)return callback(null);
  locked=true;
  try{return await callback({name});}
  finally{locked=false;}
 }};
 return {storage,locks,map};
}
function windowClient(shared,{workspaceId=workspace,now=()=>1000000,connected=true}={}){
 const calls=[];
 const auth={isSignedIn:true,userId:uid};
 const sync=new PlatformSync({
  auth,api:{},url:'https://jtlusodorfnyzgyuewkz.supabase.co',
  WebSocketImpl:null,visible:()=>true,online:()=>true,
  now,storage:shared.storage,locks:shared.locks,
  onInvalidate:async event=>{calls.push(event);return true;},
  setIntervalFn:()=>1,clearIntervalFn:()=>{}
 });
 sync.running=true;sync.scope={userId:uid,workspaceId};sync.pollRecoveryAt=now();
 sync.boardIds=[board];sync.lastTransport=connected?'realtime':'polling';
 return {sync,calls};
}
test('two signed realtime tabs perform one shared periodic audit',async()=>{
 const clock={value:1000000},same=shared();
 const first=windowClient(same,{now:()=>clock.value});
 const second=windowClient(same,{now:()=>clock.value});
 await first.sync.pollTick(first.sync.generation);
 await second.sync.pollTick(second.sync.generation);
 assert.equal(first.calls.length,1);
 assert.equal(second.calls.length,0);
 assert.equal(first.calls[0].reason,'poll');
});
test('peer audits never prevent local recovery after bounded interval',async()=>{
 const clock={value:1000000},same=shared();
 const first=windowClient(same,{now:()=>clock.value});
 const second=windowClient(same,{now:()=>clock.value});
 await first.sync.pollTick(first.sync.generation);
 for(let step=1;step<4;step++){
  clock.value=1000000+step*SYNC_RECONCILE_INTERVAL_MS;
  await first.sync.pollTick(first.sync.generation);
  await second.sync.pollTick(second.sync.generation);
 }
 assert.ok(second.calls.length>=1,'each tab must eventually reconcile missed events');
 assert.ok(SYNC_POLL_RECOVERY_MS<=3*SYNC_RECONCILE_INTERVAL_MS);
});
test('workspace scope is isolated and cannot consume another workspace audit',async()=>{
 const same=shared(),one=windowClient(same),two=windowClient(same,{workspaceId:otherWorkspace});
 await one.sync.pollTick(one.sync.generation);
 await two.sync.pollTick(two.sync.generation);
 assert.equal(one.calls.length,1);
 assert.equal(two.calls.length,1);
});
test('polling fallback does not depend on peer coordination',async()=>{
 const same=shared(),one=windowClient(same,{connected:false}),two=windowClient(same,{connected:false});
 await one.sync.pollTick(one.sync.generation);
 await two.sync.pollTick(two.sync.generation);
 assert.equal(one.calls.length,1);
 assert.equal(two.calls.length,1);
});
test('unavailable browser coordination fails open to signed local polling',async()=>{
 const same=shared();
 const client=windowClient({storage:null,locks:null});
 await client.sync.pollTick(client.sync.generation);
 assert.equal(client.calls.length,1);
 const broken=windowClient({storage:{getItem(){throw Error('blocked');},setItem(){}},locks:same.locks});
 await broken.sync.pollTick(broken.sync.generation);
 assert.equal(broken.calls.length,1);
});
test('focus and realtime invalidations remain local and uncoordinated',async()=>{
 const same=shared(),one=windowClient(same),two=windowClient(same);
 await one.sync.pollTick(one.sync.generation);
 await two.sync.syncNow('focus',[]);
 await two.sync.syncNow('broadcast',[board]);
 assert.deepEqual(two.calls.map(x=>x.reason),['focus','broadcast']);
});
test('scope stop and generation changes cannot publish a stale audit marker',async()=>{
 const clock={value:1000000},same=shared();
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const one=windowClient(same,{now:()=>clock.value});
 one.sync.onInvalidate=async event=>{one.calls.push(event);await pending;return true;};
 const p=one.sync.pollTick(one.sync.generation);
 await Promise.resolve();
 one.sync.stop();release();
 await p;
 assert.equal(same.map.size,0);
});
test('failed authoritative reconciliation is not shared as success',async()=>{
 const same=shared(),one=windowClient(same),two=windowClient(same);
 one.sync.onInvalidate=async event=>{one.calls.push(event);return false;};
 await one.sync.pollTick(one.sync.generation);
 await two.sync.pollTick(two.sync.generation);
 assert.equal(two.calls.length,1);
});
test('concurrent contenders never issue parallel full periodic reconciliations',async()=>{
 const same=shared(),one=windowClient(same),two=windowClient(same);
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 one.sync.onInvalidate=async event=>{one.calls.push(event);await gate;return true;};
 const pending=one.sync.pollTick(one.sync.generation);
 await Promise.resolve();
 await two.sync.pollTick(two.sync.generation);
 assert.equal(one.calls.length,1);
 assert.equal(two.calls.length,0);
 release();await pending;
 assert.equal(same.map.size,1);
});
test('frequent broadcasts cannot indefinitely suppress each tab recovery audit',async()=>{
 const clock={value:1000000},same=shared();
 const one=windowClient(same,{now:()=>clock.value}),two=windowClient(same,{now:()=>clock.value});
 await one.sync.pollTick(one.sync.generation);
 clock.value+=SYNC_POLL_RECOVERY_MS;
 two.sync.lastCheckAt=clock.value-1000;
 await two.sync.pollTick(two.sync.generation);
 assert.equal(two.calls.length,1,'recovery overrides recent broadcast/focus check');
});
test('failed storage writes do not replay a completed authoritative poll',async()=>{
 const same=shared(),storage={getItem:key=>same.storage.getItem(key),setItem(){throw Error('storage disabled');}};
 const one=windowClient({storage,locks:same.locks});
 await one.sync.pollTick(one.sync.generation);
 assert.equal(one.calls.length,1);
});
