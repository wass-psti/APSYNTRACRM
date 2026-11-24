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
const autoRecordId='00000000-0000-4000-8000-000000000099';
const stamp=(hour,minute=0)=>new Date(Date.UTC(2026,10,2,hour-8,minute)).toISOString();
const example=(ownerId=user)=>({
 id:'session-1',ownerId:'cloud:'+ownerId,
 clockIn:{timestamp:stamp(8),location:TT_LOCATIONS[0],department:TT_DEPARTMENTS[0],
  geo:{status:'captured',latitude:12.3,longitude:123.4}},
 clockOut:null
});
function setup({grant=true,view=true,role='Employee',activeUser=user,ctxWs=workspace,
 records=[],malformed=false,writeReady=false,foreignCapability=false,autoClockoutSnapshot=null,
 departmentValue='HR',email='employee@example.test',clockSnapshotUnavailable=false,
 clockSnapshotError=null,clockSnapshotOverride=null}={}){
 let commitCount=0,lastWrite=null,autoCompleteCount=0,autoCompleteArgs=null;
 let contextReadCount=0,nativeContextReadCount=0,moduleAccessReadCount=0;
 let directoryReadCount=0,stateReadCount=0,clockSnapshotReadCount=0;
 const rpcCounts=new Map();
 const auth={userId:activeUser,getVerifiedUser:async()=>({id:activeUser,email})};
 let currentRecords=records;
 const nativeContext=()=> {
  const boardRecord={id:board,workspace_id:ctxWs,name:'TimeTracker Attendance',
   status:'active',description:'[APSYNTRA:MODULE:timetracker:v1]',
   archived_at:null,trashed_at:null};
  return {contract:'native-app-board-v1',moduleId:'time-tracker',
   userId:activeUser,workspaceId:ctxWs,role,board:boardRecord,
   detail:{board:boardRecord}};
 };
 const api={
  context:async()=>{
   contextReadCount++;
   return {user_id:activeUser,workspace_id:ctxWs,
    profile:{status:'active',platform_role:'hr'}};
  },
  nativeApplicationBoardContext:async moduleId=>{
   nativeContextReadCount++;
   assert.equal(moduleId,'time-tracker');
   await api.context();
   if(!grant)throw Error('TimeTracker application grant required');
   return nativeContext();
  },
  board:async()=>{throw Error('Generic board reads must not gate native TimeTracker access');},
  allowed:async()=>{throw Error('Generic board permissions must not gate native TimeTracker access');},
  rpc:async(name,args)=>{
   rpcCounts.set(name,(rpcCounts.get(name)||0)+1);
   switch(name){
    case 'has_module_access':moduleAccessReadCount++;return grant;
    case 'list_module_directory':
     directoryReadCount++;
     return [{id:activeUser,status:'active',module_role:role,
      display_name:'Test signed employee'}];
    case 'list_module_state':
     stateReadCount++;
     return [{state_key:'timetracker.attendance.v1',
      scope:'shared',revision:2,value:malformed?'not-json':JSON.stringify({version:1,records:currentRecords})}];
    case 'timetracker_clock_snapshot':{
     clockSnapshotReadCount++;
     if(clockSnapshotError)throw clockSnapshotError;
     if(clockSnapshotUnavailable)throw Error('PGRST202: function not found');
     if(clockSnapshotOverride)return clockSnapshotOverride;
     const ownRecords=currentRecords.filter(record=>record?.ownerId==='cloud:'+activeUser)
      .map(record=>{
       const copy=structuredClone(record);
       if(copy.clockIn&&typeof copy.clockIn==='object')delete copy.clockIn.geo;
       if(copy.clockOut&&typeof copy.clockOut==='object')delete copy.clockOut.geo;
       return copy;
      });
     return {contract:'tt-clock-snapshot-1',actorId:activeUser,
      workspaceId:ctxWs,boardId:board,stateKey:'timetracker.attendance.v1',
      scope:'shared',rowFound:true,revision:2,updatedAt:'2026-11-20T00:00:00.000Z',
      value:JSON.stringify({version:1,records:malformed?'not-json':ownRecords})};
    }
    case 'timetracker_auto_clockout_snapshot':
     if(autoClockoutSnapshot===null)throw Error('PGRST202: function not deployed');
     return autoClockoutSnapshot;
    case 'timetracker_employee_department_for_clock':
     return {contract:'tt-department-1',actorId:activeUser,
      workspaceId:ctxWs,boardId:board,department:departmentValue};
    case 'timetracker_attendance_capabilities':
     if(!writeReady)throw Error('PGRST202: function not deployed');
     return {mode:'ACTIVE',contract:'tt-attendance-1',canClock:true,
      actorId:activeUser,workspaceId:foreignCapability?foreign:ctxWs,boardId:board};
    case 'timetracker_auto_clockout_complete':{
     autoCompleteCount++;autoCompleteArgs=args;
     return {mode:'COMMITTED',contract:'tt-auto-clockout-complete-1',
      actorId:activeUser,workspaceId:ctxWs,boardId:board,recordId:args.p_record_id,
      scheduledClockOutAt:'2026-11-20T10:30:00.000Z',
      gpsCapturedAt:args.p_geo.capturedAt,revision:3,committedAt:new Date().toISOString()};
    }
    case 'timetracker_attendance_commit_v2':{
     commitCount++;
     lastWrite=args;
     if(args.p_action==='clock-in'){
      currentRecords=[{id:'new-attendance',ownerId:'cloud:'+activeUser,clockIn:{
       timestamp:stamp(8),location:args.p_location,department:args.p_department,
       ...(args.p_work_note?{workNote:args.p_work_note}:{})},clockOut:null},
       ...currentRecords];
     }
     return {mode:'COMMITTED',contract:'tt-attendance-1',action:args.p_action,
      revision:3,committedAt:stamp(8),actorId:activeUser,
      workspaceId:ctxWs,boardId:board,recordId:currentRecords[0].id};
    }
    default:throw new Error('Unexpected RPC '+name);
   }
  }
 };
 return {client:new TimeTrackerNativeClient({auth,api}),auth,api,commits:()=>commitCount,
  lastWrite:()=>lastWrite,autoCompletes:()=>autoCompleteCount,
  lastAutoComplete:()=>autoCompleteArgs,nativeContext,
  contextReads:()=>contextReadCount,nativeContextReads:()=>nativeContextReadCount,
  moduleAccessReads:()=>moduleAccessReadCount,directoryReads:()=>directoryReadCount,
  stateReads:()=>stateReadCount,clockSnapshotReads:()=>clockSnapshotReadCount,
  rpcCalls:name=>rpcCounts.get(name)||0};
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
 assert.equal(r[0].ownerId,'cloud:'+user);
 assert.equal(JSON.stringify(r).includes('123.4'),false);
 assert.equal(JSON.stringify(r).includes(other),false);
});

