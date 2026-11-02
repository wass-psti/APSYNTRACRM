import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeTrackerGpsWindow,validateTimeTrackerGps,gpsDistance,summarizeGps,renderTimeTrackerGps,plotGps} from '../time-tracker-gps.js';
const id='10000000-0000-4000-8000-000000000011',ws='00000000-0000-4000-8000-000000000001',board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const raw={scope:'AUTHORIZED_WORKSPACE_GPS',actorId:id,workspaceId:ws,boardId:board,from:'2026-11-01',to:'2026-11-02',truncated:false,events:[
 {userId:id,recordId:'safe-id',kind:'in',name:'Employee Sample',department:'Engineering',location:'Office-Base Duty',timestamp:'2026-11-02T01:00:00Z',latitude:6.99,longitude:125.48,accuracyM:12,source:'Browser GPS'}
]};
test('GPS snapshot rejects fabricated grants and foreign board identities',()=>{
 assert.throws(()=>validateTimeTrackerGps({...raw,workspaceId:board},{userId:id,workspaceId:ws,boardId:board}),/scope mismatch/);
 assert.equal(validateTimeTrackerGps(raw,{userId:id,workspaceId:ws,boardId:board}).events.length,1);
});
test('invalid precision and impossible coordinates are rejected',()=>{
 for(const invalid of [{latitude:999},{accuracyM:-1},{longitude:190}]){
  assert.throws(()=>validateTimeTrackerGps({...raw,events:[{...raw.events[0],...invalid}]},{userId:id,workspaceId:ws,boardId:board}),/Invalid signed GPS point/);
 }
});
test('PHT date windows, distance and summarized fixes are deterministic',()=>{
 assert.deepEqual(timeTrackerGpsWindow(new Date('2026-11-02T04:00:00Z'),2),{from:'2026-11-01',to:'2026-11-02'});
 const data=validateTimeTrackerGps(raw,{userId:id,workspaceId:ws,boardId:board});
 assert.equal(gpsDistance(data.events[0],data.events[0]),0);
 assert.equal(summarizeGps(data).latest.length,1);
 assert.match(plotGps(data.events),/coordinate plot/i);
});
test('GPS presentation hides member coordinates unless explicitly eligible',()=>{
 const data=validateTimeTrackerGps(raw,{userId:id,workspaceId:ws,boardId:board});
 const hidden=renderTimeTrackerGps({data,eligible:false});
 assert.doesNotMatch(hidden,/6\.990000|Employee Sample/);
 const shown=renderTimeTrackerGps({data,eligible:true});
 assert.match(shown,/GPS &amp; Location Hub/);
 assert.match(shown,/Employee Sample/);
 assert.match(shown,/not satellite imagery/);
});
test('broad attendance snapshot remains GPS-free and cannot supply the scoped GPS view',()=>{
 const native=readFileSync('frontend/time-tracker-native.js','utf8');
 assert.match(native,/projectOwnAttendance/);
 assert.match(native,/async gpsEvidence\(/);
 const sql=readFileSync('sql/cp-tt-gps01-staged-evidence.sql','utf8');
 assert.match(sql,/timetracker_ot_require_scope/);
 assert.match(sql,/apsyntra_role_is_bootstrap/);
 assert.match(sql,/module_role_for/);
});

import {TimeTrackerNativeClient} from '../time-tracker-native.js';
test('signed server GPS endpoint accepts only bootstrap or assigned Supervisor',async()=>{
 const assigned='10000000-0000-4000-8000-000000000012';
 const payload={...raw};
 const make=(moduleRole,bootstrap=false,foreign=false)=>{
  let calls=0;
  const client=new TimeTrackerNativeClient({
   auth:{userId:id,isSignedIn:true,getVerifiedUser:async()=>({id})},
   api:{
    context:async()=>({user_id:id,workspace_id:ws,profile:{status:'active'}}),
    board:async()=>({board:{id:board,workspace_id:ws,name:'TimeTracker Attendance'}}),
    allowed:async()=>true,
    rpc:async(name)=>{
     if(name==='has_module_access')return true;
     if(name==='list_module_directory')return [{id,status:'active',module_role:moduleRole,display_name:'Example'}];
     if(name==='apsyntra_role_is_bootstrap')return bootstrap;
     if(name==='timetracker_gps_snapshot'){calls++;return {...payload,workspaceId:foreign?assigned:ws};}
     throw Error('Unexpected RPC '+name);
    }
   }
  });
  return {client,get calls(){return calls;}};
 };
 const params={from:'2026-11-01',to:'2026-11-02'};
 for(const [role,bootstrap] of [['Supervisor',false],['Employee',true]]){
  const x=make(role,bootstrap);
  assert.equal((await x.client.gpsEvidence(board,params)).events.length,1);
  assert.equal(x.calls,1);
 }
 for(const role of ['Employee','HR','Finance','System Admin','IT Administrator','OJT']){
  const x=make(role,false);
  await assert.rejects(()=>x.client.gpsEvidence(board,params),/Only bootstrap administrators/);
  assert.equal(x.calls,0);
 }
 const cross=make('Supervisor',false,true);
 await assert.rejects(()=>cross.client.gpsEvidence(board,params),/Signed GPS scope mismatch/);
});
test('GPS app wiring retains privacy and clears state on logout and expiry',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/timeTracker\.gpsEvidence/);
 assert.match(app,/case 'tt-gps-load'/);
 assert.match(app,/case 'tt-gps-compare'/);
 assert.match(app,/state\.ttGpsRunId\+\+/);
 assert.match(app,/gpsEligible:state\.roleVerified===true\|\|state\.ttAttendance\?\.access\?\.moduleRole==='Supervisor'/);
});

