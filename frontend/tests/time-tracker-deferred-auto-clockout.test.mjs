import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
import {runPendingTimeTrackerAutoClockout} from '../apps/TimeTracker/time-tracker-auto-clockout-execution.js';

const app=readFileSync('frontend/app.js','utf8');
const native=readFileSync('frontend/time-tracker-native.js','utf8');
const ui=readFileSync('frontend/time-tracker-ui.js','utf8');
const execution=readFileSync('frontend/apps/TimeTracker/time-tracker-auto-clockout-execution.js','utf8');
const migration=readFileSync(
 'supabase/migrations/20261124050317_cp_tt_deferred_foreground_clockout_01.sql',
 'utf8'
);

const user='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const workspace='00000000-0000-4000-8000-000000000001';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const recordId='00000000-0000-4000-8000-000000000099';
const scheduled='2026-11-20T10:30:00.000Z';
const capturedAt='2026-11-20T10:45:00.000Z';
const geo={status:'captured',source:'browser-geolocation',latitude:10.2,
 longitude:123.9,accuracy:14,capturedAt};

function pendingSnapshot(){
 return {status:'VERIFIED_READ',active:{id:recordId},
  autoClockout:{recordId,status:'PENDING_GPS',scheduledClockOutAt:scheduled,
   pendingAt:'2026-11-20T10:31:00.000Z'},
  records:[{id:recordId,status:'Active',automatic:false}]};
}
function harness({capture,complete,snapshot,ttView='clock'}={}){
 const state={view:'board',tab:'attendance',ttView,boardId:board,
  context:{user_id:user,workspace_id:workspace},
  ttAttendance:pendingSnapshot(),ttAutoClockoutBusy:false,ttAutoClockoutRunId:0,
  ttBusy:false,ttClockPending:null,ttGeoPromptVisible:false,ttGeoPermission:'unknown',
  ttGeoMessage:'',ttClockStage:'idle',ttError:'',ttSuccess:''};
 let captures=0,completions=0,reads=0,renders=0,captureOptions=null;
 const captureGps=async(_geo,options)=>{
  captures++;captureOptions=options;
  if(capture)return capture(_geo,options);
  options?.onProgress?.('Finding your GPS location…');
  return geo;
 };
 const timeTracker={
  async completeAutomaticClockOut(...args){completions++;return complete?
   complete(...args):{mode:'COMMITTED',scheduledClockOutAt:scheduled,
    gpsCapturedAt:geo.capturedAt,recordId};},
  async snapshot(...args){reads++;return snapshot?snapshot(...args):{
   status:'VERIFIED_READ',active:null,
   records:[{id:recordId,status:'Completed',automatic:true,clockOut:scheduled}]
  };}
 };
 const run=()=>runPendingTimeTrackerAutoClockout({
  state,seq:7,getRouteSerial:()=>7,identity:user,workspaceId:workspace,boardId:board,
  auth:{isSignedIn:true},navigator:{geolocation:{}},
  captureAttendanceGeo:captureGps,timeTracker,render:()=>{renders++;},
  formatTimeTrackerAutoClockoutTime:value=>value===scheduled?'06:30 PM':'06:45 PM',
  errorMessage:error=>String(error?.message||error)
 });
 return {state,run,counters:()=>({captures,completions,reads,renders,captureOptions})};
}

