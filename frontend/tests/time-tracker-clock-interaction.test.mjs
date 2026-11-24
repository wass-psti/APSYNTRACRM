import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isTimeTrackerHomeNoteRequired,createTimeTrackerWorkNoteDraft} from '../time-tracker-offsite-note.js';
import {attendanceSnapshotOutcome,attendanceAuthFailure,attendanceClockError}
 from '../time-tracker-clock-recovery.js';
import {recordTimeTrackerGpsDiagnostic,clearTimeTrackerGpsDiagnostics}
 from '../time-tracker-gps-diagnostics.js';

const source=readFileSync('frontend/app.js','utf8');
const start=source.indexOf('function reconcileTimeTrackerClock(');
const end=source.indexOf('async function loadIssues(',start);
assert.ok(start>0&&end>start);
const clockSource=source.slice(start,end);
const userId='20000000-0000-4000-8000-000000000001';
const workspaceId='10000000-0000-4000-8000-000000000001';
const boardId='30000000-0000-4000-8000-000000000001';
const recordId='signed-active-attendance';
const when='2026-11-03T11:35:00Z';
function activeRow(){return {id:recordId,status:'Active',clockIn:when,
 clockOut:null,location:'Office-Base Duty',department:'HR',creditedMs:null};}
function completedRow(){return {...activeRow(),status:'Completed',
 clockOut:'2026-11-04T04:31:00Z',creditedMs:60000000};}
function ownSnapshot(row=activeRow()){
 return {status:'VERIFIED_READ',access:{userId,workspaceId,boardId,
  attendanceWritesAccepted:true,moduleRole:'Employee',employeeDepartment:'HR'},records:[row],
  active:row.status==='Active'?row:null,revision:2};
}
function idleSnapshot(){return {status:'VERIFIED_READ',access:{userId,workspaceId,boardId,
 attendanceWritesAccepted:true,moduleRole:'Employee',employeeDepartment:'HR'},records:[],active:null,revision:2};}
function newClockInRow(){return {...activeRow(),id:'new-clock-in-record'};}
function harness({commit=async()=>({action:'clock-out',revision:2,recordId}),
 snapshot=async()=>ownSnapshot(completedRow()),initialAttendance=ownSnapshot(),
 capture=async()=>({status:'captured',latitude:10.3,longitude:123.9,
  accuracy:20,capturedAt:new Date().toISOString(),source:'browser-geolocation'}),
 location='Office-Base Duty',noteValue=''}={}){
 clearTimeTrackerGpsDiagnostics();
 const state={view:'board',tab:'attendance',ttBusy:false,ttClockPending:null,
  ttRunId:0,ttError:'',ttSuccess:'',boardId,
  board:{board:{name:'TimeTracker Attendance'}},
  context:{user_id:userId,workspace_id:workspaceId},
  ttAttendance:initialAttendance};
 let writes=0,reads=0,updates=0;
 const draft=createTimeTrackerWorkNoteDraft();
 const noteScope=()=>({userId,workspaceId,boardId});
 const timeTracker={
  async commit(...args){writes++;return commit(...args);},
  async snapshot(...args){reads++;return snapshot(...args);}
 };
 const functions=new Function('state','render','auth','moduleByBoardName',
  'TT_LIVE_ATTENDANCE_WRITES_ACCEPTED','FormData','captureAttendanceGeo',
  'recordTimeTrackerGpsDiagnostic','timeTracker','routeSerial','navigator','attendanceSnapshotOutcome',
  'attendanceAuthFailure','attendanceClockError','isTimeTrackerHomeNoteRequired',
  'rememberTimeTrackerClockPending','clearTimeTrackerClockPending',
  'restoreTimeTrackerClockPending','ttWorkNoteDraft','timeTrackerWorkNoteScope',clockSource+
  ';return {submitTimeTrackerAction,verifyTimeTrackerAttendance};')(
  state,()=>{updates++;},{isSignedIn:true},
  ()=>({key:'timetracker'}),true,
  class{get(key){return key==='tt-location'?location:key==='tt-department'?'HR':null;}},capture,recordTimeTrackerGpsDiagnostic,timeTracker,1,{geolocation:{}},
  attendanceSnapshotOutcome,attendanceAuthFailure,attendanceClockError,isTimeTrackerHomeNoteRequired,
  context=>{state.ttClockPending=context;},
  ()=>{state.ttClockPending=null;},
  ()=>{},draft,noteScope
 );
 const form={querySelector:()=>({value:noteValue})};
 return {state,form,draft,noteScope,...functions,counts:()=>({writes,reads,updates})};
}