test('malformed records or conflicting active sessions deny rather than fabricate',()=>{
 assert.throws(()=>projectOwnAttendance('bad json',user),/malformed/);
 assert.throws(()=>projectOwnAttendance({records:[]},user),/contract/);
 const two=[example(),{...example(),id:'session-2'}];
 assert.throws(()=>projectOwnAttendance({version:1,records:two},user),/Conflicting active/);
});

test('signed module role and native workspace context guard access without generic board permission',async()=>{
 await assert.rejects(setup({grant:false}).client.snapshot(board),/application grant/);
 const withoutBoardView=setup({view:false});
 const nativeSnapshot=await withoutBoardView.client.snapshot(board);
 assert.equal(nativeSnapshot.access.moduleRole,'Employee');
 await assert.rejects(setup({role:'invalid'}).client.snapshot(board),/role assignment/);
 const s=setup();s.auth.userId=other;
 await assert.rejects(s.client.snapshot(board),/signed|identity/i);
});

test('TimeTracker reuses the route native context and removes redundant access round trips',async()=>{
 const ordinary=setup();
 const fresh=await ordinary.client.snapshot(board);
 assert.equal(fresh.status,'VERIFIED_READ');
 assert.equal(ordinary.nativeContextReads(),1,'resolve the native application context once');
 assert.equal(ordinary.contextReads(),3,
  'one resolver context read plus the existing access and snapshot identity rechecks');
 assert.equal(ordinary.moduleAccessReads(),0,'the native resolver already checks module access');

 const reused=setup();
 const snapshot=await reused.client.snapshot(board,{nativeContext:reused.nativeContext()});
 assert.equal(snapshot.status,'VERIFIED_READ');
 assert.equal(reused.nativeContextReads(),0,'reuse the context already resolved by the route');
 assert.equal(reused.contextReads(),2,
  'retain both existing signed identity/workspace rechecks');
 assert.equal(reused.moduleAccessReads(),0);
});

