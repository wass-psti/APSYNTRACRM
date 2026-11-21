import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildTimeTrackerAdminPatch,parseTimeTrackerAdminDateTime,
 renderTimeTrackerAdminEditor,renderTimeTrackerAdminDeleteDialog,timeTrackerAdminDateTimeLocal,
 TT_ADMIN_RECORD_LIMIT
} from '../time-tracker-record-management.js';
import {creditedAttendanceRecordMs} from '../time-tracker-policy.js';
import {renderTimeTrackerLog} from '../time-tracker-log.js';

const adminId='00000000-0000-4000-8000-000000000003';
const employeeId='00000000-0000-4000-8000-000000000004';
const recordId='00000000-0000-4000-8000-000000000020';
const makeGeo=(latitude=10.3,longitude=123.9,accuracy=35)=>({
 status:'captured',source:'browser-geolocation',latitude,longitude,accuracy,
 capturedAt:'2026-11-16T00:15:00.000Z'
});
const completedRecord=()=>({
 id:recordId,ownerId:`cloud:${employeeId}`,ownerName:'Test Employee',
 clockIn:{timestamp:'2026-11-16T00:15:00.000Z',location:'Office-Base Duty',
  department:'Information Technology',geo:makeGeo()},
 clockOut:{timestamp:'2026-11-16T08:15:00.000Z',location:'Office-Base Duty',
  department:'Information Technology',geo:makeGeo(10.31,123.91,36)},
 creditedMsOverride:null
});
const activeRecord=()=>({...completedRecord(),id:'00000000-0000-4000-8000-000000000023',clockOut:null});
const form=(values={})=>{
 const data=new FormData();
 for(const [key,value] of Object.entries(values))data.set(key,String(value));
 return data;
};
const geoFields=(prefix,lat=10.32,lon=123.92,accuracy=12)=>({
 [`${prefix}latitude`]:lat,[`${prefix}longitude`]:lon,[`${prefix}accuracy`]:accuracy
});

test('Philippine date-time editor round-trips without depending on device timezone',()=>{
 const value='2026-11-16T08:15:00.000Z';
 assert.equal(timeTrackerAdminDateTimeLocal(value),'2026-11-16T16:15');
 assert.equal(parseTimeTrackerAdminDateTime('2026-11-16T16:15'),value);
 assert.throws(()=>parseTimeTrackerAdminDateTime('2026-02-31T16:15'));
});

test('individual edit builds a sparse patch for employee, timestamps, GPS, status and duration',()=>{
 const record=completedRecord();
 const {patch,reason}=buildTimeTrackerAdminPatch(form({
  employeeId:adminId,location:'Local Field Works',department:'Engineering',
  status:'Completed',clockInAt:'2026-11-16T17:00',...geoFields('clockInGeo'),
  clockOutAt:'2026-11-16T18:00',...geoFields('clockOutGeo',10.33,123.93,13),
  durationMode:'manual',durationHours:'01:30:00',reason:'Corrected from signed supporting record'
 }),{mode:'single',record:activeRecord()});
 assert.equal(patch.employeeId,adminId);
 assert.equal(patch.location,'Local Field Works');
 assert.equal(patch.department,'Engineering');
 assert.equal(patch.status,'Completed');
 assert.equal(patch.clockInAt,'2026-11-16T09:00:00.000Z');
 assert.equal(patch.clockOutAt,'2026-11-16T10:00:00.000Z');
 assert.deepEqual(patch.clockInGeo,{latitude:10.32,longitude:123.92,accuracy:12});
 assert.deepEqual(patch.clockOutGeo,{latitude:10.33,longitude:123.93,accuracy:13});
 assert.equal(patch.creditedMsOverride,5400000);
 assert.equal(reason,'Corrected from signed supporting record');
});

test('individual edit leaves unchanged fields out of the patch',()=>{
 const {patch}=buildTimeTrackerAdminPatch(form({location:'Local Field Works'}),{
  mode:'single',record:completedRecord()
 });
 assert.deepEqual(patch,{location:'Local Field Works'});
});

