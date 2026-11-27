import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeTrackerGpsRecordWindow} from '../time-tracker-gps.js';
import {renderTimeTrackerLog} from '../time-tracker-log.js';
import {TimeTrackerNativeClient} from '../time-tracker-native.js';

const userId='10000000-0000-4000-8000-000000000011';
const workspaceId='00000000-0000-4000-8000-000000000001';
const foreignWorkspaceId='00000000-0000-4000-8000-000000000002';
const boardId='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const payload={
 scope:'AUTHORIZED_WORKSPACE_GPS',actorId:userId,workspaceId,boardId,
 from:'2026-11-01',to:'2026-11-02',truncated:false,
 events:[{
  userId,recordId:'overnight',kind:'in',name:'Employee Example',
  department:'Engineering',location:'Office-Base Duty',
  timestamp:'2026-11-01T15:55:00Z',latitude:6.99,longitude:125.48,
  accuracyM:12,source:'Browser GPS'
 }]
};

function makeClient(moduleRole,bootstrap=false,foreign=false){
 let logCalls=0,hubCalls=0;
 const client=new TimeTrackerNativeClient({
  auth:{
   userId,isSignedIn:true,
   getVerifiedUser:async()=>({id:userId})
  },
  api:{
   context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
   nativeApplicationBoardContext:async moduleId=>({
    contract:'native-app-board-v1',moduleId,userId,workspaceId,role:moduleRole,
    board:{id:boardId,workspace_id:workspaceId,name:'TimeTracker Attendance',
     status:'active',description:'[APSYNTRA:MODULE:timetracker:v1]',
     archived_at:null,trashed_at:null}
   }),
   board:async()=>({board:{id:boardId,workspace_id:workspaceId,name:'TimeTracker Attendance'}}),
   allowed:async()=>true,
   rpc:async name=>{
    if(name==='has_module_access')return true;
    if(name==='list_module_directory')return [{
     id:userId,status:'active',module_role:moduleRole,display_name:'Example'
    }];
    if(name==='apsyntra_role_is_bootstrap')return bootstrap;
    if(name==='timetracker_log_gps_snapshot'){
     logCalls++;
     return {...payload,workspaceId:foreign?foreignWorkspaceId:workspaceId};
    }
    if(name==='timetracker_gps_snapshot'){hubCalls++;return payload;}
    throw Error('Unexpected RPC '+name);
   }
  }
 });
 return {client,get logCalls(){return logCalls;},get hubCalls(){return hubCalls;}};
}

test('record GPS window includes both Philippine-local dates for overnight attendance',()=>{
 assert.deepEqual(timeTrackerGpsRecordWindow({
  clockIn:'2026-11-01T15:55:00Z',clockOut:'2026-11-01T16:05:00Z'
 }),{from:'2026-11-01',to:'2026-11-02'});
 assert.deepEqual(timeTrackerGpsRecordWindow({
  clockIn:'2026-11-01T02:00:00Z',clockOut:null
 }),{from:'2026-11-01',to:'2026-11-01'});
 assert.equal(timeTrackerGpsRecordWindow({
  clockIn:'2026-10-01T00:00:00Z',clockOut:'2026-11-02T00:00:00Z'
 }),null);
});

test('Log GPS accepts HR and System Admin while GPS Hub eligibility stays unchanged',async()=>{
 for(const role of ['HR','System Admin','Supervisor']){
  const item=makeClient(role);
  const result=await item.client.logGpsEvidence(boardId,{from:payload.from,to:payload.to});
  assert.equal(result.events.length,1,role);
  assert.equal(item.logCalls,1,role);
  if(role==='Supervisor'){
   const hub=await item.client.gpsEvidence(boardId,{from:payload.from,to:payload.to});
   assert.equal(hub.events.length,1);
   assert.equal(item.hubCalls,1);
  }else{
   await assert.rejects(
    ()=>item.client.gpsEvidence(boardId,{from:payload.from,to:payload.to}),
    /Only bootstrap administrators and TimeTracker Supervisors/
   );
   assert.equal(item.hubCalls,0);
  }
 }
});

