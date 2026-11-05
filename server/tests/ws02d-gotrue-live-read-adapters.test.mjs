import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WS02D_LIVE_READ_ADAPTERS_ENABLED,
 WS02D_ACTIVE_SESSION_SQL,
 createGoTrueUserReader,
 createLiveSessionAuthority,
 createTrustedSignedActorReadVerifier
} from '../ws02d-gotrue-live-read-adapters.mjs';
import {createGoTrueActorVerifier}
 from '../ws02d-gotrue-actor-verifier.mjs';

const projectUrl='https://jtlusodorfnyzgyuewkz.supabase.co/';
const pub='sb_publishable_synthetic_no_secret_123456';
const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const session='cccccccc-0000-4000-8000-000000000003';
const fakeToken=[
 'eyJhbGciOiJIUzI1NiJ9',
 Buffer.from(JSON.stringify({
  sub:id,session_id:session,role:'authenticated',
  exp:2000000000,is_anonymous:false
 })).toString('base64url'),
 'synthetic_not_signed'
].join('.');
function reader(extra={}){
 const calls=[];
 const read=createGoTrueUserReader({
  enabled:true,projectUrl,publishableKey:pub,
  fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return {
    ok:true,
    json:async()=>({
     id,email:'sensitive@example.invalid',
     user_metadata:{role:'superadmin'},
     app_metadata:{provider:'email'},
     is_anonymous:false
    })
   };
  },
  ...extra
 });
 return {read,calls};
}

test('backend read adapters are disabled until explicitly wired',async()=>{
 assert.equal(WS02D_LIVE_READ_ADAPTERS_ENABLED,false);
 const {calls,read}=reader({enabled:false});
 await assert.rejects(read(fakeToken),/lookup unavailable/);
 assert.equal(calls.length,0);
 let dbCalls=0;
 const active=createLiveSessionAuthority({db:{
  query:async()=>{dbCalls++;return {rows:[{active:true}]};}
 }});
 assert.equal(await active({actorId:id,sessionId:session}),false);
 assert.equal(dbCalls,0);
});

test('trusted reader sends only user JWT and publishable key to exact GoTrue endpoint',async()=>{
 const {read,calls}=reader();
 const result=await read(fakeToken);
 assert.deepEqual(result,{data:{user:{id,is_anonymous:false}},error:null});
 assert.equal(JSON.stringify(result).includes('sensitive@example.invalid'),false);
 assert.equal(JSON.stringify(result).includes('superadmin'),false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,projectUrl+'auth/v1/user');
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.authorization,'Bearer '+fakeToken);
 assert.equal(calls[0].options.headers.apikey,pub);
 assert.equal(calls[0].options.redirect,'error');
 assert.equal(calls[0].options.cache,'no-store');
 assert.equal(typeof calls[0].options.signal,'object');
 assert.equal(Object.isFrozen(result.data.user),true);
});

test('Auth reader rejects arbitrary hosts, untrusted credentials, redirects and provider errors',async()=>{
 const badUrls=[
  'http://jtlusodorfnyzgyuewkz.supabase.co/',
  'https://example.invalid/',
  'https://jtlusodorfnyzgyuewkz.supabase.co.evil.invalid/',
  'https://u:p@jtlusodorfnyzgyuewkz.supabase.co/',
  'https://jtlusodorfnyzgyuewkz.supabase.co/auth/v1/user',
  'https://jtlusodorfnyzgyuewkz.supabase.co/?leak=1'
 ];
 for(const url of badUrls){
  const {read,calls}=reader({projectUrl:url});
  await assert.rejects(read(fakeToken),/lookup unavailable/);
  assert.equal(calls.length,0);
 }
 for(const key of ['sb_secret_synthetic_key','service_role', '']){
  const {read,calls}=reader({publishableKey:key});
  await assert.rejects(read(fakeToken),/lookup unavailable/);
  assert.equal(calls.length,0);
 }
 for(const fake of [
  async()=>({ok:false,status:401}),
  async()=>({ok:true,json:async()=>({id:'invalid'})}),
  async()=>({ok:true,json:async()=>({id,is_anonymous:true})}),
  async()=>{throw new Error('token '+fakeToken);},
  async()=>({ok:true,json:async()=>{throw Error('leaked');}})
 ]){
  const {read}=reader({fetchImpl:fake});
  await assert.rejects(read(fakeToken),error=>{
   assert.equal(error.message,'Trusted GoTrue user lookup unavailable');
   assert.equal(error.message.includes(fakeToken),false);
   return true;
  });
 }
});

