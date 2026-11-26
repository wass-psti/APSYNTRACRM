import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {manualAttendancePreviewRoster,renderManualAttendanceEditor,validateManualAttendanceForm} from '../apps/TimeTracker/time-tracker-manual-attendance-ui.js';
const now=new Date('2026-11-24T04:14:00Z');
const roster=[{id:'a',type:'regular',name:'Employee <A>',active:true},{id:'b',type:'ojt',name:'Intern B',active:true}];
const ready={activeReady:true,historicalReady:true,schedulerMode:'active'};
const render=(draft={},extras={})=>renderManualAttendanceEditor({
 editor:{mode:'manual',roster,draft,capability:ready,signedCreateReady:true,...extras},now
});

test('manual form defaults to an active same-day regular employee session',()=>{
 const html=render();
 assert.match(html,/Add Attendance Log/);
 assert.match(html,/data-tt-manual-attendance/);
 assert.match(html,/tt-manual-add-icon/);
 assert.match(html,/<span>Employee<\/span>/);
 assert.match(html,/name="clockInTime" type="time"/);
 assert.match(html,/Session status/);
 assert.match(html,/Work location/);
 assert.match(html,/name="reason" maxlength="500" rows="2" required/);
 assert.match(html,/Times are in Philippine Time\. Ongoing sessions can only be added for today\./);
 assert.match(html,/The employee can clock out from their own Clock screen\./);
 assert.match(html,/data-tt-manual-work-note hidden/);
 assert.match(html,/name="date" type="date" value="2026-11-24" required max="2026-11-24"/);
 assert.match(html,/value="active" selected/);
 assert.match(html,/data-tt-manual-clockout-mode hidden/);
 assert.match(html,/data-tt-manual-out hidden/);
 assert.match(html,/Employee &lt;A&gt;/);
 assert.doesNotMatch(html,/Intern B/);
 assert.match(html,/type="submit" class="primary">Save Attendance Log/);
 assert.match(html,/value="active" selected/);
});


test('Offsite Home reveals a required work note while the regular office default keeps it out of the way',()=>{
 const html=render({location:'Offsite (Home)',workNote:'Working from home, coordinating with the client.'});
 assert.match(html,/data-tt-manual-work-note[^>]*><span>Work note <span class="tt-manual-required"[^>]*>Required/);
 assert.match(html,/textarea name="workNote" maxlength="500" required/);
 assert.match(html,/Offsite – Home/);
 assert.doesNotMatch(html,/data-tt-manual-work-note hidden/);
});
test('manual attendance presentation styles are scoped and retain dark theme support',()=>{
 const light=readFileSync(new URL('../time-tracker-log-admin.css',import.meta.url),'utf8');
 const dark=readFileSync(new URL('../dark-attendance-admin.css',import.meta.url),'utf8');
 assert.match(light,/\.tt-admin-editor\[data-tt-manual-attendance\]/);
 assert.match(light,/tt-manual-required/);
 assert.match(light,/backdrop-filter:blur\(4px\)/);
 assert.match(dark,/\.tt-admin-editor\[data-tt-manual-attendance\]/);
 assert.match(dark,/--tt-manual-bg:#252631/);
});

test('past dates become completed historical records with standard calculation by default',()=>{
 const html=render({date:'2026-11-23',status:'active'});
 assert.match(html,/value="active" disabled/);
 assert.match(html,/value="completed" selected/);
 assert.match(html,/value="standard" selected/);
 assert.match(html,/Standard · 9 credited hours/);
 assert.match(html,/data-tt-manual-out hidden/);
 assert.match(html,/Historical records never enter today/);
 assert.match(html,/data-tt-manual-history/);
 assert.match(html,/Historical corrections create completed HR records/);
});

test('actual clock-out override reveals date and time fields',()=>{
 const html=render({date:'2026-11-23',status:'completed',clockOutMode:'actual',
  clockOutDate:'2026-11-23',clockOutTime:'12:00'});
 assert.match(html,/value="actual" selected/);
 assert.match(html,/name="clockOutDate" type="date" value="2026-11-23" min="2026-11-23" max="2026-11-24" required/);
 assert.match(html,/name="clockOutTime" type="time" value="12:00" required/);
 assert.doesNotMatch(html,/data-tt-manual-out hidden/);
});

test('signed roster preview includes only active regular employees and excludes shared OJT identities',()=>{
 const rows=manualAttendancePreviewRoster({access:{overviewDirectory:[
  {id:'a',display_name:'Regular',status:'active'},{id:'s',display_name:'Shared login',status:'active'},
  {id:'x',display_name:'Inactive',status:'disabled'}]},ojtAdmin:{groups:[
  {userId:'s',enabled:true,interns:[{id:'b',name:'Intern',active:true},{id:'c',name:'Inactive',active:false}]},
  {userId:'d',enabled:false,interns:[{id:'e',name:'Disabled group',active:true}]}]}});
 assert.deepEqual(rows.map(r=>[r.type,r.id]),[['regular','a']]);
});

test('unverified or uncertain service cannot submit',()=>{
 assert.throws(()=>validateManualAttendanceForm(null,{signedCreateReady:false},now),/unavailable/);
 assert.throws(()=>validateManualAttendanceForm(null,{signedCreateReady:true,uncertain:true},now),/unavailable/);
 assert.match(render({},{uncertain:true}),/type="submit" class="primary" disabled/);
});

test('application routes current-day and historical writes through separate signed RPC methods',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const native=readFileSync(new URL('../time-tracker-native.js',import.meta.url),'utf8');
 const log=readFileSync(new URL('../time-tracker-log.js',import.meta.url),'utf8');
 assert.match(app,/case 'tt-log-admin-add':\{\s*if\(!timeTrackerAdminLogReady\(\)\|\|state.ttAttendance.access.moduleRole!=='System Admin'/);
 assert.match(app,/capability\?\.historicalReady===true/);
 assert.match(app,/createManualClockIn\(boardId,entry,editor\.revision\)/);
 assert.match(app,/createHistoricalAttendance\(boardId,entry,editor\.revision,editor\.requestId\)/);
 assert.match(app,/The employee’s current Clock is unchanged/);
 assert.match(native,/timetracker_attendance_admin_create_historical/);
 assert.match(native,/tt-admin-attendance-capability-3/);
 assert.match(log,/Clock-out basis/);
});

test('same-day manual clock-in remains disabled when regular scheduler is suspended',()=>{
 const html=render({},{capability:{activeReady:false,historicalReady:true,schedulerMode:'suspended'}});
 assert.match(html,/Today’s active manual clock-in is disabled/);
 assert.match(html,/type="submit" class="primary" disabled/);
});

test('historical correction remains available while the regular scheduler is suspended',()=>{
 const html=render({date:'2026-11-23',status:'completed'},{capability:{activeReady:false,historicalReady:true,schedulerMode:'suspended'}});
 assert.doesNotMatch(html,/Historical attendance service is not verified/);
 assert.match(html,/type="submit" class="primary">Save Attendance Log/);
});

test('historical correction is unavailable if the signed historical capability is absent',()=>{
 const html=render({date:'2026-11-23',status:'completed'},{capability:{activeReady:true,historicalReady:false,schedulerMode:'active'}});
 assert.match(html,/Historical attendance service is not verified/);
 assert.match(html,/type="submit" class="primary" disabled/);
});
