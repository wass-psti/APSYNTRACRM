import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WS02D_B3_SCOPED_RPC_ENABLED,createB3UserScopedRpc
} from '../ws02d-b3-user-scoped-rpc.mjs';
import {createB3TrustedReadStagingFixture}
 from '../ws02d-b3-signed-read-staging.mjs';
const origin='https://wass-psti.github.io';
const projectUrl='https://jtlusodorfnyzgyuewkz.supabase.co/';
const pub='sb_publishable_synthetic_no_secret_123456';
const actor='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sessionId='cccccccc-0000-4000-8000-000000000003';
const workspace='00000000-0000-4000-8000-000000000001';
const jwt=[
 'eyJhbGciOiJIUzI1NiJ9',
 Buffer.from(JSON.stringify({
  sub:actor,session_id:sessionId,role:'authenticated',
  exp:2000000000,is_anonymous:false
 })).toString('base64url'),'fake_signature_only_not_cryptographically_valid'
].join('.');
function fakeFetch(calls){
 return async (url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))
   return {ok:true,json:async()=>({id:actor,is_anonymous:false})};
  const name=url.split('/').at(-1);
  let payload;
  if(name==='wm_auth_access_context')
   payload={user_id:actor,workspace_id:workspace,
    profile:{status:'active',email:'must-be-removed@example.invalid'},
    secret:'must-be-removed'};
  else if(name==='has_module_access')
   payload=JSON.parse(options.body).p_module_id==='time-tracker';
  else throw new Error('Unexpected API method');
  return {ok:true,headers:{get:()=>null},
   text:async()=>JSON.stringify(payload)};
 };
}
function request(){
 return new Request('https://staging.example.invalid/ws02d-b3',{
  method:'GET',headers:{origin,authorization:'Bearer '+jwt}
 });
}
test('scoped RPC adapter disabled by default with no external request',async()=>{
 assert.equal(WS02D_B3_SCOPED_RPC_ENABLED,false);
 const calls=[];
 const reads=createB3UserScopedRpc({
  projectUrl,publishableKey:pub,fetchImpl:fakeFetch(calls)
 });
 await assert.rejects(reads.readSignedContext({jwt}),/unavailable/);
 await assert.rejects(reads.readSignedModuleAccess({jwt,p_module_id:'time-tracker'}),/unavailable/);
 assert.equal(calls.length,0);
});
test('only exact approved project and publishable key may receive a JWT',async()=>{
 for(const project of [
  'https://other-project.supabase.co/','https://evil.invalid/',
  'http://jtlusodorfnyzgyuewkz.supabase.co/',
  'https://user:pass@jtlusodorfnyzgyuewkz.supabase.co/',
  'https://jtlusodorfnyzgyuewkz.supabase.co/evil'
 ]){
  const calls=[];
  const r=createB3UserScopedRpc({
   enabled:true,projectUrl:project,publishableKey:pub,
   fetchImpl:fakeFetch(calls)
  });
  await assert.rejects(r.readSignedContext({jwt}),/unavailable/);
  assert.equal(calls.length,0);
 }
 for(const key of ['sb_secret_secretkey','service_role','']){
  const calls=[];
  const r=createB3UserScopedRpc({
   enabled:true,projectUrl,publishableKey:key,fetchImpl:fakeFetch(calls)
  });
  await assert.rejects(r.readSignedContext({jwt}),/unavailable/);
  assert.equal(calls.length,0);
 }
});
test('user-scoped calls match the signed frontend RPC names and omit user override',async()=>{
 const calls=[];
 const reads=createB3UserScopedRpc({
  enabled:true,projectUrl,publishableKey:pub,fetchImpl:fakeFetch(calls)
 });
 const context=await reads.readSignedContext({jwt});
 assert.deepEqual(context,{user_id:actor,workspace_id:workspace,
  profile:{status:'active'}});
 assert.equal(JSON.stringify(context).includes('@'),false);
 const yes=await reads.readSignedModuleAccess({jwt,p_module_id:'time-tracker'});
 const no=await reads.readSignedModuleAccess({jwt,p_module_id:'tradelink'});
 assert.deepEqual([yes,no],[true,false]);
 assert.deepEqual(calls.map(x=>x.url),[
  projectUrl+'rest/v1/rpc/wm_auth_access_context',
  projectUrl+'rest/v1/rpc/has_module_access',
  projectUrl+'rest/v1/rpc/has_module_access'
 ]);
 assert.deepEqual(calls.map(x=>JSON.parse(x.options.body)),[
  {},{p_module_id:'time-tracker'},{p_module_id:'tradelink'}
 ]);
 for(const x of calls){
  assert.equal(x.options.method,'POST');
  assert.equal(x.options.headers.authorization,'Bearer '+jwt);
  assert.equal(x.options.headers.apikey,pub);
  assert.equal(x.options.cache,'no-store');
  assert.equal(x.options.redirect,'error');
  assert.equal(typeof x.options.signal,'object');
 }
});
test('unknown RPC and provider failure reject without leaking actor or token',async()=>{
 const calls=[];
 const r=createB3UserScopedRpc({
  enabled:true,projectUrl,publishableKey:pub,fetchImpl:fakeFetch(calls)
 });
 await assert.rejects(r.readSignedModuleAccess({jwt,p_module_id:'secret-unknown'}),/unavailable/);
 assert.equal(calls.length,0);
 for(const response of [
  {ok:false,status:401},
  {ok:true,headers:{get:()=>null},text:async()=>'"true"'},
  {ok:true,headers:{get:()=>null},text:async()=>'"'.padEnd(8200,'x')},
  {ok:true,headers:{get:()=> '1000000'},text:async()=> 'true'}
 ]){
  const x=createB3UserScopedRpc({
   enabled:true,projectUrl,publishableKey:pub,
   fetchImpl:async()=>response
  });
  await assert.rejects(x.readSignedModuleAccess({jwt,p_module_id:'time-tracker'}),error=>{
   assert.equal(error.message,'Signed scoped read unavailable');
   assert.equal(error.message.includes(actor),false);
   return true;
  });
 }
});
test('composed staging handler performs Auth twice, DB twice, 12 RLS-scoped module RPCs',async()=>{
 const calls=[],queries=[];
 const handler=createB3TrustedReadStagingFixture({
  enabled:true,projectUrl,publishableKey:pub,
  fetchImpl:fakeFetch(calls),
  db:{query:async(sql,args)=>{
   queries.push({sql,args});
   return {rows:[{active:true}]};
  }},
  clock:()=>1900000000000
 });
 const r=await handler(request());
 assert.equal(r.status,200);
 const result=await r.json();
 assert.equal(result.status,'PASS');
 assert.equal(result.moduleProbeCount,12);
 assert.equal(result.authorizedModuleCount,1);
 assert.equal(result.writesAttempted,0);
 assert.equal(result.providerDeliveriesVerified,0);
 assert.equal(queries.length,2);
 assert.ok(queries.every(q=>q.args[0]===actor&&q.args[1]===sessionId));
 assert.equal(calls.filter(c=>c.url.endsWith('/auth/v1/user')).length,2);
 assert.equal(calls.filter(c=>c.url.endsWith('wm_auth_access_context')).length,2);
 assert.equal(calls.filter(c=>c.url.endsWith('has_module_access')).length,12);
 assert.doesNotMatch(JSON.stringify(result),/@|must-be-removed|Bearer|cccccccc/);
});
test('composed staging handler fail-closes on independently denied active session',async()=>{
 const calls=[];
 const handler=createB3TrustedReadStagingFixture({
  enabled:true,projectUrl,publishableKey:pub,
  fetchImpl:fakeFetch(calls),
  db:{query:async()=>({rows:[{active:false}]})},
  clock:()=>1900000000000
 });
 const r=await handler(request());
 assert.equal(r.status,401);
 assert.equal(calls.filter(c=>c.url.includes('/rpc/')).length,0);
});
