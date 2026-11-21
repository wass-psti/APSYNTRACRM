import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTimeTrackerAdminPatch,renderTimeTrackerAdminEditor} from '../time-tracker-record-management.js';
import {renderTimeTrackerLog} from '../time-tracker-log.js';
import {renderTimeTrackerNative,timeTrackerSessionElapsed} from '../time-tracker-ui.js';

const recordId='00000000-0000-4000-8000-000000000020';
const employeeId='00000000-0000-4000-8000-000000000004';
const active=()=>({
 id:recordId,ownerId:'cloud:'+employeeId,ownerName:'Test Employee',
 clockIn:{timestamp:'2026-11-20T00:30:00.000Z',
  location:'Office-Base Duty',department:'Engineering'},
 clockOut:null
});
const completed=()=>({
 ...active(),clockOut:{timestamp:'2026-11-20T09:00:00.000Z',
  location:'Office-Base Duty',department:'Engineering'}
});

test('time correction editor accepts active Clock-In but does not invent Clock-Out',()=>{
 const html=renderTimeTrackerAdminEditor({
  editor:{mode:'single',records:[active()],recordIds:[recordId]},timeOnly:true
 });
 assert.match(html,/Active clock-in session/);
 assert.match(html,/name="clockInAt"/);
 assert.doesNotMatch(html,/name="clockOutAt"/);
 assert.match(html,/Clock timer updates from the corrected start time/);
 const form=new FormData();
 form.set('clockInAt','2026-11-20T08:00');
 form.set('reason','Correcting employee timesheet');
 const plan=buildTimeTrackerAdminPatch(form,{mode:'single',record:active()});
 assert.deepEqual(plan.patch,{clockInAt:'2026-11-20T00:00:00.000Z'});
 assert.equal(plan.reason,'Correcting employee timesheet');
});

test('completed sessions allow independent Clock-In and Clock-Out corrections',()=>{
 const html=renderTimeTrackerAdminEditor({
  editor:{mode:'single',records:[completed()],recordIds:[recordId]},timeOnly:true
 });
 assert.match(html,/name="clockInAt"/);
 assert.match(html,/name="clockOutAt"/);
 const form=new FormData();
 form.set('clockOutAt','2026-11-20T17:30');
 form.set('reason','Correcting verified clock-out');
 const plan=buildTimeTrackerAdminPatch(form,{mode:'single',record:completed()});
 assert.deepEqual(plan.patch,{clockOutAt:'2026-11-20T09:30:00.000Z'});
 assert.equal(plan.reason,'Correcting verified clock-out');
});

test('admin roles find Correct time in existing Log, without a new board',()=>{
 const row={
  id:recordId,ownerId:'cloud:'+employeeId,name:'Test Employee',
  department:'Engineering',location:'Office-Base Duty',
  clockIn:'2026-11-20T00:30:00.000Z',clockOut:null,
  status:'Active',classification:'On time',creditedMs:null
 };
 const html=renderTimeTrackerLog({
  records:[row],scope:'AUTHORIZED_WORKSPACE_TEAM',adminEligible:true,
  adminFullAccess:true,now:new Date('2026-11-20T02:30:00Z')
 });
 assert.match(html,/data-action="tt-log-admin-correct-time"/);
 assert.match(html,/data-action="tt-log-admin-edit"/);
 assert.match(html,/Click any record to view its details in a popup/);
});

test('System Admin time correction opens the restricted editor, not the full record editor',()=>{
 const row={
  id:recordId,ownerId:'cloud:'+employeeId,name:'Test Employee',
  department:'Engineering',location:'Office-Base Duty',
  clockIn:'2026-11-20T00:30:00.000Z',clockOut:null,
  status:'Active',classification:'On time',creditedMs:null
 };
 const html=renderTimeTrackerLog({
  records:[row],scope:'AUTHORIZED_WORKSPACE_TEAM',
  adminEligible:true,adminFullAccess:true,
  adminEditor:{mode:'single',timeOnly:true,recordIds:[recordId],
   records:[active()]},now:new Date('2026-11-20T02:30:00Z')
 });
 assert.match(html,/Save time correction/);
 assert.match(html,/name="clockInAt"/);
 assert.doesNotMatch(html,/name="employeeId"/);
 assert.doesNotMatch(html,/name="clockOutAt"/);
});

test('corrected signed Clock-In timestamp rebases displayed active timer',()=>{
 const now=new Date('2026-11-20T02:30:00.000Z');
 const original=timeTrackerSessionElapsed('2026-11-20T00:30:00.000Z',now);
 const corrected=timeTrackerSessionElapsed('2026-11-20T00:00:00.000Z',now);
 assert.equal(original.label,'02:00:00');
 assert.equal(corrected.label,'02:30:00');
 const own={
  id:recordId,ownerId:'cloud:'+employeeId,
  clockIn:'2026-11-20T00:00:00.000Z',clockOut:null,
  status:'Active',creditedMs:null,department:'Engineering',location:'Office-Base Duty'
 };
 const html=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access:{
   moduleRole:'Employee',employeeDepartment:'Engineering',attendanceWritesAccepted:true
  },records:[own],active:own},view:'clock',now,
  clockCorrectionNotice:'Your recorded Clock-In time was corrected.'
 });
 assert.match(html,/data-clock-in="2026-11-20T00:00:00.000Z"/);
 assert.match(html,/02:30/);
 assert.match(html,/Your recorded Clock-In time was corrected/);
});

test('visible Clock polling uses signed reads, revision guard and no automatic writes',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const scope=app.slice(app.indexOf('async function refreshCorrectedTimeTrackerClock('),
  app.indexOf('function toast(',app.indexOf('async function refreshCorrectedTimeTrackerClock(')));
 assert.match(scope,/timeTracker\.snapshot\(boardId,\{clockOnly:true\}\)/);
 assert.match(scope,/ttClockSyncInFlight/);
 assert.match(scope,/document\.hidden/);
 assert.match(scope,/state\.ttClockPending/);
 assert.match(scope,/fresh\.access\?\.userId!==actor/);
 assert.match(scope,/Number\(fresh\.revision\)<=Number\(state\.ttAttendance\?\.revision\)/);
 assert.match(scope,/state\.ttAttendance=fresh/);
 assert.doesNotMatch(scope,/\.commit\(|mutateAttendanceRecords\(/);
 assert.match(app,/TT_CLOCK_CORRECTION_POLL_MS=45000/);
 assert.match(app,/if\(!document\.hidden\)void refreshCorrectedTimeTrackerClock\(\{onFocus:true\}\)/);
 assert.match(app,/case 'tt-log-admin-correct-time'/);
 assert.match(app,/\{timeOnly:true\}/);
});
