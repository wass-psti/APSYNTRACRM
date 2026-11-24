import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTimeTrackerManualClockOut,renderTimeTrackerManualClockOut} from '../time-tracker-record-management.js';
const record={clockIn:{timestamp:'2026-11-24T00:48:32Z'},clockOut:null,ownerName:'Employee'};
const now=new Date('2026-11-24T12:30:00Z');
const form=new FormData();
form.set('clockOutAt','06:48:32 PM');
test('time-only PHT admin clock-out anchors to signed attendance day and supplies audit reason',()=>{
 assert.deepEqual(buildTimeTrackerManualClockOut(form,record,now),{
  patch:{clockOutAt:'2026-11-24T10:48:32.000Z'},reason:'Administrative manual clock-out'});
 assert.throws(()=>buildTimeTrackerManualClockOut(form,{...record,clockOut:{timestamp:'2026-11-24T10:00:00Z'}},now),/active/);
 const invalid=new FormData();invalid.set('clockOutAt','11:00:00 PM');
 assert.throws(()=>buildTimeTrackerManualClockOut(invalid,record,now),/future/);
 invalid.set('clockOutAt','');
 assert.throws(()=>buildTimeTrackerManualClockOut(invalid,record,now),/valid Philippine/);
 invalid.set('clockOutAt','2026-11-24 06:48:32 PM');
 assert.throws(()=>buildTimeTrackerManualClockOut(invalid,record,now),/valid Philippine/);
 const html=renderTimeTrackerManualClockOut({editor:{records:[record]}});
 assert.match(html,/Confirm clock-out/);
 assert.match(html,/Attendance date: 2026-11-24/);
 assert.doesNotMatch(html,/name="reason"|Clock-out date and time/);
});
test('overnight clock-out uses next day only when earlier than signed clock-in time',()=>{
 const overnight={...record,clockIn:{timestamp:'2026-11-24T14:00:00Z'}};
 const time=new FormData();time.set('clockOutAt','06:30:15 AM');
 assert.equal(buildTimeTrackerManualClockOut(time,overnight,'2026-11-25T00:00:00Z').patch.clockOutAt,'2026-11-24T22:30:15.000Z');
 assert.throws(()=>buildTimeTrackerManualClockOut(time,overnight,'2026-11-24T15:00:00Z'),/future/);
 time.set('clockOutAt','23:00:00');
 assert.equal(buildTimeTrackerManualClockOut(time,overnight,'2026-11-25T00:00:00Z').patch.clockOutAt,'2026-11-24T15:00:00.000Z');
});
test('admin RPC is signed, revision-bound and audited, without invented GPS',()=>{
 const sql=readFileSync('supabase/migrations/20261124203000_cp_tt_admin_manual_clockout.sql','utf8');
 for(const token of ["IS DISTINCT FROM 'System Admin'","TT_ATTENDANCE_REVISION_CONFLICT","pg_advisory_xact_lock","FOR UPDATE","'not_captured','source','admin-manual-clockout'","tt_attendance_admin_audit","tt_attendance_admin_sync_projection","module_state_invariants_valid","p_clock_out_at>v_now"])assert.ok(sql.includes(token),token);
});