test('TimeTracker rejects a supplied native context from another workspace',async()=>{
 const s=setup();
 const stale={...s.nativeContext(),workspaceId:foreign};
 await assert.rejects(s.client.snapshot(board,{nativeContext:stale}),
  /native application identity or workspace mismatch/i);
});
test('Clock-only role is validated from the canonical native application context',async()=>{
 const s=setup({role:'invalid'});
 await assert.rejects(s.client.snapshot(board,{
  clockOnly:true,nativeContext:s.nativeContext()
 }),/role assignment/);
 assert.equal(s.directoryReads(),0);
});

test('Clock snapshot RPC is registered as an idempotent read-only domain call',()=>{
 const data=readFileSync(new URL('../data.js',import.meta.url),'utf8');
 const allowlist=data.slice(data.indexOf('const BOARD_READ_RPC'),
  data.indexOf('const BOARD_MUTATION_RPC'));
 assert.match(allowlist,/'timetracker_clock_snapshot'/);
});

test('Clock-only snapshot skips directory, full state, overview, log and OT retrieval',async()=>{
 const s=setup({records:[example(),example(other)]});
 const snapshot=await s.client.snapshot(board,{
  clockOnly:true,nativeContext:s.nativeContext()
 });
 assert.equal(snapshot.status,'VERIFIED_READ');
 assert.equal(snapshot.clockOnly,true);
 assert.equal(snapshot.access.moduleRole,'Employee');
 assert.equal(snapshot.access.name,'Signed user');
 assert.deepEqual(snapshot.access.overviewDirectory,[]);
 assert.equal(snapshot.access.employees,null);
 assert.equal(snapshot.records.length,1);
 assert.equal(snapshot.records[0].id,'session-1');
 assert.equal(snapshot.active.id,'session-1');
 assert.equal(snapshot.overview,null);
 assert.equal(snapshot.log,null);
 assert.deepEqual(snapshot.otRequests,[]);
 assert.equal(s.directoryReads(),0,'Clock does not fetch the employee directory');
 assert.equal(s.stateReads(),0,'Clock does not fetch all module state rows');
 assert.equal(s.clockSnapshotReads(),1,'Clock reads one actor-scoped attendance projection');
 assert.equal(s.rpcCalls('timetracker_ot_snapshot'),0);
 assert.equal(JSON.stringify(snapshot.records).includes('123.4'),false);
});

test('Clock-only retrieval falls back only when the lightweight RPC is not deployed',async()=>{
 const s=setup({records:[example(),example(other)],clockSnapshotUnavailable:true});
 const snapshot=await s.client.snapshot(board,{
  clockOnly:true,nativeContext:s.nativeContext()
 });
 assert.equal(snapshot.clockOnly,true);
 assert.equal(snapshot.records.length,1);
 assert.equal(snapshot.records[0].id,'session-1');
 assert.equal(s.directoryReads(),0);
 assert.equal(s.clockSnapshotReads(),1);
 assert.equal(s.stateReads(),1,'legacy full-state fallback preserves compatibility');
});

test('Clock-only retrieval never falls back on authorization or contract failures',async()=>{
 const denied=setup({clockSnapshotError:Object.assign(
  new Error('TimeTracker module access denied'),{status:403,code:'42501'})});
 await assert.rejects(denied.client.snapshot(board,{
  clockOnly:true,nativeContext:denied.nativeContext()
 }),/module access denied/i);
 assert.equal(denied.stateReads(),0);
 assert.equal(denied.directoryReads(),0);

 const foreignContext=setup({clockSnapshotOverride:{
  contract:'tt-clock-snapshot-1',actorId:user,workspaceId:foreign,boardId:board,
  stateKey:'timetracker.attendance.v1',scope:'shared',rowFound:true,
  revision:2,updatedAt:'2026-11-20T00:00:00.000Z',
  value:JSON.stringify({version:1,records:[example()]})
 }});
 await assert.rejects(foreignContext.client.snapshot(board,{
  clockOnly:true,nativeContext:foreignContext.nativeContext()
 }),/snapshot identity or schema mismatch/i);
 assert.equal(foreignContext.stateReads(),0);
});

