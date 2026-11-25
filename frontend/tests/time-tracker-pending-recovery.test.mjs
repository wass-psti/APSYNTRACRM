import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTimeTrackerPendingRecovery,timeTrackerPendingKeyMatches} from '../time-tracker-pending-recovery.js';
import {attendanceSnapshotOutcome} from '../time-tracker-clock-recovery.js';

const userId='20000000-0000-4000-8000-000000000001';
const workspaceId='10000000-0000-4000-8000-000000000001';
const boardId='30000000-0000-4000-8000-000000000001';
const scope={userId,workspaceId,boardId};
const time=Date.parse('2026-11-17T07:00:00Z');
const pending={
 ...scope,action:'clock-in',recordId:null,baselineRevision:4,
 previousRecordIds:['existing-session'],location:'Office-Base Duty',department:'HR',
 receiptVerified:false
};
function memoryStorage(){
 const values=new Map();
 return {getItem:key=>values.get(key)??null,
  setItem:(key,value)=>{values.set(key,value);},
  removeItem:key=>{values.delete(key);},values};
}
test('pending Clock In survives reload and is scoped to the signed board and actor',()=>{
 const storage=memoryStorage();
 const first=createTimeTrackerPendingRecovery(storage,{now:()=>time});
 assert.equal(first.save(pending),true);
 const reopened=createTimeTrackerPendingRecovery(storage,{now:()=>time+60000});
 assert.deepEqual(reopened.read(scope),pending);
 assert.equal(reopened.read({...scope,userId:'40000000-0000-4000-8000-000000000001'}),null);
 assert.equal(reopened.read({...scope,workspaceId:'40000000-0000-4000-8000-000000000001'}),null);
 assert.equal(reopened.read({...scope,boardId:'40000000-0000-4000-8000-000000000001'}),null);
 reopened.clear(scope);
 assert.equal(reopened.read(scope),null);
});
test('storage notifications accept only matching signed attendance scope',()=>{
 const storage=memoryStorage(),repo=createTimeTrackerPendingRecovery(storage,{now:()=>time});
 repo.save(pending);
 const key=[...storage.values.keys()][0];
 assert.equal(timeTrackerPendingKeyMatches(key,scope),true);
 assert.equal(timeTrackerPendingKeyMatches(key,{...scope,boardId:'40000000-0000-4000-8000-000000000001'}),false);
 assert.equal(timeTrackerPendingKeyMatches('apsyntra.other',scope),false);
 assert.equal(timeTrackerPendingKeyMatches(null,scope),false);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/window\.addEventListener\('storage',event=>\{/);
 assert.match(app,/timeTrackerPendingKeyMatches\(event\.key,timeTrackerClockScope\(\)\)/);
});

test('markers never contain GPS, work notes, credentials or a complete attendance record',()=>{
 const storage=memoryStorage();
 const repo=createTimeTrackerPendingRecovery(storage,{now:()=>time});
 assert.equal(repo.save({...pending,geo:{latitude:10.2},workNote:'private',accessToken:'secret'}),true);
 // The serializer is deliberately allowlisted, regardless of accidental caller fields.
 const raw=[...storage.values.values()][0];
 assert.doesNotMatch(raw,/latitude|private|secret|accessToken|geo|workNote/);
});
test('invalid or stale markers cannot unblock a second attendance write',()=>{
 const storage=memoryStorage();
 let instant=time;
 const repo=createTimeTrackerPendingRecovery(storage,{now:()=>instant});
 assert.equal(repo.save(pending),true);
 instant+=24*60*60*1000+1;
 assert.equal(repo.read(scope),null);
 assert.equal(storage.values.size,0);
 assert.equal(repo.save({...pending,recordId:'',action:'clock-out'}),false);
 assert.equal(repo.save({...pending,baselineRevision:-1}),false);
 assert.equal(repo.save({...pending,userId:'foreign'}),false);
});
test('read and write failures do not throw or interfere with current signed RPC behavior',()=>{
 const broken={
  getItem(){throw Error('disabled');},setItem(){throw Error('quota');},
  removeItem(){throw Error('disabled');}
 };
 const repo=createTimeTrackerPendingRecovery(broken,{now:()=>time});
 assert.equal(repo.save(pending),false);
 assert.equal(repo.read(scope),null);
 assert.doesNotThrow(()=>repo.clear(scope));
});
test('restored markers can reconcile only from a fresh matching signed snapshot',()=>{
 const repo=createTimeTrackerPendingRecovery(memoryStorage(),{now:()=>time});
 repo.save(pending);
 const restored=repo.read(scope);
 const started='2026-11-17T06:55:00Z';
 const row={id:'new-session',status:'Active',clockIn:started,clockOut:null,
  location:'Office-Base Duty',department:'HR'};
 const snapshot={status:'VERIFIED_READ',access:{...scope},
  revision:5,records:[row],active:row};
 assert.equal(attendanceSnapshotOutcome(snapshot,restored),'CONFIRMED');
 assert.equal(attendanceSnapshotOutcome({...snapshot,
  access:{...scope,userId:'40000000-0000-4000-8000-000000000001'}},restored),'UNVERIFIED');
 const noSessionAfterOtherEmployeeChange={...snapshot,revision:17,records:[],active:null};
 assert.equal(attendanceSnapshotOutcome(noSessionAfterOtherEmployeeChange,restored),'NOT_COMMITTED');
});
test('controller saves before invoking non-idempotent RPC and restores on initial load',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf('async function submitTimeTrackerAction(');
 const end=app.indexOf('async function loadIssues(',start);
 const submit=app.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.ok(submit.indexOf('rememberTimeTrackerClockPending({...context,receiptVerified:false})')<
  submit.indexOf('timeTracker.commit(boardId,'));
 assert.match(app,/restoreTimeTrackerClockPending\(\)/);
 assert.match(app,/clearTimeTrackerClockPending\(\)/);
 assert.match(app,/timeTrackerPendingRecovery\.read/);
 assert.equal((submit.match(/timeTracker\.commit\(/g)||[]).length,1);
 const loadStart=app.indexOf('async function loadTimeTracker(seq=routeSerial,nativeContext=null)');
 const loadEnd=app.indexOf('function timeTrackerAdminLogReady()',loadStart);
 const load=app.slice(loadStart,loadEnd);
 assert.match(load,/reconcileTimeTrackerClock\(snapshot,\{\s*resolveUncommittedClockIn:true\s*\}\)/);
 assert.doesNotMatch(load,/timeTracker\.commit\(/);
 const reconcileStart=app.indexOf('function reconcileTimeTrackerClock(');
 const reconcileEnd=app.indexOf('async function verifyTimeTrackerAttendance()',reconcileStart);
 const reconcile=app.slice(reconcileStart,reconcileEnd);
 assert.match(reconcile,/!pending\.receiptVerified/);
 assert.match(reconcile,/resolveUncommittedClockIn/);
});
