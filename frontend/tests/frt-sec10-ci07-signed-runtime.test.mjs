import test from 'node:test';
import assert from 'node:assert/strict';
import {runFRTCI07SignedRoleProbe,sanitizeFRTCI07Report}
 from '../frt-sec10-ci07-signed-runtime.js';
const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
function fixture({grant=true,role='FINANCE_APPROVER',changedIdentity=false,
 denied=false,malformed=false,expired=false}={}){
 const calls=[];let users=0;
 const auth={userId:user,async getVerifiedUser(){
  users++;if(expired)throw Object.assign(Error('secrets'),{status:401});
  return {id:changedIdentity&&users>1?'33333333-3333-4333-8333-333333333333':user};
 }};
 const api={
  async context(){calls.push('context');return {user_id:user,workspace_id:ws,profile:{status:'active'}}},
  async rpc(name,args){
   calls.push(name);
   if(name==='has_module_access'){
    assert.deepEqual(args,{p_module_id:'fund-released-tracker',p_user_id:user});
    return grant;
   }
   if(name==='frt_bootstrap'){
    assert.deepEqual(args,{p_workspace_id:ws});
    if(denied)throw Object.assign(Error('Backend private details'),{status:403});
    return {membership:{workspace_id:ws,user_id:user,enabled:true,status:'active',
      role:malformed?'UNKNOWN':role,email:'secret@example.org',display_name:'Secret'},
     companies:[]};
   }
   throw Error('Unexpected '+name);
  }
 };
 return {auth,api,calls};
}
test('real signed read-only FRT bootstrap reports role without exporting identity',async()=>{
 const f=fixture();
 const r=await runFRTCI07SignedRoleProbe(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.role,'FINANCE_APPROVER');
 assert.equal(r.checks.length,5);
 assert.ok(r.checks.every(c=>c.status==='PASS'));
 assert.equal(r.writesAttempted,0);
 assert.equal(r.revocationVerified,'NOT_VERIFIED');
 assert.deepEqual(f.calls.filter(x=>x==='frt_bootstrap'),['frt_bootstrap']);
 assert.ok(!f.calls.some(x=>/(create|update|delete|set_role|revoke|signOut)/i.test(x)));
 const s=sanitizeFRTCI07Report(r);
 assert.doesNotMatch(s,/11111111|22222222|secret@|Secret|access_token/i);
});
test('no module grant blocks FRT RPC without probing financial scope',async()=>{
 const f=fixture({grant:false});
 const r=await runFRTCI07SignedRoleProbe(f);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'NO_ACTIVE_FRT_MODULE_GRANT');
 assert.ok(!f.calls.includes('frt_bootstrap'));
});
test('backend FRT role denial is BLOCKED, never presented as a successful session check',async()=>{
 const f=fixture({denied:true});
 const r=await runFRTCI07SignedRoleProbe(f);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_FRT_DOMAIN_ACCESS_DENIED');
 assert.equal(r.financialOperationsVerified,'NOT_VERIFIED');
});
test('invalid FRT role contract and switched identity cannot pass',async()=>{
 const malformed=await runFRTCI07SignedRoleProbe(fixture({malformed:true}));
 assert.equal(malformed.status,'FAIL');
 assert.ok(malformed.checks.some(c=>c.name==='signed-frt-bootstrap-role-resolved'&&c.status==='FAIL'));
 const changed=await runFRTCI07SignedRoleProbe(fixture({changedIdentity:true}));
 assert.equal(changed.status,'FAIL');
 assert.ok(changed.checks.some(c=>c.name==='signed-identity-and-workspace-stable'&&c.status==='FAIL'));
});
test('expired session fails closed with no token or private errors in exported report',async()=>{
 const r=await runFRTCI07SignedRoleProbe(fixture({expired:true}));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_SESSION_EXPIRED');
 const s=sanitizeFRTCI07Report({...r,jwt:'token',email:'private@example.org'});
 assert.doesNotMatch(s,/private@example|token/i);
 assert.match(s,/NOT_VERIFIED/);
});
test('forged PASS fields are ignored by report sanitizer',()=>{
 const result=sanitizeFRTCI07Report({status:'PASS',role:'arbitrary admin',
  checks:[{name:'private@example.org',status:'PASS'}],
  writesAttempted:5,revocationVerified:'VERIFIED',financialOperationsVerified:'VERIFIED'});
 const data=JSON.parse(result);
 assert.equal(data.role,'UNVERIFIED');
 assert.equal(data.checks[0].name,'invalid-check-name');
 assert.equal(data.writesAttempted,0);
 assert.equal(data.revocationVerified,'NOT_VERIFIED');
 assert.equal(data.financialOperationsVerified,'NOT_VERIFIED');
});
