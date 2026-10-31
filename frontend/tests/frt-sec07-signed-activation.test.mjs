import test from 'node:test';
import assert from 'node:assert/strict';
import {runFRTSec07ActivationGate} from '../frt-sec07-signed-activation.js';

const USER='11111111-1111-4111-8111-111111111111';
const WS='22222222-2222-4222-8222-222222222222';
const err=(status=403,code='42501')=>Object.assign(Error('server response'),{status,code});
function fixture(bootstrap=true,{missing=false,leak=false,invalidSnapshot=false}={}){
 const calls=[];
 const auth={userId:USER,getVerifiedUser:async()=>({id:USER,access_token:'never-copy-me'})};
 const api={
  async context(){calls.push('context');return{user_id:USER,workspace_id:WS,profile:{status:'active'}};},
  async rpc(name,args={}){
   calls.push(name);
   if(name==='apsyntra_role_is_bootstrap')return bootstrap;
   if(name==='apsyntra_role_user_management_snapshot'){
    if(!bootstrap)throw err();
    return {workspaceId:WS,bootstrapVerified:true,
     users:[{id:USER,platformRole:'employee'}],modules:[],
     moduleAssignments:[],boards:[],boardAssignments:[]};
   }
   if(name==='apsyntra_crm_platform_role_snapshot'){
    if(missing)throw err(404,'PGRST202');
    if(!bootstrap&&leak)return {workspaceId:WS,bootstrapVerified:true,roles:[]};
    if(!bootstrap||args.p_workspace_id!==WS)throw err();
    return {workspaceId:WS,bootstrapVerified:true,roles:[{
     userId:USER,effectiveRole:invalidSnapshot?'admin':'employee',
     inheritedRole:'employee',assignedRole:null,updatedAt:null}]};
   }
   if(name==='frt_bootstrap'&&bootstrap)
    return {membership:{user_id:USER,role:'GENERAL_MANAGER'},companies:[]};
   throw Error('Unrecognized operation '+name);
  }
 };
 return {auth,api,calls};
}
test('real-session bootstrap read-only gate validates role snapshot and workspace/FRT boundaries',async()=>{
 const a=fixture(true);
 const result=await runFRTSec07ActivationGate(a);
 assert.equal(result.status,'PASS');
 assert.equal(result.scenario,'BOOTSTRAP');
 assert.equal(result.writesAttempted,0);
 assert.equal(result.checks.length,5);
 assert.ok(result.checks.every(c=>c.status==='PASS'));
 assert.doesNotMatch(JSON.stringify(result),/never-copy-me|11111111|Bearer|@/i);
 assert.ok(!a.calls.some(c=>/set|manage_user_access|create|delete|insert|update/i.test(c)));
});
test('nonbootstrap signed user denied both central administration snapshots',async()=>{
 const a=fixture(false);
 const result=await runFRTSec07ActivationGate(a);
 assert.equal(result.status,'PASS');
 assert.equal(result.scenario,'NONBOOTSTRAP');
 assert.equal(result.checks.length,4);
 assert.ok(result.checks.every(c=>c.status==='PASS'));
});
test('missing CRM backend is BLOCKED, not falsely accepted as nonbootstrap denial',async()=>{
 const a=fixture(false,{missing:true});
 const result=await runFRTSec07ActivationGate(a);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'CRM_ROLE_BACKEND_NOT_INSTALLED');
 assert.equal(result.writesAttempted,0);
 assert.ok(!result.checks.some(c=>c.name==='nonbootstrap-crm-platform-snapshot-denied'));
});
test('missing CRM backend in bootstrap fallback is BLOCKED, preserving old snapshots',async()=>{
 const a=fixture(true,{missing:true});
 const result=await runFRTSec07ActivationGate(a);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'CRM_ROLE_BACKEND_NOT_INSTALLED');
});
test('unprotected nonbootstrap access is a failing authorization regression',async()=>{
 const result=await runFRTSec07ActivationGate(fixture(false,{leak:true}));
 assert.equal(result.status,'FAIL');
 assert.ok(result.checks.some(c=>c.name==='nonbootstrap-crm-platform-snapshot-denied'&&c.status==='FAIL'));
});
test('inconsistent platform role ranks fail closed even when RPC returns success',async()=>{
 const result=await runFRTSec07ActivationGate(fixture(true,{invalidSnapshot:true}));
 assert.equal(result.status,'FAIL');
 assert.ok(result.checks.some(c=>c.name==='crm-platform-snapshot-active-and-complete'&&c.status==='FAIL'));
});
test('missing verified identity blocks without server authorization shortcuts',async()=>{
 const a=fixture(true);
 a.auth.getVerifiedUser=async()=>{throw err(401,'JWT_EXPIRED');};
 const result=await runFRTSec07ActivationGate(a);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'SIGNED_SESSION_EXPIRED');
 assert.deepEqual(a.calls,[]);
});
test('generic HTTP 404 is not an accepted denied-role response',async()=>{
 const a=fixture(false);
 const prev=a.api.rpc;
 a.api.rpc=async(name,args)=>{
  if(name==='apsyntra_crm_platform_role_snapshot')throw err(404,'PGRST205');
  return prev(name,args);
 };
 const result=await runFRTSec07ActivationGate(a);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'RPC_NOT_AVAILABLE_OR_NOT_EXPOSED');
});