test('editing unrelated fields preserves original timestamp seconds and milliseconds',()=>{
 const record=completedRecord();
 record.clockIn.timestamp='2026-11-16T00:15:31.417Z';
 record.clockOut.timestamp='2026-11-16T08:15:42.123Z';
 const {patch}=buildTimeTrackerAdminPatch(form({
  department:'Engineering',
  clockInAt:timeTrackerAdminDateTimeLocal(record.clockIn.timestamp),
  clockOutAt:timeTrackerAdminDateTimeLocal(record.clockOut.timestamp)
 }),{mode:'single',record});
 assert.deepEqual(patch,{department:'Engineering'});
});

test('a malformed Clock-Out is treated as active and requires a valid completion fix',()=>{
 const record={...activeRecord(),clockOut:{timestamp:'invalid',geo:null}};
 assert.throws(()=>buildTimeTrackerAdminPatch(form({status:'Completed'}),{
  mode:'single',record
 }),/Clock-Out timestamp and GPS/);
 const {patch}=buildTimeTrackerAdminPatch(form({
  status:'Completed',clockOutAt:'2026-11-16T17:00',
  ...geoFields('clockOutGeo',10.33,123.93,15)
 }),{mode:'single',record});
 assert.equal(patch.status,'Completed');
 assert.equal(patch.clockOutAt,'2026-11-16T09:00:00.000Z');
});

test('time corrections reject Clock-Out values earlier than Clock-In',()=>{
 assert.throws(()=>buildTimeTrackerAdminPatch(form({
  clockInAt:'2026-11-16T18:00',clockOutAt:'2026-11-16T17:00'
 }),{mode:'single',record:completedRecord()}),/Clock-Out must be at or after Clock-In/);
});

test('a location correction also reconciles a differing Clock-Out location',()=>{
 const record=completedRecord();
 record.clockOut.location='Offsite (Home)';
 const {patch}=buildTimeTrackerAdminPatch(form({location:'Office-Base Duty'}),{
  mode:'single',record
 });
 assert.deepEqual(patch,{location:'Office-Base Duty'});
});

test('automatic duration clears a previous manual override',()=>{
 const record={...completedRecord(),creditedMsOverride:3600000};
 const {patch}=buildTimeTrackerAdminPatch(form({durationMode:'auto'}),{mode:'single',record});
 assert.deepEqual(patch,{creditedMsOverride:null});
});

test('time correction preserves an explicitly selected manual duration override',()=>{
 const {patch}=buildTimeTrackerAdminPatch(form({
  clockOutAt:'2026-11-16T18:15',durationMode:'manual',durationHours:'01:00:00'
 }),{mode:'single',record:completedRecord()});
 assert.equal(patch.creditedMsOverride,3600000);
 assert.equal(patch.clockOutAt,'2026-11-16T10:15:00.000Z');
});

test('bulk edit applies only populated fields to every selected record',()=>{
 const {patch}=buildTimeTrackerAdminPatch(form({
  location:'Out of Town Assignment',department:'Finance and Accounting'
 }),{mode:'bulk',records:[completedRecord(),activeRecord()]});
 assert.deepEqual(patch,{location:'Out of Town Assignment',department:'Finance and Accounting'});
});

test('bulk completion of active sessions requires common Clock-Out time and GPS',()=>{
 const records=[activeRecord(),completedRecord()];
 assert.throws(()=>buildTimeTrackerAdminPatch(form({status:'Completed'}),{
  mode:'bulk',records
 }),/Clock-Out timestamp and GPS/);
 const {patch}=buildTimeTrackerAdminPatch(form({
  status:'Completed',clockOutAt:'2026-11-16T17:00',
  ...geoFields('clockOutGeo',10.33,123.93,15)
 }),{mode:'bulk',records});
 assert.equal(patch.status,'Completed');
 assert.equal(patch.clockOutAt,'2026-11-16T09:00:00.000Z');
 assert.deepEqual(patch.clockOutGeo,{latitude:10.33,longitude:123.93,accuracy:15});
});

