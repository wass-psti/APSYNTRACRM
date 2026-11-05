import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WS02D_GOTRUE_ACTOR_VERIFIER_ENABLED,createGoTrueActorVerifier
} from '../ws02d-gotrue-actor-verifier.mjs';
import {createTrustedInvitationHttpBoundary}
 from '../ws02d-invitation-http-boundary.mjs';

const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sessionId='cccccccc-0000-4000-8000-000000000003';
const inviteId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const future=2_000_000_000;
const base={sub:id,session_id:sessionId,role:'authenticated',
 exp:future,is_anonymous:false};
function jwt(claims=base){
 return ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
 Buffer.from(JSON.stringify(claims)).toString('base64url'),
 'synthetic-not-a-valid-signature'].join('.');
}
function setup(overrides={}){
 const calls={user:0,session:0};
 const getUserForToken=async token=>{
  calls.user++;
  assert.equal(typeof token,'string');
  return {data:{user:{id,is_anonymous:false}},error:null};
 };
 const assertActiveSession=async record=>{
  calls.session++;
  assert.deepEqual(record,{actorId:id,sessionId});
  return true;
 };
 return {
  calls,
  verify:createGoTrueActorVerifier({
   enabled:true,
   getUserForToken,assertActiveSession,clock:()=>1_900_000_000_000,
   ...overrides
  })
 };
}
test('disabled adapter rejects before touching Auth provider or database',async()=>{
 assert.equal(WS02D_GOTRUE_ACTOR_VERIFIER_ENABLED,false);
 const {calls,verify}=setup({enabled:false});
 await assert.rejects(verify(jwt()),/authentication denied/);
 assert.deepEqual(calls,{user:0,session:0});
 for(const unavailable of [
  {getUserForToken:undefined},{assertActiveSession:undefined}
 ]){
  const {verify:failClosed}=setup(unavailable);
  await assert.rejects(failClosed(jwt()),/authentication denied/);
 }
});
test('only valid, time-bounded, nonanonymous user JWT claims reach trusted Auth',async()=>{
 const {calls,verify}=setup();
 for(const input of [
  '', 'one.two', 'one.two.three.four','one.@@@.three',
  jwt({...base,sub:'invalid'}),
  jwt({...base,session_id:'invalid'}),
  jwt({...base,role:'service_role'}),
  jwt({...base,is_anonymous:true}),
  jwt({...base,exp:1_800_000_000}),
  jwt({...base,exp:'2000000000'}),
  jwt({...base,session_id:null})
 ]){
  await assert.rejects(verify(input),/authentication denied/);
 }
 assert.deepEqual(calls,{user:0,session:0});
});
test('getUser is authoritative; decoded claims alone never prove identity',async()=>{
 const mismatch=setup({getUserForToken:async()=>({
  data:{user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}},error:null
 })});
 await assert.rejects(mismatch.verify(jwt()),/authentication denied/);
 assert.equal(mismatch.calls.session,0);
 const invalid=setup({getUserForToken:async()=>({
  data:{user:{id}},error:{message:'rejected'}
 })});
 await assert.rejects(invalid.verify(jwt()),/authentication denied/);
 const anonymous=setup({getUserForToken:async()=>({
  data:{user:{id,is_anonymous:true}},error:null
 })});
 await assert.rejects(anonymous.verify(jwt()),/authentication denied/);
 const thrower=setup({getUserForToken:async()=>{throw new Error('secret');}});
 await assert.rejects(thrower.verify(jwt()),err=>{
  assert.equal(err.message,'Signed invitation authentication denied');return true;
 });
});
test('revoked/stale session denies even after successful Auth.getUser',async()=>{
 const revoked=setup({assertActiveSession:async()=>false});
 await assert.rejects(revoked.verify(jwt()),/authentication denied/);
 const inaccessible=setup({assertActiveSession:async()=>{throw Error('DB secret');}});
 await assert.rejects(inaccessible.verify(jwt()),err=>{
  assert.equal(err.message,'Signed invitation authentication denied');return true;
 });
 const {calls,verify}=setup();
 assert.deepEqual(await verify(jwt()),{
  id,sessionId,active:true,verified:true
 });
 assert.deepEqual(calls,{user:1,session:1});
 assert.equal(Object.isFrozen(await verify(jwt())),true);
});
test('staged HTTP boundary accepts only independently verified user and active session',async()=>{
 let emailCount=0,issued=0,recorded=0;
 const verifySignedActor=setup().verify;
 const handler=createTrustedInvitationHttpBoundary({
  enabled:true,verifySignedActor,
  issueForAuthorizedActor:async(actor,params)=>{
   assert.deepEqual(actor,{id,sessionId});
   assert.equal(params.role,'member');
   issued++;
   return {schemaVersion:1,invitationId:inviteId,
    state:'pending',idempotent:false,tokenAvailable:true,
    token:inviteId+'.'+'ab'.repeat(32)};
  },
  sendEmail:async()=>{
   emailCount++;
   return {accepted:true,
    providerMessageId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  },
  recordDeliveryOutcome:async()=>{
   recorded++;
   return {persisted:true};
  }
 });
 const request=new Request('https://example.invalid/ws02d',{
  method:'POST',
  headers:{origin:'https://wass-psti.github.io',
   authorization:'Bearer '+jwt(),'content-type':'application/json'},
  body:JSON.stringify({
   workspaceId:'00000000-0000-4000-8000-000000000001',
   requestId:'11111111-1111-4111-8111-111111111101',
   email:'synthetic-recipient@example.invalid',
   role:'member'
  })
 });
 const response=await handler(request);
 assert.equal(response.status,202);
 const text=await response.text();
 assert.equal(text.includes('ab'.repeat(32)),false);
 assert.equal(text.includes('synthetic-recipient@example.invalid'),false);
 assert.deepEqual({issued,emailCount,recorded},{issued:1,emailCount:1,recorded:1});
});