test('Clock-only empty state preserves the zero-revision empty contract',async()=>{
 const s=setup({clockSnapshotOverride:{
  contract:'tt-clock-snapshot-1',actorId:user,workspaceId:workspace,boardId:board,
  stateKey:'timetracker.attendance.v1',scope:'shared',rowFound:false,
  revision:0,updatedAt:null,value:JSON.stringify({version:1,records:[]})
 }});
 const snapshot=await s.client.snapshot(board,{
  clockOnly:true,nativeContext:s.nativeContext()
 });
 assert.equal(snapshot.revision,0);
 assert.deepEqual(snapshot.records,[]);
 assert.equal(snapshot.active,null);
});

test('full TimeTracker views retain directory and complete state retrieval',async()=>{
 const s=setup({records:[example(),example(other)]});
 const snapshot=await s.client.snapshot(board,{nativeContext:s.nativeContext()});
 assert.equal(snapshot.clockOnly,false);
 assert.equal(snapshot.access.employees,null);
 assert.ok(snapshot.overview);
 assert.ok(snapshot.log);
 assert.equal(snapshot.records.length,1);
 assert.equal(s.directoryReads(),1);
 assert.equal(s.stateReads(),1);
 assert.equal(s.clockSnapshotReads(),0);
});


test('initial and background TimeTracker routes use Clock-only mode unless a record is selected',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/await loadTimeTracker\(seq,nativeModuleId==='time-tracker'\?nativeContext:null\)/);
 assert.match(app,/function timeTrackerClockOnlyForRoute\(identity,workspaceId,boardId\)/);
 assert.match(app,/pending\?\.applicationId==='timetracker'/);
 assert.match(app,/\['Attendance session','Overtime request'\]\.includes\(pending\.recordType\)/);
 assert.match(app,/const clockOnly=timeTrackerClockOnlyForRoute\(identity,ws,state\.boardId\)/);
 assert.match(app,/timeTracker\.snapshot\(state\.boardId,\{\s*clockOnly,nativeContext\s*\}\)/);
 assert.match(app,/clockOnly:timeTrackerClockOnlyForRoute\(userId,workspaceId,boardId\)/);
});

test('read projects existing authoritative state and rejects malformed state',async()=>{
 const s=setup({records:[example()]});
 const snap=await s.client.snapshot(board);
 assert.equal(snap.access.userId,user);
 assert.equal(snap.active.id,'session-1');
 assert.equal(snap.revision,2);
 await assert.rejects(setup({malformed:true}).client.snapshot(board),/malformed/);
});


test('signed automatic clock-out snapshot is bound to the active session and PHT schedule',async()=>{
 const session={recordId:'session-1',status:'GRACE',
  thresholdAt:'2026-11-20T10:00:00.000Z',
  graceStartedAt:'2026-11-20T10:00:00.000Z',
  graceDeadlineAt:'2026-11-20T10:30:00.000Z',
  overtimeCutoffAt:null,nextAt:'2026-11-20T10:30:00.000Z',
  lastEvaluatedAt:'2026-11-20T10:10:00.000Z',clockOutReason:null};
 const response={mode:'ACTIVE',contract:'tt-auto-clockout-1',
  actorId:user,workspaceId:workspace,boardId:board,session};
 const snap=await setup({records:[example()],autoClockoutSnapshot:response}).client.snapshot(board);
 assert.equal(snap.autoClockout.status,'GRACE');
 assert.equal(snap.autoClockout.nextAt,'2026-11-20T10:30:00.000Z');
 const mismatched=await setup({records:[example()],autoClockoutSnapshot:{
  ...response,actorId:other
 }}).client.snapshot(board);
 assert.equal(mismatched.autoClockout,null);
 assert.equal(mismatched.autoClockoutUnavailable,true);
 const foreign=await setup({records:[example()],autoClockoutSnapshot:{
  ...response,session:{...session,recordId:'foreign-session'}
 }}).client.snapshot(board);
 assert.equal(foreign.autoClockout,null);
 assert.equal(foreign.autoClockoutUnavailable,true);
 const legacy=await setup({records:[example()],autoClockoutSnapshot:{
  ...response,session:null
 }}).client.snapshot(board);
 assert.equal(legacy.autoClockout,null);
 const pendingSession={...session,status:'PENDING_GPS',
  pendingAt:'2026-11-20T10:31:00.000Z',
  scheduledClockOutAt:'2026-11-20T10:30:00.000Z',
  clockOutReason:'nine_hour_threshold_grace_expired',
  nextAt:'2026-11-20T10:30:00.000Z'};
 const pending=await setup({records:[example()],autoClockoutSnapshot:{
  ...response,session:pendingSession
 }}).client.snapshot(board);
 assert.equal(pending.autoClockout.status,'PENDING_GPS');
 assert.equal(pending.autoClockout.scheduledClockOutAt,pendingSession.scheduledClockOutAt);
 assert.equal(pending.autoClockout.pendingAt,pendingSession.pendingAt);
});

