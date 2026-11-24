import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildTimeTrackerManualOjtEntry,renderTimeTrackerManualOjtEntry} from '../apps/TimeTracker/time-tracker-ojt-manual-entry.js';
import {projectOjtAdminAttendance} from '../apps/TimeTracker/time-tracker-ojt.js';
const internId='00000000-0000-4000-8000-000000000111';
const scope={userId:'00000000-0000-4000-8000-000000000001',
 workspaceId:'00000000-0000-4000-8000-000000000002',
 boardId:'00000000-0000-4000-8000-000000000003'};
const values=patch=>{
 const data=new FormData();
 for(const [k,v] of Object.entries({internId,location:'Office-Base Duty',
  clockInAt:'2026-11-24 08:00 AM',clockOutAt:'2026-11-24 05:00 PM',
  workNote:'',reason:'GPS was not available; arrival confirmed by supervisor.',...patch}))data.set(k,v);
 return data;
};
const options={interns:[{id:internId,name:'OJT One'}],now:Date.parse('2026-11-24T10:00:00Z')};

test('manual OJT entry requires current intern, valid shift, and reason',()=>{
 const entry=buildTimeTrackerManualOjtEntry(values(),options);
 assert.equal(entry.internId,internId);
 assert.equal(entry.clockIn,'2026-11-24T00:00:00.000Z');
 assert.equal(entry.clockOut,'2026-11-24T09:00:00.000Z');
 assert.throws(()=>buildTimeTrackerManualOjtEntry(values({internId:scope.userId}),options),/registered OJT/);
 assert.throws(()=>buildTimeTrackerManualOjtEntry(values({reason:'GPS error'}),options),/10 characters/);
 assert.throws(()=>buildTimeTrackerManualOjtEntry(values({clockOutAt:'2026-11-24 07:00 AM'}),options),/later than/);
 assert.throws(()=>buildTimeTrackerManualOjtEntry(values({location:'Offsite (Home)'}),options),/work plan/);
});
test('active entry accepted, with accurate non-GPS warnings and accessible modal',()=>{
 const entry=buildTimeTrackerManualOjtEntry(values({clockOutAt:''}),options);
 assert.equal(entry.clockOut,null);
 const html=renderTimeTrackerManualOjtEntry({editor:{manualCreate:true,interns:options.interns}});
 assert.match(html,/role="dialog" aria-modal="true"/);
 assert.match(html,/Save manual attendance/);
 assert.match(html,/GPS is recorded as not captured/);
 assert.match(html,/tt-ojt-manual-entry-form/);
});
test('manual OJT provenance is allowlisted without exposing location evidence',()=>{
 const r=projectOjtAdminAttendance({
  contract:'tt-ojt-admin-attendance-1',...scope,actorId:scope.userId,
  records:[{id:'00000000-0000-4000-8000-000000000112',internId,
   name:'OJT One',clockIn:'2026-11-24T00:00:00Z',clockOut:null,
   location:'Office-Base Duty',workNote:null,revision:1,manualEntry:true}]
 },scope);
 assert.equal(r.records[0].manualEntry,true);
});
const sql=readFileSync(new URL('../../supabase/migrations/20261124120000_cp_tt_ojt_manual_attendance_create.sql',import.meta.url),'utf8');
test('SQL enforces signed System Admin and append-only manual entry evidence',()=>{
 assert.match(sql,/CREATE FUNCTION public\.timetracker_ojt_admin_create/);
 assert.match(sql,/v_role IS DISTINCT FROM 'System Admin'/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/overlapping attendance record/);
 assert.match(sql,/'status','not_captured','source','admin-manual-entry'/);
 assert.match(sql,/'admin-manual-create'/);
 assert.match(sql,/entry_source='admin-manual'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.timetracker_ojt_admin_create/);
 assert.doesNotMatch(sql,/DELETE FROM private\.tt_ojt_attendance/);
});
