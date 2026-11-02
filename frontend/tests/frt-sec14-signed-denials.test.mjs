import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSEC14SignedDenials,sanitizeSEC14SignedDenials}
 from '../frt-sec14-signed-denials.js';
import {renderSecurityAcceptance} from '../board-security-ui.js';

const uid='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const claim={user_id:uid,workspace_id:ws,profile:{status:'active'}};
function fixture({bootstrap=false,grant=true,deny=true,
 noForeign=false,malformed=false,expired=false,switched=false}={}){
 const calls=[];let seen=0;
 const auth={userId:uid,async getVerifiedUser(){
  seen++;
  return {id:switched&&seen>1?other:uid};
 }};
 const api={
  async context(){return {...claim};},
  async rpc(name,args){
   calls.push({name,args});
   if(name==='apsyntra_role_is_bootstrap')return bootstrap;
   if(name==='has_module_access')return grant;
   if(name==='frt_bootstrap')return {
    membership:{user_id:uid,workspace_id:ws,enabled:true,
      status:'active',role:'FINANCE_MANAGER'},
    companies:[{code:'WASS',name:'WASS'}]
   };
   if(name==='frt_sec14_auto_foreign_denials'){
    if(expired)throw Object.assign(Error('expired'),{status:401});
    if(malformed)return {status:'PASS',foreignWorkspaceExistence:'VERIFIED'};
    if(noForeign)return {status:'PENDING',reason:'NO_INDEPENDENT_FOREIGN_WORKSPACE',
     foreignWorkspaceExistence:'NOT_VERIFIED',dashboard:'PENDING',list:'PENDING'};
    if(deny)return {status:'PASS',reason:'FOREIGN_WORKSPACE_DENIAL_VERIFIED',
     foreignWorkspaceExistence:'VERIFIED',dashboard:'PASS',list:'PASS'};
    return {status:'FAIL',reason:'FOREIGN_WORKSPACE_ACCESS_NOT_DENIED',
     foreignWorkspaceExistence:'VERIFIED',dashboard:'FAIL',list:'FAIL'};
   }
   throw Error('Unexpected backend name: '+name);
  }
 };
 return {auth,api,calls};
}
test('signed nonbootstrap active grant receives two explicit server 42501 foreign-scope denials',async()=>{
 const f=fixture();
 const r=await runSEC14SignedDenials(f);
 assert.equal(r.scenario,'NONBOOTSTRAP');
 assert.equal(r.role,'FINANCE_MANAGER');
 assert.equal(r.status,'PASS');
 assert.equal(r.reason,'FOREIGN_WORKSPACE_DENIAL_VERIFIED');
 assert.deepEqual(r.checks.map(x=>x.status),Array(7).fill('PASS'));
 assert.equal(r.foreignWorkspaceExistence,'VERIFIED');
 const scoped=f.calls.filter(x=>x.name==='frt_sec14_auto_foreign_denials');
 assert.equal(scoped.length,1);
 assert.deepEqual(scoped[0].args,{p_workspace_id:ws});
 assert.ok(!f.calls.some(x=>/^(frt_get_request|frt_list_requests|frt_dashboard|frt_request_action)$/.test(x.name)));
 assert.equal(r.writesAttempted,0);
 assert.equal(r.roleChangesAttempted,0);
 const safe=sanitizeSEC14SignedDenials(r);
 assert.doesNotMatch(safe,/11111111|22222222|33333333|email|access_token/i);
 assert.equal(JSON.parse(safe).status,'PASS');
});
test('bootstrap sessions cannot manufacture nonbootstrap acceptance',async()=>{
 const f=fixture({bootstrap:true});
 const r=await runSEC14SignedDenials(f);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'NONBOOTSTRAP_SESSION_REQUIRED');
 assert.ok(!f.calls.some(x=>x.name==='frt_board_list_safe'));
});
test('no FRT grant or independent foreign workspace remains fail-closed',async()=>{
 const denied=await runSEC14SignedDenials(fixture({grant:false}));
 assert.equal(denied.status,'BLOCKED');
 assert.equal(denied.reason,'NONBOOTSTRAP_FRT_GRANT_REQUIRED');
 const empty=await runSEC14SignedDenials(fixture({noForeign:true}));
 assert.equal(empty.status,'PENDING');
 assert.equal(empty.reason,'NO_INDEPENDENT_FOREIGN_WORKSPACE');
 assert.equal(empty.foreignWorkspaceExistence,'NOT_VERIFIED');
});
test('foreign scope disclosure fails; JWT expiration, misleading denial codes and account switch never pass',async()=>{
 const open=await runSEC14SignedDenials(fixture({deny:false}));
 assert.equal(open.status,'FAIL');
 assert.equal(open.reason,'FOREIGN_WORKSPACE_ACCESS_NOT_DENIED');
 const wrong=await runSEC14SignedDenials(fixture({malformed:true}));
 assert.equal(wrong.status,'BLOCKED');
 assert.equal(wrong.reason,'AUTO_FOREIGN_WORKSPACE_CONTRACT_INVALID');
 const expired=await runSEC14SignedDenials(fixture({expired:true}));
 assert.equal(expired.status,'BLOCKED');
 const switched=await runSEC14SignedDenials(fixture({switched:true}));
 assert.equal(switched.status,'FAIL');
});
test('SEC14 denial export allowlists fields and Security page escapes output',()=>{
 const fake=sanitizeSEC14SignedDenials({
  status:'PASS',scenario:'NONBOOTSTRAP',role:'GENERAL_MANAGER',
  checks:[{name:'<img onerror=alert(1)>',status:'PASS'}],
  otherWorkspaceId:other,access_token:'SECRET',writesAttempted:99
 });
 assert.equal(JSON.parse(fake).checks[0].name,'invalid-check');
 assert.equal(JSON.parse(fake).status,'PASS');
 assert.doesNotMatch(fake,/SECRET|33333333|onerror/);
 const render=renderSecurityAcceptance({
  context:claim,
  sec14DenialResult:{status:'BLOCKED',scenario:'<svg onload=alert(1)>',
    reason:'EXISTING_FOREIGN_WORKSPACE_ID_REQUIRED',
    checks:[{name:'<b>secret</b>',status:'FAIL'}]}
 });
 assert.match(render,/security-sec14-denial/);
 assert.match(render,/security-sec14-denial-copy/);
 assert.doesNotMatch(render,/id="security-sec14-foreign-workspace"/);
 assert.match(render,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(render,/<svg onload=/);
});
test('SEC14 app invalidates denial results on workspace switch, logout, sign-in and expiration',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'security-sec14-denial'/);
 assert.match(app,/case 'security-sec14-denial-copy'/);
 assert.ok(app.includes("runSEC14SignedDenials({auth,api:db})"));
 assert.ok(!app.includes("getElementById('security-sec14-foreign-workspace')"));
 assert.equal((app.match(/state\.sec14DenialResult=null;state\.sec14DenialRunId\+\+;state\.sec14DenialBusy=false;/g)||[]).length,4);
});
