import test from 'node:test';
import assert from 'node:assert/strict';
import {
 runWs02dB3DeployedHttpsAcceptance,
 sanitizeWs02dB3DeployedHttpsReport,
 renderWs02dB3DeployedHttpsAcceptance,
 WS02D_B3_HTTPS_CHECKPOINT
} from '../workspace-b3-deployed-https-acceptance.js';
import {SUPABASE_PUBLISHABLE_KEY} from '../config.js';

const actor='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const bearer='synthetic_signed_token_'.repeat(5);
const origin='https://wass-psti.github.io';
const endpoint='https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-ws02d-b3-read';
const checks=['signed-identity','authoritative-workspace',
 'module-access-read','stable-signed-context'];
const data=()=>({
 checkpoint:'CP-WS-02D-B3-SIGNED-READ-PREFLIGHT',
 status:'PASS',checks:checks.map(name=>({name,status:'PASS'})),
 moduleProbeCount:12,authorizedModuleCount:7,
 identifiersDisclosed:0,writesAttempted:0,
 domainWritesVerified:0,providerDeliveriesVerified:0,
 acceptanceBoundary:'READ_ONLY_NOT_DOMAIN_WRITE_OR_EMAIL_ACCEPTANCE',
 trustBoundary:'SERVER_VERIFIED_GOTRUE_AND_USER_SCOPED_READ'
});
function fixture({response,after=actor,fetchFails=false}={}){
 let calls=0,sends=0;
 const auth={
  userId:actor,
  getVerifiedUser:async()=>({id:++calls===1?actor:after}),
  token:async()=>bearer
 };
 const fetchImpl=async(url,req)=>{
  sends++;
  assert.equal(url,endpoint);
  assert.equal(req.method,'GET');
  assert.equal(req.mode,'cors');
  assert.equal(req.redirect,'error');
  assert.equal(req.cache,'no-store');
  assert.equal(req.headers.Authorization,'Bearer '+bearer);
  assert.equal(req.headers.apikey,SUPABASE_PUBLISHABLE_KEY);
  assert.equal(req.headers.Accept,'application/json');
  assert.equal(typeof req.signal,'object');
  if(fetchFails)throw Error('Never reveal network errors');
  return response||Response.json(data(),{headers:{'Cache-Control':'no-store, max-age=0'}});
 };
 return {auth,fetchImpl,count:()=>({calls,sends})};
}

test('genuine signed browser acceptance adapter validates pinned route, token handling and strictly sanitized success',async()=>{
 const f=fixture();
 const r=await runWs02dB3DeployedHttpsAcceptance({...f,origin});
 assert.equal(r.checkpoint,WS02D_B3_HTTPS_CHECKPOINT);
 assert.equal(r.status,'PASS');
 assert.equal(r.stage,'signed-https-complete');
 assert.equal(r.moduleProbeCount,12);
 assert.equal(r.authorizedModuleCount,7);
 assert.equal(r.genuineDeployedReadVerified,true);
 assert.equal(r.independentTableRlsVerified,false);
 assert.equal(r.crossWorkspaceDenialVerified,false);
 assert.equal(r.revokedSessionDenialVerified,false);
 assert.deepEqual(f.count(),{calls:2,sends:1});
 const output=sanitizeWs02dB3DeployedHttpsReport(r);
 assert.equal(JSON.parse(output).status,'PASS');
 assert.doesNotMatch(JSON.stringify(r)+output,/synthetic_signed_token_|11111111|sb_publishable_|@example|refresh_token/);
 const html=renderWs02dB3DeployedHttpsAcceptance({result:r});
 assert.match(html,/Run deployed B3 signed HTTPS check/);
 assert.doesNotMatch(html,/synthetic_signed_token_|11111111|sb_publishable_/);
});

test('no signed browser, wrong origin or missing auth prevents outgoing network requests',async()=>{
 const f=fixture();
 assert.equal((await runWs02dB3DeployedHttpsAcceptance({...f,origin:'https://foreign.invalid'})).stage,'prerequisite');
 assert.equal((await runWs02dB3DeployedHttpsAcceptance({origin,fetchImpl:f.fetchImpl})).status,'BLOCKED');
 assert.equal(f.count().sends,0);
});

test('real host default-off response, gateway denial and network preflight failures cannot turn into a PASS',async()=>{
 for(const status of [401,403,503,429]){
  const f=fixture({response:Response.json({status:'BLOCKED'},{status})});
  const result=await runWs02dB3DeployedHttpsAcceptance({...f,origin});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.genuineDeployedReadVerified,false);
  assert.equal(result.stage,status===503?'application-disabled-or-unavailable':
   status===401||status===403?'gateway-denial':'network-or-preflight');
  assert.doesNotMatch(sanitizeWs02dB3DeployedHttpsReport(result),/synthetic_signed_token_/);
 }
 const f=fixture({fetchFails:true});
 const res=await runWs02dB3DeployedHttpsAcceptance({...f,origin});
 assert.equal(res.stage,'network-or-preflight');
 assert.equal(res.status,'BLOCKED');
});

test('200 HTTP is not PASS without exact sanitized server contract and no-store cache headers',async()=>{
 const variants=[
  {...data(),session_id:'secret'},
  {...data(),checks:[...data().checks.slice(0,3),data().checks[0]]},
  {...data(),checks:[...data().checks.slice(0,3),{name:'stable-signed-context',status:'FAIL'}]},
  {...data(),authorizedModuleCount:13},
  {...data(),moduleProbeCount:11},
  {...data(),identifiersDisclosed:1},
  {...data(),writesAttempted:1},
  {...data(),trustBoundary:'FAKE'},
 ];
 for(const body of variants){
  const f=fixture({response:Response.json(body,{headers:{'Cache-Control':'no-store'}})});
  const r=await runWs02dB3DeployedHttpsAcceptance({...f,origin});
  assert.equal(r.status,'FAIL');
  assert.equal(r.stage,'server-contract');
  assert.equal(r.moduleProbeCount,0);
 }
 const bad=fixture({response:Response.json(data())});
 assert.equal((await runWs02dB3DeployedHttpsAcceptance({...bad,origin})).status,'FAIL');
});

test('post-read signed actor drift fails closed, never printing IDs or bearer tokens',async()=>{
 const f=fixture({after:other});
 const r=await runWs02dB3DeployedHttpsAcceptance({...f,origin});
 assert.equal(r.status,'FAIL');
 assert.equal(r.stage,'session-changed');
 const sanitized=sanitizeWs02dB3DeployedHttpsReport(r);
 assert.doesNotMatch(sanitized,/11111111|22222222|synthetic_signed_token_/);
});

test('sanitizer never upgrades an untrusted claim of PASS into accepted evidence',()=>{
 const forged={status:'PASS',stage:'signed-https-complete',moduleProbeCount:12,
  authorizedModuleCount:99,genuineDeployedReadVerified:true,token:bearer};
 const safe=JSON.parse(sanitizeWs02dB3DeployedHttpsReport(forged));
 assert.equal(safe.status,'BLOCKED');
 assert.equal(safe.genuineDeployedReadVerified,false);
 assert.equal(safe.moduleProbeCount,0);
 assert.doesNotMatch(JSON.stringify(safe),/synthetic_signed_token_/);
});