test('GPS reference redesign renders accessible mapped tabs, counters and filters',()=>{
 const data=validateTimeTrackerGps(raw,{userId:id,workspaceId:ws,boardId:board});
 const html=renderTimeTrackerGps({data,eligible:true,view:'map',now:new Date('2026-11-02T04:00:00Z')});
 for(const token of ['tt-gps-heading','tt-gps-map-shell','tt-gps-map-stats',
  'tt-gps-map-modes','tt-gps-map-zoom','tt-gps-controls','tt-gps-records',
  'Live Map','Geofence','Trail','Accuracy','Trends','Load signed evidence']){
  assert.ok(html.includes(token),'missing GPS design feature: '+token);
 }
 assert.match(html,/role="tablist"/);
 assert.match(html,/aria-selected="true"/);
 assert.match(html,/RECORDED/);
 assert.doesNotMatch(html,/Tracking Active|live employee location/i);
});
test('GPS map mode and zoom are bounded and do not request unapproved satellite tiles',()=>{
 const data=validateTimeTrackerGps(raw,{userId:id,workspaceId:ws,boardId:board});
 const html=renderTimeTrackerGps({data,eligible:true,filters:{theme:'dark',zoom:3}});
 assert.match(html,/tt-gps-theme-dark/);
 assert.match(html,/scale\(3\)/);
 assert.match(html,/data-theme="dark" aria-pressed="true"/);
 assert.match(html,/Satellite<\/span><\/button>/);
 assert.match(html,/disabled aria-disabled="true"/);
 assert.doesNotMatch(html,/<(?:img|iframe)\b|(?:src|style)="[^"]*https:\/\/[^"]*(?:tiles|satellite)/i);
 assert.match(plotGps(data.events,{zoom:99}),/scale\(4\)/);
 assert.match(plotGps(data.events,{zoom:-1}),/scale\(1\)/);
});
test('GPS privacy and geofence, trail and analysis views retain signed records',()=>{
 const data=validateTimeTrackerGps(raw,{userId:id,workspaceId:ws,boardId:board});
 for(const view of ['geofence','trail','accuracy','trends']){
  const html=renderTimeTrackerGps({data,eligible:true,view,filters:{userId:id,referenceId:'safe-id:in',radius:300}});
  assert.match(html,/GPS &amp; Location Hub/);
  assert.match(html,/Employee Sample/);
 }
 const hidden=renderTimeTrackerGps({data,eligible:false});
 assert.doesNotMatch(hidden,/Employee Sample|6\.990000|tt-gps-map-modes/);
 const index=readFileSync('index.html','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(index,/frontend\/time-tracker-gps\.css/);
 assert.match(app,/case 'tt-gps-zoom'/);
 assert.match(app,/case 'tt-gps-theme'/);
});
