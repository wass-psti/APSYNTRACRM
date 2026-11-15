import test from 'node:test';
import assert from 'node:assert/strict';
import {DomainApi} from '../data.js';

const USER='11111111-1111-4111-8111-111111111111';
const WORKSPACE='22222222-2222-4222-8222-222222222222';
const context=()=>({user_id:USER,workspace_id:WORKSPACE,profile:{status:'active',display_name:'QA'}});
const deferred=()=>{let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};};
function apiWith(auth={userId:USER,accessToken:'signed-token'}){
 const api=new DomainApi(auth);let calls=0;
 api.rpc=async name=>{assert.equal(name,'wm_auth_access_context');calls++;return context();};
 return {api,calls:()=>calls,setRpc(fn){api.rpc=fn;}};
}

test('overlapping signed context reads share one in-flight RPC',async()=>{
 const {api,calls,setRpc}=apiWith(),gate=deferred();
 setRpc(name=>{assert.equal(name,'wm_auth_access_context');return gate.promise;});
 const first=api.context(),second=api.context();
 await Promise.resolve();
 assert.equal(api.contextPending.size,1);
 gate.resolve(context());
 const [a,b]=await Promise.all([first,second]);
 assert.equal(calls(),0);
 assert.deepEqual(a,context());assert.deepEqual(b,context());
 assert.notEqual(a,b,'each caller receives an isolated snapshot');
 a.profile.status='mutated-locally';
 assert.equal(b.profile.status,'active');
 assert.equal(api.contextPending.size,0);
});

test('completed context reads are never cached',async()=>{
 const {api}=apiWith();let calls=0;
 api.rpc=async()=>{calls++;return context();};
 await api.context();await api.context();
 assert.equal(calls,2);
});

test('cache invalidation detaches an in-flight context read and rejects its stale result',async()=>{
 const {api}=apiWith();const firstGate=deferred();let calls=0;
 api.rpc=()=>{calls++;return calls===1?firstGate.promise:Promise.resolve(context());};
 const stale=api.context();
 await Promise.resolve();
 api.invalidateBoardCache();
 const fresh=api.context();
 assert.deepEqual(await fresh,context());
 firstGate.resolve(context());
 await assert.rejects(stale,error=>error.status===409);
 assert.equal(calls,2);
});

test('board-only invalidation does not discard an unrelated workspace context read',async()=>{
 const {api}=apiWith(),gate=deferred();let calls=0;
 api.rpc=()=>{calls++;return gate.promise;};
 const pending=api.context();
 await Promise.resolve();
 api.invalidateBoardCache('44444444-4444-4444-8444-444444444444');
 gate.resolve(context());
 assert.deepEqual(await pending,context());
 assert.equal(calls,1);
});

test('identity changes cannot reuse or commit a pending context read',async()=>{
 const auth={userId:USER,accessToken:'signed-token'};
 const {api}=apiWith(auth),gate=deferred();let calls=0;
 api.rpc=()=>{calls++;return gate.promise;};
 const stale=api.context();
 await Promise.resolve();
 auth.userId='33333333-3333-4333-8333-333333333333';
 auth.accessToken='different-token';
 const next=api.context();
 assert.equal(calls,2);
 gate.resolve(context());
 await assert.rejects(stale,error=>error.status===409);
 await assert.rejects(next,error=>error.status===403);
});

test('legacy adapters without an access token retain uncached authoritative reads',async()=>{
 const {api}=apiWith({userId:USER});let calls=0;
 api.rpc=async()=>{calls++;return context();};
 await api.context();await api.context();
 assert.equal(calls,2);
 assert.equal(api.contextPending.size,0);
});
