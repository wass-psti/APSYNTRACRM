import test from 'node:test';
import assert from 'node:assert/strict';
import {runFRTSec10SignedCeilingProbe,sanitizeFRTSec10Report} from '../frt-sec10-signed-ceiling.js';

const u='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const board='33333333-3333-4333-8333-333333333333';
const deny=(status=403,code='42501')=>Object.assign(Error('private error'),{status,code});
const moduleIds=['aps-aims','charter-navigator','employee-eval','fueltrack-plus',
 'fueltrans','fund-released-tracker','material-request-hub','order-intake',
 'time-tracker','tool-traceability','toolbox-issues','tradelink'];
const matrix={
 VIEWER:{view:true,edit:false,manage:false,frt:false},
 SUPERVISOR:{view:true,edit:true,manage:false,frt:true},
 RESTORED:{view:true,edit:true,manage:true,frt:true}
};
function fixture(stage,{leak=false,otherBoard=false,expired=false,drift=false,badBoolean=false,bootstrap=false,unconfirmed=false,missingPrereqs=false,missingSelf=false,viewerBoard=false}={}){
 let verified=0;
 const calls=[];
 const rights={...matrix[stage],edit:viewerBoard?false:matrix[stage].edit,
  manage:viewerBoard?false:matrix[stage].manage};
 const auth={userId:u,getVerifiedUser:async()=>{
  verified++;
  if(expired)throw deny(401,'JWT_EXPIRED');
  return {id:drift&&verified===3?'44444444-4444-4444-8444-444444444444':u,
    access_token:'do-not-export-this',email:'hidden@example.org'};
 }};
 const api={
  async context(){calls.push('context');return {user_id:u,workspace_id:ws,profile:{status:'active',platform_role:'hr'}}},
  async rpc(name,args={}){
   calls.push(name);
   if(name==='apsyntra_role_is_bootstrap')return bootstrap;
   if(name==='apsyntra_crm_my_effective_access'){
    if(missingSelf)throw Object.assign(Error('missing RPC'),{status:404,code:'PGRST202'});
    const assigned=stage==='VIEWER'?'viewer':stage==='SUPERVISOR'?'supervisor':null;
    const effective=stage==='VIEWER'?'viewer':'supervisor';
    const explicit=unconfirmed?(stage==='RESTORED'?'viewer':null):assigned;
    const role=unconfirmed?'supervisor':effective;
    return {schemaVersion:1,workspaceId:ws,platformRole:'hr',
     effectivePlatformRole:role,explicitPlatformRole:explicit,bootstrap:false,
     modules:moduleIds.map(moduleId=>({moduleId,role:null,
      allowed:moduleId==='fund-released-tracker'?
       (missingPrereqs?false:matrix[stage].frt):false})),
     boards:[{id:board,name:'FRT',memberRole:viewerBoard?'viewer':'owner',
      view:rights.view,edit:rights.edit,manage:rights.manage}]};
   }
   if(name==='has_module_access')return badBoolean?'false':matrix[stage].frt;
   if(name==='apsyntra_crm_platform_role_snapshot'){
    if(leak)return {bootstrapVerified:true,roles:[]};
    throw deny();
   }
   throw Error('Unexpected '+name);
  },
  async boards(){calls.push('boards');return [{id:otherBoard?'55555555-5555-4555-8555-555555555555':board}]},
  async allowed(id,permission){calls.push('allowed:'+permission);return rights[permission]}
 };
 return {auth,api,calls};
}
for(const stage of ['VIEWER','SUPERVISOR','RESTORED']){
 test('read-only signed capabilities match '+stage+' without role mutation',async()=>{
  const x=fixture(stage);
  const r=await runFRTSec10SignedCeilingProbe({...x,boardId:board,stage});
  assert.equal(r.status,'PASS');
  assert.equal(r.phase,stage);
  assert.equal(r.checks.length,7);
  assert.ok(r.checks.every(c=>c.status==='PASS'));
  assert.equal(r.writesAttempted,0);
  assert.equal(r.freshSessionIssued,'NOT_VERIFIED');
  assert.equal(r.prerequisiteOwnershipVerified,'NOT_VERIFIED');
  assert.ok(!x.calls.some(c=>/set|mutate|revoke|insert|delete|update|create/.test(c)));
  const report=sanitizeFRTSec10Report(r);
  assert.doesNotMatch(report,/11111111|do-not-export|hidden@example/);
 });
}
test('explicit stage and a preexisting visible board are required',async()=>{
 const x=fixture('VIEWER');
 let r=await runFRTSec10SignedCeilingProbe({...x,boardId:board,stage:'ADMIN'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'INVALID_SIGNED_PROBE_INPUT');
 r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{otherBoard:true}),boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'EXISTING_ACCESSIBLE_BOARD_REQUIRED');
});
test('denied or leaked CRM administrative snapshot is enforced',async()=>{
 const r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{leak:true}),boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'FAIL');
 assert.ok(r.checks.some(x=>x.name==='nonbootstrap-admin-snapshot-denied'&&x.status==='FAIL'));
});
test('malformed permission responses never count as successful denial',async()=>{
 const r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{badBoolean:true}),boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'INVALID_SERVER_PERMISSION_RESPONSE');
});
test('signed bootstrap, expired token and switched identity are not accepted',async()=>{
 let r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{bootstrap:true}),boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'BOOTSTRAP_SESSION_INELIGIBLE');
 assert.equal(r.scenario,'BOOTSTRAP');
 r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{expired:true}),boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_SESSION_EXPIRED');
 r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{drift:true}),boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_SELF_ACCESS_PRECONDITION_FAILED');
});
test('nonboolean authoritative bootstrap decision blocks before reading permissions',async()=>{
 const e=fixture('VIEWER',{bootstrap:'UNKNOWN'});
 const r=await runFRTSec10SignedCeilingProbe({...e,boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.scenario,'UNVERIFIED');
 assert.equal(r.reason,'INVALID_BOOTSTRAP_DECISION');
 assert.ok(!e.calls.includes('boards'));
 assert.equal(r.checks.length,0);
});
test('export preserves accurate signed classification for ineligible bootstrap and unknown decision',async()=>{
 const r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{bootstrap:true}),boardId:board,stage:'VIEWER'});
 const safe=JSON.parse(sanitizeFRTSec10Report(r));
 assert.equal(safe.scenario,'BOOTSTRAP');
 assert.equal(safe.reason,'BOOTSTRAP_SESSION_INELIGIBLE');
 assert.equal(safe.writesAttempted,0);
 assert.equal(safe.freshSessionIssued,'NOT_VERIFIED');
 const untrusted=JSON.parse(sanitizeFRTSec10Report({scenario:'admin@private.example',status:'BLOCKED',phase:'VIEWER',
  reason:'INVALID_BOOTSTRAP_DECISION',checks:[],writesAttempted:0,roleChangesAttempted:0}));
 assert.equal(untrusted.scenario,'UNVERIFIED');
 assert.doesNotMatch(JSON.stringify(untrusted),/@|private\.example/);
});
test('a selected phase that disagrees with the actual backend cannot PASS',async()=>{
 const r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER'),boardId:board,stage:'SUPERVISOR'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'STAGE_NOT_CONFIRMED_BY_BACKEND');
 assert.equal(r.checks.length,0);
});
test('viewer-like board permissions do not prove an explicit Viewer role assignment',async()=>{
 const x=fixture('VIEWER',{unconfirmed:true});
 const r=await runFRTSec10SignedCeilingProbe({...x,boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'STAGE_NOT_CONFIRMED_BY_BACKEND');
 assert.ok(!x.calls.includes('allowed:view'));
});
test('restored stage needs current owner and FRT grant in authoritative self-only snapshot',async()=>{
 const r=await runFRTSec10SignedCeilingProbe({...fixture('RESTORED',{missingPrereqs:true}),
  boardId:board,stage:'RESTORED'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'ORIGINAL_OPERATIONAL_PREREQUISITES_MISSING');
});
test('a genuine Supervisor with only Viewer board membership is BLOCKED, not an edit regression',async()=>{
 const x=fixture('SUPERVISOR',{viewerBoard:true});
 const r=await runFRTSec10SignedCeilingProbe({...x,boardId:board,stage:'SUPERVISOR'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.scenario,'NONBOOTSTRAP');
 assert.equal(r.reason,'PREEXISTING_BOARD_OWNER_REQUIRED');
 assert.deepEqual(r.checks,[]);
 assert.equal(r.writesAttempted,0);
 assert.equal(r.roleChangesAttempted,0);
 assert.ok(!x.calls.some(x=>x.startsWith('allowed:')));
 assert.equal(JSON.parse(sanitizeFRTSec10Report(r)).reason,'PREEXISTING_BOARD_OWNER_REQUIRED');
});
test('Viewer cap is not accepted as a controlled transition without original board ownership',async()=>{
 const x=fixture('VIEWER',{viewerBoard:true});
 const r=await runFRTSec10SignedCeilingProbe({...x,boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'PREEXISTING_BOARD_OWNER_REQUIRED');
 assert.deepEqual(r.checks,[]);
});
test('missing CP11 backend or failed signed self-inspection cannot be a valid stage',async()=>{
 const r=await runFRTSec10SignedCeilingProbe({...fixture('VIEWER',{missingSelf:true}),
  boardId:board,stage:'VIEWER'});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_SELF_ACCESS_PRECONDITION_FAILED');
});
test('export drops arbitrary identity/server errors and does not fabricate fresh auth issuance',()=>{
 const data={status:'PASS',phase:'VIEWER',reason:'Bearer hidden@example.org',writesAttempted:4,
  checks:[{name:'hidden@example.org',status:'PASS'}],
  userId:u,jwt:'do-not-export-this',freshSessionIssued:'VERIFIED'};
 const clean=JSON.parse(sanitizeFRTSec10Report(data));
 assert.equal(clean.freshSessionIssued,'NOT_VERIFIED');
 assert.equal(clean.prerequisiteOwnershipVerified,'NOT_VERIFIED');
 assert.equal(clean.checks[0].name,'invalid-check-name');
 assert.equal(clean.writesAttempted,4);
 assert.doesNotMatch(JSON.stringify(clean),/Bearer|hidden|@|11111111|do-not-export/);
});
