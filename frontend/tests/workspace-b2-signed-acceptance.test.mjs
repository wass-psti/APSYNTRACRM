import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WS01_B2_CHECKPOINT,runWs01B2SignedDiscovery,
 renderWs01B2SignedAcceptance,sanitizeWs01B2Report
} from '../workspace-b2-signed-acceptance.js';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspace='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
function setup({deny=false,malformed=false,expired=false,foreign=false}={}){
 let calls=[];
 const auth={userId:actor,
  getVerifiedUser:async()=>expired?Promise.reject({status:401}):({id:actor})};
 const context={user_id:actor,workspace_id:workspace,profile:{status:'active'}};
 const api={context:async()=>structuredClone(context),rpc:async(name,args)=>{
  calls.push({name,args});
  assert.equal(name,'wm_ws01_list');
  assert.deepEqual(args,{});
  if(deny)throw {status:403,code:'42501'};
  return {schemaVersion:1,userId:actor,activeWorkspaceId:workspace,
   rows:[{id:foreign?other:workspace,name:'Authorized Workspace',
    relation:'member',privacy:'closed',active:true}]};
 }};
 return {auth,api,calls};
}
test('real-session B2 read acceptance verifies actor, current workspace and stable session',async()=>{
 const {auth,api,calls}=setup();
 const result=await runWs01B2SignedDiscovery({auth,api});
 assert.equal(result.checkpoint,WS01_B2_CHECKPOINT);
 assert.equal(result.status,'PASS');
 assert.equal(result.signedWorkspaceCount,1);
 assert.deepEqual(result.checks.map(c=>c.status),Array(5).fill('PASS'));
 assert.deepEqual(calls.map(c=>c.name),['wm_ws01_list']);
 assert.equal(result.writesAttempted,0);
 assert.equal(result.identifiersDisclosed,0);
});
test('signed user without server RPC authorization is FAIL, not a false PASS',async()=>{
 const {auth,api}=setup({deny:true});
 const result=await runWs01B2SignedDiscovery({auth,api});
 assert.equal(result.status,'FAIL');
 assert.equal(result.checks.find(x=>x.name==='server-discovery').status,'FAIL');
});
test('foreign workspace and mismatched active-workspace claims fail closed',async()=>{
 const {auth,api}=setup({foreign:true});
 const report=await runWs01B2SignedDiscovery({auth,api});
 assert.equal(report.status,'FAIL');
 assert.equal(report.checks.find(x=>x.name==='membership-catalog').status,'FAIL');
});
test('expired session cannot receive a signed PASS',async()=>{
 const {auth,api}=setup({expired:true});
 assert.equal((await runWs01B2SignedDiscovery({auth,api})).status,'BLOCKED');
 const invalid={userId:other,getVerifiedUser:async()=>({id:actor})};
 assert.equal((await runWs01B2SignedDiscovery({auth:invalid,api})).status,'FAIL');
});
test('reports never disclose names, workspace IDs, bearer tokens or personal data',async()=>{
 const {auth,api}=setup();
 const result=await runWs01B2SignedDiscovery({auth,api});
 result.checks[0].secret='DO NOT EXPORT a bearer token';
 const text=sanitizeWs01B2Report(result);
 assert.match(text,/"signedWorkspaceCount": 1/);
 assert.doesNotMatch(text,/Authorized Workspace|bearer token|aaaaaaaa-aaaa|00000000-0000/);
 const html=renderWs01B2SignedAcceptance({report:result});
 assert.match(html,/security-ws01-b2-run/);
 assert.match(html,/security-ws01-b2-copy/);
 assert.doesNotMatch(html,/Authorized Workspace|aaaaaaaa-aaaa|00000000-0000/);
 assert.match(renderWs01B2SignedAcceptance({busy:true}),/disabled/);
});
test('Access acceptance wiring is signed-only, cancellable on sign-out and leaves UI discovery gated',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 assert.match(app,/case 'security-ws01-b2-run'/);
 assert.match(app,/runWs01B2SignedDiscovery\(\{auth,api:db\}\)/);
 assert.match(app,/state\.view!=='security'/);
 assert.match(app,/state\.ws01B2RunId\+\+/);
 assert.match(app,/state\.context=null;state\.ws01B2RunId\+\+;state\.ws01B2Busy=false;state\.ws01B2Result=null/);
 assert.match(app,/auth\.onExpired=\(\)=>\{closeWorkspacePanels\(\);state\.context=null;state\.frtSecurityResult=null;state\.sec07Result=null;state\.ws01B2RunId\+\+;/);
 assert.match(app,/renderWs01B2SignedAcceptance/);
 assert.match(ui,/WS01_DISCOVERY_ENABLED=false/);
 assert.match(ui,/WS01_CREATION_ENABLED=false/);
 assert.match(ui,/WS01_SWITCHING_ENABLED=false/);
 assert.match(smoke,/frontend\/workspace-b2-signed-acceptance\.js/);
});
