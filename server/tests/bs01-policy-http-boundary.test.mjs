import test from 'node:test';
import assert from 'node:assert/strict';
import {BS01_POLICY_HTTP_ENABLED,createBoardPolicyHttpBoundary}
 from '../bs01-policy-http-boundary.mjs';

const actor='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
const board='33333333-3333-4333-8333-333333333333';
const ws='44444444-4444-4444-8444-444444444444';
const token=['a'.repeat(14),'b'.repeat(14),'c'.repeat(14)].join('.');
const origin='https://wass-psti.github.io';
function request(body,{method='POST',auth=true,originValue=origin,
 contentType='application/json'}={}){
 return new Request('https://example.invalid/functions/v1/bs01-policy',{
  method,headers:{Origin:originValue,'Content-Type':contentType,
   ...(auth?{Authorization:'Bearer '+token}:{})},
  ...(method==='POST'?{body:JSON.stringify(body)}:{})
 });
}
const receipt={schemaVersion:1,boardId:board,workspaceId:ws,
 externalSharing:'private',guestLinksEnabled:false,mayIssue:false};
const setup=(overrides={})=>{
 const calls=[];
 const fn=createBoardPolicyHttpBoundary({
  enabled:true,
  verifySignedActor:async jwt=>{
   calls.push(['verified',jwt]);
   return {id:actor,sessionId:sid,active:true,verified:true};
  },
  readAuthorizedPolicy:async(user,payload)=>{
   calls.push(['read',user,payload]);return receipt;
  },
  setAuthorizedPolicy:async(user,payload)=>{
   calls.push(['set',user,payload]);
   return {schemaVersion:1,boardId:board,externalSharing:payload.mode,
    revision:2,changed:true};
  },...overrides
 });
 return {fn,calls};
};
test('feature remains explicitly default disabled',async()=>{
 assert.equal(BS01_POLICY_HTTP_ENABLED,false);
 const disabled=createBoardPolicyHttpBoundary();
 const result=await disabled(request({action:'read',boardId:board}));
 assert.equal(result.status,503);
});
test('foreign origin and unauthenticated caller cannot reach adapters',async()=>{
 const {fn,calls}=setup();
 assert.equal((await fn(request({action:'read',boardId:board},
  {originValue:'https://attacker.invalid'}))).status,403);
 assert.equal((await fn(request({action:'read',boardId:board},
  {auth:false}))).status,401);
 assert.deepEqual(calls,[]);
});
test('valid signed read exposes only typed nonsecret receipt',async()=>{
 const {fn,calls}=setup();
 const response=await fn(request({action:'read',boardId:board}));
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(response.headers.get('access-control-allow-origin'),origin);
 assert.deepEqual(await response.json(),receipt);
 assert.equal(calls.length,2);
 assert.deepEqual(calls[1][2],{boardId:board});
});
test('write is bound to verified actor and exact board/revision',async()=>{
 const {fn,calls}=setup();
 const response=await fn(request({
  action:'set',boardId:board,mode:'private',expectedRevision:1,
  userId:'ffffffff-ffff-4fff-8fff-ffffffffffff',workspaceId:ws
 }));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{
  schemaVersion:1,boardId:board,externalSharing:'private',
  revision:2,changed:true
 });
 assert.deepEqual(calls[1][1],{id:actor,sessionId:sid});
 assert.deepEqual(calls[1][2],{
  boardId:board,mode:'private',expectedRevision:1
 });
});
test('invalid policy request is denied before any SQL adapter is called',async()=>{
 const {fn,calls}=setup();
 for(const payload of [
  {action:'read',boardId:'../../private'},
  {action:'set',boardId:board,mode:'public',expectedRevision:1},
  {action:'set',boardId:board,mode:'guest_shareable',expectedRevision:0},
  {action:'set',boardId:board,mode:'guest_shareable',expectedRevision:'1'},
  {action:'set',boardId:'not-a-uuid',mode:'private',expectedRevision:1}
 ])assert.equal((await fn(request(payload))).status,400);
 assert.equal(calls.filter(x=>x[0]==='read'||x[0]==='set').length,0);
});
test('denied manager, forged receipt and unverified actor fail closed',async()=>{
 const unauthorized=setup({setAuthorizedPolicy:async()=>{throw Error('secret sql details');}});
 const response=await unauthorized.fn(request({
  action:'set',boardId:board,mode:'guest_shareable',expectedRevision:1
 }));
 assert.equal(response.status,403);
 assert.deepEqual(await response.json(),{state:'denied'});
 const forged=setup({readAuthorizedPolicy:async()=>({...receipt,boardId:actor})});
 assert.equal((await forged.fn(request({action:'read',boardId:board}))).status,409);
 const unverified=setup({verifySignedActor:async()=>({
  id:actor,sessionId:sid,active:true,verified:false})});
 assert.equal((await unverified.fn(request({action:'read',boardId:board}))).status,401);
});
test('OPTIONS preflight does not require user token, foreign origin gets no CORS',async()=>{
 const {fn,calls}=setup();
 const allowed=await fn(request(undefined,{method:'OPTIONS',auth:false}));
 assert.equal(allowed.status,200);
 assert.equal(allowed.headers.get('access-control-allow-origin'),origin);
 const blocked=await fn(request(undefined,{
  method:'OPTIONS',auth:false,originValue:'https://attacker.invalid'
 }));
 assert.equal(blocked.status,403);
 assert.equal(blocked.headers.get('access-control-allow-origin'),null);
 assert.deepEqual(calls,[]);
});
