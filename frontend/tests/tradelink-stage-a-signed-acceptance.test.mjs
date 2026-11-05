import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 runTradeLinkStageASignedReadOnly,renderTradeLinkStageAAcceptance,
 sanitizeTradeLinkStageAReport,TL03_STAGE_A_CHECKPOINT
} from '../tradelink-stage-a-signed-acceptance.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {ApiError} from '../session.js';

const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const primary='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const missing='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const moduleIds=['aps-aims','charter-navigator','employee-eval','fueltrack-plus',
 'fueltrans','fund-released-tracker','material-request-hub','order-intake',
 'time-tracker','tool-traceability','toolbox-issues','tradelink'];
const denial=()=>new ApiError('Signed TradeLink read denied',403,'42501');
function makeFixture(scenario='manager',{wrongBoardAllowed=false,brokenList=false,leakForeignBoard=false}={}){
 const isForeign=scenario==='foreign';
 const isManager=scenario==='manager';
 const boardManage=scenario!=='editor';
 const moduleRole=scenario==='module-user'?'User':'General Manager';
 const workspaceId=isForeign?foreign:primary;
 const profile={status:'active',platform_role:'admin_general_manager'};
 const context={user_id:actor,workspace_id:workspaceId,profile};
 const boardRows=isForeign&&!leakForeignBoard?[]:[{id:TRADELINK_BOARD_ID,name:'TradeLink',
  view:true,edit:true,manage:boardManage,memberRole:boardManage?'owner':'editor'}];
 const snapshot={schemaVersion:1,workspaceId,platformRole:profile.platform_role,
  effectivePlatformRole:'admin',explicitPlatformRole:null,bootstrap:false,
  modules:moduleIds.map(moduleId=>({moduleId,
   role:moduleId==='tradelink'?moduleRole:null,allowed:moduleId==='tradelink'})),
  boards:boardRows};
 const calls=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>structuredClone(context),
  rpc:async(name,args={})=>{
   calls.push([name,args]);
   if(name==='apsyntra_crm_my_effective_access')return structuredClone(snapshot);
   if(name==='tl03_documents_list'){
    if(args.p_board_id!==TRADELINK_BOARD_ID&&!wrongBoardAllowed)throw denial();
    if(args.p_board_id===TRADELINK_BOARD_ID&&!isManager)throw denial();
    return brokenList?[{invalid:'payload'}]:[];
   }
   if(name==='tl03_document_read'){
    if(!isManager)throw denial();
    return null;
   }
   throw Error('Unexpected API invocation '+name);
  }};
 return {auth,api,calls};
}
async function run(scenario,options){
 const fixture=makeFixture(scenario,options);
 const report=await runTradeLinkStageASignedReadOnly({
  auth:fixture.auth,api:fixture.api,createProbeId:()=>missing});
 return {report,calls:fixture.calls};
}
test('signed General Manager passes list, nonexistent read and unrelated-board denial',async()=>{
 const {report,calls}=await run('manager');
 assert.equal(report.checkpoint,TL03_STAGE_A_CHECKPOINT);
 assert.equal(report.scenario,'AUTHORIZED_MANAGER');
 assert.equal(report.status,'PASS');
 assert.equal(report.checks.length,6);
 assert.ok(report.checks.every(x=>x.status==='PASS'));
 assert.equal(report.writesAttempted,0);
 assert.equal(report.documentsDisclosed,0);
 assert.ok(calls.some(([name])=>name==='tl03_documents_list'));
 assert.ok(calls.some(([name])=>name==='tl03_document_read'));
 assert.ok(calls.every(([name])=>!name.includes('commit')&&!name.includes('insert')));
});
test('existing nonmanager module role must be denied even with board owner',async()=>{
 const {report}=await run('module-user');
 assert.equal(report.scenario,'MODULE_ROLE_DENIED');
 assert.equal(report.status,'PASS');
 assert.equal(report.checks.find(c=>c.name==='document-list').status,'PASS');
 assert.equal(report.checks.find(c=>c.name==='missing-document-read').status,'PASS');
});
test('General Manager module role cannot bypass board-manage ceiling',async()=>{
 const {report}=await run('editor');
 assert.equal(report.scenario,'BOARD_MANAGER_DENIED');
 assert.equal(report.status,'PASS');
});
test('genuine foreign-workspace context is denied without fabricating a target membership',async()=>{
 const {report}=await run('foreign');
 assert.equal(report.scenario,'FOREIGN_WORKSPACE_DENIED');
 assert.equal(report.status,'PASS');
});
test('foreign-workspace self-permission snapshot must not leak the TradeLink board',async()=>{
 const {report}=await run('foreign',{leakForeignBoard:true});
 assert.equal(report.status,'FAIL');
 assert.equal(report.scenario,'UNVERIFIED');
 assert.equal(report.checks.find(c=>c.name==='effective-access').status,'FAIL');
});
test('unexpected document access, wrong-board access and malformed server responses fail',async()=>{
 const a=await run('module-user',{wrongBoardAllowed:true});
 assert.equal(a.report.status,'FAIL');
 assert.equal(a.report.checks.find(c=>c.name==='wrong-board-denial').status,'FAIL');
 const b=await run('manager',{brokenList:true});
 assert.equal(b.report.status,'FAIL');
 assert.equal(b.report.checks.find(c=>c.name==='document-list').status,'FAIL');
});
test('expired, unverified or inconsistent identity is never reported as signed PASS',async()=>{
 const {api}=makeFixture();
 const expired=await runTradeLinkStageASignedReadOnly({auth:{
  userId:actor,getVerifiedUser:async()=>{throw new ApiError('Expired',401);}
 },api,createProbeId:()=>missing});
 assert.equal(expired.status,'BLOCKED');
 const invalid=await runTradeLinkStageASignedReadOnly({
  auth:{userId:foreign,getVerifiedUser:async()=>({id:actor})},api,
  createProbeId:()=>missing});
 assert.equal(invalid.status,'FAIL');
 const noClients=await runTradeLinkStageASignedReadOnly({});
 assert.equal(noClients.status,'BLOCKED');
});
test('nonsecret copy report excludes names, tokens, document content and raw IDs',async()=>{
 const {report}=await run('manager');
 report.checks[0].detail='Should never expose an access token or personal name';
 const safe=sanitizeTradeLinkStageAReport(report);
 assert.match(safe,/"status": "PASS"/);
 assert.doesNotMatch(safe,/token|personal name|aaaaaaaa-aaaa|documentNumber/i);
 const rendered=renderTradeLinkStageAAcceptance({report});
 assert.match(rendered,/security-tl03-stage-a-run/);
 assert.match(rendered,/security-tl03-stage-a-copy/);
 assert.match(rendered,/Writes attempted: 0/);
 assert.doesNotMatch(rendered,/aaaaaaa|documentNumber/);
 const idle=renderTradeLinkStageAAcceptance({busy:true});
 assert.match(idle,/disabled/);
 assert.doesNotMatch(idle,/security-tl03-stage-a-copy/);
});
test('Access acceptance action is wired, signed, route-isolated and cleared on logout',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 assert.match(app,/case 'security-tl03-stage-a-run'/);
 assert.match(app,/runTradeLinkStageASignedReadOnly\(\{auth,api:db\}\)/);
 assert.match(app,/state\.view!=='security'/);
 assert.match(app,/state\.tl03ReadRunId\+\+/);
 assert.match(app,/state\.tl03ReadResult=null;state\.context=null/);
 assert.match(smoke,/frontend\/tradelink-stage-a-signed-acceptance\.js/);
});

test('foreign-workspace eligibility is a nonsecret read-only inventory, never a substituted signed test',()=>{
 const sql=readFileSync('sql/tests/cp-tl03c-foreign-workspace-eligibility.sql','utf8');
 assert.match(sql,/public\.workspace_members/);
 assert.match(sql,/public\.profiles/);
 assert.match(sql,/auth\.sessions/);
 assert.match(sql,/BLOCKED_NO_ACTIVE_FOREIGN_MEMBERS/);
 assert.match(sql,/CANDIDATE_ONLY__GENUINE_SIGNED_USER_ACCEPTANCE_STILL_REQUIRED/);
 assert.match(sql,/NO_WRITES__NO_MEMBERSHIP_CHANGES__NO_IMPERSONATION/);
 assert.doesNotMatch(sql,/^\s*(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|REVOKE|COPY|CALL)\b/im);
 assert.doesNotMatch(sql,/\b(?:m\.user_id|pr\.email|s\.id)\s+AS\s+\w+/i);
});