test('session read query has only constant SELECT with parameterized actor and session',async()=>{
 assert.match(WS02D_ACTIVE_SESSION_SQL,/^SELECT EXISTS\(/);
 assert.match(WS02D_ACTIVE_SESSION_SQL,/s\.id=\$2::uuid/);
 assert.match(WS02D_ACTIVE_SESSION_SQL,/s\.user_id=\$1::uuid/);
 assert.match(WS02D_ACTIVE_SESSION_SQL,/s\.not_after/);
 assert.match(WS02D_ACTIVE_SESSION_SQL,/u\.deleted_at IS NULL/);
 assert.match(WS02D_ACTIVE_SESSION_SQL,/p\.status='active'/);
 assert.match(WS02D_ACTIVE_SESSION_SQL,/m\.active IS TRUE/);
 assert.doesNotMatch(WS02D_ACTIVE_SESSION_SQL,/\b(INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i);
 const observations=[];
 const active=createLiveSessionAuthority({enabled:true,db:{
  query:async(query,params)=>{
   observations.push({query,params});
   return {rows:[{active:true}]};
  }
 }});
 assert.equal(await active({actorId:id,sessionId:session}),true);
 assert.deepEqual(observations,[{
  query:WS02D_ACTIVE_SESSION_SQL,params:[id,session]
 }]);
});

test('session reader strictly denies revoked/missing/expired or malformed DB results',async()=>{
 const deniedOutputs=[
  {rows:[{active:false}]},{rows:[]},
  {rows:[{active:'true'}]},{rows:[{active:1}]},
  {rows:[{active:true},{active:false}]},null
 ];
 for(const result of deniedOutputs){
  const active=createLiveSessionAuthority({
   enabled:true,db:{query:async()=>result}
  });
  assert.equal(await active({actorId:id,sessionId:session}),false);
 }
 let calls=0;
 const active=createLiveSessionAuthority({enabled:true,db:{
  query:async()=>{calls++;return {rows:[{active:true}]};}
 }});
 assert.equal(await active({actorId:'invalid',sessionId:session}),false);
 assert.equal(await active({actorId:id,sessionId:'invalid'}),false);
 assert.equal(calls,0);
 const inaccessible=createLiveSessionAuthority({enabled:true,db:{
  query:async()=>{throw Error('sensitive postgres credentials');}
 }});
 assert.equal(await inaccessible({actorId:id,sessionId:session}),false);
});

test('end-to-end staged adapter wiring rejects a revoked database session after real-Auth-shaped response',async()=>{
 const observations=[];
 const {read}=reader();
 const db={query:async(q,params)=>{
  observations.push(params);
  return {rows:[{active:observations.length===1}]};
 }};
 const verify=createGoTrueActorVerifier({
  enabled:true,getUserForToken:read,
  assertActiveSession:createLiveSessionAuthority({enabled:true,db}),
  clock:()=>1900000000000
 });
 const first=await verify(fakeToken);
 assert.deepEqual(first,{id,sessionId:session,active:true,verified:true});
 await assert.rejects(verify(fakeToken),/authentication denied/);
 assert.deepEqual(observations,[[id,session],[id,session]]);
});

test('one factory composes true GoTrue-shaped read and parameterized live session check',async()=>{
 let fetched=0,queried=0;
 const verifier=createTrustedSignedActorReadVerifier({
  enabled:true,
  projectUrl,publishableKey:pub,
  fetchImpl:async()=>{fetched++;return {ok:true,json:async()=>({id})};},
  db:{query:async(_sql,params)=>{
   queried++;
   assert.deepEqual(params,[id,session]);
   return {rows:[{active:true}]};
  }},
  clock:()=>1900000000000
 });
 const actor=await verifier(fakeToken);
 assert.deepEqual(actor,{id,sessionId:session,active:true,verified:true});
 assert.deepEqual({fetched,queried},{fetched:1,queried:1});
 const disabled=createTrustedSignedActorReadVerifier({
  projectUrl,publishableKey:pub,fetchImpl:async()=>{fetched++;},
  db:{query:async()=>{queried++;return {rows:[{active:true}]};}}
 });
 await assert.rejects(disabled(fakeToken),/authentication denied/);
 assert.deepEqual({fetched,queried},{fetched:1,queried:1});
});
