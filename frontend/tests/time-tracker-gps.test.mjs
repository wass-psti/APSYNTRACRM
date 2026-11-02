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
 assert.doesNotMatch(native,/async gpsEvidence\(/);
 const sql=readFileSync('sql/cp-tt-gps01-staged-evidence.sql','utf8');
 assert.match(sql,/timetracker_ot_require_scope/);
 assert.match(sql,/apsyntra_role_is_bootstrap/);
 assert.match(sql,/module_role_for/);
});
