import test from 'node:test';
import assert from 'node:assert/strict';
import {readSignedConfig,tokenClaims,runCol01SignedHttp}
 from '../../scripts/cp-board-col01-signed-http.mjs';
const ref='jtlusodorfnyzgyuewkz';
const admin='11111111-1111-4111-8111-111111111111';
const member='22222222-2222-4222-8222-222222222222';
const board='33333333-3333-4333-8333-333333333333';
const foreign='44444444-4444-4444-8444-444444444444';
const workspace='55555555-5555-4555-8555-555555555555';
const key='sb_publishable_'+('a'.repeat(35));
function config(){
 return {COL01_PROJECT_REF:ref,COL01_SUPABASE_URL:'https://'+ref+'.supabase.co/',
  COL01_PRODUCTION_READ_ONLY:'ACKNOWLEDGED',COL01_WORKSPACE_ID:workspace,
  COL01_BOARD_ID:board,COL01_FOREIGN_BOARD_ID:foreign,
  COL01_PUBLISHABLE_KEY:key,COL01_ADMIN_EMAIL:'owner@example.invalid',
  COL01_ADMIN_PASSWORD:'dummy-owner-password',
  COL01_MEMBER_EMAIL:'member@example.invalid',
  COL01_MEMBER_PASSWORD:'dummy-member-password'};
}
const encode=(user,n,exp)=>'hdr.'+Buffer.from(JSON.stringify({
 sub:user,session_id:'66666666-6666-4666-8666-'+String(n).padStart(12,'0'),
 iat:exp-3600,exp})).toString('base64url')+'.signature';
const now=()=>Math.floor(Date.now()/1000);
function mock({allowRevoked=false,allowForeign=false,badMemberManage=false}={}){
 let sequence=0,currentSeconds=now();
 const logout=new Set(),calls=[];
 const fetcher=async(url,opts)=>{
  const u=new URL(url);
  assert.equal(u.hostname,ref+'.supabase.co');
  const path=u.pathname;
  const body=opts.body?JSON.parse(opts.body):{};
  const token=opts.headers.Authorization?.slice(7);
  calls.push({path,method:opts.method});
  const yes=(data,status=200)=>({ok:true,status,json:async()=>data});
  const no=(status=401)=>({ok:false,status,json:async()=>({code:'denied'})});
  if(path==='/auth/v1/token'){
   const user=body.email.startsWith('owner@')?admin:member;
   return yes({access_token:encode(user,++sequence,currentSeconds+3600)});
  }
  if(!token)return no();
  const proof=tokenClaims(token);
  if(proof.exp<currentSeconds)return no();
  if(path==='/auth/v1/logout'){logout.add(token);return yes({});}
  if(logout.has(token)&&!allowRevoked)return no();
  if(path==='/auth/v1/user')return yes({id:proof.user});
  if(path==='/rest/v1/rpc/wm_auth_access_context'){
   return yes({user_id:proof.user,workspace_id:workspace});
  }
  if(path==='/rest/v1/rpc/wm_list_board_events_page')return yes([]);
  if(path==='/rest/v1/rpc/work_board_access'){
   if(body.p_board_id===foreign)return yes(allowForeign);
   if(body.p_required==='manage')return yes(proof.user===admin||badMemberManage);
   return yes(true);
  }
  return no(404);
 };
 return {fetcher,calls,nowSeconds:()=>currentSeconds,sleep:async ms=>{currentSeconds+=Math.ceil(ms/1000);}};
}
test('configuration requires explicit production read-only intent and distinct signed test accounts',()=>{
 const good=readSignedConfig(config());
 assert.equal(good.ref,ref);
 assert.equal(good.revoke,false);
 const base=config();
 for(const e of [
  {...base,COL01_PRODUCTION_READ_ONLY:''},
  {...base,COL01_SUPABASE_URL:'https://attacker.invalid/'},
  {...base,COL01_SUPABASE_URL:'https://'+ref+'.supabase.co.evil.invalid/'},
  {...base,COL01_BOARD_ID:foreign},
  {...base,COL01_MEMBER_EMAIL:base.COL01_ADMIN_EMAIL},
  {...base,COL01_PUBLISHABLE_KEY:'secret'},
 ])assert.throws(()=>readSignedConfig(e));
 assert.equal(readSignedConfig({...base,COL01_REVOKE_DISPOSABLE_SESSION:'YES'}).revoke,false);
 assert.equal(readSignedConfig({...base,COL01_REVOKE_DISPOSABLE_SESSION:'YES',
  COL01_TEST_ACCOUNTS_DISPOSABLE:'YES'}).revoke,true);
});
test('real HTTPS protocol harness requires actor, workspace, roles, revoked and expired gates',async()=>{
 const env={...config(),COL01_REVOKE_DISPOSABLE_SESSION:'YES',
  COL01_TEST_ACCOUNTS_DISPOSABLE:'YES',COL01_NEAR_EXPIRY_ACCESS_TOKEN:encode(member,99,now()+10)};
 const {fetcher,calls,nowSeconds,sleep}=mock();
 const out=await runCol01SignedHttp(env,fetcher,{nowSeconds,sleep});
 assert.equal(out.status,'VERIFIED');
 assert.deepEqual(out.tests.map(x=>x.status),Array(6).fill('PASS'));
 assert.equal(out.productionMutations,0);
 assert.equal(calls.filter(x=>x.path==='/auth/v1/token').length,3);
 assert.equal(calls.filter(x=>x.path==='/auth/v1/logout').length,3);
 assert.doesNotMatch(JSON.stringify(out),/owner@example|member@example|Bearer|sb_publishable/);
});
test('stale revoked token and missing expired credentials remain blocked',async()=>{
 const {fetcher,nowSeconds,sleep}=mock({allowRevoked:true});
 const env={...config(),COL01_REVOKE_DISPOSABLE_SESSION:'YES',
  COL01_TEST_ACCOUNTS_DISPOSABLE:'YES',COL01_EXPIRED_ACCESS_TOKEN:encode(member,99,now()-50)};
 const out=await runCol01SignedHttp(env,fetcher,{nowSeconds,sleep});
 assert.equal(out.status,'BLOCKED');
 assert.equal(out.tests.find(x=>x.name==='fresh-disposable-session-revocation')?.status,'FAIL');
 const absent=await runCol01SignedHttp(config(),mock().fetcher);
 assert.equal(absent.status,'BLOCKED');
 assert.ok(absent.tests.some(x=>x.status==='PENDING'));
 const missing=await runCol01SignedHttp({},fetcher);
 assert.equal(missing.status,'BLOCKED');
});
test('cross-workspace and nonadmin manage grants fail closed',async()=>{
 for(const options of [{allowForeign:true},{badMemberManage:true}]){
  const out=await runCol01SignedHttp(config(),mock(options).fetcher);
  assert.equal(out.status,'BLOCKED');
  assert.equal(out.reason,'ROLE_OR_WORKSPACE_BOUNDARY_FAILED');
 }
});
test('malformed JWT cannot produce real acceptance',async()=>{
 assert.throws(()=>tokenClaims('unknown'),/INVALID_SIGNED_JWT/);
 assert.throws(()=>tokenClaims('x.e30.y'),/SIGNED_SESSION_PROOF_MISSING/);
 const out=await runCol01SignedHttp(config(),async()=>({
  ok:true,status:200,json:async()=>({access_token:'bad'})
 }));
 assert.equal(out.status,'BLOCKED');
 assert.equal(out.reason,'INVALID_SIGNED_JWT');
});
