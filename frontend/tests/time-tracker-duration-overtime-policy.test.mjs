import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDurationOvertime,computeDurationOvertimeCredit,validDurationOvertimeMinutes}
 from '../time-tracker-duration-overtime-policy.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const employeeId='00000000-0000-4000-8000-000000000002';
const recordId='00000000-0000-4000-8000-000000000003';
const requestId='00000000-0000-4000-8000-000000000004';
const otherId='00000000-0000-4000-8000-000000000005';
const clockInAt='2026-11-26T00:00:00Z';
const regularCutoffAt='2026-11-26T10:00:00Z';
const record={workspaceId,employeeId,recordId,clockInAt,clockOutAt:null};
const request={workspaceId,employeeId,requestId,workDate:'2026-11-26',
 policy:'duration-v1',source:'employee',status:'Approved',durationMinutes:180,
 submittedAt:'2026-11-25T08:00:00Z',approvedAt:'2026-11-26T09:00:00Z'};
const input={workspaceId,employeeId,recordId,clockInAt,regularCutoffAt,records:[record],requests:[request]};
const resolve=overrides=>resolveDurationOvertime({...input,...overrides});
const withRequest=overrides=>resolve({requests:[{...request,...overrides}]});
test('approved three hours extends 9 credited hours to 12, preserving existing lunch-adjusted cutoff',()=>{
 const result=resolve();
 assert.equal(result.reason,'approved-duration-ot');
 assert.equal(result.requestId,requestId);
 assert.equal(result.attendanceRecordId,recordId);
 assert.equal(result.targetMinutes,720);
 assert.equal(result.cutoffAt,'2026-11-26T13:00:00.000Z');
});
test('duration bounds preserve existing 30-minute to six-hour contract',()=>{
 for(const n of [30,45,90,180,360])assert.equal(validDurationOvertimeMinutes(n),true);
 for(const n of [0,29,361,1.5,'180',NaN])assert.equal(validDurationOvertimeMinutes(n),false);
 assert.equal(withRequest({durationMinutes:90}).targetMinutes,630);
});
test('pending, rejected, withdrawn, missing, legacy and historical manual OT retain regular threshold',()=>{
 for(const status of ['Submitted','Rejected','Withdrawn']){
  assert.equal(withRequest({status}).approvedMinutes,0);
 }
 for(const change of [{policy:'legacy-range'},{source:'manual_admin'},{durationMinutes:361}]){
  assert.equal(withRequest(change).approvedMinutes,0);
 }
 assert.equal(resolve({requests:[]}).cutoffAt,'2026-11-26T10:00:00.000Z');
});
test('employee, workspace and PHT clock-in date must match exactly',()=>{
 for(const change of [{employeeId:otherId},{workspaceId:otherId},{workDate:'2026-11-27'}]){
  assert.equal(withRequest(change).approvedMinutes,0);
 }
});
test('overnight attendance matches original PHT clock-in date, not cutoff date',()=>{
 const start='2026-11-26T14:00:00Z';
 const cutoff='2026-11-27T00:00:00Z';
 const result=resolve({clockInAt:start,regularCutoffAt:cutoff,
  records:[{...record,clockInAt:start}]});
 assert.equal(result.workDate,'2026-11-26');
 assert.equal(result.cutoffAt,'2026-11-27T03:00:00.000Z');
});
test('PHT date rollover differs from UTC date',()=>{
 const start='2026-11-25T18:00:00Z';
 const cutoff='2026-11-26T04:00:00Z';
 const result=resolve({clockInAt:start,regularCutoffAt:cutoff,
  records:[{...record,clockInAt:start}],
  requests:[{...request,approvedAt:'2026-11-25T17:00:00Z'}]});
 assert.equal(result.workDate,'2026-11-26');
 assert.equal(result.approvedMinutes,180);
});
test('approval at or after cutoff, invalid chronology or missing approval do not extend',()=>{
 for(const approvedAt of [regularCutoffAt,'2026-11-26T10:00:01Z',null,'2026-11-25T07:00:00Z']){
  assert.equal(withRequest({approvedAt}).approvedMinutes,0);
 }
});
test('approval before clock-in remains eligible',()=>{
 assert.equal(withRequest({approvedAt:'2026-11-25T09:00:00Z'}).approvedMinutes,180);
});
test('unbound requests fail closed on ambiguous records, including completed records',()=>{
 assert.equal(resolve({records:[record,{...record,recordId:otherId,
  clockOutAt:'2026-11-26T02:00:00Z'}]}).reason,'ambiguous-attendance');
 assert.equal(resolve({records:[record,record]}).reason,'record-mismatch');
 assert.equal(resolve({records:[]}).reason,'record-mismatch');
});
test('approved requests cannot be stacked or reused on another record',()=>{
 assert.equal(resolve({requests:[request,{...request,requestId:otherId}]}).reason,'ambiguous-requests');
 assert.equal(withRequest({attendanceRecordId:otherId}).reason,'bound-to-other-record');
 assert.equal(withRequest({attendanceRecordId:recordId}).approvedMinutes,180);
});
test('completed records never reopen',()=>{
 assert.equal(resolve({records:[{...record,clockOutAt:regularCutoffAt}]}).reason,'record-not-active');
});
test('early clock-out pays only actual eligible overtime, capped by approval',()=>{
 for(const [actual,paid] of [[480,0],[540,0],[600,60],[690,150],[720,180],[750,180]]){
  const r=computeDurationOvertimeCredit(actual,180);
  assert.equal(r.regularMinutes,Math.min(actual,540));
  assert.equal(r.payableOvertimeMinutes,paid);
  assert.equal(r.totalPayableMinutes,Math.min(actual,540)+paid);
 }
 assert.equal(computeDurationOvertimeCredit(720,0).excessUnapprovedMinutes,180);
 assert.throws(()=>computeDurationOvertimeCredit(-1,180),TypeError);
});