test('successful End Session commits once, refreshes the signed row and stops being active',async()=>{
 const sim=harness();
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.counts().reads,1);
 assert.equal(sim.state.ttClockPending,null);
 assert.equal(sim.state.ttAttendance.active,null);
 assert.match(sim.state.ttSuccess,/confirmed/);
 assert.equal(sim.state.ttBusy,false);
});

test('GPS failure prevents any attendance commit and provides actionable feedback',async()=>{
 const sim=harness({capture:async()=>{const e=new Error('Timeout expired');
  e.code='TT_GEO_UNAVAILABLE';throw e;}});
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,0);
 assert.equal(sim.counts().reads,0);
 assert.equal(sim.state.ttClockPending,null);
 assert.match(sim.state.ttError,/No clock-out request was sent/);
 assert.doesNotMatch(sim.state.ttError,/Timeout expired/);
});

test('duplicate End Session clicks while processing cannot issue a second write',async()=>{
 let release;
 const paused=new Promise(resolve=>{release=resolve;});
 const sim=harness({commit:()=>paused});
 const first=sim.submitTimeTrackerAction(sim.form,'clock-out');
 const second=sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.state.ttBusy,true);
 release({action:'clock-out',revision:2,recordId});
 await Promise.all([first,second]);
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.state.ttClockPending,null);
});

test('response lost after PostgreSQL commit is reconciled by fresh signed read',async()=>{
 const sim=harness({commit:async()=>{throw new Error('Network interrupted after commit');}});
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.counts().reads,1);
 assert.equal(sim.state.ttClockPending,null);
 assert.match(sim.state.ttSuccess,/confirmed/);
 assert.equal(sim.state.ttError,'');
});

test('unknown outcome locks retry until explicit signed read verifies state',async()=>{
 let readable=false;
 const sim=harness({commit:async()=>{throw new Error('Network interrupted');},
  snapshot:async()=>{if(!readable)throw new Error('Network unavailable');
   return ownSnapshot(activeRow());}});
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1);
 assert.ok(sim.state.ttClockPending);
 assert.match(sim.state.ttError,/confirmation is uncertain/);
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1,'no second write without reconciliation');
 readable=true;
 await sim.verifyTimeTrackerAttendance();
 assert.equal(sim.state.ttClockPending,null);
 assert.match(sim.state.ttError,/still active/);
 assert.equal(sim.state.ttBusy,false);
});

test('receipt-confirmed clock-out never unlocks another write on stale active read',async()=>{
 const sim=harness({snapshot:async()=>ownSnapshot(activeRow())});
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1);
 assert.ok(sim.state.ttClockPending?.receiptVerified);
 await sim.verifyTimeTrackerAttendance();
 assert.ok(sim.state.ttClockPending?.receiptVerified);
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1);
});

test('permission denial after write attempt cannot be retried with stale identity',async()=>{
 const sim=harness({commit:async()=>{const err=new Error('Access denied');err.status=403;throw err;}});
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.counts().reads,0);
 assert.ok(sim.state.ttClockPending);
 assert.match(sim.state.ttError,/permission is no longer valid/);
 await sim.submitTimeTrackerAction(sim.form,'clock-out');
 assert.equal(sim.counts().writes,1);
});


test('successful Clock In commits once and confirms the new active signed record',async()=>{
 const row=newClockInRow();
 const sim=harness({initialAttendance:idleSnapshot(),
  commit:async()=>({action:'clock-in',revision:3,recordId:row.id}),
  snapshot:async()=>({...ownSnapshot(row),revision:3})});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.counts().reads,1);
 assert.equal(sim.state.ttClockPending,null);
 assert.equal(sim.state.ttAttendance.active.id,row.id);
 assert.match(sim.state.ttSuccess,/Clock In confirmed/);
 assert.equal(sim.state.ttBusy,false);
});

test('duplicate Start Session clicks while processing issue only one Clock-In write',async()=>{
 let release;const paused=new Promise(resolve=>{release=resolve;});
 const row=newClockInRow();
 const sim=harness({initialAttendance:idleSnapshot(),commit:()=>paused,
  snapshot:async()=>({...ownSnapshot(row),revision:3})});
 const first=sim.submitTimeTrackerAction(sim.form,'clock-in');
 const second=sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.state.ttBusy,true);
 release({action:'clock-in',revision:3,recordId:row.id});
 await Promise.all([first,second]);
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.state.ttClockPending,null);
});

test('lost Clock-In response is reconciled from the new signed active row',async()=>{
 const row=newClockInRow();
 const sim=harness({initialAttendance:idleSnapshot(),
  commit:async()=>{throw new Error('Network interrupted after commit');},
  snapshot:async()=>({...ownSnapshot(row),revision:3})});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.counts().reads,1);
 assert.equal(sim.state.ttClockPending,null);
 assert.equal(sim.state.ttAttendance.active.id,row.id);
 assert.match(sim.state.ttSuccess,/Clock In confirmed/);
 assert.equal(sim.state.ttError,'');
});