test('clock-in validates offsite note, GPS and duplicate sessions before RPC',async()=>{
 const s=setup({writeReady:true});
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
 const dup=setup({records:[example()],writeReady:true});
 await assert.rejects(dup.client.commit(board,{...base,workNote:'Site supervision'}),/Already clocked in/);
 assert.equal(dup.commits(),0);
});

test('clock-out requires active record; invalid geographic coordinates never sent',async()=>{
 const s=setup({writeReady:true});
 await assert.rejects(s.client.commit(board,{action:'clock-out',location:TT_LOCATIONS[0],
  department:'HR',geo:{status:'captured',latitude:10,longitude:123,accuracy:20}}),/No active/);
 assert.equal(s.commits(),0);
 const yes=setup({records:[example()],writeReady:true});
 await assert.rejects(yes.client.commit(board,{action:'clock-out',location:TT_LOCATIONS[0],
  department:'HR',geo:{status:'captured',latitude:999,longitude:123,accuracy:20}}),/GPS/);
 assert.equal(yes.commits(),0);
});

test('automatic clock-out completion preserves the scheduled time and submits fresh foreground GPS',async()=>{
 const session={recordId:autoRecordId,status:'PENDING_GPS',
  thresholdAt:'2026-11-20T10:00:00.000Z',
  graceStartedAt:'2026-11-20T10:00:00.000Z',
  graceDeadlineAt:'2026-11-20T10:30:00.000Z',overtimeCutoffAt:null,
  scheduledClockOutAt:'2026-11-20T10:30:00.000Z',
  pendingAt:'2026-11-20T10:31:00.000Z',nextAt:'2026-11-20T10:30:00.000Z',
  lastEvaluatedAt:'2026-11-20T10:31:00.000Z',
  clockOutReason:'nine_hour_threshold_grace_expired'};
 const snapshot={mode:'ACTIVE',contract:'tt-auto-clockout-1',actorId:user,
  workspaceId:workspace,boardId:board,session};
 const s=setup({records:[{...example(),id:autoRecordId}],writeReady:true,autoClockoutSnapshot:snapshot});
 const geo={status:'captured',source:'browser-geolocation',latitude:10.2,
  longitude:123.9,accuracy:14,capturedAt:new Date().toISOString()};
 const result=await s.client.completeAutomaticClockOut(board,{recordId:autoRecordId,geo});
 assert.equal(result.mode,'COMMITTED');
 assert.equal(result.scheduledClockOutAt,session.scheduledClockOutAt);
 assert.equal(result.gpsCapturedAt,geo.capturedAt);
 assert.equal(s.autoCompletes(),1);
 assert.equal(s.lastAutoComplete().p_record_id,autoRecordId);
 assert.equal(s.lastAutoComplete().p_geo,geo);
});

test('automatic clock-out rejects stale GPS and does not call the completion RPC',async()=>{
 const session={recordId:autoRecordId,status:'PENDING_GPS',
  thresholdAt:'2026-11-20T10:00:00.000Z',scheduledClockOutAt:'2026-11-20T10:30:00.000Z',
  pendingAt:'2026-11-20T10:31:00.000Z',clockOutReason:'nine_hour_threshold_grace_expired'};
 const s=setup({records:[{...example(),id:autoRecordId}],writeReady:true,autoClockoutSnapshot:{
  mode:'ACTIVE',contract:'tt-auto-clockout-1',actorId:user,
  workspaceId:workspace,boardId:board,session}});
 await assert.rejects(s.client.completeAutomaticClockOut(board,{recordId:autoRecordId,geo:{
  status:'captured',source:'browser-geolocation',latitude:10,longitude:123,
  accuracy:10,capturedAt:new Date(Date.now()-120000).toISOString()
 }}),/fresh foreground/);
 assert.equal(s.autoCompletes(),0);
});

