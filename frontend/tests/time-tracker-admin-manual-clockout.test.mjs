import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTimeTrackerManualClockOut,renderTimeTrackerManualClockOut} from '../time-tracker-record-management.js';
const record={clockIn:{timestamp:'2026-11-24T00:48:32Z'},clockOut:null,ownerName:'Employee'};
const now=new Date('2026-11-24T12:30:00Z');
const form=new FormData();
form.set('clockOutAt','2026-11-24 06:48:32 PM');
form.set('reason','Missed scheduled cutoff');
test('explicit second-accurate PHT admin clock-out with reason',()=>{
 assert.deepEqual(buildTimeTrackerManualClockOut(form,record,now),{
  patch:{clockOutAt:'2026-11-24T10:48:32.000Z'},reason:'Missed scheduled cutoff'});
 assert.throws(()=>buildTimeTrackerManualClockOut(form,{...record,clockOut:{timestamp:'2026-11-24T10:00:00Z'}},now),/active/);
 const invalid=new FormData();invalid.set('clockOutAt','2026-11-24 11:00:00 PM');invalid.set('reason','test');
 assert.throws(()=>buildTimeTrackerManualClockOut(invalid,record,now),/future/);
 invalid.set('clockOutAt','2026-11-24 06:48:32 PM');invalid.set('reason','');
 assert.throws(()=>buildTimeTrackerManualClockOut(invalid,record,now),/reason/);
 assert.match(renderTimeTrackerManualClockOut({editor:{records:[record]}}),/Confirm clock-out/);
});
test('admin RPC is signed, revision-bound and audited, without invented GPS',()=>{
 const sql=readFileSync('supabase/migrations/20261124203000_cp_tt_admin_manual_clockout.sql','utf8');
 for(const token of ["IS DISTINCT FROM 'System Admin'","TT_ATTENDANCE_REVISION_CONFLICT","pg_advisory_xact_lock","FOR UPDATE","'not_captured','source','admin-manual-clockout'","tt_attendance_admin_audit","tt_attendance_admin_sync_projection","module_state_invariants_valid","p_clock_out_at>v_now"])assert.ok(sql.includes(token),token);
});
