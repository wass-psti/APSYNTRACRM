import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileTimeTrackerAccounting} from '../time-tracker-accounting-reconciliation.js';
import {renderTimeTrackerReports} from '../time-tracker-reports.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
const owner='cloud:20000000-0000-4000-8000-000000000001';
const record={
 id:'test-session',ownerId:owner,name:'Test Employee',status:'Completed',
 classification:'On time',department:'HR',location:'Office-Base Duty',
 clockIn:'2026-11-17T08:00:00.000Z', // 16:00 PHT
 clockOut:'2026-11-17T12:00:00.000Z', // 20:00 PHT
 creditedMs:14400000
};
const approved={id:'approved-ot',ownerId:owner,status:'Approved',date:'2026-11-17',
 start:'18:00',end:'20:00',durationMinutes:120};
test('read-only signed approved OT overlap does not alter PostgreSQL attendance hours',()=>{
 const r=reconcileTimeTrackerAccounting({records:[record],otRequests:[approved],otContractActive:true});
 assert.deepEqual(r,{status:'SIGNED_READ_ONLY',completed:1,creditedMs:14400000,
  matchedSessions:1,approvedOverlapMinutes:120,evaluatedApprovedRequests:1});
});
test('rejected, submitted, foreign and before-18:00 requests never qualify',()=>{
 const r=reconcileTimeTrackerAccounting({
  records:[record],otContractActive:true,otRequests:[
   {...approved,id:'pending',status:'Submitted'},
   {...approved,id:'rejected',status:'Rejected'},
   {...approved,id:'foreign',ownerId:'cloud:someone-else'},
   {...approved,id:'early',start:'17:00',end:'19:00'},
   {...approved,id:'wrong-date',date:'2026-11-16'}
  ]});
 assert.equal(r.approvedOverlapMinutes,0);
 assert.equal(r.matchedSessions,0);
});
test('partial shifts count actual clock overlap and overlapping approvals are not double counted',()=>{
 const r=reconcileTimeTrackerAccounting({
  records:[{...record,clockOut:'2026-11-17T11:00:00.000Z'}],
  otRequests:[approved,{...approved,id:'overlap',start:'18:30',end:'19:30'}],
  otContractActive:true
 });
 assert.equal(r.approvedOverlapMinutes,60);
 assert.equal(r.matchedSessions,1);
});
test('no signed OT contract results in an unavailable indication, never simulated approval',()=>{
 const r=reconcileTimeTrackerAccounting({records:[record],otRequests:[approved]});
 assert.equal(r.status,'OT_CONTRACT_UNAVAILABLE');
 assert.equal(r.approvedOverlapMinutes,0);
 assert.equal(r.creditedMs,14400000);
});
test('Reports clearly label approved OT as comparison only and do not mutate hours',()=>{
 const html=renderTimeTrackerReports({rows:[record],otRequests:[approved],
  otContractActive:true,now:new Date('2026-11-18T03:00:00Z')});
 assert.match(html,/Signed overtime reconciliation/);
 assert.match(html,/120 minutes of clocked approved OT overlap/);
 assert.match(html,/These minutes are not added to credited hours/);
 assert.match(html,/04:00:00/);
 const noContract=renderTimeTrackerReports({rows:[record],otRequests:[approved],
  now:new Date('2026-11-18T03:00:00Z')});
 assert.match(noContract,/Authoritative OT approval contract is not active/);
 assert.doesNotMatch(noContract,/120 minutes of clocked approved OT overlap/);
});
test('TimeTracker native Reports connects the signed OT snapshot to the comparison',()=>{
 const html=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',records:[record],active:null,
   access:{userId:owner.slice(6),workspaceId:'10000000-0000-4000-8000-000000000001',
    boardId:'30000000-0000-4000-8000-000000000001',otContractActive:true,
    attendanceWritesAccepted:true,moduleRole:'Employee'},
   log:{rows:[record],scope:'OWN_ATTENDANCE_ONLY'},
   otRequests:[approved]},
  view:'reports',now:new Date('2026-11-18T03:00:00Z')
 });
 assert.match(html,/Signed overtime reconciliation/);
 assert.match(html,/120 minutes of clocked approved OT overlap/);
});