test('automatic clock-out recognizes a session already closed manually without a duplicate write',async()=>{
 const closed={...example(),id:autoRecordId,clockOut:{timestamp:'2026-11-20T10:35:00.000Z',
  geo:{status:'captured',latitude:10,longitude:123,accuracy:10}}};
 const s=setup({records:[closed],writeReady:true,autoClockoutSnapshot:{
  mode:'ACTIVE',contract:'tt-auto-clockout-1',actorId:user,
  workspaceId:workspace,boardId:board,session:null}});
 const result=await s.client.completeAutomaticClockOut(board,{recordId:autoRecordId,geo:{}});
 assert.equal(result.mode,'ALREADY_CLOSED');
 assert.equal(s.autoCompletes(),0);
});

test('browser GPS captured with no fake or cached location fallback',async()=>{
 const geo={getCurrentPosition(ok){ok({timestamp:Date.now(),
  coords:{latitude:10.2,longitude:123.9,accuracy:14}});}};
 const result=await captureAttendanceGeo(geo);
 assert.equal(result.status,'captured');
 assert.equal(result.source,'browser-geolocation');
 await assert.rejects(captureAttendanceGeo(null),/unavailable/);
});

test('automatic foreground GPS acquisition disables all cached browser fixes',async()=>{
 const options=[];
 const geo={getCurrentPosition(ok,_fail,settings){
  options.push(settings);
  ok({timestamp:Date.now(),coords:{latitude:10.2,longitude:123.9,accuracy:14}});
 }};
 const fix=await captureAttendanceGeo(geo,{freshOnly:true});
 assert.equal(fix.status,'captured');
 assert.equal(options.length,1);
 assert.equal(options[0].maximumAge,0);
});

test('native TimeTracker application shell preserves attendance rendering and escapes untrusted metadata',()=>{
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
 access:{moduleRole:'Employee',platformRole:'hr',name:'<script>bad</script>'},
 records:[{...projectOwnAttendance({version:1,records:[example()]},user)[0],
  location:'<img src=x onerror=evil()>',department:'HR'}],
 active:null}});
 assert.match(html,/class="tt-native"/);
 assert.match(html,/class="fm1-app tt-application"/);
 assert.match(html,/class="tt-app-header fm1-app-header"/);
 assert.match(html,/class="tt-navigation fm1-tabs"/);
 assert.match(html,/tt-clock-form/);
 assert.match(html,/tt-clock-face/);
 assert.match(html,/tt-session-summary/);
 assert.doesNotMatch(html,/<script>bad<\/script>/);
 const log=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{moduleRole:'Employee',platformRole:'hr',name:'<script>bad</script>'},
  records:[{...projectOwnAttendance({version:1,records:[example()]},user)[0],
   location:'<img src=x onerror=evil()>',department:'HR'}]},view:'log'});
 assert.match(log,/Read-only history of authorized sessions, today and earlier\./);
 assert.match(log,/<h2>Attendance Log<\/h2>/);
 assert.doesNotMatch(log,/Signed Clock writes active|Signed workspace verified|tt-log-command-hero/);
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

test('Clock supports v2 but stays disabled without a validated signed server capability',()=>{
 assert.equal(TT_LIVE_ATTENDANCE_WRITES_ACCEPTED,true);
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
 assert.match(app,/state\.ttAttendance\?\.access\?\.attendanceWritesAccepted!==true/);
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
   records:[],otRequests:[{id:'one',date:'2026-11-02',status:'Submitted',
    start:'18:00',end:'20:00',durationMinutes:120,task:'Overtime work'}],
   active:null},period:'week',view:'ot',
   now:new Date('2026-11-04T04:00:00.000Z')});
 assert.match(html,/Overtime/);
 assert.match(html,/Pending/);
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
 assert.match(html,/data-target="calendar"/);
 assert.doesNotMatch(html,/data-target="calendar" disabled aria-disabled="true"/);
 assert.doesNotMatch(html,/data-target="roles"/);
 assert.match(html,/data-target="monitor"/);
 assert.doesNotMatch(html,/data-target="monitor" disabled/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tt-tab'/);
 assert.match(app,/case 'tt-location-shortcut'/);
 assert.match(app,/maintainTimeTrackerClock\(\)/);
 assert.match(app,/stopTimeTrackerClock\(\)/);
});

