import test from 'node:test';
import assert from 'node:assert/strict';
import {WS02D_B3_SIGNED_READ_STAGING_ENABLED,createB3SignedReadStaging}
 from '../ws02d-b3-signed-read-staging.mjs';

const url='https://staging.example.invalid/ws02d-b3-read';
const origin='https://wass-psti.github.io';
const token='headerheaderheader.payloadpayloadpayload.signaturesignaturesignature';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionId='aaaaaaaa-0000-4000-8000-000000000001';
const workspace='00000000-0000-4000-8000-000000000001';
const actor={id,sessionId,active:true,verified:true};
const scope={user_id:id,workspace_id:workspace,profile:{status:'active'}};
function request(method='GET',t=token,originHeader=origin){
 return new Request(url,{method,headers:{
  origin:originHeader,authorization:t?'Bearer '+t:''
 }});
}
function fixture(overrides={}){
 const calls={auth:0,context:0,modules:[]};
 const deps={
  enabled:true,
  verifySignedActor:async jwt=>{
   calls.auth++;assert.equal(jwt,token);return {...actor};
  },
  readSignedContext:async({jwt})=>{
   calls.context++;assert.equal(jwt,token);return {...scope};
  },
  readSignedModuleAccess:async({jwt,p_module_id})=>{
   assert.equal(jwt,token);
   calls.modules.push(p_module_id);
   return calls.modules.length%2===0;
  },...overrides
 };
 return {calls,run:createB3SignedReadStaging(deps)};
}
test('staged B3 HTTP read is disabled without execution',async()=>{
 assert.equal(WS02D_B3_SIGNED_READ_STAGING_ENABLED,false);
 const {calls,run}=fixture({enabled:false});
 const r=await run(request());
 assert.equal(r.status,503);
 assert.deepEqual(calls,{auth:0,context:0,modules:[]});
});
test('strict method and origin; no authentication for OPTIONS or denied origin',async()=>{
 const {calls,run}=fixture();
 assert.equal((await run(request('GET',token,'https://evil.invalid'))).status,403);
 const options=await run(request('OPTIONS'));
 assert.equal(options.status,200);
 assert.equal(options.headers.get('access-control-allow-origin'),origin);
 assert.equal(options.headers.get('access-control-allow-methods'),'GET, OPTIONS');
 assert.equal((await run(request('POST'))).status,405);
 assert.deepEqual(calls,{auth:0,context:0,modules:[]});
});
test('missing, malformed and verification-rejected JWT cannot query scope',async()=>{
 const {calls,run}=fixture();
 for(const t of ['', 'bad','one.two.three','x'.repeat(11000)]){
  assert.equal((await run(request('GET',t))).status,401);
 }
 assert.deepEqual(calls,{auth:0,context:0,modules:[]});
 const denied=fixture({verifySignedActor:async()=>{throw Error('secret');}});
 const response=await denied.run(request());
 assert.equal(response.status,401);
 assert.doesNotMatch(await response.text(),/secret|Bearer/);
 assert.equal(denied.calls.context,0);
});
test('genuine-shaped successful read contains only four checks, twelve boolean module reads and no secrets',async()=>{
 const {calls,run}=fixture();
 const response=await run(request());
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const result=await response.json();
 assert.equal(result.checkpoint,'CP-WS-02D-B3-SIGNED-READ-PREFLIGHT');
 assert.equal(result.status,'PASS');
 assert.deepEqual(result.checks.map(x=>x.status),['PASS','PASS','PASS','PASS']);
 assert.equal(result.moduleProbeCount,12);
 assert.equal(result.authorizedModuleCount,6);
 assert.equal(result.identifiersDisclosed,0);
 assert.equal(result.writesAttempted,0);
 assert.equal(result.domainWritesVerified,0);
 assert.equal(result.providerDeliveriesVerified,0);
 assert.equal(result.trustBoundary,'SERVER_VERIFIED_GOTRUE_AND_USER_SCOPED_READ');
 assert.deepEqual({auth:calls.auth,context:calls.context},{auth:2,context:2});
 assert.equal(calls.modules.length,12);
 assert.equal(new Set(calls.modules).size,12);
 const output=JSON.stringify(result);
 assert.doesNotMatch(output,/aaaaaaaa-aaaa|00000000-0000|headerheader|payloadpayload|signaturesignature/);
 assert.doesNotMatch(output,/@|recipient|private\.ws02d_issue/);
});
test('wrong actor, foreign scope, inactive profile and invalid boolean cannot PASS',async()=>{
 const bad=[
 {verifySignedActor:async()=>({...actor,active:false})},
 {readSignedContext:async()=>({...scope,user_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})},
 {readSignedContext:async()=>({...scope,workspace_id:'bad'})},
 {readSignedContext:async()=>({...scope,profile:{status:'disabled'}})},
 {readSignedModuleAccess:async()=> 'true'},
 {readSignedModuleAccess:async()=>{throw Error('database secret');}}
 ];
 for(const overrides of bad){
  const r=await fixture(overrides).run(request());
  assert.notEqual(r.status,200);
  assert.doesNotMatch(await r.text(),/database secret|aaaaaaaa-aaaa/);
 }
});
test('revalidation after 12 reads catches revocation, actor switch and workspace switch',async()=>{
 let count=0;
 const revoked=fixture({verifySignedActor:async()=>{
  count++;return count===1?actor:{...actor,active:false};
 }});
 assert.equal((await revoked.run(request())).status,401);
 let seen=0;
 const moved=fixture({readSignedContext:async()=>{
  seen++;return seen===1?scope:{...scope,workspace_id:'00000000-0000-4000-8000-000000000002'};
 }});
 assert.equal((await moved.run(request())).status,401);
 const absent=fixture({readSignedModuleAccess:undefined});
 assert.equal((await absent.run(request())).status,503);
 assert.deepEqual(absent.calls,{auth:0,context:0,modules:[]});
});
