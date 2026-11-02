import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TimeTrackerNativeClient,projectOwnAttendance,creditedAttendanceMs,
 attendanceClassification,captureAttendanceGeo,TT_LOCATIONS,TT_DEPARTMENTS}
 from '../time-tracker-native.js';
import {renderTimeTrackerNative,ownAttendanceCsv} from '../time-tracker-ui.js';

const user='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const other='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const stamp=(hour,minute=0)=>new Date(2026,10,2,hour,minute).toISOString();
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
 assert.match(html,/My attendance history/);
 assert.doesNotMatch(html,/<script>bad<\/script>/);
 assert.doesNotMatch(html,/<img src=x/);
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
