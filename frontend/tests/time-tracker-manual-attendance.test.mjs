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
  {allowed:true,activeAllowed:true,historicalAllowed:false,defaultStatus:'active'});
 assert.deepEqual(manualAttendanceDatePolicy('2026-11-23',now),
  {allowed:true,activeAllowed:false,historicalAllowed:true,defaultStatus:'completed'});
 assert.equal(manualAttendanceDatePolicy('2026-11-25',now).allowed,false);
 assert.equal(manualAttendanceDatePolicy('2026-02-30',now).allowed,false);
});

test('today creates only an active session with no clock-out',()=>{
 const result=build();
 assert.equal(result.date,'2026-11-24');
 assert.equal(result.clockInAt,'2026-11-24T00:00:00.000Z');
 assert.equal(result.clockOutAt,null);
 assert.equal(result.clockOutMode,null);
 assert.equal(result.status,'active');
 assert.equal(result.employeeId,regular);
 assert.throws(()=>build({status:'completed',clockOutTime:'11:00'}),/must remain an active session/);
});

test('historical default uses the server-calculated standard nine-credited-hour method',()=>{
 const result=build({date:'2026-11-23',status:'completed'});
 assert.equal(result.clockInAt,'2026-11-23T00:00:00.000Z');
 assert.equal(result.clockOutAt,null);
 assert.equal(result.clockOutMode,'standard');
 assert.equal(result.status,'completed');
});

test('historical correction can override with an actual clock-out time',()=>{
 const result=build({date:'2026-11-23',status:'completed',clockOutMode:'actual',
  clockOutDate:'2026-11-23',clockOutTime:'12:00'});
 assert.equal(result.clockOutAt,'2026-11-23T04:00:00.000Z');
 assert.equal(result.clockOutMode,'actual');
});

test('historical actual clock-out supports overnight shifts already completed',()=>{
 const result=build({date:'2026-11-23',clockInTime:'22:00',status:'completed',
  clockOutMode:'actual',clockOutDate:'2026-11-24',clockOutTime:'06:00'});
 assert.equal(result.clockInAt,'2026-11-23T14:00:00.000Z');
 assert.equal(result.clockOutAt,'2026-11-23T22:00:00.000Z');
});

test('past dates must be completed and future dates are rejected',()=>{
 assert.throws(()=>build({date:'2026-11-23',status:'active'}),/Past attendance must be completed/);
 assert.throws(()=>build({date:'2026-11-25'}),/invalid or in the future/);
});

test('invalid, missing, equal, reversed and future timestamps fail closed',()=>{
 assert.throws(()=>build({clockInTime:'13:00'}),/future/);
 assert.throws(()=>build({clockInTime:'25:00'}),/valid Philippine/);
 assert.throws(()=>build({date:'2026-11-23',status:'completed',clockOutMode:'actual'}),/valid Philippine/);
 assert.throws(()=>build({date:'2026-11-23',status:'completed',clockOutMode:'actual',clockOutTime:'08:00'}),/later/);
 assert.throws(()=>build({date:'2026-11-23',status:'completed',clockOutMode:'actual',clockOutTime:'07:00'}),/later/);
 assert.throws(()=>build({date:'2026-11-23',status:'completed',clockOutMode:'actual',clockOutDate:'2026-11-24',clockOutTime:'17:00'}),/future/);
 assert.throws(()=>build({date:'2026-11-23',status:'completed',clockOutMode:'actual',
  clockOutDate:'2026-11-25',clockOutTime:'12:00'}),/invalid or in the future/);
});

test('only selected active regular employees are accepted; OJT remains separate',()=>{
 assert.throws(()=>build({employeeId:'33333333-3333-4333-8333-333333333333'}),/authorized roster/);
 assert.throws(()=>build({employeeId:ojt,employeeType:'ojt'}),/regular employee/);
 assert.throws(()=>build({employeeType:'ojt'}),/regular employee/);
 assert.throws(()=>build({reason:' '}),/reason/);
 assert.throws(()=>build({location:'Offsite (Home)'}),/work note/);
 assert.equal(build({location:'Offsite (Home)',workNote:'Project work'}).workNote,'Project work');
 assert.throws(()=>buildManualAttendanceEntry(base,{now,roster:[{id:regular,type:'regular',active:false}]}),/active regular employee/);
});

test('historical actual clock-out is limited to the supported 48-hour shift window',()=>{
 assert.throws(()=>build({date:'2026-11-22',clockInTime:'08:00',status:'completed',
  clockOutMode:'actual',clockOutDate:'2026-11-24',clockOutTime:'09:00'}),/within 48 hours/);
});
