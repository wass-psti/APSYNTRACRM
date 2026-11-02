import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TimeTrackerNativeClient,projectOwnAttendance,creditedAttendanceMs,
 attendanceClassification,captureAttendanceGeo,TT_LOCATIONS,TT_DEPARTMENTS,TT_LIVE_ATTENDANCE_WRITES_ACCEPTED,projectOwnOvertime,filterMyAttendancePeriod}
 from '../time-tracker-native.js';
import {renderTimeTrackerNative,ownAttendanceCsv,timeTrackerClockParts,syncTimeTrackerClock} from '../time-tracker-ui.js';

const user='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const other='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const stamp=(hour,minute=0)=>new Date(Date.UTC(2026,10,2,hour-8,minute)).toISOString();
const example=(ownerId=user)=>({
 id:'session-1',ownerId:'cloud:'+ownerId,
 clockIn:{timestamp:stamp(8),location:TT_LOCATIONS[0],department:TT_DEPARTMENTS[0],
  geo:{status:'captured',latitude:12.3,longitude:123.4}},
 clockOut:null
});
function setup({grant=true,view=true,role='Employee',activeUser=user,ctxWs=workspace,
 records=[],malformed=false}={}){
 let commitCount=0;
 const auth={userId:activeUser,getVerifiedUser:async()=>({id:activeUser})};
 let currentRecords=records;
 const api={
  context:async()=>({user_id:activeUser,workspace_id:ctxWs,profile:{status:'active',platform_role:'hr'}}),
  board:async()=>({board:{id:board,workspace_id:ctxWs,name:'TimeTracker Attendance'}}),
  allowed:async()=>view,
  rpc:async(name,args)=>{
   switch(name){
    case 'has_module_access':return grant;
    case 'list_module_directory':return [{id:activeUser,status:'active',module_role:role,
     display_name:'Test signed employee'}];
    case 'list_module_state':return [{state_key:'timetracker.attendance.v1',
     scope:'shared',revision:2,value:malformed?'not-json':JSON.stringify({version:1,records:currentRecords})}];
    case 'commit_timetracker_attendance_action':{
     commitCount++;
     if(args.p_action==='clock-in'){
      currentRecords=[{id:'new-attendance',ownerId:'cloud:'+activeUser,clockIn:{
       timestamp:stamp(8),location:args.p_location,department:args.p_department},clockOut:null},
       ...currentRecords];
     }
     return {action:args.p_action,revision:3,state_key:'timetracker.attendance.v1',
      committed_at:stamp(8),record:currentRecords[0]};
    }
    default:throw new Error('Unexpected RPC '+name);
   }
  }
 };
 return {client:new TimeTrackerNativeClient({auth,api}),auth,api,commits:()=>commitCount};
}

test('source 08:00 late threshold and unpaid 12:00–13:00 credit policy',()=>{
 assert.equal(attendanceClassification(example()),'On time');
 assert.equal(attendanceClassification({...example(),clockIn:{timestamp:stamp(8,1)}}),'Late');
 assert.equal(creditedAttendanceMs(stamp(11),stamp(14)),2*3600000);
 assert.equal(creditedAttendanceMs(stamp(13),stamp(14)),3600000);
 assert.equal(creditedAttendanceMs('bad-date',stamp(14)),0);
});

test('attendance classifications and break deductions use PHT even outside Asia/Manila',()=>{
 assert.equal(attendanceClassification({clockIn:{timestamp:'2026-11-02T00:00:00.000Z'}}),'On time');
 assert.equal(attendanceClassification({clockIn:{timestamp:'2026-11-02T00:01:00.000Z'}}),'Late');
 assert.equal(creditedAttendanceMs('2026-11-02T03:00:00.000Z','2026-11-02T06:00:00.000Z'),2*3600000);
 assert.equal(creditedAttendanceMs('2026-11-01T15:00:00.000Z','2026-11-01T17:00:00.000Z'),2*3600000);
});

test('native projection returns only signed actor fields, no GPS or foreign rows',()=>{
 const r=projectOwnAttendance({version:1,records:[example(),example(other)]},user);
 assert.equal(r.length,1);
 assert.equal(r[0].status,'Active');
 assert.equal(JSON.stringify(r).includes('123.4'),false);
 assert.equal(JSON.stringify(r).includes(other),false);
});

