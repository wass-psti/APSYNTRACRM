import test from 'node:test';
import assert from 'node:assert/strict';
import {runFuelTrackSignedPreflight} from '../fueltrack-v3-signed-preflight.js';
import {renderFuelTrackV3Application,FUELTRACK_V3_ID} from '../fueltrack-v3-application.js';

const workspace='00000000-0000-4000-8000-000000000001';
const forbidden=Object.assign(new Error('Denied'),{status:403});
function harness(role='Admin',wrongBoardDenied=true){
 const calls=[];
 const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const auth={isSignedIn:true,userId,getVerifiedUser:async()=>{calls.push('auth-user');return {id:userId};}};
 const client={
  auth,boardId:FUELTRACK_V3_ID,workspaceId:workspace,
  read:async()=>{calls.push('read');return {role,status:'VERIFIED_READ'};},
  analytics:async()=>{calls.push('analytics');return {};},
  audit:async()=>{calls.push('audit');if(role==='User')throw forbidden;return {};},
 };
 const api={auth,rpc:async(name,args)=>{calls.push(name);
  if(name==='fueltrack_v3_read'&&args.p_board_id!=='7af78b3f-67bf-4600-9aa1-9006d19d486e'){
   if(wrongBoardDenied)throw forbidden;
  }
  if(name==='fueltrack_v3_receipt_read'||name==='fueltrack_v3_receipt_prepare')throw forbidden;
  return {status:'VERIFIED_READ',boardId:args.p_board_id};
 }};
 return {client,api,calls,boardId:FUELTRACK_V3_ID};
}
test('same-session Admin verification performs only signed reads and a denied wrong-Board read',async()=>{
 const h=harness();
 const result=await runFuelTrackSignedPreflight(h);
 assert.equal(result.status,'READ_ONLY_PREFLIGHT_PASS');
 assert.equal(result.role,'Admin');
 assert.deepEqual(result.checks,[
  'AUTH_IDENTITY_VERIFIED','SIGNED_READ_SCOPED','SIGNED_ANALYTICS_SCOPED',
  'ADMIN_AUDIT_SCOPED','WRONG_BOARD_DENIED',
  'UNKNOWN_RECEIPT_READ_DENIED','UNKNOWN_RECEIPT_PREPARE_DENIED'
 ]);
 assert.deepEqual(h.calls,['auth-user','read','analytics','audit','fueltrack_v3_read','fueltrack_v3_receipt_read','fueltrack_v3_receipt_prepare']);
 assert.ok(result.checks.includes('WRONG_BOARD_DENIED'));
});
test('User role must be denied audit; no token or mutation API is accepted',async()=>{
 const h=harness('User');
 const result=await runFuelTrackSignedPreflight(h);
 assert.equal(result.role,'User');
 assert.ok(result.checks.includes('AUTH_IDENTITY_VERIFIED'));
 assert.ok(result.checks.includes('USER_AUDIT_DENIED'));
 assert.ok(result.checks.includes('UNKNOWN_RECEIPT_READ_DENIED'));
 assert.ok(result.checks.includes('UNKNOWN_RECEIPT_PREPARE_DENIED'));
 assert.deepEqual(h.calls,['auth-user','read','analytics','audit','fueltrack_v3_read','fueltrack_v3_receipt_read','fueltrack_v3_receipt_prepare']);
});
test('a permissive wrong Board or receipt endpoint causes failure, never a claimed acceptance',async()=>{
 await assert.rejects(runFuelTrackSignedPreflight(harness('Admin',false)),/WRONG_BOARD_DENIED FAILED/);
 const h=harness();
 h.api.rpc=async(name,args)=>{
  h.calls.push(name);
  if(name==='fueltrack_v3_read'&&args.p_board_id!=='7af78b3f-67bf-4600-9aa1-9006d19d486e')throw forbidden;
  if(name==='fueltrack_v3_receipt_prepare')return {status:'VERIFIED_RECEIPT_PREPARE'};
  throw forbidden;
 };
 await assert.rejects(runFuelTrackSignedPreflight(h),/UNKNOWN_RECEIPT_PREPARE_DENIED FAILED/);
});
test('same authenticated AuthClient must back both domain client and RPC transport',async()=>{
 const h=harness();
 h.api.auth={isSignedIn:true,userId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
 await assert.rejects(runFuelTrackSignedPreflight(h),/same signed session/);
 assert.deepEqual(h.calls,[]);
});
test('preflight verifies the live Auth identity and aborts if the page context changes',async()=>{
 const h=harness();
 await assert.rejects(runFuelTrackSignedPreflight({...h,isCurrent:()=>false}),/page context changed/);
 const mismatch=harness();
 mismatch.client.auth.getVerifiedUser=async()=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
 await assert.rejects(runFuelTrackSignedPreflight(mismatch),/identity verification/);
});
test('missing or improperly denied credentials fail closed',async()=>{
 const h=harness();
 h.client.read=async()=>{throw forbidden;};
 await assert.rejects(runFuelTrackSignedPreflight(h),/Denied/);
 const bad=harness('User');
 bad.client.audit=async()=>({});
 await assert.rejects(runFuelTrackSignedPreflight(bad),/FAILED/);
 await assert.rejects(runFuelTrackSignedPreflight({}),/same signed session/);
});
test('UI shows an explicit, escaped, read-only action with scoped result',()=>{
 const detail={board:{id:FUELTRACK_V3_ID,workspace_id:workspace,name:'FuelTrack+ v3',
  description:'[APSYNTRA:MODULE:fueltrack:v1] Verified board',status:'active'},
  items:[],columns:[],values:[]};
 const html=renderFuelTrackV3Application({detail,backend:{
  preflight:{status:'READ_ONLY_PREFLIGHT_PASS',role:'Admin',checks:['SIGNED_READ_SCOPED']}}});
 assert.match(html,/data-action="ft3-signed-preflight"/);
 assert.match(html,/read-only/);
 assert.match(html,/Signed read checks passed/);
 const failed=renderFuelTrackV3Application({detail,backend:{
  preflight:{status:'PREFLIGHT_BLOCKED',message:'<script>alert(1)</script>'}}});
 assert.doesNotMatch(failed,/<script>/);
 assert.match(failed,/&lt;script&gt;/);
 const busy=renderFuelTrackV3Application({detail,backend:{preflightBusy:true}});
 assert.match(busy,/ft3-signed-preflight" disabled/);
});
