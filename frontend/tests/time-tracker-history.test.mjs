import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectTimeTrackerLog} from '../time-tracker-history.js';
import {filterTimeTrackerLogRows,renderTimeTrackerLog,timeTrackerLogCsv,
 timeTrackerLogSummary} from '../time-tracker-log.js';
import {TimeTrackerNativeClient} from '../time-tracker-native.js';

const manager='e247a7b9-c3d4-4d3d-91b1-abcdef000001';
const staff='e247a7b9-c3d4-4d3d-91b1-abcdef000002';
const colleague='e247a7b9-c3d4-4d3d-91b1-abcdef000003';
const foreign='e247a7b9-c3d4-4d3d-91b1-abcdef000004';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const workspace='00000000-0000-4000-8000-000000000001';
const now=new Date('2026-11-02T08:00:00.000Z'); // Nov 2, 4 PM PHT
const directory=[
 {id:manager,status:'active',display_name:'Manager Person'},
 {id:staff,status:'active',display_name:'Engineering Member'},
 {id:colleague,status:'active',display_name:'Staff Two'},
 {id:foreign,status:'inactive',display_name:'Inactive member'}
];
const record=(id,user,timestamp,clockOut=null,name='')=>({
 id,ownerId:'cloud:'+user,
 clockIn:{timestamp,location:'Office-Base Duty',department:'Engineering',
  geo:{latitude:6.99,longitude:125.48},workNote:name},
 clockOut:clockOut?{timestamp:clockOut}:null,
 audit:{privileged:true,device:'private'}
});
const state={version:1,records:[
 record('today-one',staff,'2026-11-02T01:00:00Z'),
 record('today-two',colleague,'2026-11-01T23:30:00Z','2026-11-02T07:30:00Z'),
 record('old-one',staff,'2026-10-31T23:30:00Z','2026-11-01T08:00:00Z'),
 record('old-manager',manager,'2026-10-28T01:00:00Z','2026-10-28T10:00:00Z'),
 record('not-listed',foreign,'2026-11-02T01:00:00Z'),
 record('not-authorized','01010101-1111-4111-8111-111111111111','2026-11-02T01:00:00Z')
]};
const project=(moduleRole,userId=manager)=>projectTimeTrackerLog({
 value:state,directory,userId,moduleRole
});

test('privileged signed current-workspace roles see today and all eligible prior sessions',()=>{
 for(const role of ['System Admin','IT Administrator','HR']){
  const log=project(role);
  assert.equal(log.scope,'AUTHORIZED_WORKSPACE_TEAM');
  assert.deepEqual(log.rows.map(r=>r.id),
   ['today-one','today-two','old-one','old-manager']);
  assert.equal(new Set(log.rows.map(r=>r.ownerId)).size,3);
  assert.equal(log.rows[0].name,'Engineering Member');
  assert.equal(log.rows[2].status,'Completed');
  assert.equal(log.rows[0].classification,'Late');
  assert.equal(log.rows[1].classification,'On time');
 }
});

test('nonmanagement roles cannot browse coworkers despite broad API record input',()=>{
 for(const role of ['Employee','OJT','Supervisor','Finance']){
  const log=projectTimeTrackerLog({value:state,directory,userId:staff,moduleRole:role});
  assert.equal(log.scope,'OWN_ATTENDANCE_ONLY');
  assert.deepEqual(log.rows.map(r=>r.id),['today-one','old-one']);
 }
});

test('directory omissions, inactive users and malformed source fail closed',()=>{
 assert.deepEqual(project('HR').rows.map(r=>r.id).includes('not-listed'),false);
 assert.throws(()=>projectTimeTrackerLog({
  value:state,directory:[],userId:manager,moduleRole:'HR'
 }),/directory/);
 assert.throws(()=>projectTimeTrackerLog({
  value:'bad-json',directory,userId:manager,moduleRole:'HR'
 }),/malformed/);
 assert.throws(()=>projectTimeTrackerLog({
  value:{version:2,records:[]},directory,userId:manager,moduleRole:'HR'
 }),/schema/);
});