test('uncertain Clock In remains locked until an explicit signed read confirms it',async()=>{
 const row=newClockInRow();let readable=false;
 const sim=harness({initialAttendance:idleSnapshot(),
  commit:async()=>{throw new Error('Network interrupted');},
  snapshot:async()=>{if(!readable)throw new Error('Network unavailable');
   return {...ownSnapshot(row),revision:3};}});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.counts().writes,1);
 assert.equal(sim.state.ttClockPending.action,'clock-in');
 assert.match(sim.state.ttError,/Clock-in confirmation is uncertain/);
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.counts().writes,1);
 readable=true;await sim.verifyTimeTrackerAttendance();
 assert.equal(sim.state.ttClockPending,null);
 assert.match(sim.state.ttSuccess,/Clock In confirmed/);
 assert.equal(sim.state.ttBusy,false);
});

test('Clock-In failure is retryable only after signed read confirms no revision or active session',async()=>{
 const sim=harness({initialAttendance:idleSnapshot(),
  commit:async()=>{throw new Error('Commit rejected before persistence');},
  snapshot:async()=>idleSnapshot()});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.state.ttClockPending.action,'clock-in');
 await sim.verifyTimeTrackerAttendance();
 assert.equal(sim.state.ttClockPending,null);
 assert.match(sim.state.ttError,/Clock In was not committed/);
 assert.equal(sim.counts().writes,1);
});

test('Home work plan remains intact after GPS permission denial and allows another attempt',async()=>{
 const plan='Review material delivery, coordinate with team, and prepare inspection notes.';
 const sim=harness({initialAttendance:idleSnapshot(),location:'Offsite (Home)',noteValue:plan,
  capture:async()=>{const err=Error('Location permission denied');err.code='TT_GEO_DENIED';throw err;}});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.counts().writes,0);
 assert.equal(sim.draft.read(sim.noteScope()),plan);
 assert.equal(sim.state.ttBusy,false);
 assert.match(sim.state.ttError,/GPS|location/i);
});

test('Home work plan survives GPS unavailability without a database write',async()=>{
 const plan='Complete customer follow-ups and daily engineering checklist.';
 const sim=harness({initialAttendance:idleSnapshot(),location:'Offsite (Home)',noteValue:plan,
  capture:async()=>{const err=Error('Timed out');err.code='TT_GEO_UNAVAILABLE';throw err;}});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.counts().writes,0);
 assert.equal(sim.draft.read(sim.noteScope()),plan);
 assert.equal(sim.state.ttClockPending,null);
});

test('Home work plan is retained during uncertain Clock In but cleared after a signed confirmation',async()=>{
 const plan='Design review and documented progress for scheduled tasks.';
 const row={...newClockInRow(),location:'Offsite (Home)'};let readable=false;
 const sim=harness({initialAttendance:idleSnapshot(),location:'Offsite (Home)',noteValue:plan,
  commit:async()=>{throw Error('Network interrupted');},
  snapshot:async()=>{if(!readable)throw Error('Offline');return {...ownSnapshot(row),revision:3};}});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(sim.draft.read(sim.noteScope()),plan);
 assert.ok(sim.state.ttClockPending);
 readable=true;
 await sim.verifyTimeTrackerAttendance();
 assert.equal(sim.state.ttClockPending,null);
 assert.equal(sim.draft.read(sim.noteScope()),'');
});

test('Home work plan only clears after server-confirmed commit and is absent from Office payload',async()=>{
 const plan='Draft HVAC inspection plan and compliance checklist.';
 const row=newClockInRow();
 let payload=null;
 const sim=harness({initialAttendance:idleSnapshot(),location:'Offsite (Home)',noteValue:plan,
  commit:async(_board,request)=>{payload=request;return {action:'clock-in',revision:3,recordId:row.id};},
  snapshot:async()=>({...ownSnapshot(row),revision:3})});
 await sim.submitTimeTrackerAction(sim.form,'clock-in');
 assert.equal(payload.workNote,plan);
 assert.equal(sim.draft.read(sim.noteScope()),'');
 const office=harness({initialAttendance:idleSnapshot(),location:'Office-Base Duty',noteValue:plan,
  commit:async(_board,request)=>{payload=request;return {action:'clock-in',revision:3,recordId:row.id};},
  snapshot:async()=>({...ownSnapshot(row),revision:3})});
 await office.submitTimeTrackerAction(office.form,'clock-in');
 assert.equal(payload.workNote,'');
});
