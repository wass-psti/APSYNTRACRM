import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureAttendanceGeo} from '../time-tracker-native.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
import {clockOutSnapshotOutcome,clockInSnapshotOutcome,attendanceSnapshotOutcome,attendanceAuthFailure,attendanceClockError} from '../time-tracker-clock-recovery.js';

const user='20000000-0000-4000-8000-000000000001';
const workspace='10000000-0000-4000-8000-000000000001';
const board='30000000-0000-4000-8000-000000000001';
const recordId='attendance-unique-record';
const base={recordId,userId:user,workspaceId:workspace,boardId:board};
const started='2026-11-03T11:35:00.000Z';
const ended='2026-11-04T04:21:00.000Z';
const row={id:recordId,status:'Active',clockIn:started,clockOut:null,
 location:'Office-Base Duty',department:'HR',creditedMs:null};
const snapshot=changes=>({
 status:'VERIFIED_READ',access:{userId:user,workspaceId:workspace,boardId:board,
  moduleRole:'Employee',attendanceWritesAccepted:true},
 records:[row],active:row,...changes
});
const position=(timestamp=Date.now())=>({
 timestamp,coords:{latitude:10.31542,longitude:123.95777,accuracy:29}
});

test('geolocation first uses fresh high accuracy; returns original browser timestamp',async()=>{
 let calls=0;
 const geo={getCurrentPosition(ok,fail,opts){
  calls++;
  assert.deepEqual(opts,{enableHighAccuracy:true,timeout:10000,maximumAge:25000});
  ok(position());
 }};
 const fix=await captureAttendanceGeo(geo);
 assert.equal(calls,1);
 assert.equal(fix.source,'browser-geolocation');
 assert.equal(fix.status,'captured');
 assert.equal(fix.accuracy,29);
 assert.equal(fix.latitude,10.31542);
 assert.ok(Number.isFinite(Date.parse(fix.capturedAt)));
});

test('timeout or unavailable high accuracy falls back only to fresh balanced GPS',async()=>{
 for(const code of [2,3]){
  let calls=0;
  const geo={getCurrentPosition(ok,bad,opts){
   calls++;
   if(calls===1){
    assert.deepEqual(opts,{enableHighAccuracy:true,timeout:10000,maximumAge:25000});
    bad({code,message:'Timeout expired'});
   }else{
    assert.deepEqual(opts,{enableHighAccuracy:false,timeout:12000,maximumAge:45000});
    ok(position());
   }
  }};
  const fix=await captureAttendanceGeo(geo);
  assert.equal(calls,2);
  assert.equal(fix.status,'captured');
 }
});

test('permission denial does not retry and never attempts a write',async()=>{
 let calls=0;
 const geo={getCurrentPosition(ok,bad){calls++;bad({code:1,message:'Permission denied'});}};
 await assert.rejects(()=>captureAttendanceGeo(geo),err=>
  err.code==='TT_GEO_DENIED');
 assert.equal(calls,1);
 assert.match(attendanceClockError({code:'TT_GEO_DENIED'}),/No clock-out request was sent/);
});

test('double timeout and old/invalid fixes remain fail closed',async()=>{
 let calls=0;
 const geo={getCurrentPosition(ok,bad){
  calls++;bad({code:3,message:'Timeout expired'});
 }};
 await assert.rejects(()=>captureAttendanceGeo(geo),err=>
  err.code==='TT_GEO_TIMEOUT');
 assert.equal(calls,2);
 assert.match(attendanceClockError({code:'TT_GEO_TIMEOUT'}),/No clock-out request was sent/);
 const stale={getCurrentPosition(ok){ok(position(Date.now()-120000));}};
 await assert.rejects(()=>captureAttendanceGeo(stale),err=>
  err.code==='TT_GEO_UNAVAILABLE');
 const malformed={getCurrentPosition(ok){ok({
  timestamp:Date.now(),coords:{latitude:999,longitude:123,accuracy:20}
 });}};
 await assert.rejects(()=>captureAttendanceGeo(malformed),err=>
  err.code==='TT_GEO_UNAVAILABLE');
 assert.match(attendanceClockError({code:'TT_GEO_UNAVAILABLE'}),/No clock-out request was sent/);
});

