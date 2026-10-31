import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMySignedEffectiveAccess,sanitizeEffectiveAccessReport} from '../signed-effective-access.js';
const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const board='33333333-3333-4333-8333-333333333333';
const moduleIds=['aps-aims','charter-navigator','employee-eval','fueltrack-plus',
 'fueltrans','fund-released-tracker','material-request-hub','order-intake',
 'time-tracker','tool-traceability','toolbox-issues','tradelink'];
const modules=()=>moduleIds.map(moduleId=>({moduleId,role:null,allowed:false}));
function fixture(kind='hr',{invalid=false,drift=false,unavailable=false,boardLeak=false}={}){
 let verified=0;
 const calls=[];
 const bootstrap=kind==='admin';
 const role=bootstrap?'admin_general_manager':'hr';
 const data={
  schemaVersion:1,workspaceId:invalid?'44444444-4444-4444-8444-444444444444':ws,
  platformRole:role,effectivePlatformRole:bootstrap?'admin':'supervisor',
  explicitPlatformRole:null,bootstrap,
  modules:modules(),
  boards:kind==='hr'?[]:[{id:board,name:'FRT board',memberRole:null,view:!boardLeak,edit:true,manage:true}]
 };
 const auth={userId:user,getVerifiedUser:async()=>{
  verified++;return{id:drift&&verified===2?'55555555-5555-4555-8555-555555555555':user,
   access_token:'secret-token',email:'hidden@example.org'};
 }};
 const api={
  context:async()=>({user_id:user,workspace_id:ws,profile:{platform_role:role,status:'active'}}),
  rpc:async(name,args)=>{
   calls.push(name);
   assert.equal(name,'apsyntra_crm_my_effective_access');
   assert.deepEqual(args,{});
   if(unavailable)throw Object.assign(Error('missing'),{status:404,code:'PGRST202'});
   return data;
  }
 };
 return{auth,api,calls,data};
}
test('bootstrap signed account can inspect authoritative role and accessible boards without mutation',async()=>{
 const f=fixture('admin');
 const r=await inspectMySignedEffectiveAccess(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.scenario,'BOOTSTRAP');
 assert.equal(r.platformRole,'admin_general_manager');
 assert.equal(r.effectivePlatformRole,'admin');
 assert.equal(r.boards.length,1);
 assert.equal(r.boards[0].manage,true);
 assert.equal(r.modules.length,12);
 assert.equal(r.checks.length,5);
 assert.deepEqual(f.calls,['apsyntra_crm_my_effective_access']);
 assert.equal(r.writesAttempted,0);
});
test('HR without board membership is a valid signed inspection with explicit empty state',async()=>{
 const r=await inspectMySignedEffectiveAccess(fixture('hr'));
 assert.equal(r.status,'PASS');
 assert.equal(r.scenario,'NONBOOTSTRAP');
 assert.equal(r.platformRole,'hr');
 assert.equal(r.effectivePlatformRole,'supervisor');
 assert.deepEqual(r.boards,[]);
 assert.equal(r.boardsEmpty,true);
 assert.ok(r.modules.every(m=>m.allowed===false));
});
test('backend must be deployed; PostgREST PGRST202 is BLOCKED, not fabricated permissions',async()=>{
 const r=await inspectMySignedEffectiveAccess(fixture('hr',{unavailable:true}));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SELF_AUTHORIZATION_BACKEND_NOT_INSTALLED');
});
test('wrong workspace, unexpected board authorization or session drift fails closed',async()=>{
 let r=await inspectMySignedEffectiveAccess(fixture('hr',{invalid:true}));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'INVALID_SELF_AUTHORIZATION_SNAPSHOT');
 r=await inspectMySignedEffectiveAccess(fixture('admin',{boardLeak:true}));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'INVALID_BOARD_ACCESS_SNAPSHOT');
 r=await inspectMySignedEffectiveAccess(fixture('hr',{drift:true}));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_CONTEXT_CHANGED');
});
test('incomplete module snapshot and duplicate permissions cannot be accepted',async()=>{
 const f=fixture('hr');
 f.data.modules.pop();
 let r=await inspectMySignedEffectiveAccess(f);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'INCOMPLETE_MODULE_ACCESS_SNAPSHOT');
 const q=fixture('hr');
 q.data.modules[1].moduleId=q.data.modules[0].moduleId;
 r=await inspectMySignedEffectiveAccess(q);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'INVALID_MODULE_ACCESS_SNAPSHOT');
});
test('copied summary omits identities, workspace, board labels and arbitrary errors',async()=>{
 const r=await inspectMySignedEffectiveAccess(fixture('admin'));
 const json=sanitizeEffectiveAccessReport({...r,token:'secret-token',userId:user,workspaceId:ws,
  reason:'someone@example.org',boards:[{...r.boards[0],name:'hidden secret finance'}]});
 assert.doesNotMatch(json,/secret-token|11111111|22222222|33333333|hidden secret finance|@/i);
 const parsed=JSON.parse(json);
 assert.equal(parsed.checkpoint,'CP-FRT-SEC11');
 assert.equal(parsed.status,'PASS');
 assert.equal(parsed.boardPermissions.length,1);
 assert.equal(parsed.writesAttempted,0);
});