test('Bootstrap behavior remains supported and ordinary Employee remains excluded',async()=>{
 const bootstrap=makeClient('Employee',true);
 assert.equal((await bootstrap.client.logGpsEvidence(boardId,{
  from:payload.from,to:payload.to
 })).events.length,1);
 assert.equal((await bootstrap.client.gpsEvidence(boardId,{
  from:payload.from,to:payload.to
 })).events.length,1);
 const employee=makeClient('Employee',false);
 await assert.rejects(()=>employee.client.logGpsEvidence(boardId,{
  from:payload.from,to:payload.to
 }),/Only System Admin, HR/);
 assert.equal(employee.logCalls,0);
});

test('Log GPS response is rejected when its signed workspace identity differs',async()=>{
 const client=makeClient('HR',false,true);
 await assert.rejects(()=>client.client.logGpsEvidence(boardId,{
  from:payload.from,to:payload.to
 }),/Signed GPS scope mismatch/);
});

const overnightRecord={
 id:'overnight',ownerId:'cloud:'+userId,name:'Employee Example',
 clockIn:'2026-11-01T15:55:00Z',clockOut:'2026-11-01T16:05:00Z',
 department:'Engineering',location:'Office-Base Duty',status:'Completed',
 classification:'On time',creditedMs:9*60*60*1000
};

test('Signed Log presents clock-in and clock-out GPS independently',()=>{
 const html=renderTimeTrackerLog({
  records:[overnightRecord],now:new Date('2026-11-02T02:00:00Z'),
  gpsEligible:true,expandedRecordIds:['overnight'],
  gpsData:{
   ranges:[{from:'2026-11-01',to:'2026-11-02',userId,truncated:false}],
   events:payload.events,truncated:false
  }
 });
 assert.match(html,/Clock-in GPS/);
 assert.match(html,/Captured/);
 assert.match(html,/Clock-out GPS/);
 assert.match(html,/Not captured/);
 assert.match(html,/6\.990000, 125\.480000/);
});

test('A complete employee-specific read supersedes a truncated all-user range',()=>{
 const html=renderTimeTrackerLog({
  records:[overnightRecord],now:new Date('2026-11-02T02:00:00Z'),
  gpsEligible:true,expandedRecordIds:['overnight'],
  gpsData:{
   ranges:[
    {from:'2026-11-01',to:'2026-11-02',userId:null,truncated:true},
    {from:'2026-11-01',to:'2026-11-02',userId,truncated:false}
   ],events:[],truncated:true
  }
 });
 assert.match(html,/Clock-in GPS/);
 assert.match(html,/Clock-out GPS/);
 assert.match(html,/Not captured/);
 assert.doesNotMatch(html,/Clock-in GPS[\s\S]{0,100}Not loaded/);
});

test('Truncated all-user evidence remains Not loaded until a complete employee read',()=>{
 const html=renderTimeTrackerLog({
  records:[overnightRecord],now:new Date('2026-11-02T02:00:00Z'),
  gpsEligible:true,expandedRecordIds:['overnight'],
  gpsData:{
   ranges:[{from:'2026-11-01',to:'2026-11-02',userId:null,truncated:true}],
   events:[],truncated:true
  }
 });
 assert.match(html,/Not loaded/);
});

test('Attendance Log GPS status summary has responsive visual styling',()=>{
 const css=readFileSync('frontend/styles.css','utf8');
 assert.match(css,/\.tt-log-gps-status-summary\\{display:flex/);
 assert.match(css,/\.tt-log-gps-status-summary strong/);
 assert.match(css,/@media\\(max-width:680px\\)/);
});
test('Attendance Log role wiring is separate from GPS Hub and uses per-employee evidence ranges',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const native=readFileSync('frontend/time-tracker-native.js','utf8');
 assert.match(app,/function timeTrackerLogGpsEligible/);
 assert.match(app,/\['System Admin','HR','Supervisor'\]/);
 assert.match(app,/timeTracker\.logGpsEvidence\(boardId,params\)/);
 assert.match(app,/logGpsEligible:timeTrackerLogGpsEligible\(\)/);
 assert.match(app,/timeTrackerMapEligible\(\)/);
 assert.match(app,/timeTrackerLogRowsForSnapshot\(state\.ttAttendance\)\.find/);
 assert.match(app,/timeTrackerGpsRecordWindow\(record\)/);
 assert.match(app,/truncated:data\.truncated===true/);
 assert.match(native,/timetracker_log_gps_snapshot/);
 assert.match(native,/async gpsEvidence/);
 assert.match(native,/async logGpsEvidence/);
});
