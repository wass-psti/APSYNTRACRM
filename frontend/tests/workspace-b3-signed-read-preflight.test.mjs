import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WS02D_B3_READ_CHECKPOINT,runWs02dB3SignedReadPreflight,
 sanitizeWs02dB3SignedReport,renderWs02dB3SignedPreflight
} from '../workspace-b3-signed-read-preflight.js';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
function fixture({badType=false,rpcDenied=false,identityChanged=false,expired=false}={}){
 const calls=[],state={reads:0,context:0};
 const auth={userId:actor,getVerifiedUser:async()=>{
  if(expired)throw new Error('session expired');
  return {id:identityChanged&&state.reads>0?foreign:actor};
 }};
 const api={context:async()=>{
  state.context++;return {user_id:actor,workspace_id:workspace,profile:{status:'active'}};
 },rpc:async(name,args)=>{
  calls.push({name,args});state.reads++;
  if(rpcDenied)throw Object.assign(new Error('denied'),{status:403});
  assert.equal(name,'has_module_access');
  assert.equal('p_user_id' in args,false);
  return badType&&state.reads===3?'true':state.reads%2===0;
 }};
 return {auth,api,calls};
}
test('B3 user-triggered read preflight uses exactly twelve signed self-access RPCs',async()=>{
 const {auth,api,calls}=fixture();
 const result=await runWs02dB3SignedReadPreflight({auth,api});
 assert.equal(result.checkpoint,WS02D_B3_READ_CHECKPOINT);
 assert.equal(result.status,'PASS');
 assert.deepEqual(result.checks.map(x=>x.status),Array(4).fill('PASS'));
 assert.equal(result.moduleProbeCount,12);
 assert.equal(result.authorizedModuleCount,6);
 assert.equal(result.writesAttempted,0);
 assert.equal(result.domainWritesVerified,0);
 assert.equal(result.providerDeliveriesVerified,0);
 assert.equal(result.identifiersDisclosed,0);
 assert.equal(calls.length,12);
 assert.equal(new Set(calls.map(c=>c.args.p_module_id)).size,12);
 assert.equal(calls.every(c=>Object.keys(c.args).join()==='p_module_id'),true);
 assert.equal(calls.every(c=>c.name==='has_module_access'),true);
});
test('B3 malformed access result cannot be classified PASS',async()=>{
 const {auth,api}=fixture({badType:true});
 const result=await runWs02dB3SignedReadPreflight({auth,api});
 assert.equal(result.status,'FAIL');
 assert.equal(result.checks.find(x=>x.name==='module-access-read').status,'FAIL');
});
test('B3 denied or offline read is BLOCKED not a false authorization pass',async()=>{
 const {auth,api}=fixture({rpcDenied:true});
 assert.equal((await runWs02dB3SignedReadPreflight({auth,api})).status,'BLOCKED');
 assert.equal((await runWs02dB3SignedReadPreflight(fixture({expired:true}))).status,'BLOCKED');
 assert.equal((await runWs02dB3SignedReadPreflight({auth:null,api})).status,'BLOCKED');
});
test('B3 signed identity change fails stable-session checkpoint',async()=>{
 const {auth,api}=fixture({identityChanged:true});
 const r=await runWs02dB3SignedReadPreflight({auth,api});
 assert.equal(r.status,'FAIL');
 assert.equal(r.checks.find(x=>x.name==='stable-signed-context').status,'FAIL');
});
test('B3 report sanitizes raw IDs, tokens and untrusted rows',async()=>{
 const {auth,api}=fixture();
 const report=await runWs02dB3SignedReadPreflight({auth,api});
 report.checks[0].raw='Bearer secret '+actor;
 report.user_id=actor;report.workspace_id=workspace;report.email='secret@example.invalid';
 const exported=sanitizeWs02dB3SignedReport(report);
 assert.doesNotMatch(exported,/Bearer|secret@example.invalid|aaaaaaaa-aaaa|00000000-0000/);
 assert.match(exported,/READ_ONLY_NOT_DOMAIN_WRITE_OR_EMAIL_ACCEPTANCE/);
 assert.equal(JSON.parse(exported).writesAttempted,0);
 const rendered=renderWs02dB3SignedPreflight({report});
 assert.match(rendered,/security-ws02d-b3-run/);
 assert.match(rendered,/NOT RUN/);
 assert.doesNotMatch(rendered,/Bearer|aaaaaaaa-aaaa|secret@example.invalid/);
 assert.match(renderWs02dB3SignedPreflight({busy:true}),/ disabled/);
});
test('Security-page B3 control is signed-only, cancellable on sign-out/expiry and read-only',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 const workflow=readFileSync('.github/workflows/cp-ws01b-disposable-postgres.yml','utf8');
 assert.match(app,/case 'security-ws02d-b3-run'/);
 assert.match(app,/runWs02dB3SignedReadPreflight\(\{auth,api:db\}\)/);
 assert.match(app,/state\.ws02dB3RunId\+\+/);
 assert.match(app,/state\.ws02dB3Busy=false;state\.ws02dB3Report=null/);
 assert.match(app,/renderWs02dB3SignedPreflight/);
 assert.match(smoke,/frontend\/workspace-b3-signed-read-preflight\.js/);
 assert.match(workflow,/frontend\/tests\/workspace-b3-signed-read-preflight\.test\.mjs/);
});