test('opening a TimeTracker board canonicalizes to the dedicated app and bypasses generic board UI',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/const defaultClock=!parts\[2\]/);
 assert.match(app,/defaultClock\?'attendance':'items'/);
 assert.match(app,/db\.nativeApplicationBoardContext\('time-tracker'\)/);
 assert.match(app,/db\.nativeApplicationBoardContext\('time-tracker'\)/);
 assert.match(app,/const timeTrackerBoard=state\.boards\.find/);
 assert.match(app,/TIMETRACKER_APPLICATION_ROUTE/);
 const boardPage=app.slice(app.indexOf('function boardPage(){'),app.indexOf('async function onRoute(){'));
 const appRoute=boardPage.indexOf("if(moduleByBoardName(b.name)?.key==='timetracker')return renderTimeTrackerApplication();");
 const boardControls=boardPage.indexOf('const items=');
 assert.ok(appRoute>=0&&boardControls>appRoute,'TimeTracker application must return before generic board rendering');
 assert.match(readFileSync('frontend/time-tracker-ui.js','utf8'),/data-action="tt-tab"/);
});

test('Clock backend capability is bound to signed actor, workspace and board',async()=>{
 const ready=setup({writeReady:true});
 const signed=await ready.client.snapshot(board);
 assert.equal(signed.access.attendanceWritesAccepted,true);
 const cross=setup({writeReady:true,foreignCapability:true});
 assert.equal((await cross.client.snapshot(board)).access.attendanceWritesAccepted,false);
 const readOnly=setup();
 assert.equal((await readOnly.client.snapshot(board)).access.attendanceWritesAccepted,false);
 await assert.rejects(()=>readOnly.client.commit(board,{action:'clock-in',location:TT_LOCATIONS[0],
  department:'HR',geo:{status:'captured',latitude:10,longitude:123,accuracy:20}}),/activation required/);
 assert.equal(readOnly.commits(),0);
});

test('Clock button activates only after signed backend capability is in snapshot',()=>{
 const access={moduleRole:'Employee',platformRole:'employee',name:'User',
  attendanceWritesAccepted:true,employeeDepartment:'HR'};
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',access,
  records:[],active:null}});
 assert.match(html,/name="tt-action" value="clock-in"/);
 assert.doesNotMatch(html,/name="tt-action" value="clock-in" disabled/);
 assert.match(html,/Session is secured with a fresh GPS fix on start and end/);
 assert.doesNotMatch(html,/Signed Clock writes active|Signed workspace verified/);
 assert.doesNotMatch(html,/Live writes remain disabled/);
 const inactive=renderTimeTrackerNative({result:{status:'VERIFIED_READ',
  access:{...access,attendanceWritesAccepted:false},records:[],active:null}});
 assert.match(inactive,/value="clock-in" disabled/);
 assert.match(inactive,/Clock actions pending backend acceptance/);
 assert.match(inactive,/Live writes remain disabled/);
 assert.doesNotMatch(inactive,/Session is secured with a fresh GPS fix on start and end/);
});

test('active Clock Out reuses signed Clock In context and requires a fresh GPS fix',async()=>{
 const s=setup({records:[example()],writeReady:true});
 const gps={status:'captured',latitude:10.2,longitude:123.9,accuracy:12,
  capturedAt:new Date().toISOString(),source:'browser-geolocation'};
 const result=await s.client.commit(board,{action:'clock-out',
  location:'malicious client-selected location',department:'invalid',geo:gps});
 assert.equal(result.action,'clock-out');
 assert.equal(s.lastWrite().p_record_id,'session-1');
 assert.equal(s.lastWrite().p_location,TT_LOCATIONS[0]);
 assert.equal(s.lastWrite().p_department,TT_DEPARTMENTS[0]);
 assert.deepEqual(s.lastWrite().p_geo,gps);
 const snap=await s.client.snapshot(board);
 const html=renderTimeTrackerNative({result:snap,view:'clock'});
 assert.match(html,/tt-active-session-context/);
 assert.match(html,/Location<\/span><strong>(?:Office-Base Duty|Offsite · Home)<\/strong>/);
 assert.match(html,/Session is secured with a fresh GPS fix on start and end/);
 assert.doesNotMatch(html,/id="tt-location"/);
 assert.doesNotMatch(html,/id="tt-department"/);
 const offsite={...example(),clockIn:{...example().clockIn,
  location:'Offsite (Home)'}};
 const home=setup({records:[offsite],writeReady:true});
 const homeView=renderTimeTrackerNative({result:await home.client.snapshot(board)});
 assert.match(homeView,/Work Plan/);
 assert.match(homeView,/textarea id="tt-note" readonly/);
 assert.doesNotMatch(homeView,/id="tt-note-wrap" hidden/);
 const clockOut=await home.client.commit(board,{action:'clock-out',geo:gps});
 assert.equal(clockOut.action,'clock-out');
});