test('malformed records or conflicting active sessions deny rather than fabricate',()=>{
 assert.throws(()=>projectOwnAttendance('bad json',user),/malformed/);
 assert.throws(()=>projectOwnAttendance({records:[]},user),/contract/);
 const two=[example(),{...example(),id:'session-2'}];
 assert.throws(()=>projectOwnAttendance({version:1,records:two},user),/Conflicting active/);
});

test('signed module role, board permission and workspace context guard access',async()=>{
 await assert.rejects(setup({grant:false}).client.snapshot(board),/application grant/);
 await assert.rejects(setup({view:false}).client.snapshot(board),/Board access/);
 await assert.rejects(setup({role:'invalid'}).client.snapshot(board),/role assignment/);
 const s=setup();s.auth.userId=other;
 await assert.rejects(s.client.snapshot(board),/signed|identity/i);
});

test('read projects existing authoritative state and rejects malformed state',async()=>{
 const s=setup({records:[example()]});
 const snap=await s.client.snapshot(board);
 assert.equal(snap.access.userId,user);
 assert.equal(snap.active.id,'session-1');
 assert.equal(snap.revision,2);
 await assert.rejects(setup({malformed:true}).client.snapshot(board),/malformed/);
});

test('clock-in validates offsite note, GPS and duplicate sessions before RPC',async()=>{
 const s=setup();
 const base={action:'clock-in',location:'Offsite (Home)',department:'HR',
 geo:{status:'captured',latitude:10,longitude:123,accuracy:20}};
 await assert.rejects(s.client.commit(board,base),/Work Note/);
 assert.equal(s.commits(),0);
 await assert.rejects(s.client.commit(board,{...base,workNote:'Site supervision',
  geo:{status:'unavailable'}}),/GPS/);
 assert.equal(s.commits(),0);
 const result=await s.client.commit(board,{...base,workNote:'Site supervision'});
 assert.equal(result.action,'clock-in');
 assert.equal(result.revision,3);
 assert.equal(s.commits(),1);
 const dup=setup({records:[example()]});
 await assert.rejects(dup.client.commit(board,{...base,workNote:'Site supervision'}),/Already clocked in/);
 assert.equal(dup.commits(),0);
});

test('clock-out requires active record; invalid geographic coordinates never sent',async()=>{
 const s=setup();
 await assert.rejects(s.client.commit(board,{action:'clock-out',location:TT_LOCATIONS[0],
  department:'HR',geo:{status:'captured',latitude:10,longitude:123,accuracy:20}}),/No active/);
 assert.equal(s.commits(),0);
 const yes=setup({records:[example()]});
 await assert.rejects(yes.client.commit(board,{action:'clock-out',location:TT_LOCATIONS[0],
  department:'HR',geo:{status:'captured',latitude:999,longitude:123,accuracy:20}}),/GPS/);
 assert.equal(yes.commits(),0);
});

test('browser GPS captured with no fake or cached location fallback',async()=>{
 const geo={getCurrentPosition(ok){ok({timestamp:Date.now(),
  coords:{latitude:10.2,longitude:123.9,accuracy:14}});}};
 const result=await captureAttendanceGeo(geo);
 assert.equal(result.status,'captured');
 assert.equal(result.source,'browser-geolocation');
 await assert.rejects(captureAttendanceGeo(null),/unavailable/);
});

test('native UI mounts within board and escapes untrusted record metadata',()=>{
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
 access:{moduleRole:'Employee',platformRole:'hr',name:'<script>bad</script>'},
 records:[{...projectOwnAttendance({version:1,records:[example()]},user)[0],
  location:'<img src=x onerror=evil()>',department:'HR'}],
 active:null}});
 assert.match(html,/tt-clock-form/);
 assert.match(html,/tt-clock-face/);
 assert.match(html,/tt-session-summary/);
 assert.doesNotMatch(html,/<script>bad<\/script>/);
 const log=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{moduleRole:'Employee',platformRole:'hr',name:'<script>bad</script>'},
  records:[{...projectOwnAttendance({version:1,records:[example()]},user)[0],
   location:'<img src=x onerror=evil()>',department:'HR'}]},view:'log'});
 assert.match(log,/Attendance history/);
 assert.doesNotMatch(log,/<img src=x/);
 const denied=renderTimeTrackerNative({error:'No module access'});
 assert.doesNotMatch(denied,/tt-clock-form/);
});