test('verified signed snapshot reconciles completed record by exact identity',()=>{
 const completed={...row,status:'Completed',clockOut:ended,creditedMs:50400000};
 assert.equal(clockOutSnapshotOutcome(snapshot({
  records:[completed],active:null
 }),base),'CONFIRMED');
 assert.equal(clockOutSnapshotOutcome(snapshot(),base),'STILL_ACTIVE');
 for(const changed of [
  {access:{...snapshot().access,userId:'foreign'}},
  {access:{...snapshot().access,workspaceId:'foreign'}},
  {access:{...snapshot().access,boardId:'foreign'}},
  {status:'UNAVAILABLE'},
  {records:[]},
  {records:[{...completed,id:'other'}]},
  {records:[completed,completed]}
 ]){
  assert.equal(clockOutSnapshotOutcome(snapshot(changed),base),'UNVERIFIED');
 }
});

test('revoked or denied sessions remain blocked from result reconciliation',()=>{
 for(const err of [{status:401},{status:403},{code:'42501'},
  {message:'session revoked'},{message:'authentication required'}]){
  assert.equal(attendanceAuthFailure(err),true);
 }
 assert.equal(attendanceAuthFailure({code:'TT_GEO_UNAVAILABLE'}),false);
 assert.match(attendanceClockError({status:403}),/signed attendance permission/);
 assert.match(attendanceClockError(new Error('network unavailable'),{
  commitAttempted:true
 }),/Verify the signed attendance state/);
});

test('clock-out verification control replaces the write button only when pending',()=>{
 const result=snapshot();
 const pending=renderTimeTrackerNative({result,view:'clock',clockPending:true});
 assert.match(pending,/data-action="tt-clock-verify"/);
 assert.match(pending,/Verify session status/);
 assert.match(pending,/second attendance write is blocked/);
 assert.doesNotMatch(pending,/name="tt-action" value="clock-out"/);
 const normal=renderTimeTrackerNative({result,view:'clock'});
 assert.match(normal,/name="tt-action" value="clock-out"/);
 assert.doesNotMatch(normal,/data-action="tt-clock-verify"/);
});

test('app makes one write attempt and reconciles ambiguous clock-out without automatic retry',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf('async function submitTimeTrackerAction(');
 const end=app.indexOf('async function loadIssues(',start);
 assert.ok(start>0&&end>start);
 const submit=app.slice(start,end);
 assert.equal((submit.match(/timeTracker\.commit\(/g)||[]).length,1);
 assert.match(submit,/const geo=await captureAttendanceGeo/);
 assert.match(submit,/if\(commitAttempted\)/);
 assert.match(submit,/rememberTimeTrackerClockPending\(\{\.\.\.context,receiptVerified:false\}\)/);
 assert.match(submit,/reconcileTimeTrackerClock\(snapshot\)/);
 assert.match(app,/async function verifyTimeTrackerAttendance\(\)/);
 assert.match(app,/case 'tt-clock-verify'/);
 assert.match(app,/attendanceSnapshotOutcome\(snapshot,pending\)/);
 assert.match(app,/state\.ttClockPending=null/);
 assert.match(app,/state\.ttBusy=true;state\.ttClockStage='location';state\.ttError='';state\.ttSuccess='';render\(\)/);
});


test('Clock-In signed reconciliation confirms only a new matching session and revision',()=>{
 const old={id:'previous-record',status:'Completed',clockIn:started,
  clockOut:ended,location:'Office-Base Duty',department:'HR'};
 const fresh={id:'new-record',status:'Active',clockIn:'2026-11-05T01:00:00.000Z',
  clockOut:null,location:'Office-Base Duty',department:'HR'};
 const before={status:'VERIFIED_READ',access:{userId:user,workspaceId:workspace,boardId:board},
  records:[old],active:null,revision:4};
 const after={...before,records:[fresh,old],active:fresh,revision:5};
 const pending={action:'clock-in',userId:user,workspaceId:workspace,boardId:board,
  baselineRevision:4,previousRecordIds:['previous-record'],location:'Office-Base Duty',
  department:'HR'};
 assert.equal(clockInSnapshotOutcome(after,pending),'CONFIRMED');
 assert.equal(attendanceSnapshotOutcome(after,pending),'CONFIRMED');
 assert.equal(clockInSnapshotOutcome(before,pending),'NOT_COMMITTED');
 assert.equal(clockInSnapshotOutcome({...after,revision:4},pending),'UNVERIFIED');
 assert.equal(clockInSnapshotOutcome({...after,active:null},pending),'UNVERIFIED');
 assert.equal(clockInSnapshotOutcome({...after,records:[{...fresh,location:'Offsite (Home)'},old],
  active:{...fresh,location:'Offsite (Home)'}},pending),'UNVERIFIED');
 for(const changed of [
  {access:{...after.access,userId:'foreign'}},
  {access:{...after.access,workspaceId:'foreign'}},
  {access:{...after.access,boardId:'foreign'}},
  {status:'UNAVAILABLE'},
  {records:[old],active:null,revision:5},
  {records:[fresh,fresh,old],active:fresh,revision:5}
 ])assert.equal(clockInSnapshotOutcome({...after,...changed},pending),'UNVERIFIED');
});

