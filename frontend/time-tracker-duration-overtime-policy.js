/**
 * Pure duration-OT policy. No database writes or client-side authorization.
 * Integration must run equivalent rules against locked authoritative server rows.
 * Legacy range-based OT and historical manual OT must not enter this policy.
 */
export const TT_REGULAR_WORK_MINUTES=540;
export const TT_OT_MIN_MINUTES=30;
export const TT_OT_MAX_MINUTES=360;
const minuteMs=60_000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId=value=>typeof value==='string'&&uuid.test(value);
const instant=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 const ms=Date.parse(value);
 return Number.isFinite(ms)?ms:null;
};
const workDate=value=>{
 if(instant(value)===null)return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const part=type=>parts.find(p=>p.type===type)?.value;
 return [part('year'),part('month'),part('day')].join('-');
};
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function validDurationOvertimeMinutes(value){
 return Number.isInteger(value)&&value>=TT_OT_MIN_MINUTES&&value<=TT_OT_MAX_MINUTES;
}
/**
 * Normalized input: explicit workspaceId, employeeId, recordId; ISO timestamps.
 * regularCutoffAt is the existing authoritative lunch-adjusted nine-hour cutoff.
 * All attendance records for the owner/work date, including completed rows, are
 * needed for unbound requests; a partial UI snapshot is not sufficient.
 * Requests must explicitly use policy 'duration-v1', source 'employee'.
 */
export function resolveDurationOvertime({workspaceId,employeeId,recordId,clockInAt,
 regularCutoffAt,records=[],requests=[]}={}){
 const start=instant(clockInAt),base=instant(regularCutoffAt);
 if(!isId(workspaceId)||!isId(employeeId)||!isId(recordId)||start===null||
  base===null||base<start+TT_REGULAR_WORK_MINUTES*minuteMs||
  !Array.isArray(records)||!Array.isArray(requests))throw new TypeError('Invalid authoritative attendance context');
 const date=workDate(clockInAt);
 const fallback=reason=>({reason,attendanceRecordId:recordId,workDate:date,requestId:null,
  approvedMinutes:0,targetMinutes:TT_REGULAR_WORK_MINUTES,cutoffAt:new Date(base).toISOString()});
 const scope=r=>r?.workspaceId===workspaceId&&r?.employeeId===employeeId;
 const matches=records.filter(r=>scope(r)&&workDate(r.clockInAt)===date);
 const current=matches.filter(r=>r.recordId===recordId);
 if(current.length!==1||instant(current[0].clockInAt)!==start)return fallback('record-mismatch');
 if(current[0].clockOutAt!==null)return fallback('record-not-active');
 const eligible=requests.filter(r=>scope(r)&&r.workDate===date&&r.status==='Approved'&&
  r.policy==='duration-v1'&&r.source==='employee');
 if(eligible.length===0)return fallback('no-approved-duration-ot');
 if(eligible.length!==1)return fallback('ambiguous-requests');
 const request=eligible[0];
 if(!isId(request.requestId)||!validDate(request.workDate)||
  !validDurationOvertimeMinutes(request.durationMinutes))return fallback('invalid-request');
 if(request.attendanceRecordId!=null&&request.attendanceRecordId!==recordId)
  return fallback('bound-to-other-record');
 if(request.attendanceRecordId==null&&matches.length!==1)return fallback('ambiguous-attendance');
 const approvedAt=instant(request.approvedAt),submittedAt=instant(request.submittedAt);
 if(approvedAt===null||submittedAt===null||submittedAt>approvedAt||approvedAt>=base)
  return fallback('approval-not-before-cutoff');
 return {reason:'approved-duration-ot',attendanceRecordId:recordId,workDate:date,
  requestId:request.requestId,approvedMinutes:request.durationMinutes,
  targetMinutes:TT_REGULAR_WORK_MINUTES+request.durationMinutes,
  cutoffAt:new Date(base+request.durationMinutes*minuteMs).toISOString()};
}
/** Credited minutes must already exclude unpaid breaks. Approval is a cap,
 * not proof of worked hours. Only use an independently verified association.
 */
export function computeDurationOvertimeCredit(creditedMinutes,approvedMinutes){
 if(!Number.isSafeInteger(creditedMinutes)||creditedMinutes<0||
  !(approvedMinutes===0||validDurationOvertimeMinutes(approvedMinutes)))
  throw new TypeError('Invalid credited or approved minutes');
 const regularMinutes=Math.min(creditedMinutes,TT_REGULAR_WORK_MINUTES);
 const actualOvertimeMinutes=Math.max(0,creditedMinutes-TT_REGULAR_WORK_MINUTES);
 const payableOvertimeMinutes=Math.min(approvedMinutes,actualOvertimeMinutes);
 return {regularMinutes,actualOvertimeMinutes,payableOvertimeMinutes,
  excessUnapprovedMinutes:actualOvertimeMinutes-payableOvertimeMinutes,
  totalPayableMinutes:regularMinutes+payableOvertimeMinutes};
}
