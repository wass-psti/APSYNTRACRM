import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 runPhaseBSignedDenial,renderPhaseBSignedDenial,sanitizePhaseBDenialReport
} from '../board-col-delete-phase-b-signed-denial.js';
import {B4_QA_BOARD_ID} from '../board-column-recovery.js';

const signedActor='11111111-1111-4111-8111-111111111111';
const signedWorkspace='22222222-2222-4222-8222-222222222222';
function fixture({manage=true,view=manage,validSession=true,flipSession=false,
 recovery='expected',boardRead='denied'}={}){
 const calls=[];
 let identityChecks=0;
 const auth={
  userId:signedActor,
  getVerifiedUser:async()=>{
   calls.push('getVerifiedUser');
   identityChecks++;
   if(!validSession)throw Error('Unauthenticated');
   return {id:flipSession&&identityChecks>1?signedWorkspace:signedActor};
  }
 };
 const api={
  context:async()=>{calls.push('context');return {
   user_id:signedActor,workspace_id:signedWorkspace,profile:{status:'active'}
  }},
  allowed:async(id,level)=>{
   calls.push('allowed:'+level);
   assert.equal(id,B4_QA_BOARD_ID);
   return level==='manage'?manage:view;
  },
  board:async(id)=>{
   calls.push('board');
   assert.equal(id,B4_QA_BOARD_ID);
   if(boardRead==='allowed')return {board:{id}};
   throw {status:404,code:'42501',message:'Board not found'};
  },
  rpc:async(name,args)=>{
   calls.push('rpc');
   assert.equal(name,'wm_list_recoverable_board_columns');
   assert.deepEqual(args,{p_board_id:B4_QA_BOARD_ID});
   if(recovery==='allowed')return [];
   if(recovery==='unknown')throw {status:403,code:'42501',message:'Unexpected backend detail'};
   if(recovery==='transport')throw {status:0,message:'Network unavailable'};
   throw {status:403,code:'42501',message:manage?
    'COL_RECOVERY_LIST_NOT_ACTIVATED':'COL_RECOVERY_LIST_AUTHORIZATION_DENIED'};
  }
 };
 return {auth,api,calls};
}
test('signed manager observes B5 default-off denial under genuine session, no writes',async()=>{
 const fx=fixture();
 const r=await runPhaseBSignedDenial(fx);
 assert.equal(r.status,'PASS');
 assert.equal(r.caseType,'SIGNED_MANAGER');
 assert.equal(r.managerBoundary,'NOT_APPLICABLE');
 assert.equal(r.foreignWorkspace,'PENDING');
 assert.equal(r.revokedSession,'PENDING');
 assert.equal(r.expiredSession,'PENDING');
 assert.equal(r.writeAttempts,0);
 assert.equal(fx.calls.filter(x=>x==='rpc').length,1);
 assert.equal(fx.calls.filter(x=>x==='getVerifiedUser').length,2);
 assert.equal(fx.calls.includes('board'),false);
});
test('signed non-manager is denied manage and recovery index without mutations',async()=>{
 const fx=fixture({manage:false,view:true});
 const r=await runPhaseBSignedDenial(fx);
 assert.equal(r.status,'PASS');
 assert.equal(r.caseType,'SIGNED_NONMANAGER');
 assert.equal(r.managerBoundary,'PASS');
 assert.equal(r.nonmemberRead,'NOT_APPLICABLE');
 assert.equal(fx.calls.filter(x=>x==='rpc').length,1);
});
test('nonmember read is denied and manager recovery is denied but foreign workspace is still unproven',async()=>{
 const fx=fixture({manage:false,view:false});
 const r=await runPhaseBSignedDenial(fx);
 assert.equal(r.status,'PASS');
 assert.equal(r.nonmemberRead,'PASS');
 assert.equal(r.managerBoundary,'PASS');
 assert.equal(r.foreignWorkspace,'PENDING');
 assert.equal(fx.calls.filter(x=>x==='board').length,1);
});
test('unexpectedly readable nonmember board fails closed before recovery request',async()=>{
 const fx=fixture({manage:false,view:false,boardRead:'allowed'});
 const r=await runPhaseBSignedDenial(fx);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'UNAUTHORIZED_QA_BOARD_READ');
 assert.equal(fx.calls.includes('rpc'),false);
});
test('backend recovery unexpectedly allowed is a failure, not a PASS',async()=>{
 const fx=fixture({recovery:'allowed'});
 const r=await runPhaseBSignedDenial(fx);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'RECOVERY_UNEXPECTEDLY_ALLOWED');
});
test('unknown denial reason, transport errors and mismatched signed sessions cannot be certified',async()=>{
 for(const mode of ['unknown','transport']){
  const r=await runPhaseBSignedDenial(fixture({recovery:mode}));
  assert.equal(r.status,'INCONCLUSIVE');
  assert.equal(r.reason,'RECOVERY_DENIAL_NOT_VERIFIED');
 }
 const invalid=fixture({validSession:false});
 assert.equal((await runPhaseBSignedDenial(invalid)).status,'BLOCKED');
 assert.equal(invalid.calls.includes('rpc'),false);
 const changed=fixture({flipSession:true});
 assert.equal((await runPhaseBSignedDenial(changed)).status,'BLOCKED');
});
test('JWT absence or rejected auth never becomes a false revoked-session PASS',async()=>{
 const r=await runPhaseBSignedDenial({auth:{userId:signedActor,
  getVerifiedUser:async()=>{throw {status:401,message:'Session revoked'};}},api:{
  context:async()=>({}),allowed:async()=>true,board:async()=>null,rpc:async()=>[]
 }});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.revokedSession,'PENDING');
});
test('report redacts actor, workspace, board and tokens and preserves pending cases',()=>{
 const s=sanitizePhaseBDenialReport({
  status:'PASS',reason:'NONE',caseType:'SIGNED_MANAGER',
  managerBoundary:'NOT_APPLICABLE',nonmemberRead:'NOT_APPLICABLE',
  foreignWorkspace:'PASS',revokedSession:'PASS',expiredSession:'PASS',
  userId:signedActor,workspace:signedWorkspace,boardId:B4_QA_BOARD_ID,
  access_token:'SUPER_SECRET'
 });
 const data=JSON.parse(s);
 assert.equal(data.status,'PASS');
 assert.equal(data.foreignWorkspace,'PENDING');
 assert.equal(data.revokedSession,'PENDING');
 assert.equal(data.expiredSession,'PENDING');
 assert.equal(data.identifiersDisclosed,false);
 assert.equal(data.writeAttempts,0);
 assert.doesNotMatch(s,/SUPER_SECRET|8491b933|11111111|22222222/);
});
test('Security UI is read-only, explicit, and clears on signout, expiry and workspace changes',()=>{
 const html=renderPhaseBSignedDenial({report:{status:'PASS',reason:'NONE'}});
 assert.match(html,/security-col-delete-denial-run/);
 assert.match(html,/security-col-delete-denial-copy/);
 assert.doesNotMatch(html,/password|token|8491b933/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/runPhaseBSignedDenial\(\{auth,api:db\}\)/);
 assert.match(app,/renderPhaseBSignedDenial\(\{busy:state\.phaseBDenialBusy,report:state\.phaseBDenialReport\}\)/);
 assert.match(app,/state\.phaseBDenialRunId\+\+;state\.phaseBDenialBusy=false;state\.phaseBDenialReport=null/);
 assert.match(app,/case 'security-col-delete-denial-run':/);
 assert.match(app,/case 'security-col-delete-denial-copy':/);
});
