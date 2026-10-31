import test from 'node:test';
import assert from 'node:assert/strict';
import {liveConfig,jwtSessionId,sanitizedResult,PRODUCTION_REF} from '../../scripts/cp-frt-sec10-live-guards.mjs';
import {runIsolatedSEC10} from '../../scripts/cp-frt-sec10-nonprod-acceptance.mjs';

const ref='abcdefghijklmnopqrst';
const ws='11111111-1111-4111-8111-111111111111';
const board='22222222-2222-4222-8222-222222222222';
const admin='33333333-3333-4333-8333-333333333333';
const member='44444444-4444-4444-8444-444444444444';
const change='55555555-5555-4555-8555-555555555555';
const config=()=>({
 SEC10_CONFIRM_ISOLATED_MUTATIONS:'ISOLATED_NONPRODUCTION_ONLY',
 SEC10_PROJECT_REF:ref,SEC10_SUPABASE_URL:'https://'+ref+'.supabase.co',
 SEC10_WORKSPACE_ID:ws,SEC10_BOARD_ID:board,
 SEC10_PUBLISHABLE_KEY:'sb_publishable_mock_fixture_value_0001',
 SEC10_BOOTSTRAP_EMAIL:'admin@example.test',SEC10_BOOTSTRAP_PASSWORD:'not-real-admin',
 SEC10_MEMBER_EMAIL:'member@example.test',SEC10_MEMBER_PASSWORD:'not-real-member'
});
function claim(id,n){
 const payload={sub:id,session_id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),
  iat:1780000000+n,exp:1780003600+n};
 return 'header.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.signature';
}
function simulatedSupabase({owner=true,frt=true,bootstrap=true,dropViewerAck=false}={}){
 let role=null,revision=null,sequence=0;
 const tokens=new Map(),writes=[],calls=[];
 const okay=(body,status=200)=>({ok:status>=200&&status<300,status,
   json:async()=>body});
 const deny=(status)=>okay({code:'PGRST_EXCEPTION'},status);
 async function fetcher(u,opts={}){
  const url=new URL(u);const path=url.pathname;calls.push(path);
  if(path==='/auth/v1/token'){
   const body=JSON.parse(opts.body||'{}');
   const id=body.email==='admin@example.test'&&body.password==='not-real-admin'
    ?admin:body.email==='member@example.test'&&body.password==='not-real-member'?member:null;
   if(!id)return deny(401);
   const token=claim(id,++sequence);tokens.set(token,id);
   return okay({access_token:token,refresh_token:'fake',user:{id}});
  }
  const token=String(opts.headers?.Authorization||'').replace('Bearer ','');
  const actor=tokens.get(token);
  if(!actor)return deny(401);
  if(path==='/auth/v1/user')return okay({id:actor});
  if(path==='/auth/v1/logout')return okay({});
  if(!path.startsWith('/rest/v1/rpc/'))return deny(404);
  const rpc=path.split('/').pop(),args=JSON.parse(opts.body||'{}');
  if(rpc==='wm_auth_access_context')return okay({user_id:actor,workspace_id:ws,
   profile:{status:'active',platform_role:actor===admin?'admin_general_manager':'employee'}});
  if(rpc==='apsyntra_role_is_bootstrap')return okay(actor===admin&&bootstrap);
  if(rpc==='apsyntra_crm_my_effective_access'&&actor===member)
   return okay({schemaVersion:1,workspaceId:ws,bootstrap:false,
    effectivePlatformRole:role||'employee',explicitPlatformRole:role,
    boards:[{id:board,memberRole:owner?'owner':'viewer',
      view:true,edit:role!=='viewer'&&owner,manage:role===null&&owner}],
    modules:[{moduleId:'fund-released-tracker',allowed:frt&&role!=='viewer',role:frt?'FINANCE_MANAGER':null}]});
  if(rpc==='apsyntra_crm_platform_role_snapshot'){
   if(actor!==admin)return deny(403);
   return okay({bootstrapVerified:true,workspaceId:ws,roles:[
    {userId:member,assignedRole:role,effectiveRole:role||'employee',updatedAt:revision}]});
  }
  if(rpc==='work_board_access'&&actor===member){
   const access=args.p_required==='view'?true:
    args.p_required==='edit'?role!=='viewer'&&owner:role===null&&owner;
   return okay(access);
  }
  if(rpc==='has_module_access'&&actor===member)return okay(frt&&role!=='viewer');
  if(rpc==='apsyntra_crm_platform_role_set'&&actor===admin){
   if(args.p_workspace_id!==ws||args.p_target_user_id!==member)return deny(403);
   if((args.p_expected_updated_at??null)!==revision)return deny(409);
   if(role===args.p_role)return deny(409);
   role=args.p_role;
   revision=role===null?null:'2026-10-31T05:00:'+String(writes.length+1).padStart(2,'0')+'.000Z';
   writes.push(role);
   if(dropViewerAck&&role==='viewer')throw Error('network response dropped');
   return okay({scope:'crm-platform',effective:true,workspaceId:ws,
    targetUserId:member,changeId:change,currentRevision:revision,
    after:role===null?null:{role,updatedAt:revision},
    effectiveRole:role||'employee'});
  }
  return deny(404);
 }
 return {fetcher,writes,calls,current:()=>({role,revision})};
}
test('rejects production project, URL mismatch, and missing mutation confirmation before network',async()=>{
 let calls=0;const f=()=>{calls++;throw Error('network should never run')};
 for(const env of [
  {...config(),SEC10_PROJECT_REF:PRODUCTION_REF,SEC10_SUPABASE_URL:'https://'+PRODUCTION_REF+'.supabase.co'},
  {...config(),SEC10_CONFIRM_ISOLATED_MUTATIONS:'no'},
  {...config(),SEC10_SUPABASE_URL:'https://'+PRODUCTION_REF+'.supabase.co'},
  {...config(),SEC10_MEMBER_EMAIL:'admin@example.test'}
 ]){
  const r=await runIsolatedSEC10(env,f);
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.reason,'NONPRODUCTION_CONFIG_NOT_VERIFIED');
 }
 assert.equal(calls,0);
});
test('genuine-login orchestration contract performs viewer -> supervisor -> restored, stale CAS, and 3 distinct sessions',async()=>{
 const service=simulatedSupabase();
 const r=await runIsolatedSEC10(config(),service.fetcher);
 assert.equal(r.status,'CAPABILITY_PASS_AUDIT_PENDING');
 assert.equal(r.verifiedSessionCount,3);
 assert.equal(r.transitionCount,3);
 assert.equal(r.mutationAttempts,4);
 assert.deepEqual(service.writes,['viewer','supervisor',null]);
 assert.equal(service.current().role,null);
 assert.ok(r.steps.every(x=>x.status==='PASS'));
 assert.equal(r.steps.length,5);
 const output=sanitizedResult(r);
 assert.doesNotMatch(output,/not-real-|sb_publishable_mock|header\.|signature|@|33333333|44444444|abcdefghijklmnopqrst/);
 assert.equal(JSON.parse(output).independentAuditVerified,false);
});
test('no staged mutations when original owner or FRT grants are absent',async()=>{
 for(const option of [{owner:false},{frt:false}]){
  const service=simulatedSupabase(option);
  const r=await runIsolatedSEC10(config(),service.fetcher);
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.reason,'ORIGINAL_BOARD_OWNER_AND_FRT_GRANT_REQUIRED');
  assert.equal(service.writes.length,0);
 }
});
test('bootstrap verification required before any role setter access',async()=>{
 const service=simulatedSupabase({bootstrap:false});
 const r=await runIsolatedSEC10(config(),service.fetcher);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'BOOTSTRAP_NOT_VERIFIED');
 assert.deepEqual(service.writes,[]);
});
test('uncertain mutation receipts never trigger unsafe automatic recovery',async()=>{
 const service=simulatedSupabase({dropViewerAck:true});
 const r=await runIsolatedSEC10(config(),service.fetcher);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'MANUAL_ISOLATED_ROLE_RECOVERY_REQUIRED');
 assert.equal(r.mutationAttempts,1);
 assert.deepEqual(service.writes,['viewer']);
});
test('JWT session lineage never makes authorization decisions from role claims',()=>{
 assert.throws(()=>jwtSessionId('garbage'),/SIGNED_JWT_REQUIRED/);
 const p=jwtSessionId(claim(member,2));
 assert.equal(p.userId,member);
 assert.ok(p.sessionId.startsWith('00000000-'));
 const c=liveConfig(config());
 assert.equal(c.ref,ref);
 assert.equal(c.boardId,board);
});
