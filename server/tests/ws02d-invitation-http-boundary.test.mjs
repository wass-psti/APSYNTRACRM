import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WS02D_INVITE_HTTP_ENABLED,createTrustedInvitationHttpBoundary
} from '../ws02d-invitation-http-boundary.mjs';

const url='https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/ws02d-invite';
const origin='https://wass-psti.github.io';
const wrongOrigin='https://evil.invalid';
const token='headerheaderhead.payloadpayloadpayload.signaturesignature';
const actor={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 sessionId:'cccccccc-0000-4000-8000-000000000003',
 active:true,verified:true};
const invitationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const inviteToken=invitationId+'.'+'cd'.repeat(32);
const draft={
 workspaceId:'00000000-0000-4000-8000-000000000001',
 requestId:'11111111-1111-4111-8111-111111111101',
 email:'recipient@example.invalid',role:'member',message:'Join the team'
};
function post(body=draft,headers={}){
 return new Request(url,{
  method:'POST',
  headers:{
   origin,authorization:'Bearer '+token,
   'content-type':'application/json',...headers
  },body:JSON.stringify(body)
 });
}
function build(overrides={}){
 const calls={verified:0,issued:0,sent:0,recorded:0};
 const verifySignedActor=async jwt=>{
  calls.verified++;
  assert.equal(jwt,token);
  return actor;
 };
 const issueForAuthorizedActor=async(verified,params)=>{
  calls.issued++;
  assert.deepEqual(verified,{id:actor.id,sessionId:actor.sessionId});
  assert.equal(params.role,'member');
  return {
   schemaVersion:1,invitationId,token:inviteToken,
   state:'pending',idempotent:false,tokenAvailable:true
  };
 };
 const sendEmail=async message=>{
  calls.sent++;
  assert.match(message.text,/#\/invitations\/accept\//);
  return {accepted:true,providerMessageId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
 };
 const recordDeliveryOutcome=async receipt=>{
  calls.recorded++;
  assert.equal(receipt.invitationId,invitationId);
  assert.ok(['provider-accepted','delivery-uncertain'].includes(receipt.state));
  if(receipt.state==='provider-accepted'){
   assert.equal(receipt.providerMessageId,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  }else assert.equal(receipt.providerMessageId,null);
  return {persisted:true};
 };
 return {
  calls,handler:createTrustedInvitationHttpBoundary({
   enabled:true,verifySignedActor,issueForAuthorizedActor,sendEmail,
   recordDeliveryOutcome,
   ...overrides
  })
 };
}
test('endpoint disabled by default; no provider or authorization callback executed',async()=>{
 assert.equal(WS02D_INVITE_HTTP_ENABLED,false);
 const {calls,handler}=build({enabled:false});
 const response=await handler(post());
 assert.equal(response.status,503);
 assert.equal((await response.json()).state,'unavailable');
 assert.deepEqual(calls,{verified:0,issued:0,sent:0,recorded:0});
});
test('CORS exact origin and HTTP method enforce zero side effects',async()=>{
 const {calls,handler}=build();
 const foreign=await handler(post(draft,{origin:wrongOrigin}));
 assert.equal(foreign.status,403);
 assert.equal(foreign.headers.get('access-control-allow-origin'),null);
 const preflight=await handler(new Request(url,{
  method:'OPTIONS',headers:{origin}
 }));
 assert.equal(preflight.status,200);
 assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 const get=await handler(new Request(url,{method:'GET',headers:{origin}}));
 assert.equal(get.status,405);
 assert.deepEqual(calls,{verified:0,issued:0,sent:0,recorded:0});
});
test('missing/incorrect JWT and non-verified session fail before issue',async()=>{
 const {calls,handler}=build();
 for(const auth of ['', 'Bearer malformed.jwt', 'Bearer '+token+'\r\nInjection']){
  let r;
  try{
   r=await handler(post(draft,{authorization:auth}));
  }catch(error){
   // Node Request rejects header CR/LF before our handler; still fail closed.
   assert.match(error.message,/header|invalid/i);
   continue;
  }
  assert.equal(r.status,401);
 }
 assert.equal(calls.issued,0);
 assert.equal(calls.sent,0);
 const denied=build({verifySignedActor:async()=>({
  ...actor,active:false
 })});
 assert.equal((await denied.handler(post())).status,401);
 assert.equal(denied.calls.issued,0);
 const stale=build({verifySignedActor:async()=>{throw new Error(inviteToken);}});
 const r=await stale.handler(post());
 assert.equal(r.status,401);
 assert.equal(JSON.stringify(await r.json()).includes(inviteToken),false);
});
test('strict JSON input/size/role bound and registered identity',async()=>{
 const {calls,handler}=build();
 for(const bad of [
  {...draft,role:'admin'},
  {...draft,email:'not-an-email'},
  {...draft,requestId:'bad'},
  {...draft,message:'X'.repeat(501)}
 ]){
  assert.equal((await handler(post(bad))).status,400);
 }
 assert.equal((await handler(post(draft,{
  'content-type':'text/plain'
 }))).status,415);
 assert.equal((await handler(post(draft,{
  'content-length':'999999'
 }))).status,413);
 assert.equal((await handler(post(draft,{
  'content-length':'invalid'
 }))).status,413);
 const oversize=JSON.stringify({...draft,padding:'x'.repeat(4100)});
 const oversized=new Request(url,{
  method:'POST',headers:{origin,authorization:'Bearer '+token,
   'content-type':'application/json'},body:oversize
 });
 assert.equal((await handler(oversized)).status,400);
 assert.equal(calls.issued,0);
 assert.equal(calls.sent,0);
});
test('verified user -> signed private issuance -> mock provider, no secret response',async()=>{
 const {calls,handler}=build();
 const response=await handler(post());
 assert.equal(response.status,202,'Unexpected fail-closed stage: '+JSON.stringify(calls));
 assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('access-control-allow-origin'),origin);
 assert.deepEqual(await response.json(),{
  state:'delivery-submitted',invitationId
 });
 assert.deepEqual(calls,{verified:1,issued:1,sent:1,recorded:1});
});
test('durable delivery ledger adapter is mandatory before issuance',async()=>{
 const {calls,handler}=build({recordDeliveryOutcome:undefined});
 const r=await handler(post());
 assert.equal(r.status,503);
 assert.deepEqual(calls,{verified:0,issued:0,sent:0,recorded:0});
});

test('database and provider errors produce uniform denial without secret exposure',async()=>{
 for(const overrides of [
  {issueForAuthorizedActor:async()=>{throw new Error('secret '+inviteToken);}},
  {sendEmail:async()=>{throw new Error('provider failed '+inviteToken);}}
 ]){
  const {handler}=build(overrides);
  const response=await handler(post());
  assert.equal(response.status,403);
  const serialized=await response.text();
  assert.equal(serialized.includes(inviteToken),false);
  assert.equal(serialized.includes(draft.email),false);
  assert.deepEqual(JSON.parse(serialized),{state:'denied'});
 }
});