test('mvasquez active Home clock-out hides the exempt work note and retains End Session',async()=>{
 const id='5655922e-bb42-45e4-bf8b-348a0bf77f3a';
 const prior={...example(id),clockIn:{...example(id).clockIn,
  location:'Offsite (Home)',department:'Engineering',workNote:''}};
 const s=setup({records:[prior],activeUser:id,email:'mvasquez@watchdogautomation.com.ph',
  departmentValue:'Engineering',writeReady:true});
 const html=renderTimeTrackerNative({result:await s.client.snapshot(board),view:'clock'});
 assert.match(html,/id="tt-note-wrap" hidden/);
 assert.match(html,/name="tt-action" value="clock-out"/);
 assert.match(html,/Location<\/span><strong>(?:Office-Base Duty|Offsite · Home)<\/strong>/);
});

test('Home requires a trimmed note for ordinary accounts including System Admin',async()=>{
 const geo={status:'captured',latitude:10,longitude:123,accuracy:20};
 for(const role of ['Employee','System Admin']){
  const s=setup({writeReady:true,role,email:'other@watchdogautomation.com.ph'});
  const request={action:'clock-in',location:'Offsite (Home)',geo};
  await assert.rejects(s.client.commit(board,{...request,workNote:'   '}),/Offsite Work Note/);
  assert.equal(s.commits(),0);
  await s.client.commit(board,{...request,workNote:'  Checking reports from home  '});
  assert.equal(s.lastWrite().p_work_note,'Checking reports from home');
  const snap=await s.client.snapshot(board);
  assert.equal(snap.records[0].workNote,'Checking reports from home');
 }
});

test('only two authenticated email accounts can clock in at Home without a note',async()=>{
 const geo={status:'captured',latitude:10,longitude:123,accuracy:20};
 for(const email of ['asenagan@watchdogautomation.com.ph','mvasquez@watchdogautomation.com.ph']){
  const s=setup({writeReady:true,email:email.toUpperCase()});
  const snap=await s.client.snapshot(board);
  assert.equal(snap.access.email,email);
  const receipt=await s.client.commit(board,{
   action:'clock-in',location:'Offsite (Home)',workNote:'   ',geo
  });
  assert.equal(receipt.action,'clock-in');
  assert.equal(s.lastWrite().p_work_note,null);
 }
});

test('verified mvasquez user ID permits an empty Home note without an email field',async()=>{
 const signedUserId='5655922e-bb42-45e4-bf8b-348a0bf77f3a';
 const s=setup({writeReady:true,activeUser:signedUserId,email:''});
 const geo={status:'captured',latitude:10,longitude:123,accuracy:20};
 const snapshot=await s.client.snapshot(board);
 assert.equal(snapshot.access.email,'');
 assert.equal(snapshot.access.userId,signedUserId);
 const receipt=await s.client.commit(board,{action:'clock-in',location:'Offsite (Home)',workNote:'   ',geo});
 assert.equal(receipt.action,'clock-in');
 assert.equal(s.lastWrite().p_work_note,null);
 assert.equal(s.commits(),1);
});

test('Home reason readback is scoped to the signed attendance owner',()=>{
 const own={...example(),clockIn:{...example().clockIn,location:'Offsite (Home)',workNote:'  Approved home schedule  '}};
 const foreignRecord={...example(other),id:'foreign-note',clockIn:{...example(other).clockIn,workNote:'Sensitive note'}};
 const rows=projectOwnAttendance({version:1,records:[own,foreignRecord]},user);
 assert.equal(rows.length,1);
 assert.equal(rows[0].workNote,'  Approved home schedule  ');
 assert.equal(JSON.stringify(rows).includes('Sensitive note'),false);
});