test('single active record cannot be completed without a new Clock-Out GPS fix',()=>{
 assert.throws(()=>buildTimeTrackerAdminPatch(form({status:'Completed',clockOutAt:'2026-11-16T17:00'}),{
  mode:'single',record:activeRecord()
 }),/Clock-Out timestamp and GPS/);
});

test('invalid GPS coordinates, incomplete fixes and excessive duration are rejected',()=>{
 assert.throws(()=>buildTimeTrackerAdminPatch(form({
  ...geoFields('clockInGeo',91,123,10)
 }),{mode:'single',record:completedRecord()}),/GPS coordinates/);
 assert.throws(()=>buildTimeTrackerAdminPatch(form({
  clockInGeolatitude:10.3,clockInGeolongitude:123.9
 }),{mode:'single',record:completedRecord()}),/requires latitude/);
 assert.throws(()=>buildTimeTrackerAdminPatch(form({
  durationMode:'manual',durationHours:'745:00:00'
 }),{mode:'single',record:completedRecord()}),/maximum 744 hours/);
});

test('empty edit is rejected and duration cannot be manually assigned to an active session',()=>{
 assert.throws(()=>buildTimeTrackerAdminPatch(form(),{mode:'single',record:completedRecord()}),/No attendance fields/);
 assert.throws(()=>buildTimeTrackerAdminPatch(form({durationMode:'manual',durationHours:'01:00:00'}),{
  mode:'single',record:activeRecord()
 }),/completed attendance/);
});

