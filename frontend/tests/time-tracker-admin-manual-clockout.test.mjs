import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTimeTrackerManualClockOut,renderTimeTrackerManualClockOut,manualClockOutNineHourReference,manualClockOutPreview} from '../time-tracker-record-management.js';
import {creditedAttendanceMs} from '../time-tracker-policy.js';
const record={clockIn:{timestamp:'2026-11-24T00:48:32Z'},clockOut:null,ownerName:'Employee'};
const now=new Date('2026-11-24T12:30:00Z');
function form(date='2026-11-24',time='06:48:32 PM'){
 const data=new FormData();data.set('clockOutDate',date);data.set('clockOutAt',time);return data;
}
test('explicit PHT date and time retain signed administrative closure and audit reason',()=>{
 assert.deepEqual(buildTimeTrackerManualClockOut(form(),record,now),{
  patch:{clockOutAt:'2026-11-24T10:48:32.000Z'},reason:'Administrative manual clock-out'});
 assert.throws(()=>buildTimeTrackerManualClockOut(form(),{...record,clockOut:{timestamp:'2026-11-24T10:00:00Z'}},now),/active/);
 assert.throws(()=>buildTimeTrackerManualClockOut(form('2026-11-24','11:00:00 PM'),record,now),/future/);
 assert.throws(()=>buildTimeTrackerManualClockOut(form('2026-11-24',''),record,now),/valid Philippine/);
 assert.throws(()=>buildTimeTrackerManualClockOut(form('2026-11-24','2026-11-24 06:48:32 PM'),record,now),/valid Philippine/);
 assert.throws(()=>buildTimeTrackerManualClockOut(form('','06:48:32 PM'),record,now),/date/);
 assert.throws(()=>buildTimeTrackerManualClockOut(form('2026-02-30'),record,now),/valid Philippine/);
});
test('overnight and overtime use explicit editable date, never implicit rollover',()=>{
 const overnight={...record,clockIn:{timestamp:'2026-11-24T14:00:00Z'}};
 assert.equal(buildTimeTrackerManualClockOut(form('2026-11-25','06:30:15 AM'),overnight,'2026-11-25T00:00:00Z').patch.clockOutAt,'2026-11-24T22:30:15.000Z');
 assert.throws(()=>buildTimeTrackerManualClockOut(form('2026-11-24','06:30:15 AM'),overnight,'2026-11-25T00:00:00Z'),/at or after/);
 assert.throws(()=>buildTimeTrackerManualClockOut(form('2026-11-25','06:30:15 AM'),overnight,'2026-11-24T15:00:00Z'),/future/);
 assert.equal(buildTimeTrackerManualClockOut(form('2026-11-24','23:00:00'),overnight,'2026-11-25T00:00:00Z').patch.clockOutAt,'2026-11-24T15:00:00.000Z');
 assert.equal(buildTimeTrackerManualClockOut(form('2026-11-24','10:00 PM'),record,'2026-11-25T00:00:00Z').patch.clockOutAt,'2026-11-24T14:00:00.000Z');
});
test('nine-hour reference deducts only overlapping unpaid lunch and rounds up to whole seconds',()=>{
 for(const [start,end] of [
  ['2026-11-24T00:48:32Z','2026-11-24T10:48:32.000Z'],
  ['2026-11-24T05:00:00Z','2026-11-24T14:00:00.000Z'],
  ['2026-11-24T14:00:00Z','2026-11-24T23:00:00.000Z'],
  ['2026-11-24T04:30:00Z','2026-11-24T14:00:00.000Z'],
  ['2026-11-24T00:48:32.195Z','2026-11-24T10:48:33.000Z']
 ]){
  assert.equal(manualClockOutNineHourReference(start),end);
  assert.ok(creditedAttendanceMs(start,end)>=32400000);
  assert.ok(creditedAttendanceMs(start,Date.parse(end)-1000)<32400000);
 }
 assert.equal(manualClockOutNineHourReference('bad'),null);
});
test('preview calculates real credited hours but does not force nine hours or infer overtime',()=>{
 assert.deepEqual(manualClockOutPreview(form(),record,now),{
  valid:true,elapsed:'10:00:00',unpaid:'01:00:00',credited:'09:00:00',message:'Nine-hour shift reached.'});
 assert.equal(manualClockOutPreview(form('2026-11-24','05:48:32 PM'),record,now).credited,'08:00:00');
 assert.equal(manualClockOutPreview(form('2026-11-24','07:48:32 PM'),record,now).credited,'10:00:00');
 assert.equal(manualClockOutPreview(form('2026-11-25'),record,now).valid,false);
});
test('calendar defaults to signed clock-in date, preserves selected date and displays recorded time',()=>{
 const html=renderTimeTrackerManualClockOut({editor:{records:[record]},now});
 assert.match(html,/name="clockOutDate" type="date" value="2026-11-24" min="2026-11-24" max="2026-11-24" required/);
 assert.match(html,/Clock-in \(recorded\)/);
 assert.match(html,/08:48:32 AM/);
 assert.match(html,/06:48:32 PM/);
 assert.match(html,/9-hour shift reference/);
 assert.match(html,/data-tt-clockout-preview="credited"/);
 assert.match(html,/disabled>Confirm clock-out/);
 assert.doesNotMatch(html,/name="reason"/);
 const draft=renderTimeTrackerManualClockOut({editor:{records:[record],clockOutDateDraft:'2026-11-25',clockOutDraft:'01:00:00 AM'},now:new Date('2026-11-25T00:00:00Z')});
 assert.match(draft,/name="clockOutDate" type="date" value="2026-11-25"/);
 assert.match(draft,/name="clockOutAt" type="text" value="01:00:00 AM"/);
 assert.match(draft,/class="primary">Confirm clock-out/);
});
test('OJT record projection uses same explicit date and preview without changing signed mutation route',()=>{
 const row={clockIn:'2026-11-24T00:48:32Z',clockOut:null,name:'Intern'};
 assert.equal(buildTimeTrackerManualClockOut(form(),row,now).patch.clockOutAt,'2026-11-24T10:48:32.000Z');
 assert.match(renderTimeTrackerManualClockOut({editor:{ojt:true,record:row},now}),/Intern/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/editor\.clockOutDateDraft=String\(draft\.get\('clockOutDate'\)/);
 assert.match(app,/syncManualClockOutPreview\(form,editor\.ojt\?editor\.record:editor\.records\?\.\[0\]\)/);
 assert.match(app,/editor\.manualClockout\?buildTimeTrackerManualClockOut\(new FormData\(form\),editor\.record\)/);
});
test('admin RPC is signed, revision-bound and audited, without invented GPS',()=>{
 const sql=readFileSync('supabase/migrations/20261124203000_cp_tt_admin_manual_clockout.sql','utf8');
 for(const token of ["IS DISTINCT FROM 'System Admin'","TT_ATTENDANCE_REVISION_CONFLICT","pg_advisory_xact_lock","FOR UPDATE","'not_captured','source','admin-manual-clockout'","tt_attendance_admin_audit","tt_attendance_admin_sync_projection","module_state_invariants_valid","p_clock_out_at>v_now"])assert.ok(sql.includes(token),token);
});
