import test from 'node:test';
import assert from 'node:assert/strict';
import {runFuelTrackSignedPreflight} from '../fueltrack-v3-signed-preflight.js';
import {renderFuelTrackV3Application,FUELTRACK_V3_ID} from '../fueltrack-v3-application.js';

const workspace='00000000-0000-4000-8000-000000000001';
const forbidden=Object.assign(new Error('Denied'),{status:403});
function harness(role='Admin',wrongBoardDenied=true){
 const calls=[];
 const client={
  read:async()=>{calls.push('read');return {role,status:'VERIFIED_READ'};},
  analytics:async()=>{calls.push('analytics');return {};},
  audit:async()=>{calls.push('audit');if(role==='User')throw forbidden;return {};},
 };
 const api={rpc:async(name,args)=>{calls.push(name);
  if(wrongBoardDenied)throw forbidden;
  return {status:'VERIFIED_READ',boardId:args.p_board_id};
 }};
 return {client,api,calls,boardId:FUELTRACK_V3_ID};
}
test('same-session Admin verification performs only signed reads and a denied wrong-Board read',async()=>{
 const h=harness();
 const result=await runFuelTrackSignedPreflight(h);
 assert.equal(result.status,'READ_ONLY_PREFLIGHT_PASS');
 assert.equal(result.role,'Admin');
 assert.deepEqual(h.calls,['read','analytics','audit','fueltrack_v3_read']);
 assert.ok(result.checks.includes('WRONG_BOARD_DENIED'));
});
test('User role must be denied audit; no token or mutation API is accepted',async()=>{
 const h=harness('User');
 const result=await runFuelTrackSignedPreflight(h);
 assert.equal(result.role,'User');
 assert.ok(result.checks.includes('USER_AUDIT_DENIED'));
 assert.deepEqual(h.calls,['read','analytics','audit','fueltrack_v3_read']);
});
test('a permissive wrong Board causes failure, never a claimed acceptance',async()=>{
 await assert.rejects(runFuelTrackSignedPreflight(harness('Admin',false)),/FAILED/);
});
test('missing or improperly denied credentials fail closed',async()=>{
 const h=harness();
 h.client.read=async()=>{throw forbidden;};
 await assert.rejects(runFuelTrackSignedPreflight(h),/Denied/);
 const bad=harness('User');
 bad.client.audit=async()=>({});
 await assert.rejects(runFuelTrackSignedPreflight(bad),/FAILED/);
 await assert.rejects(runFuelTrackSignedPreflight({}),/required/);
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
