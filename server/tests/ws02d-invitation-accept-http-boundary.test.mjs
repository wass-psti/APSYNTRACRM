import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvitationAcceptanceBoundary} from '../ws02d-invitation-accept-http-boundary.mjs';
const origin='https://wass-psti.github.io';
const url='https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/ws02d-accept';
const jwt='headerheaderhead.payloadpayloadpayload.signaturesignature';
const token='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.'+'bd'.repeat(32);
const actor={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 sessionId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',verified:true,active:true};
const receipt={schemaVersion:1,state:'accepted',workspaceId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',role:'member',switched:false};
const post=(body={token},headers={})=>new Request(url,{method:'POST',headers:{origin,authorization:'Bearer '+jwt,'content-type':'application/json',...headers},body:JSON.stringify(body)});
function setup(options={}){
 const calls={verified:0,accepted:0};
 const handler=createInvitationAcceptanceBoundary({enabled:true,
  verifySignedActor:async raw=>{calls.verified++;assert.equal(raw,jwt);return actor;},
  acceptForSignedRecipient:async(identity,secret)=>{
   calls.accepted++;assert.deepEqual(identity,{actorId:actor.id,sessionId:actor.sessionId});
   assert.equal(secret,token);return receipt;
  },...options});
 return {handler,calls};
}
test('disabled handler does not verify a JWT or accept a token',async()=>{
 const {handler,calls}=setup({enabled:false});
 const r=await handler(post());
 assert.equal(r.status,503);assert.deepEqual(calls,{verified:0,accepted:0});
});
test('origin, method, auth and request framing all fail closed',async()=>{
 const {handler,calls}=setup();
 assert.equal((await handler(post({token},{origin:'https://evil.invalid'}))).status,403);
 assert.equal((await handler(new Request(url,{method:'GET',headers:{origin}}))).status,405);
 assert.equal((await handler(new Request(url,{method:'OPTIONS',headers:{origin}}))).status,200);
 assert.equal((await handler(post({token},{authorization:'Bearer invalid'}))).status,401);
 assert.equal((await handler(post({token},{'content-type':'text/plain'}))).status,415);
 assert.equal((await handler(post({token},{'content-length':'900'}))).status,413);
 assert.deepEqual(calls,{verified:0,accepted:0});
});
test('reject malformed, extra-property, oversized and foreign-URL tokens without database call',async()=>{
 const {handler,calls}=setup();
 for(const value of ['', 'https://evil.invalid',token+'junk','../'+token,token.toUpperCase()])
  assert.equal((await handler(post({token:value}))).status,400);
 assert.equal((await handler(post({token,workspaceId:receipt.workspaceId}))).status,400);
 assert.equal((await handler(post({token,padding:'x'.repeat(550)}))).status,413);
 assert.equal(calls.accepted,0);
});
test('verified recipient receives a minimal safe membership receipt',async()=>{
 const {handler,calls}=setup();
 const response=await handler(post());
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.deepEqual(await response.json(),{state:'accepted',workspaceId:receipt.workspaceId,role:'member',switched:false});
 assert.deepEqual(calls,{verified:1,accepted:1});
});
test('revoked session and wrong authorization body do not accept',async()=>{
 for(const invalid of [{...actor,active:false},{...actor,verified:false},null]){
  const {handler,calls}=setup({verifySignedActor:async()=>invalid});
  assert.equal((await handler(post())).status,401);
  assert.equal(calls.accepted,0);
 }
});
test('denied, replayed, expired and foreign-scope errors never reveal token',async()=>{
 for(const reason of ['replay','expired','foreign workspace','wrong email']){
  const {handler}=setup({acceptForSignedRecipient:async()=>{throw Error(reason+' '+token);}});
  const response=await handler(post());
  assert.equal(response.status,403);
  const output=await response.text();
  assert.equal(output.includes(token),false);
  assert.equal(output.includes(reason),false);
 }
});
test('unexpected role and malformed acceptance receipts never claim success',async()=>{
 for(const result of [null,{...receipt,role:'admin'},{...receipt,switched:true},{...receipt,workspaceId:'bad'},
  {...receipt,state:'pending'},{...receipt,schemaVersion:2}]){
  const {handler}=setup({acceptForSignedRecipient:async()=>result});
  const response=await handler(post());
  assert.equal(response.status,409);
  assert.deepEqual(await response.json(),{state:'denied'});
 }
});
