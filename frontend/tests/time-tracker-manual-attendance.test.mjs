import test from 'node:test';
import assert from 'node:assert/strict';
import {manualAttendanceToday,manualAttendanceDatePolicy,buildManualAttendanceEntry} from '../apps/TimeTracker/time-tracker-manual-attendance.js';

const now=new Date('2026-11-24T04:14:00Z');
const regular='11111111-1111-4111-8111-111111111111';
const ojt='22222222-2222-4222-8222-222222222222';
const roster=[{id:regular,type:'regular',active:true},{id:ojt,type:'ojt',active:true}];
const base={employeeId:regular,employeeType:'regular',date:'2026-11-24',
 clockInTime:'08:00',status:'active',location:'Office-Base Duty',reason:'Missed clock-in'};
const build=(patch={})=>buildManualAttendanceEntry({...base,...patch},{now,roster});

test('Manila midnight, not UTC or browser timezone, decides today',()=>{
 assert.equal(manualAttendanceToday(new Date('2026-11-23T15:59:59Z')),'2026-11-23');
 assert.equal(manualAttendanceToday(new Date('2026-11-23T16:00:00Z')),'2026-11-24');
 assert.deepEqual(manualAttendanceDatePolicy('2026-11-24',now),
  {allowed:true,activeAllowed:true,defaultStatus:'active'});
 assert.equal(manualAttendanceDatePolicy('2026-11-23',now).defaultStatus,'completed');
 assert.equal(manualAttendanceDatePolicy('2026-11-25',now).allowed,false);
 assert.equal(manualAttendanceDatePolicy('2026-02-30',now).allowed,false);
});
test('regular and OJT active sessions use the same payload rules',()=>{
 for(const [employeeId,employeeType] of [[regular,'regular'],[ojt,'ojt']]){
  const result=build({employeeId,employeeType});
  assert.equal(result.clockInAt,'2026-11-24T00:00:00.000Z');
  assert.equal(result.clockOutAt,null);
  assert.equal(result.employeeId,employeeId);
 }
});
test('today can also be completed, and past must be completed',()=>{
 assert.equal(build({status:'completed',clockOutTime:'11:00'}).clockOutAt,'2026-11-24T03:00:00.000Z');
 assert.equal(build({date:'2026-11-23',status:'completed',clockOutTime:'17:00'}).clockOutAt,'2026-11-23T09:00:00.000Z');
 assert.throws(()=>build({date:'2026-11-23'}),/Past attendance/);
 assert.throws(()=>build({date:'2026-11-25'}),/future/);
});
test('completed records support overnight shifts that already ended',()=>{
 assert.equal(build({date:'2026-11-23',clockInTime:'22:00',status:'completed',
  clockOutDate:'2026-11-24',clockOutTime:'06:00'}).clockOutAt,'2026-11-23T22:00:00.000Z');
});
test('invalid, missing, equal, reversed and future timestamps fail closed',()=>{
 assert.throws(()=>build({clockInTime:'12:15'}),/future/);
 assert.throws(()=>build({clockInTime:'25:00'}),/valid Philippine/);
 assert.throws(()=>build({status:'completed'}),/valid Philippine/);
 assert.throws(()=>build({status:'completed',clockOutTime:'08:00'}),/later/);
 assert.throws(()=>build({status:'completed',clockOutTime:'07:00'}),/later/);
 assert.throws(()=>build({date:'2026-11-23',status:'completed',clockOutMode:'actual',clockOutDate:'2026-11-24',clockOutTime:'13:00'}),/future/);
 assert.throws(()=>build({clockOutTime:'11:00'}),/Active attendance/);
});
test('only selected roster identities and valid manual evidence accepted',()=>{
 assert.throws(()=>build({employeeId:'33333333-3333-4333-8333-333333333333'}),/authorized roster/);
 assert.throws(()=>build({employeeId:ojt}),/authorized roster/);
 assert.throws(()=>build({reason:' '}),/reason/);
 assert.throws(()=>build({location:'Offsite (Home)'}),/work note/);
 assert.equal(build({location:'Offsite (Home)',workNote:'Project work'}).workNote,'Project work');
 assert.throws(()=>buildManualAttendanceEntry(base,{now,roster:[{id:regular,type:'regular',active:false}]}),/active employee/);
});