test('attendance error feedback names Clock In and Clock Out correctly',()=>{
 assert.match(attendanceClockError({code:'TT_GEO_DENIED'},{action:'clock-in'}),
  /No clock-in request was sent/);
 assert.match(attendanceClockError(new Error('network'),
  {commitAttempted:true,action:'clock-in'}),/Clock-in confirmation is uncertain/);
 assert.match(attendanceClockError(new Error('network'),
  {commitAttempted:true,action:'clock-out'}),/Clock-out confirmation is uncertain/);
});

test('verified signed TimeTracker reload clears stale bootstrap errors without unlocking pending writes',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf('async function loadTimeTracker(seq=routeSerial,nativeContext=null)');
 const end=app.indexOf('function timeTrackerAdminLogReady()',start);
 const load=app.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(load,/state\.ttAttendance=snapshot;[\s\S]*if\(snapshot\?\.status==='VERIFIED_READ'&&!state\.ttClockPending\)\s*state\.ttError='';/);
 assert.match(load,/if\(state\.ttClockPending\)reconcileTimeTrackerClock\(snapshot\)/);
});

test('signed administrative closure reconciles a pending employee clock-out and restores Start session',()=>{
 const access={...snapshot().access,employeeDepartment:'HR'};
 const completed={...row,status:'Completed',clockOut:ended,creditedMs:32400000};
 const closed=snapshot({access,records:[completed],active:null,revision:6});
 assert.equal(attendanceSnapshotOutcome(closed,{...base,action:'clock-out',baselineRevision:5}),'CONFIRMED');
 const html=renderTimeTrackerNative({result:closed,view:'clock',clockPending:false});
 assert.match(html,/Not clocked in/);
 assert.match(html,/name="tt-action" value="clock-in"/);
 assert.match(html,/Start session/);
 assert.doesNotMatch(html,/Verify session status/);
 const newRecord={...row,id:'admin-created',clockIn:'2026-11-04T05:00:00.000Z'};
 const started=snapshot({access,records:[newRecord,completed],active:newRecord,revision:7});
 const activeHtml=renderTimeTrackerNative({result:started,view:'clock',clockPending:false});
 assert.match(activeHtml,/name="tt-action" value="clock-out"/);
 assert.match(activeHtml,/End session/);
 assert.match(activeHtml,/data-clock-in="2026-11-04T05:00:00.000Z"/);
 assert.doesNotMatch(activeHtml,/name="tt-action" value="clock-in"/);
});
test('visible regular Clock polls signed idle and active states and reconciles pending writes',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const sync=app.slice(app.indexOf('async function refreshCorrectedTimeTrackerClock'),app.indexOf('function toast('));
 assert.doesNotMatch(sync,/\|\|!before\.active/);
 assert.match(sync,/timeTracker\.snapshot\(boardId,\{clockOnly:true\}\)/);
 assert.match(sync,/state\.ttAttendance=fresh/);
 assert.match(sync,/reconcileTimeTrackerClock\(fresh\)==='CONFIRMED'/);
 assert.match(sync,/if\(sessionChanged\|\|reconciled\)/);
 assert.match(sync,/Attendance closed on the server\. You can start a new session\./);
 assert.doesNotMatch(sync,/timeTracker\.commit\(/);
});
