import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureAttendanceGeo} from '../time-tracker-native.js';
import {renderTimeTrackerOjtClock} from '../apps/TimeTracker/time-tracker-ojt.js';
import {filterTimeTrackerLogRows,renderTimeTrackerLog,timeTrackerLogCsv,
 timeTrackerLogRowsForSnapshot} from '../time-tracker-log.js';

const id='00000000-0000-4000-8000-000000000011';
const internId='00000000-0000-4000-8000-000000000022';
const clockIn='2026-11-23T02:20:00.000Z'; // 10:20 AM Philippine Time: Late
const coordinates=(timestamp=Date.now())=>({
 timestamp,coords:{latitude:10.25,longitude:123.88,accuracy:35}
});

test('a real fresh browser location is accepted immediately without second attempt',async()=>{
 const options=[];
 const geo={getCurrentPosition(ok,_fail,opts){options.push(opts);ok(coordinates());}};
 const updates=[];
 const fix=await captureAttendanceGeo(geo,{onProgress:message=>updates.push(message)});
 assert.equal(fix.status,'captured');
 assert.equal(fix.latitude,10.25);
 assert.equal(fix.source,'browser-geolocation');
 assert.equal(options.length,1);
 assert.equal(options[0].enableHighAccuracy,true);
 assert.equal(options[0].timeout,10000);
 assert.ok(options[0].maximumAge>0);
 assert.equal(updates.length,1);
});

test('high-accuracy timeout retries with a recent browser-provided network fix',async()=>{
 const options=[],updates=[];
 const geo={getCurrentPosition(ok,fail,opts){
  options.push(opts);
  if(options.length===1)fail({code:3});
  else ok(coordinates(Date.now()-30000));
 }};
 const fix=await captureAttendanceGeo(geo,{onProgress:message=>updates.push(message)});
 assert.equal(fix.status,'captured');
 assert.equal(options.length,2);
 assert.equal(options[1].enableHighAccuracy,false);
 assert.equal(options[1].timeout,12000);
 assert.ok(updates[1].includes('network-assisted'));
});

test('stale coordinates are rejected and a subsequent current sensor fix is used',async()=>{
 let attempts=0;
 const geo={getCurrentPosition(ok){
  attempts++;
  ok(coordinates(Date.now()-(attempts===1?120000:1000)));
 }};
 const fix=await captureAttendanceGeo(geo);
 assert.equal(attempts,2);
 assert.ok(Date.now()-Date.parse(fix.capturedAt)<60000);
});

test('GPS permission denial short circuits retries; repeated timeout is actionable',async()=>{
 let tries=0;
 const denied={getCurrentPosition(_ok,fail){tries++;fail({code:1});}};
 await assert.rejects(captureAttendanceGeo(denied),error=>error.code==='TT_GEO_DENIED');
 assert.equal(tries,1);
 const timeout={getCurrentPosition(_ok,fail){fail({code:3});}};
 await assert.rejects(captureAttendanceGeo(timeout),error=>error.code==='TT_GEO_TIMEOUT');
 await assert.rejects(captureAttendanceGeo(null),error=>error.code==='TT_GEO_UNAVAILABLE');
});

test('OJT form preserves selected work location, note and progress after redraw',()=>{
 const html=renderTimeTrackerOjtClock({
  roster:{mode:'SHARED_LOGIN',interns:[{id:internId,name:'Intern Alpha'}]},
  selected:{id:internId,name:'Intern Alpha'},attendance:{records:[],active:null},
  busy:true,locationSelection:'Offsite (Home)',geoProgress:'Finding your GPS location…',
  workPlanDraft:'Inspect instruments from home'
 });
 assert.match(html,/value="Offsite \(Home\)" selected/);
 assert.match(html,/Inspect instruments from home/);
 assert.match(html,/Locating…/);
 assert.match(html,/Finding your GPS location/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/state\.ttOjtLocationSelection=locationValue/);
 assert.match(app,/state\.ttOjtGeoProgress=''/);
 assert.match(app,/TT_GEO_TIMEOUT:'GPS timed out/);
});

test('administrators see individually attributed OJT rows merged with regular Logs',()=>{
 const standard={id:'normal-001',ownerId:'cloud:employee-001',name:'Engineer E',
  clockIn,clockOut:null,department:'Engineering',location:'Office-Base Duty',
  status:'Active',classification:'On time',creditedMs:null};
 const snapshot={status:'VERIFIED_READ',access:{moduleRole:'System Admin'},
  log:{rows:[standard]},ojtAdminAttendance:{records:[
   {id,internId,name:'Intern Alpha',clockIn,clockOut:null,location:'Office-Base Duty'}
  ]}};
 const rows=timeTrackerLogRowsForSnapshot(snapshot);
 assert.equal(rows.length,2);
 const intern=rows.find(r=>r.isOjt);
 assert.equal(intern.name,'Intern Alpha');
 assert.equal(intern.id,'ojt:'+id);
 assert.equal(intern.ownerId,'ojt:'+internId);
 assert.equal(intern.department,'OJT');
 assert.equal(intern.status,'Active');
 assert.equal(intern.classification,'Late');
 assert.equal(filterTimeTrackerLogRows(rows,{search:'intern alpha'}).length,1);
 assert.match(timeTrackerLogCsv(rows),/Intern Alpha/);
 assert.deepEqual(timeTrackerLogRowsForSnapshot({...snapshot,access:{moduleRole:'Employee'}}),[standard]);
 assert.deepEqual(timeTrackerLogRowsForSnapshot({...snapshot,status:'LOADING'}),[]);
});

test('OJT Log details show individual selection and admin actions, never GPS or standard bulk writes',()=>{
 const rows=timeTrackerLogRowsForSnapshot({status:'VERIFIED_READ',
  access:{moduleRole:'IT Administrator'},log:{rows:[]},
  ojtAdminAttendance:{records:[
   {id,internId,name:'Intern Alpha',clockIn,clockOut:null,location:'Offsite (Home)'}
  ]}});
 const html=renderTimeTrackerLog({records:rows,adminEligible:true,adminFullAccess:true,
  expandedRecordIds:['ojt:'+id],now:new Date()});
 assert.match(html,/Intern Alpha/);
 assert.match(html,/OJT intern · Shared login/);
 assert.match(html,/SIGNED OJT ATTENDANCE/);
 assert.match(html,/Shared-login OJT attendance · Admin corrections are audited/);
 assert.match(html,/data-action="tt-log-detail-toggle-select"/);
 assert.match(html,/data-action="tt-log-admin-correct-time"/);
 assert.match(html,/data-action="tt-log-admin-edit"/);
 assert.match(html,/data-action="tt-log-admin-delete"/);
 assert.doesNotMatch(html,/data-action="tt-log-gps-load"/);
});