test('TimeTracker module entry invokes automatic completion only for a persisted PENDING_GPS session',()=>{
 assert.match(app,/state\.ttAttendance\?\.autoClockout\?\.status==='PENDING_GPS'/);
 assert.match(app,/runPendingTimeTrackerAutoClockout/);
 assert.match(execution,/captureAttendanceGeo\(navigator\.geolocation/);
 assert.match(execution,/freshOnly:true/);
 assert.match(execution,/completeAutomaticClockOut/);
 assert.match(native,/maximumAge:freshOnly===true\?0/);
 assert.match(native,/timetracker_auto_clockout_complete/);
});

test('foreground GPS success commits once, preserves the scheduled cutoff and confirms readback',async()=>{
 const sim=harness();
 await sim.run();
 assert.equal(sim.counters().captures,1);
 assert.equal(sim.counters().completions,1);
 assert.equal(sim.counters().reads,1);
 assert.equal(sim.counters().captureOptions.freshOnly,true);
 assert.equal(sim.state.ttAttendance.active,null);
 assert.match(sim.state.ttSuccess,/06:30 PM/);
 assert.match(sim.state.ttSuccess,/06:45 PM/);
 assert.equal(sim.state.ttError,'');
 assert.equal(sim.state.ttBusy,false);
 assert.equal(sim.state.ttAutoClockoutBusy,false);
 assert.equal(sim.state.ttGeoPromptVisible,false);
});

test('ambiguous completion response is reconciled from the signed attendance snapshot',async()=>{
 const sim=harness({
  complete:async()=>{throw new Error('Network timeout after the database commit');},
  snapshot:()=>({status:'VERIFIED_READ',active:null,
   records:[{id:recordId,status:'Completed',automatic:true,clockOut:scheduled}]})
 });
 await sim.run();
 assert.equal(sim.counters().completions,1);
 assert.equal(sim.counters().reads,1);
 assert.equal(sim.state.ttAttendance.active,null);
 assert.match(sim.state.ttSuccess,/committed and verified/);
 assert.equal(sim.state.ttError,'');
 assert.equal(sim.state.ttGeoPromptVisible,false);
});

test('unavailable readback after an ambiguous commit never claims completion or retries automatically',async()=>{
 const sim=harness({
  complete:async()=>{throw new Error('Network timeout');},
  snapshot:()=>{throw new Error('Signed read unavailable');}
 });
 await sim.run();
 assert.equal(sim.counters().completions,1);
 assert.equal(sim.counters().reads,1);
 assert.match(sim.state.ttError,/outcome is uncertain/);
 assert.equal(sim.state.ttSuccess,'');
 assert.equal(sim.state.ttBusy,false);
});

test('GPS denial leaves the durable automatic clock-out pending and sends no completion request',async()=>{
 const sim=harness({capture:async()=>{
  const error=new Error('Browser location permission denied');
  error.code='TT_GEO_DENIED';
  throw error;
 }});
 await sim.run();
 assert.equal(sim.counters().captures,1);
 assert.equal(sim.counters().completions,0);
 assert.equal(sim.counters().reads,0);
 assert.equal(sim.state.ttAttendance.autoClockout.status,'PENDING_GPS');
 assert.match(sim.state.ttError,/remains pending/);
 assert.match(sim.state.ttGeoMessage,/reopen TimeTracker/);
 assert.equal(sim.state.ttGeoPermission,'denied');
 assert.equal(sim.state.ttBusy,false);
 assert.equal(sim.state.ttAutoClockoutBusy,false);
});

test('no pending session means no GPS prompt and no automatic clock-out RPC',async()=>{
 const sim=harness();
 sim.state.ttAttendance.autoClockout={recordId,status:'GRACE'};
 await sim.run();
 assert.equal(sim.counters().captures,0);
 assert.equal(sim.counters().completions,0);
 assert.equal(sim.state.ttBusy,false);
});

test('pending state is visible in the Clock UI without a stale countdown',()=>{
 const record={id:recordId,ownerId:'cloud:'+user,clockIn:'2026-11-20T00:00:00.000Z',
  location:'Office-Base Duty',department:'Information Technology',status:'Active'};
 const html=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access:{userId:user,moduleRole:'Employee',
   attendanceWritesAccepted:true},records:[record],active:record,
   autoClockout:{recordId,status:'PENDING_GPS',scheduledClockOutAt:scheduled,
    pendingAt:'2026-11-20T10:31:00.000Z'},autoClockoutUnavailable:false,otRequests:[],
   employeeDepartment:'Information Technology'},
  view:'clock',now:'2026-11-20T10:45:00.000Z',busy:true,
  geoPromptVisible:true,geoPermission:'unknown',
  geoMessage:'Acquiring fresh GPS…',clockStage:'auto-location'
 });
 assert.match(html,/Automatic clock-out pending · fresh foreground GPS required/);
 assert.match(html,/Getting GPS for automatic clock-out/);
 assert.doesNotMatch(html,/data-tt-auto-clockout-countdown/);
});

test('database migration converts due states to PENDING_GPS and preserves atomic foreground completion',()=>{
 assert.match(migration,/ADD COLUMN IF NOT EXISTS pending_at timestamptz/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS scheduled_clock_out_at timestamptz/);
 assert.match(migration,/v_status:='PENDING_GPS';\s+v_reason:='approved_overtime_ended'/);
 assert.match(migration,/v_status:='PENDING_GPS';\s+v_reason:='nine_hour_threshold_grace_expired'/);
 assert.match(migration,/IF v_clock_out_at IS NOT NULL AND v_status<>''PENDING_GPS'' THEN/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.timetracker_auto_clockout_complete/);
 assert.match(migration,/p_geo->>'capturedAt'/);
 assert.match(migration,/module_state_invariants_valid/);
 assert.match(migration,/timetracker_attendance_mutation_audit/);
 assert.match(migration,/tt_board_projection_upsert/);
 assert.match(migration,/source\)\s*VALUES[\s\S]*'automatic'/);
 assert.match(migration,/'timestamp',[\s\S]*v_clock_out_at/);
 assert.match(migration,/'geo',p_geo/);
 assert.match(migration,/pending_at=NULL/);
 assert.match(migration,/scheduled_clock_out_at=NULL/);
 assert.doesNotMatch(migration,/server-auto-clockout/);
});

test('automatic clock-out readback preserves OT data after successful and uncertain commits',async()=>{
 for(const uncertain of [false,true]){
  const options=[];
  const sim=harness({ttView:'ot',
   complete:uncertain?async()=>{throw Error('Uncertain response');}:undefined,
   snapshot:(_board,opts)=>{
    options.push(opts);
    return {status:'VERIFIED_READ',clockOnly:opts.clockOnly,active:null,
     access:{durationOtContractActive:!opts.clockOnly},
     otRequests:opts.clockOnly?[]:[{id:'existing-ot'}],
     records:[{id:recordId,status:'Completed',automatic:true,clockOut:scheduled}]};
   }
  });
  await sim.run();
  assert.deepEqual(options,[{clockOnly:false}]);
  assert.equal(sim.state.ttAttendance.access.durationOtContractActive,true);
  assert.deepEqual(sim.state.ttAttendance.otRequests,[{id:'existing-ot'}]);
  assert.equal(sim.state.ttBusy,false);
 }
 const options=[];
 const sim=harness({snapshot:(_board,opts)=>{
  options.push(opts);
  return {status:'VERIFIED_READ',active:null,records:[
   {id:recordId,status:'Completed',automatic:true,clockOut:scheduled}]};
 }});
 await sim.run();
 assert.deepEqual(options,[{clockOnly:true}]);
});