test('own CSV escapes formulas and does not include sensitive GPS',()=>{
 const r=projectOwnAttendance({version:1,records:[example()]},user);
 const csv=ownAttendanceCsv([{...r[0],location:'=HYPERLINK("evil")'}]);
 assert.match(csv,/HYPERLINK/);
 assert.doesNotMatch(csv,/latitude|longitude|geo/);
 assert.match(csv,/' =HYPERLINK/);
});

test('board route integrates TimeTracker without standalone imports or local store',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/time-tracker-native\.js/);
 assert.match(app,/loadTimeTracker\(seq\)/);
 assert.match(app,/commit_timetracker_attendance_action|timeTracker\.commit/);
 assert.match(app,/parts\[2\]==='attendance'/);
 assert.doesNotMatch(app,/time-tracker\.zip|\/apps\/time-tracker\/|ttStorage/);
});

test('production clock actions fail closed until signed backend audit/work-note gates pass',()=>{
 assert.equal(TT_LIVE_ATTENDANCE_WRITES_ACCEPTED,false);
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{moduleRole:'Employee',platformRole:'employee',name:'User'},
  records:[],active:null}});
 assert.match(html,/Live writes remain disabled/);
 assert.match(html,/name="tt-action" value="clock-in" disabled/);
 assert.doesNotMatch(html,/name="tt-action" value="clock-out"/);
 const active=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{moduleRole:'Employee',platformRole:'employee',name:'User'},
  records:[],active:{id:'session-1',clockIn:stamp(8)}},view:'clock'});
 assert.match(active,/name="tt-action" value="clock-out" disabled/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/if\(!TT_LIVE_ATTENDANCE_WRITES_ACCEPTED\)/);
});

test('overtime projection only includes verified signed owner and valid statuses',()=>{
 const requests=[
  {id:'ot-one',ownerId:'cloud:'+user,date:'2026-11-02',status:'Submitted',
   start:'18:00',end:'19:00',durationMinutes:60,task:'Site review'},
  {id:'ot-other',ownerId:'cloud:'+other,date:'2026-11-02',status:'Approved',
   start:'18:00',end:'19:00',durationMinutes:60,task:'Restricted item'},
  {id:'ot-invalid',ownerId:'cloud:'+user,date:'invalid',status:'Approved'}
 ];
 const result=projectOwnOvertime({version:1,requests},user);
 assert.equal(result.length,1);
 assert.equal(result[0].id,'ot-one');
 assert.equal(JSON.stringify(result).includes('Restricted item'),false);
 assert.throws(()=>projectOwnOvertime('invalid-json',user),/malformed/);
});

test('weekly and monthly personal reporting preserve period and owner scope',()=>{
 const monday=new Date('2026-11-02T04:00:00.000Z'); // 12:00 PHT
 const rows=[
  {clockIn:'2026-11-02T00:00:00.000Z'}, // Monday 08:00 PHT
  {clockIn:'2026-10-31T00:00:00.000Z'}  // Saturday 08:00 PHT
 ];
 assert.equal(filterMyAttendancePeriod(rows,'today',monday).length,1);
 assert.equal(filterMyAttendancePeriod(rows,'week',monday).length,1);
 assert.equal(filterMyAttendancePeriod(rows,'month',monday).length,1);
 assert.equal(filterMyAttendancePeriod(rows,'all',monday).length,2);
 assert.throws(()=>filterMyAttendancePeriod(rows,'nextYear',monday),/Unsupported report period/);
});

test('personal today, week and month boundaries follow the PHT calendar',()=>{
 const now=new Date('2026-11-01T17:00:00.000Z'); // Monday 01:00 PHT
 const rows=[
  {clockIn:'2026-10-31T15:59:59.000Z'}, // October 31 23:59 PHT
  {clockIn:'2026-11-01T15:59:59.000Z'}, // Sunday 23:59 PHT
  {clockIn:'2026-11-01T16:00:00.000Z'}, // Monday 00:00 PHT
  {clockIn:'2026-11-01T16:30:00.000Z'}, // Monday 00:30 PHT
  {clockIn:'2026-11-01T18:00:00.000Z'}  // future session, excluded
 ];
 for(const period of ['today','week'])
  assert.deepEqual(filterMyAttendancePeriod(rows,period,now),rows.slice(2,4));
 assert.deepEqual(filterMyAttendancePeriod(rows,'month',now),rows.slice(1,4));
 assert.equal(filterMyAttendancePeriod(rows,'all',now).length,5);
});

