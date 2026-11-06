import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WS02D_B3_EDGE_SIGNED_READ_ENABLED,createB3EdgeSignedReadStaging
} from '../ws02d-b3-edge-signed-read.mjs';

const projectUrl='https://jtlusodorfnyzgyuewkz.supabase.co/';
const origin='https://wass-psti.github.io';
const pub='sb_publishable_disposable_staging_test_key';
const actor='11111111-1111-4111-8111-111111111111';
const session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspace='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const different='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const modules=new Set([
 'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
 'fund-released-tracker','fueltrans','order-intake','tool-traceability',
 'material-request-hub','aps-aims','employee-eval','charter-navigator'
]);
const claims=Object.freeze({
 sub:actor,session_id:session,role:'authenticated',
 iss:'https://jtlusodorfnyzgyuewkz.supabase.co/auth/v1',
 exp:2100000000
});
function jwt(c=claims){
 return [
  Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
  Buffer.from(JSON.stringify(c)).toString('base64url'),
  'synthetic_signature_not_valid_for_real_gotrue'
 ].join('.');
}
const token=jwt();
const endpoint='https://staging.example.invalid/ws02d-b3-signed-read';
const req=(method='GET',bearer=token,site=origin)=>
 new Request(endpoint,{method,headers:{
  origin:site,authorization:bearer?'Bearer '+bearer:'',apikey:pub
 }});
function fixture(overrides={}){
 const seen=[];
 let catalogReads=0,moduleReads=0;
 const mocked=async(url,options={})=>{
  const path=new URL(url).pathname;
  seen.push({path,options});
  assert.equal(new URL(url).origin,'https://jtlusodorfnyzgyuewkz.supabase.co');
  assert.equal(options.headers.apikey,pub);
  assert.equal(options.headers.authorization,'Bearer '+token);
  assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');
  if(path==='/auth/v1/user'){
   assert.equal(options.method,'GET');
   return new Response(JSON.stringify({id:overrides.authId??actor,is_anonymous:false}),{status:200});
  }
  assert.equal(options.method,'POST');
  const body=JSON.parse(options.body);
  if(path==='/rest/v1/rpc/wm_ws01_list'){
   assert.deepEqual(body,{});
   catalogReads++;
   if(overrides.catalogFailAt===catalogReads)
    return new Response('{"error":"revoked"}',{status:403});
   return Response.json({
    schemaVersion:1,userId:overrides.catalogActor??actor,
    activeWorkspaceId:overrides.catalogWorkspace??workspace,
    rows:[{id:overrides.catalogWorkspace??workspace,active:true}]
   });
  }
  if(path==='/rest/v1/rpc/wm_auth_access_context'){
   assert.deepEqual(body,{});
   return Response.json({user_id:actor,
    workspace_id:overrides.contextWorkspace??workspace,
    profile:{status:'active'}});
  }
  if(path==='/rest/v1/rpc/has_module_access'){
   assert.deepEqual(Object.keys(body),['p_module_id']);
   assert.ok(modules.has(body.p_module_id));
   moduleReads++;
   return Response.json(overrides.badPredicate?'true':moduleReads%2===0);
  }
  throw Error('Unexpected RPC attempted');
 };
 const handler=createB3EdgeSignedReadStaging({
  enabled:overrides.enabled??true,
  projectUrl:overrides.projectUrl??projectUrl,
  publishableKey:overrides.publishableKey??pub,
  fetchImpl:mocked,clock:()=>1900000000000
 });
 return {handler,seen,counters:()=>({catalogReads,moduleReads})};
}

test('Edge B3 host is default-disabled and cannot call any upstream',async()=>{
 assert.equal(WS02D_B3_EDGE_SIGNED_READ_ENABLED,false);
 const f=fixture({enabled:false});
 const res=await f.handler(req());
 assert.equal(res.status,503);
 assert.deepEqual(f.seen,[]);
});
test('invalid project URL or non-publishable key blocks upstream before authentication',async()=>{
 for(const overrides of [
  {projectUrl:'https://other-project.supabase.co/'},
  {projectUrl:'https://jtlusodorfnyzgyuewkz.supabase.co@evil.invalid/'},
  {publishableKey:'sb_secret_ineligible'},
  {publishableKey:''}
 ]){
  const f=fixture(overrides);
  assert.equal((await f.handler(req())).status,503);
  assert.deepEqual(f.seen,[]);
 }
});
test('strict origin, method, preflight and malformed bearer never access backend',async()=>{
 const f=fixture();
 const forbidden=await f.handler(req('GET',token,'https://foreign.invalid'));
 assert.equal(forbidden.status,403);
 assert.equal(forbidden.headers.get('access-control-allow-origin'),null);
 const options=await f.handler(req('OPTIONS'));
 assert.equal(options.status,200);
 assert.match(options.headers.get('access-control-allow-headers'),/apikey/);
 assert.equal((await f.handler(req('POST'))).status,405);
 for(const bad of ['', 'wrong',jwt({...claims,iss:'https://other.supabase.co/auth/v1'}),
  jwt({...claims,exp:100}),jwt({...claims,role:'service_role'})]){
  assert.equal((await f.handler(req('GET',bad))).status,401);
 }
 assert.deepEqual(f.seen,[]);
});
test('source-only signed read composes GoTrue, signed session catalog and twelve user-scoped predicates',async()=>{
 const f=fixture(),res=await f.handler(req());
 assert.equal(res.status,200,'Synthetic upstream sequence: '+f.seen.map(x=>x.path).join(','));
 const report=await res.json();
 assert.equal(report.status,'PASS');
 assert.equal(report.moduleProbeCount,12);
 assert.equal(report.authorizedModuleCount,6);
 assert.equal(report.trustBoundary,'SERVER_VERIFIED_GOTRUE_AND_USER_SCOPED_READ');
 assert.equal(report.identifiersDisclosed,0);
 assert.equal(report.writesAttempted,0);
 assert.equal(report.domainWritesVerified,0);
 assert.equal(report.providerDeliveriesVerified,0);
 assert.equal(report.checks.length,4);
 assert.deepEqual(f.counters(),{catalogReads:2,moduleReads:12});
 assert.equal(f.seen.filter(x=>x.path==='/auth/v1/user').length,2);
 assert.equal(f.seen.filter(x=>x.path==='/rest/v1/rpc/wm_auth_access_context').length,2);
 assert.equal(f.seen.length,18);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(actor+'|'+session+'|'+workspace+'|synthetic_signature'));
 assert.equal(res.headers.get('cache-control'),'no-store, max-age=0');
});
test('signed session revocation, forged identity, invalid predicate and workspace mismatch fail closed',async()=>{
 for(const [args,status] of [
  [{catalogFailAt:1},401],[{catalogFailAt:2},401],
  [{catalogActor:different},401],[{authId:different},401],
  [{contextWorkspace:different},403],[{badPredicate:true},503]
 ]){
  const f=fixture(args);
  const res=await f.handler(req());
  assert.equal(res.status,status,JSON.stringify({args,paths:f.seen.map(x=>x.path)}));
  const body=await res.text();
  assert.doesNotMatch(body,/11111111|aaaa-4aaa|bbbb-4bbb|synthetic_signature|GoTrue/);
 }
});