test('rendered System Admin editor exposes correction fields and escapes employee names',()=>{
 const html=renderTimeTrackerAdminEditor({
  editor:{mode:'single',recordIds:[recordId],records:[completedRecord()]},
  directory:[{id:employeeId,displayName:'<img src=x onerror=alert(1)>'}]
 });
 for(const field of ['employeeId','location','department','status','clockInAt','clockInGeolatitude',
  'clockOutAt','clockOutGeolatitude','durationMode','durationHours','reason'])
  assert.match(html,new RegExp(`name="${field}"`));
 assert.match(html,/role="dialog"/);
 assert.match(html,/aria-modal="true"/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
});

test('individual and bulk editors expose consistent redesigned context and guidance',()=>{
 const single=renderTimeTrackerAdminEditor({
  editor:{mode:'single',recordIds:[recordId],records:[completedRecord()]}
 });
 assert.match(single,/tt-admin-record-context/);
 assert.match(single,/INDIVIDUAL CORRECTION/);
 assert.match(single,/data-tt-admin-dialog/);
 assert.match(single,/Changes are saved to the existing attendance record/);
 const bulk=renderTimeTrackerAdminEditor({
  editor:{mode:'bulk',recordIds:[recordId,'00000000-0000-4000-8000-000000000023'],records:[completedRecord(),activeRecord()]}
 });
 assert.match(bulk,/tt-admin-bulk-guidance/);
 assert.match(bulk,/2 records selected/);
 assert.match(bulk,/BULK CORRECTION/);
 assert.match(bulk,/Blank fields are preserved/);
});

test('individual and bulk deletion use a custom accessible confirmation dialog',()=>{
 const single=renderTimeTrackerAdminDeleteDialog({
  confirmation:{recordIds:[recordId],records:[{name:'Test Employee'}]}
 });
 assert.match(single,/role="alertdialog"/);
 assert.match(single,/aria-modal="true"/);
 assert.match(single,/Delete attendance record/);
 assert.match(single,/Test Employee/);
 assert.match(single,/tt-log-admin-delete-confirm/);
 assert.match(single,/Audit evidence is retained/);
 const bulk=renderTimeTrackerAdminDeleteDialog({
  confirmation:{recordIds:[recordId,'00000000-0000-4000-8000-000000000023'],
   records:[{name:'Test Employee'},{name:'Second Employee'}]}
 });
 assert.match(bulk,/Delete selected attendance records/);
 assert.match(bulk,/2 attendance records/);
 assert.match(bulk,/Second Employee/);
 assert.match(bulk,/Delete 2 records/);
 assert.equal(renderTimeTrackerAdminDeleteDialog({confirmation:null}),'');
});

test('bulk editor leaves fields unchanged unless explicitly populated',()=>{
 const html=renderTimeTrackerAdminEditor({
  editor:{mode:'bulk',recordIds:[recordId,'00000000-0000-4000-8000-000000000023'],records:[completedRecord(),activeRecord()]},
  directory:[{id:employeeId,displayName:'Test Employee'}]
 });
 assert.match(html,/2 selected records/);
 assert.match(html,/value="" selected>No change/);
 assert.match(html,/Leave unchanged/);
});

test('attendance Log management controls are absent for non-System Admin users',()=>{
 const html=renderTimeTrackerLog({records:[{
  id:recordId,ownerId:`cloud:${employeeId}`,name:'Test Employee',
  department:'Information Technology',location:'Office-Base Duty',
  clockIn:'2026-11-16T00:15:00.000Z',clockOut:'2026-11-16T08:15:00.000Z',
  status:'Completed',classification:'Late',creditedMs:28800000
 }],now:new Date('2026-11-16T10:00:00.000Z'),adminEligible:false});
 assert.doesNotMatch(html,/tt-log-admin-toolbar/);
 assert.doesNotMatch(html,/data-tt-log-select/);
 assert.doesNotMatch(html,/tt-log-admin-edit/);
 assert.doesNotMatch(html,/tt-log-admin-delete/);
});

test('attendance Log management controls appear only when System Admin eligibility is supplied',()=>{
 const html=renderTimeTrackerLog({records:[{
  id:recordId,ownerId:`cloud:${employeeId}`,name:'Test Employee',
  department:'Information Technology',location:'Office-Base Duty',
  clockIn:'2026-11-16T00:15:00.000Z',clockOut:'2026-11-16T08:15:00.000Z',
  status:'Completed',classification:'Late',creditedMs:28800000
 }],now:new Date('2026-11-16T10:00:00.000Z'),adminEligible:true,
  selectedIds:[recordId],adminDirectory:[{id:employeeId,display_name:'Test Employee'}]});
 assert.match(html,/tt-log-admin-toolbar/);
 assert.match(html,/data-action="tt-log-admin-select-visible"/);
 assert.match(html,/tt-log-filterable aps-record-selectable is-selected board-row-selected/);
 assert.match(html,/data-action="tt-log-open-detail"/);
 assert.doesNotMatch(html,/type="checkbox"/);
 assert.match(html,/data-action="tt-log-admin-edit"/);
 assert.match(html,/data-action="tt-log-admin-delete"/);
 assert.match(html,/data-action="tt-log-admin-bulk-edit"/);
 assert.match(html,/data-action="tt-log-admin-bulk-delete"/);
});

test('manual credited duration overrides the normal break calculation only on completed records',()=>{
 const record={...completedRecord(),creditedMsOverride:5400000};
 assert.equal(creditedAttendanceRecordMs(record,record.clockIn.timestamp,record.clockOut.timestamp),5400000);
 assert.equal(creditedAttendanceRecordMs(activeRecord(),activeRecord().clockIn.timestamp,null),null);
});

test('bulk management limit remains bounded',()=>assert.equal(TT_ADMIN_RECORD_LIMIT,100));

test('IT Administrator time-only editor cannot expose delete, GPS, employee, status or department changes',()=>{
 const completed=renderTimeTrackerAdminEditor({
  editor:{mode:'single',records:[completedRecord()],recordIds:[recordId]},
  timeOnly:true
 });
 for(const name of ['clockInAt','clockOutAt','reason'])
  assert.match(completed,new RegExp('name="'+name+'"'));
 assert.match(completed,/Correction note \(optional\)/);
 assert.doesNotMatch(completed,/minlength="10"|name="reason"[^>]*required/);
 for(const blocked of ['employeeId','clockInGeo','clockOutGeo','durationMode','name="status"'])
  assert.doesNotMatch(completed,new RegExp(blocked));
 const active=renderTimeTrackerAdminEditor({
  editor:{mode:'single',records:[activeRecord()],recordIds:[recordId]},
  timeOnly:true
 });
 assert.match(active,/Active clock-in session/);
 assert.doesNotMatch(active,/name="clockOutAt"/);
 assert.doesNotMatch(active,/Delete record/);
});
