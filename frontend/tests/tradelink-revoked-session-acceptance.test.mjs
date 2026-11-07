import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 runTradeLinkLocalSessionRevocation,
 sanitizeTradeLinkRevocationReport,
 renderTradeLinkSessionRevocation,
 renderTradeLinkSignedOutRevocationResult
} from '../tradelink-revoked-session-acceptance.js';
import {SUPABASE_PUBLISHABLE_KEY} from '../config.js';

const now=1762530000000;
const jwt=exp=>'eyJhbGciOiJIUzI1NiJ9.'+
 Buffer.from(JSON.stringify({exp,sub:'11111111-1111-4111-8111-111111111111'})).toString('base64url')+
 '.synthetic_not_a_real_signature_1234567890';
const token=jwt(Math.floor((now+3600000)/1000));
const names=['signed-identity','effective-access','document-list',
 'missing-document-read','wrong-board-denial','stable-session'];
const manager=()=>({status:'PASS',scenario:'AUTHORIZED_MANAGER',
 checks:names.map(name=>({name,status:'PASS'})),
 writesAttempted:0,documentsDisclosed:0});
function setup({status=403,ack=true,before=manager(),jwtValue=token,network=false}={}){
 const counters={preflight:0,logout:0,fetch:0};
 const auth={
  accessToken:jwtValue,userId:'11111111-1111-4111-8111-111111111111',
  token:async()=>jwtValue,
  signOut:async({scope})=>{
   assert.equal(scope,'local');
   counters.logout++;
   auth.accessToken=null;
   return ack;
  }
 };
 const readRunner=async({auth:used,api})=>{
  assert.equal(used,auth);
  assert.deepEqual(api,{tag:'central'});
  counters.preflight++;
  return before;
 };
 const fetchImpl=async(url,opts)=>{
  counters.fetch++;
  assert.equal(url,'https://jtlusodorfnyzgyuewkz.supabase.co/rest/v1/rpc/tl03_documents_list');
  assert.equal(opts.method,'POST');
  assert.equal(opts.mode,'cors');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.headers.Authorization,'Bearer '+jwtValue);
  assert.equal(opts.headers.apikey,SUPABASE_PUBLISHABLE_KEY);
  assert.deepEqual(JSON.parse(opts.body),{
   p_board_id:'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',p_limit:1
  });
  if(network)throw Error('network blocked; synthetic');
  return {status};
 };
 return {auth,api:{tag:'central'},readRunner,fetchImpl,
  origin:'https://wass-psti.github.io',clock:()=>now,counters};
}

test('verified manager then explicit local signout and denied old JWT (403) is scoped PASS',async()=>{
 const x=setup();
 const result=await runTradeLinkLocalSessionRevocation(x);
 assert.equal(result.status,'PASS');
 assert.equal(result.stage,'revoked-rpc-denied');
 assert.equal(result.priorSignedManagerReadVerified,true);
 assert.equal(result.localSignoutAcknowledged,true);
 assert.equal(result.revokedTradeLinkReadDenied,true);
 assert.equal(result.denialHttpStatus,403);
 assert.deepEqual(x.counters,{preflight:1,logout:1,fetch:1});
 assert.equal(x.auth.accessToken,null);
 const sanitized=sanitizeTradeLinkRevocationReport(result);
 assert.doesNotMatch(sanitized,/synthetic_not_a_real_signature|11111111|sb_publishable_/);
});

test('401 is also a valid old-token denial; 200 is a real security FAIL',async()=>{
 const a=await runTradeLinkLocalSessionRevocation(setup({status:401}));
 assert.equal(a.status,'PASS');
 const b=await runTradeLinkLocalSessionRevocation(setup({status:200}));
 assert.equal(b.status,'FAIL');
 assert.equal(b.stage,'revoked-jwt-still-accepted');
 assert.equal(b.revokedTradeLinkReadDenied,false);
});

test('a denied or forged manager preflight preserves session and sends no replay',async()=>{
 for(const before of [
  {...manager(),scenario:'BOARD_MANAGER_DENIED'},
  {...manager(),checks:[{name:'signed-identity',status:'PASS'}]},
  {...manager(),writesAttempted:1},
  {...manager(),checks:[...manager().checks.slice(0,-1),{name:'signed-identity',status:'PASS'}]},
  {...manager(),status:'BLOCKED'}
 ]){
  const x=setup({before});
  const result=await runTradeLinkLocalSessionRevocation(x);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.stage,'manager-preflight-unavailable');
  assert.equal(x.counters.logout,0);
  assert.equal(x.counters.fetch,0);
  assert.equal(x.auth.accessToken,token);
 }
});

