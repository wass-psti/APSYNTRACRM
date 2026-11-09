import test from 'node:test';
import assert from 'node:assert/strict';
import {FuelTrackV3DomainClient} from '../fueltrack-v3-domain-client.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='11111111-1111-4111-8111-111111111111';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const snapshot={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,
 rows:[],summary:{total:0,submitted:0,approved:0,rejected:0,refuelingDone:0,completed:0}};
const calls=[];
const auth={isSignedIn:true};
const api={rpc:async(name,args)=>{calls.push({name,args});
 return name==='fueltrack_v3_read'?snapshot:{id,state:name==='fueltrack_v3_submit'?'submitted':
 name==='fueltrack_v3_decide'?'approved':name==='fueltrack_v3_mark_refueled'?'refueling_done':'completed',revision:1};}};
const client=()=>new FuelTrackV3DomainClient({api,auth,workspaceId:workspace,boardId:board});
test('signed request read checks exact authoritative workspace and board scopes',async()=>{
 calls.length=0;const result=await client().read({limit:50});
 assert.equal(result.status,'VERIFIED_READ');
 assert.deepEqual(calls[0],{name:'fueltrack_v3_read',args:{p_board_id:board,p_limit:50}});
 const foreign=new FuelTrackV3DomainClient({api:{rpc:async()=>({...snapshot,workspaceId:id})},auth,workspaceId:workspace,boardId:board});
 await assert.rejects(foreign.read(),/Invalid signed/);
});
test('submission forwards caller-preserved idempotency key, no generated identifiers',async()=>{
 calls.length=0;await client().submit({clientKey:key,kind:'vehicle',details:{plate:'GAN 8289'}});
 assert.equal(calls[0].name,'fueltrack_v3_submit');
 assert.equal(calls[0].args.p_client_key,key);
});
test('review, refuel and completion route to distinct transactional RPCs',async()=>{
 calls.length=0;
 await client().decide({requestId:id,expectedRevision:1,decision:'approved'});
 await client().markRefueled({requestId:id,expectedRevision:2});
 await client().complete({requestId:id,expectedRevision:3,actualAmount:500,fuelLiters:10});
 assert.deepEqual(calls.map(x=>x.name),[
 'fueltrack_v3_decide','fueltrack_v3_mark_refueled','fueltrack_v3_complete']);
});
test('signed-out, malformed payload, and invalid revisions fail before backend request',async()=>{
 calls.length=0;const c=client();
 auth.isSignedIn=false;
 await assert.rejects(c.read(),/signed session required/);
 auth.isSignedIn=true;
 await assert.rejects(c.submit({clientKey:'invalid',kind:'vehicle',details:{}}),/Invalid clientKey/);
 await assert.rejects(c.decide({requestId:id,expectedRevision:0,decision:'approved'}),/Invalid decision/);
 await assert.rejects(c.complete({requestId:id,expectedRevision:1,actualAmount:-10,fuelLiters:5}),/Invalid refueling receipt/);
 assert.equal(calls.length,0);
});
test('backend denials and errors are propagated without fabricated local success',async()=>{
 const c=new FuelTrackV3DomainClient({api:{rpc:async()=>{throw Object.assign(new Error('Denied'),{status:403});}},
  auth,workspaceId:workspace,boardId:board});
 await assert.rejects(c.read(),{status:403});
});


test('analytics and immutable audit reads use distinct signed RPCs',async()=>{
 const c=new FuelTrackV3DomainClient({api:{rpc:async(name,args)=>{
  calls.push({name,args});
  return name==='fueltrack_v3_analytics'?
   {status:'VERIFIED_READ',boardId:board,workspaceId:workspace,daily:[]}:
   {status:'VERIFIED_READ',boardId:board,workspaceId:workspace,events:[],hasMore:false};
 }},auth,workspaceId:workspace,boardId:board});
 calls.length=0;
 await c.analytics({days:30});
 await c.audit({beforeId:20,limit:40});
 assert.deepEqual(calls.map(x=>x.name),['fueltrack_v3_analytics','fueltrack_v3_audit_read']);
 assert.equal(calls[1].args.p_before_id,20);
 await assert.rejects(c.audit({beforeId:-1}),/Invalid audit cursor/);
});

test('a signed session invalidated during a pending read rejects the response',async()=>{
 const localAuth={isSignedIn:true,userId:id};
 const c=new FuelTrackV3DomainClient({
  api:{rpc:async()=>{localAuth.isSignedIn=false;return snapshot;}},
  auth:localAuth,workspaceId:workspace,boardId:board
 });
 await assert.rejects(c.read(),/signed session required/);
});
