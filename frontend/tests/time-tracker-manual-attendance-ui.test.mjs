import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {manualAttendancePreviewRoster,renderManualAttendanceEditor,validateManualAttendanceForm} from '../apps/TimeTracker/time-tracker-manual-attendance-ui.js';
const now=new Date('2026-11-24T04:14:00Z');
const roster=[{id:'a',type:'regular',name:'Employee <A>',active:true},{id:'b',type:'ojt',name:'Intern B',active:true}];
const render=(draft={},extras={})=>renderManualAttendanceEditor({editor:{mode:'manual',roster,draft,...extras},now});
test('manual form shows today by default, both identities and locked save before backend acceptance',()=>{
 const html=render();
 assert.match(html,/Add Attendance Log/);
 assert.match(html,/name="date" type="date" value="2026-11-24" required max="2026-11-24"/);
 assert.match(html,/value="active" selected>Active/);
 assert.match(html,/data-tt-manual-out hidden/);
 assert.match(html,/Employee &lt;A&gt;/);
 assert.match(html,/Intern B \(OJT\)/);
 assert.match(html,/type="submit" disabled>Save Attendance Log/);
});
test('past dates force Completed and require clock-out; today may be completed explicitly',()=>{
 const past=render({date:'2026-11-23',status:'active'});
 assert.match(past,/value="active" disabled/);
 assert.match(past,/value="completed" selected/);
 assert.match(past,/name="clockOutTime" type="text" value=""[^>]*required/);
 assert.doesNotMatch(past,/data-tt-manual-out hidden/);
 assert.match(render({status:'completed'}),/value="completed" selected/);
});
test('signed roster preview excludes shared login, inactive users and inactive interns',()=>{
 const rows=manualAttendancePreviewRoster({access:{overviewDirectory:[
  {id:'a',display_name:'Regular',status:'active'},{id:'s',display_name:'Shared login',status:'active'},
  {id:'x',display_name:'Inactive',status:'disabled'}]},ojtAdmin:{groups:[
  {userId:'s',enabled:true,interns:[{id:'b',name:'Intern',active:true},{id:'c',name:'Inactive',active:false}]},
  {userId:'d',enabled:false,interns:[{id:'e',name:'Disabled group',active:true}]}]}});
 assert.deepEqual(rows.map(r=>[r.type,r.id]),[['ojt','b'],['regular','a']]);
});
test('unverified or uncertain service cannot submit',()=>{
 assert.throws(()=>validateManualAttendanceForm(null,{signedCreateReady:false},now),/unavailable/);
 assert.throws(()=>validateManualAttendanceForm(null,{signedCreateReady:true,uncertain:true},now),/unavailable/);
 assert.match(render({},{signedCreateReady:true,uncertain:true}),/type="submit" disabled/);
});
test('application routes the admin Add Log action through the existing signed guard and fail-closed editor',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const log=readFileSync(new URL('../time-tracker-log.js',import.meta.url),'utf8');
 assert.match(app,/case 'tt-log-admin-add':\{\s*if\(!timeTrackerAdminLogReady\(\)\|\|state.ttAttendance.access.moduleRole!=='System Admin'/);
 assert.match(app,/signedCreateReady:false,draft:/);
 assert.match(app,/No record was saved/);
 assert.match(log,/adminFullAccess\?'<div class="tt-log-admin-toolbar"/);
 assert.match(log,/data-action="tt-log-admin-add"/);
 assert.match(log,/adminFullAccess&&adminEditor\?\.mode==='manual'\?renderManualAttendanceEditor/);
});

test('verified active-only service excludes OJT and completed creation',()=>{
 const html=render({date:'2026-11-23',status:'completed'},{signedCreateReady:true,activeOnly:true});
 assert.match(html,/data-active-only="true"/);
 assert.match(html,/name="date" type="date" value="2026-11-24"/);
 assert.match(html,/value="active" selected/);
 assert.doesNotMatch(html,/value="completed"/);
 assert.doesNotMatch(html,/Intern B/);
 assert.match(html,/type="submit">Save Attendance Log/);
});

test('verified completed service exposes an editable calendar and both status options for regular employees',()=>{
 const html=render({clockInTime:'08:45'},{signedCreateReady:true,regularOnly:true,activeOnly:false});
 assert.match(html,/name="date" type="date"[^>]*max="2026-11-24"/);
 assert.doesNotMatch(html,/name="date"[^>]*readonly/);
 assert.match(html,/value="active" selected/);
 assert.match(html,/value="completed">Completed/);
 assert.match(html,/name="clockInTime" type="text" value="8:45 AM"/);
 assert.match(html,/name="clockInPreset" aria-label="Clock-in time hourly presets"/);
 assert.match(html,/<option value="08:00">8:00 AM<\/option>/);
 assert.match(html,/<option value="18:00">6:00 PM<\/option>/);
 assert.doesNotMatch(html,/Intern B/);
 assert.match(html,/type="submit">Save Attendance Log/);
});
test('offsite Work Plan alone exposes and requires the work note; other locations hide and omit it',()=>{
 const html=render({location:'Office-Base Duty',workNote:'Do not carry this note'});
 assert.match(html,/data-tt-manual-note hidden/);
 assert.match(html,/name="workNote" maxlength="500" disabled/);
 assert.doesNotMatch(html,/Do not carry this note/);
 const home=render({location:'Offsite (Home)',workNote:'Project testing'});
 assert.doesNotMatch(home,/data-tt-manual-note hidden/);
 assert.match(home,/name="workNote" maxlength="500" required>Project testing/);
});