test('JWT expiry margins block before logout and prevent expiry false PASS',async()=>{
 const x=setup({jwtValue:jwt(Math.floor((now+30000)/1000))});
 const r=await runTradeLinkLocalSessionRevocation(x);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.stage,'token-too-close-to-expiration');
 assert.deepEqual(x.counters,{preflight:0,logout:0,fetch:0});
 const y=setup();
 let calls=0;
 y.clock=()=>++calls>=3?now+4000000:now;
 const s=await runTradeLinkLocalSessionRevocation(y);
 assert.equal(s.status,'INCONCLUSIVE');
 assert.equal(s.stage,'expired-during-probe');
 assert.equal(s.revokedTradeLinkReadDenied,false);
 assert.deepEqual(y.counters,{preflight:1,logout:1,fetch:0});
});

test('wrong origin or missing client never signs out or invokes HTTP',async()=>{
 const x=setup();
 const r=await runTradeLinkLocalSessionRevocation({...x,origin:'https://foreign.example'});
 assert.equal(r.status,'BLOCKED');
 assert.deepEqual(x.counters,{preflight:0,logout:0,fetch:0});
 const s=await runTradeLinkLocalSessionRevocation({...setup(),api:null});
 assert.equal(s.status,'BLOCKED');
});

test('unacknowledged signout and network errors cannot certify revoked-session denial',async()=>{
 const x=setup({ack:false});
 const r=await runTradeLinkLocalSessionRevocation(x);
 assert.equal(r.status,'INCONCLUSIVE');
 assert.equal(r.stage,'local-signout-not-acknowledged');
 assert.equal(x.counters.fetch,0);
 const y=setup({network:true});
 const n=await runTradeLinkLocalSessionRevocation(y);
 assert.equal(n.status,'INCONCLUSIVE');
 assert.equal(n.stage,'post-signout-network');
 assert.equal(y.counters.logout,1);
 const z=await runTradeLinkLocalSessionRevocation(setup({status:503}));
 assert.equal(z.status,'INCONCLUSIVE');
});

test('sanitizer refuses forged PASS and never exports the token or identifiers',()=>{
 const forged=JSON.parse(sanitizeTradeLinkRevocationReport({
  status:'PASS',stage:'revoked-rpc-denied',
  priorSignedManagerReadVerified:true,localSignoutAcknowledged:false,
  revokedTradeLinkReadDenied:true,denialHttpStatus:403,
  secret:token,userId:'11111111-1111-4111-8111-111111111111'
 }));
 assert.equal(forged.status,'BLOCKED');
 assert.equal(forged.revokedTradeLinkReadDenied,false);
 assert.equal(forged.domainWritesAttempted,0);
 assert.doesNotMatch(JSON.stringify(forged),/11111111|synthetic_not_a_real_signature|sb_publishable_/);
});

test('Security panel is two-step opt-in; signed-out summary exports only safe report',()=>{
 const idle=renderTradeLinkSessionRevocation();
 const armed=renderTradeLinkSessionRevocation({armed:true});
 assert.match(idle,/Prepare TradeLink session-revocation test/);
 assert.doesNotMatch(idle,/data-action="security-tl03-revoke-run"/);
 assert.match(armed,/data-action="security-tl03-revoke-run"/);
 assert.match(armed,/data-action="security-tl03-revoke-cancel"/);
 assert.match(armed,/CURRENT browser session/);
 const out=renderTradeLinkSignedOutRevocationResult({
  status:'PASS',stage:'revoked-rpc-denied',
  priorSignedManagerReadVerified:true,localSignoutAcknowledged:true,
  revokedTradeLinkReadDenied:true,denialHttpStatus:403,secret:token
 });
 assert.match(out,/Copy nonsecret TradeLink revocation report/);
 assert.doesNotMatch(out,/synthetic_not_a_real_signature|11111111/);
});

test('real UI wiring is scoped to security and displays result after local signout',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/renderTradeLinkSessionRevocation\(\{armed:state\.tl03RevokeArmed/);
 assert.match(app,/case 'security-tl03-revoke-arm'/);
 assert.match(app,/case 'security-tl03-revoke-cancel'/);
 assert.match(app,/case 'security-tl03-revoke-run'/);
 assert.match(app,/runTradeLinkLocalSessionRevocation\(\{auth,api:db\}\)/);
 assert.match(app,/renderTradeLinkSignedOutRevocationResult\(state\.tl03RevokedReport\)/);
 assert.match(app,/case 'security-tl03-revoke-copy'/);
});
