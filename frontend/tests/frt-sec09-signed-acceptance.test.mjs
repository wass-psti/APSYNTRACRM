import test from 'node:test';
import assert from 'node:assert/strict';
import {runFRTSec09SignedAcceptance,sanitizeFRTSec09Report} from '../frt-sec09-signed-acceptance.js';

const USER='11111111-1111-4111-8111-111111111111';
const WS='22222222-2222-4222-8222-222222222222';
const error=(status=403,code='42501')=>Object.assign(new Error('server response'),{status,code});
function fixture(bootstrap,{missingCRM=false,leak=false,switchIdentity=false,roleMismatch=false,sessionExpired=false}={}){
 const calls=[];
 let verifiedCount=0;
 const auth={
  userId:USER,
  getVerifiedUser:async()=>{
   verifiedCount++;
   if(sessionExpired)throw error(401,'JWT_EXPIRED');
   return {id:switchIdentity&&verifiedCount>=4?'33333333-3333-4333-8333-333333333333':USER,
    email:'sensitive@example.org',access_token:'never-export-this-token'};
  }
 };
 const api={
  context:async()=>{
   calls.push('context');
   return {user_id:USER,workspace_id:WS,profile:{status:'active'}};
  },
  rpc:async(name,args={})=>{
   calls.push(name);
   if(name==='apsyntra_role_is_bootstrap')return bootstrap;
   if(name==='frt_admin_users')throw error(403);
   if(name==='apsyntra_role_configuration_snapshot'){
    if(!bootstrap||args.p_workspace_id!==WS)throw error(403);
    return {bootstrapVerified:true,workspaceId:WS,mode:'staged_only',
     roles:[],users:[],assignments:[],boards:[],proposals:[],audit:[]};
   }
   if(name==='apsyntra_role_user_management_snapshot'){
    if(!bootstrap)throw error(403);
    return {workspaceId:WS,bootstrapVerified:true,
     users:[{id:USER,platformRole:'employee'}],modules:[],moduleAssignments:[],
     boards:[],boardAssignments:[]};
   }
   if(name==='apsyntra_crm_platform_role_snapshot'){
    if(missingCRM)throw error(404,'PGRST202');
    if(!bootstrap&&leak)return {bootstrapVerified:true,workspaceId:WS,roles:[]};
    if(!bootstrap||args.p_workspace_id!==WS)throw error(403);
    return {bootstrapVerified:true,workspaceId:WS,roles:[{
     userId:USER,inheritedRole:'employee',
     effectiveRole:roleMismatch?'admin':'employee',assignedRole:null,updatedAt:null
    }]};
   }
   if(name==='frt_bootstrap'&&bootstrap)
    return {membership:{user_id:USER,role:'GENERAL_MANAGER'},companies:[]};
   throw new Error('Unexpected method '+name);
  }
 };
 return {auth,api,calls};
}

test('bootstrap genuine-session runner requires SEC03 and SEC07 PASS and same identity',async()=>{
 const e=fixture(true);
 const r=await runFRTSec09SignedAcceptance(e);
 assert.equal(r.checkpoint,'CP-FRT-SEC09');
 assert.equal(r.status,'PASS');
 assert.equal(r.scenario,'BOOTSTRAP');
 assert.equal(r.sources.length,2);
 assert.deepEqual(r.sources.map(c=>c.status),['PASS','PASS']);
 assert.equal(r.checks.length,5);
 assert.ok(r.checks.every(c=>c.status==='PASS'));
 assert.equal(r.writesAttempted,0);
 assert.equal(r.roleChangesAttempted,0);
 const serialized=sanitizeFRTSec09Report(r);
 assert.doesNotMatch(serialized,/11111111|sensitive@example|never-export|access_token|refresh_token/i);
 assert.ok(!e.calls.some(n=>/role_set|create_request|manage_user_access|add_board|update_board|delete_board/.test(n)));
});
test('existing nonbootstrap session requires both central admin denials',async()=>{
 const r=await runFRTSec09SignedAcceptance(fixture(false));
 assert.equal(r.status,'PASS');
 assert.equal(r.scenario,'NONBOOTSTRAP');
 assert.deepEqual(r.sources.map(c=>c.checks.length),[5,4]);
});
test('missing new backend never counted as an authorization denial',async()=>{
 const r=await runFRTSec09SignedAcceptance(fixture(false,{missingCRM:true}));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SEC07_ACTIVATION_BLOCKED');
 assert.equal(r.sources[1].status,'BLOCKED');
 assert.equal(r.writesAttempted,0);
});
test('old FRT baseline fails closed independently of the CRM source',async()=>{
 const e=fixture(true);
 const original=e.api.rpc;
 e.api.rpc=async(name,args)=>{
  if(name==='frt_admin_users')return [{id:USER}];
  return original(name,args);
 };
 const r=await runFRTSec09SignedAcceptance(e);
 assert.equal(r.status,'FAIL');
 assert.equal(r.sources[0].status,'FAIL');
 assert.ok(r.checks.some(x=>x.name==='sec03-governance-baseline'&&x.status==='FAIL'));
});
test('nonbootstrap CRM snapshot leak fails gate instead of claiming authorization',async()=>{
 const r=await runFRTSec09SignedAcceptance(fixture(false,{leak:true}));
 assert.equal(r.status,'FAIL');
 assert.equal(r.sources[1].status,'FAIL');
});
test('CRM effective role mismatch from backend fails rather than trusting frontend claims',async()=>{
 const r=await runFRTSec09SignedAcceptance(fixture(true,{roleMismatch:true}));
 assert.equal(r.status,'FAIL');
 assert.ok(r.checks.some(x=>x.name==='sec07-crm-platform-rbac'&&x.status==='FAIL'));
});
test('identity change during multi-request runner fails closed',async()=>{
 const r=await runFRTSec09SignedAcceptance(fixture(false,{switchIdentity:true}));
 assert.equal(r.status,'FAIL');
 assert.ok(r.checks.some(c=>c.name==='same-signed-identity-and-workspace'&&c.status==='FAIL'));
});
test('expired session never counted as acceptance',async()=>{
 const r=await runFRTSec09SignedAcceptance(fixture(true,{sessionExpired:true}));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_READ_ONLY_ACCEPTANCE_INCOMPLETE');
 assert.equal(r.sources.length,0);
});
test('report sanitization drops even accidentally supplied credentials and freeform errors',()=>{
 const r={status:'PASS',scenario:'BOOTSTRAP',
  reason:'Bearer confidential_user@gmail.com',
  writesAttempted:999,
  checks:[{name:'secret@gmail.com',status:'PASS'}],
  sources:[{checkpoint:'CP-FRT-SEC03',status:'PASS',scenario:'BOOTSTRAP',
   checks:[{name:'<b>secret</b>',status:'PASS'}],writesAttempted:0,
   bearer:'do-not-include-me'}]
 };
 const s=sanitizeFRTSec09Report(r);
 assert.doesNotMatch(s,/confidential_user|gmail|do-not-include|<b>|Bearer/);
 assert.equal(JSON.parse(s).writesAttempted,999);
 assert.equal(JSON.parse(s).sources[0].checks[0].name,'invalid-check-name');
});
