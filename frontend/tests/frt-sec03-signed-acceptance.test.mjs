import test from 'node:test';
import assert from 'node:assert/strict';
import {runFRTSec03SignedAcceptance} from '../frt-sec03-signed-acceptance.js';

const USER='11111111-1111-4111-8111-111111111111';
const WORKSPACE='22222222-2222-4222-8222-222222222222';
const denied=()=>Object.assign(Error('Forbidden'),{status:403});
function fixture(bootstrap,{leakLegacy=false}={}){
 const calls=[];
 const auth={
  userId:USER,
  getVerifiedUser:async()=>({id:USER,access_token:'must-not-appear-in-report'})
 };
 const api={
  context:async()=>({user_id:USER,workspace_id:WORKSPACE,profile:{status:'active'}}),
  rpc:async(name,args={})=>{
   calls.push(name);
   if(name==='apsyntra_role_is_bootstrap')return bootstrap;
   if(name==='frt_admin_users'){
    if(leakLegacy)return [{id:USER}];
    throw denied();
   }
   if(name==='apsyntra_role_configuration_snapshot'){
    if(!bootstrap||args.p_workspace_id!==WORKSPACE)throw denied();
    return {bootstrapVerified:true,workspaceId:WORKSPACE,mode:'staged_only',
     roles:[],users:[],assignments:[],boards:[],proposals:[],audit:[]};
   }
   if(name==='apsyntra_role_user_management_snapshot'){
    if(!bootstrap)throw denied();
    return {bootstrapVerified:true,workspaceId:WORKSPACE,
     users:[],modules:[],moduleAssignments:[],boards:[],boardAssignments:[]};
   }
   if(name==='frt_bootstrap'&&bootstrap)
    return {membership:{user_id:USER,role:'GENERAL_MANAGER'},companies:[]};
   throw Error('Unexpected RPC: '+name);
  }
 };
 return {auth,api,calls};
}

test('bootstrap signed session reads central role and operational FRT contracts without writes',async()=>{
 const env=fixture(true);
 const report=await runFRTSec03SignedAcceptance(env);
 assert.equal(report.status,'PASS');
 assert.equal(report.scenario,'BOOTSTRAP');
 assert.equal(report.writesAttempted,0);
 assert.ok(report.checks.length>=6);
 assert.ok(report.checks.every(c=>c.status==='PASS'));
 assert.doesNotMatch(JSON.stringify(report),new RegExp(USER+'|access_token'));
 assert.ok(!env.calls.some(name=>/propose|manage_user_access|set_role|create_request/.test(name)));
});

test('nonbootstrap signed session is refused central admin read surfaces',async()=>{
 const env=fixture(false);
 const report=await runFRTSec03SignedAcceptance(env);
 assert.equal(report.status,'PASS');
 assert.equal(report.scenario,'NONBOOTSTRAP');
 assert.ok(report.checks.some(c=>c.name==='nonbootstrap-user-management-denied'&&c.status==='PASS'));
 assert.equal(report.writesAttempted,0);
});

test('legacy FRT user-role listing exposure fails closed',async()=>{
 const env=fixture(true,{leakLegacy:true});
 const report=await runFRTSec03SignedAcceptance(env);
 assert.equal(report.status,'FAIL');
 assert.ok(report.checks.some(c=>c.name==='legacy-frt-admin-list-unavailable'&&c.status==='FAIL'));
});

test('missing signed context is blocked, never counted as acceptance',async()=>{
 const env=fixture(true);
 env.auth.getVerifiedUser=async()=>{throw Object.assign(Error('Session expired'),{status:401})};
 const report=await runFRTSec03SignedAcceptance(env);
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.reason,'HTTP 401');
 assert.deepEqual(env.calls,[]);
});
