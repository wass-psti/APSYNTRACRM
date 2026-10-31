import test from 'node:test';
import assert from 'node:assert/strict';
import {localStackConfig,jwtSessionProof,runLocalGoTrueSmoke} from '../../scripts/cp-frt-sec10-ci-auth-smoke.mjs';
const admin='11111111-1111-4111-8111-111111111111';
const member='22222222-2222-4222-8222-222222222222';
const status='API_URL="http://127.0.0.1:54321"\nANON_KEY="test-local-anon"\nSERVICE_ROLE_KEY="test-local-service"\n';
const ci={CI:'true',GITHUB_ACTIONS:'true',SEC10_CI_AUTH_SMOKE:'EPHEMERAL_ONLY'};
function token(id,n){
 const payload={sub:id,session_id:'33333333-3333-4333-8333-'+String(n).padStart(12,'0'),iat:1790000000+n};
 return 'header.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.signature';
}
test('reject hosted production and non-loopback URLs without network access',()=>{
 assert.throws(()=>localStackConfig(status,{...ci,CI:'false'}),/CI_ONLY/);
 assert.throws(()=>localStackConfig(status,{...ci,SEC10_CI_AUTH_SMOKE:'NO'}),/CI_ONLY/);
 for(const url of ['https://jtlusodorfnyzgyuewkz.supabase.co','http://192.168.1.2:54321',
  'http://localhost.evil.invalid:54321','http://127.0.0.1:54321@evil.invalid:443',
  'https://127.0.0.1:54321','http://127.0.0.1:54321/auth']){
  assert.throws(()=>localStackConfig(status.replace('http://127.0.0.1:54321',url),ci),
   /LOOPBACK_ENDPOINT_REQUIRED/);
 }
});
test('no data or credentials disclosed by config parser',()=>{
 const c=localStackConfig(status,ci);
 assert.equal(c.api,'http://127.0.0.1:54321');
 assert.equal(c.anonKey,'test-local-anon');
 assert.equal(c.serviceKey,'test-local-service');
 assert.throws(()=>jwtSessionProof('unverified'),/JWT_REQUIRED/);
});
test('two real-Auth protocol accounts and four distinct sessions, no production requests',async()=>{
 const calls=[];
 let seq=0;
 const fetcher=async(url,options)=>{
  const u=new URL(url);
  assert.equal(u.hostname,'127.0.0.1');
  const body=options.body?JSON.parse(options.body):{};
  const path=u.pathname;
  calls.push(path);
  const good=(data)=>({ok:true,status:200,json:async()=>data});
  if(path==='/auth/v1/admin/users'){
   const id=body.email.includes('administrator')?admin:member;
   assert.equal(body.email_confirm,true);
   assert.ok(body.email.endsWith('@example.invalid'));
   return good({id});
  }
  if(path==='/auth/v1/token'){
   const id=body.email.includes('administrator')?admin:member;
   return good({access_token:token(id,++seq)});
  }
  if(path==='/auth/v1/user'){
   const decoded=jwtSessionProof(options.headers.Authorization.slice(7));
   return good({id:decoded.userId});
  }
  if(path==='/auth/v1/logout')return good({});
  throw Error('UNEXPECTED_OUTBOUND_REQUEST');
 };
 const r=await runLocalGoTrueSmoke(localStackConfig(status,ci),fetcher);
 assert.equal(r.status,'PASS');
 assert.equal(r.realGoTrueSessionsVerified,4);
 assert.equal(r.crmRoleTransitionsVerified,0);
 assert.equal(r.productionTouched,false);
 assert.deepEqual(r.checks.map(c=>c.status),['PASS','PASS','PASS']);
 assert.equal(calls.filter(p=>p==='/auth/v1/admin/users').length,2);
 assert.equal(calls.filter(p=>p==='/auth/v1/token').length,4);
 assert.equal(calls.filter(p=>p==='/auth/v1/logout').length,4);
 assert.doesNotMatch(JSON.stringify(r),/test-local|eyJ|@example\.invalid/);
});