test('today and historical Log search/filter/sort cover all authorized employee names',()=>{
 const log=project('HR');
 assert.equal(filterTimeTrackerLogRows(log.rows,{period:'all'},now).length,4);
 assert.equal(filterTimeTrackerLogRows(log.rows,{period:'today'},now).length,2);
 assert.deepEqual(filterTimeTrackerLogRows(log.rows,{search:'staff two'},now).map(r=>r.id),
  ['today-two']);
 assert.deepEqual(filterTimeTrackerLogRows(log.rows,{search:'engineering member',sort:'oldest'},now)
  .map(r=>r.id),['old-one','today-one']);
 assert.equal(filterTimeTrackerLogRows(log.rows,{status:'Completed'},now).length,3);
 const metrics=timeTrackerLogSummary(log.rows,now);
 assert.equal(metrics.sessions,4);
 assert.equal(metrics.people,3);
 assert.equal(metrics.today,2);
 assert.equal(metrics.historical,2);
});

test('rendered team Log identifies employee names without raw GPS or audit metadata',()=>{
 const log=project('HR');
 const html=renderTimeTrackerLog({records:log.rows,scope:log.scope,now});
 assert.match(html,/Authorized team history/);
 assert.match(html,/Engineering Member/);
 assert.match(html,/Staff Two/);
 assert.match(html,/October 28/);
 assert.match(html,/November 2/);
 assert.match(html,/Details/);
 assert.ok(!html.includes(String(state.records[0].clockIn.geo.latitude)));
 assert.ok(!html.includes(String(state.records[0].clockIn.geo.longitude)));
 assert.doesNotMatch(html,/"geo":|"audit":/);
 const csv=timeTrackerLogCsv(filterTimeTrackerLogRows(log.rows,{search:'Engineering Member'},now));
 assert.match(csv,/Engineering Member/);
 assert.doesNotMatch(csv,/Staff Two|latitude|device/);
 const malicious=timeTrackerLogCsv([{
  ...log.rows[0],name:'=HYPERLINK("https:\/\/bad.example")'
 }]);
 assert.ok(malicious.includes("'=HYPERLINK"));
 const controlCsv=timeTrackerLogCsv([{...log.rows[0],name:String.fromCharCode(9)+'=SUM(1,1)'}]);
 assert.ok(controlCsv.includes("'"+String.fromCharCode(9)+'=SUM'));

});

test('native signed snapshot wires sanitized all-date Log without weakening personal Clock records',async()=>{
 const auth={userId:manager,getVerifiedUser:async()=>({id:manager})};
 const api={
  context:async()=>({user_id:manager,workspace_id:workspace,
   profile:{status:'active',platform_role:'hr'}}),
  board:async()=>({board:{id:board,workspace_id:workspace,name:'TimeTracker Attendance'}}),
  allowed:async()=>true,
  rpc:async(name)=>{
   if(name==='has_module_access')return true;
   if(name==='list_module_directory')return directory.map(u=>({
     ...u,module_role:u.id===manager?'HR':'Employee'
   }));
   if(name==='list_module_state')return [{state_key:'timetracker.attendance.v1',
     scope:'shared',revision:2,value:JSON.stringify(state)}];
   if(name==='timetracker_ot_snapshot')throw Error('PGRST202: Could not find the function');
   throw Error('Unexpected RPC: '+name);
  }
 };
 const snapshot=await new TimeTrackerNativeClient({auth,api}).snapshot(board);
 assert.equal(snapshot.records.length,1);
 assert.equal(snapshot.log.rows.length,4);
 assert.equal(snapshot.log.scope,'AUTHORIZED_WORKSPACE_TEAM');
 assert.equal(snapshot.log.rows[0].name,'Engineering Member');
 const native=readFileSync('frontend/time-tracker-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(native,/result\.log\?\.rows/);
 assert.match(app,/timeTrackerLogCsv/);
 assert.match(app,/ttAttendance\.log\?\.rows/);
});