test('native report UI includes period selection and signed-user OT read-only table',()=>{
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
   access:{moduleRole:'Employee',platformRole:'employee',name:'User'},
   records:[],otRequests:[{id:'one',date:'2026-11-02',status:'Draft',
    start:'18:00',end:'20:00',durationMinutes:120,task:'Overtime work'}],
   active:null},period:'week',view:'ot'});
 assert.match(html,/My overtime requests/);
 assert.match(html,/Overtime work/);
 assert.doesNotMatch(html,/data-action="tt-ot-approve"/);
 const reports=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{moduleRole:'Employee',platformRole:'employee',name:'User'},
  records:[],active:null},view:'reports',period:'month'});
 assert.match(reports,/tt-report-period/);
 assert.match(reports,/value="month" selected/);
});

test('Clock reference layout formats stable local time and daytime greeting',()=>{
 const time=new Date('2026-11-02T07:22:31.000Z');
 const parts=timeTrackerClockParts(time);
 assert.equal(parts.greeting,'Good afternoon,');
 assert.equal(parts.day,'Monday, November 2');
 assert.equal(parts.hours,'03');
 assert.equal(parts.minutes,'22');
 assert.equal(parts.seconds,'31');
 assert.equal(parts.period,'PM');
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{moduleRole:'Employee',platformRole:'hr',name:'Employee'},
  records:[],active:null,otRequests:[]},now:time});
 assert.match(html,/Good afternoon,/);
 assert.match(html,/Monday, November 2/);
 assert.match(html,/id="tt-clock-hours">03/);
 assert.match(html,/id="tt-clock-minutes">22/);
 assert.match(html,/tt-clock-colon/);
 assert.match(html,/tt-session-summary/);
 assert.match(html,/Quick select/);
 assert.match(html,/data-location="Office-Base Duty"/);
 assert.match(html,/data-location="Offsite \(Home\)"/);
 assert.match(html,/value="clock-in" disabled/);
 assert.match(html,/Clock actions pending backend acceptance/);
});

test('Clock ticker updates only mounted text nodes and does not fetch data',()=>{
 const nodes=new Map();
 for(const key of ['greeting','date','hours','minutes','seconds','period'])
  nodes.set('#tt-clock-'+key,{textContent:''});
 const root={querySelector:id=>nodes.get(id)||null};
 assert.equal(syncTimeTrackerClock(root,new Date('2026-11-02T07:22:31.000Z')),true);
 assert.equal(nodes.get('#tt-clock-hours').textContent,'03');
 assert.equal(nodes.get('#tt-clock-minutes').textContent,'22');
 assert.equal(nodes.get('#tt-clock-seconds').textContent,'31');
 assert.equal(syncTimeTrackerClock({querySelector:()=>null}),false);
});

test('TimeTracker reference navigation exposes only already implemented views',()=>{
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{moduleRole:'Employee',platformRole:'hr',name:'Employee'},
  records:[],active:null,otRequests:[]}});
 for(const section of ['clock','log','reports','ot'])
  assert.match(html,new RegExp('data-target="'+section+'"'));
 assert.match(html,/data-target="calendar" disabled aria-disabled="true"/);
 assert.match(html,/data-target="roles" disabled aria-disabled="true"/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tt-tab'/);
 assert.match(app,/case 'tt-location-shortcut'/);
 assert.match(app,/maintainTimeTrackerClock\(\)/);
 assert.match(app,/stopTimeTrackerClock\(\)/);
});

test('opening TimeTracker board lands on Clock but generic board items stay reachable',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/const defaultClock=!parts\[2\]/);
 assert.match(app,/defaultClock\?'attendance':'items'/);
 assert.match(app,/key==='timetracker'\?'\/items':''/);
 assert.match(readFileSync('frontend/time-tracker-ui.js','utf8'),/data-action="tt-tab"/);
});
