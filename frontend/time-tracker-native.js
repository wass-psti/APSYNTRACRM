import {isTimeTrackerHomeNoteRequired} from './time-tracker-offsite-note.js';
import {TT_LOCATIONS,creditedAttendanceMs,creditedAttendanceRecordMs,completedLogWorkDurationMs,manilaClockMinutes,TT_PHT_OFFSET_MS} from './time-tracker-policy.js';
export {TT_LOCATIONS,creditedAttendanceMs} from './time-tracker-policy.js';
import {projectTimeTrackerOverview,TT_TEAM_OVERVIEW_ROLES} from './time-tracker-overview.js';
import {projectTimeTrackerLog} from './time-tracker-history.js';
import {projectTimeTrackerOtRows,validateOvertimeDraft,validateDurationOvertimeDraft,validateManualOvertimeDraft,validateManualDurationOvertimeDraft,canReviewTimeTrackerOt,TT_OT_REVIEW_ROLES,TT_OT_WRITES_ACCEPTED} from './time-tracker-overtime.js';
import {projectTimeTrackerTeamDirectory,projectTimeTrackerTeamDepartments,TT_TEAM_DEPARTMENTS,validTimeTrackerDepartmentName} from './time-tracker-team.js';
import {projectTimeTrackerEmployees,projectTimeTrackerEmployeeDepartments,projectTimeTrackerDepartmentCatalog,canViewTimeTrackerEmployees} from './time-tracker-application.js';
import {validateTimeTrackerGps} from './time-tracker-gps.js';
import {beginTimeTrackerGpsCapture,observeTimeTrackerGpsPermission,
 observeTimeTrackerGpsLifecycle,gpsPositionFailureReason,recordTimeTrackerGpsDiagnostic}
 from './time-tracker-gps-diagnostics.js';
import {projectOjtRoster,projectOjtAdmin,projectOjtAdminAttendance,TIMETRACKER_SHARED_OJT_USER_ID} from './apps/TimeTracker/time-tracker-ojt.js';
/**
 * TimeTracker native APSYNTRA adapter. Source reference: TimeTracker v2.0.14.
 * No standalone app, storage shim, local JWT, synthetic rows, or privileged key.
 * All attendance mutations use the existing atomic signed PostgreSQL RPC.
 */
const moduleId='time-tracker';
// The client supports the signed v2 protocol, but the server capability must also pass.
// A missing, expired, revoked or mismatched capability keeps all writes disabled.
export const TT_LIVE_ATTENDANCE_WRITES_ACCEPTED=true;
const stateKey='timetracker.attendance.v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TT_DEPARTMENTS=TT_TEAM_DEPARTMENTS;
export const TT_ROLES=Object.freeze([
 'System Admin','IT Administrator','HR','Supervisor','Finance','OJT','Employee'
]);
export const TT_POLICY=Object.freeze({
 version:'1.0',standardClockInMinutes:480,unpaidBreakStartMinutes:720,
 unpaidBreakEndMinutes:780,requiredWorkMs:9*60*60*1000
});
const deny=(message)=>{throw new Error(message);};
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function attendanceClassification(record){
 if(record?.clockOut?.status==='administratively_closed'||record?.reconciliation?.type==='legacy_duplicate_session')
  return 'Administrative closure';
 if(!safeTime(record?.clockIn?.timestamp))return 'Unknown';
 return manilaClockMinutes(record.clockIn.timestamp)>TT_POLICY.standardClockInMinutes?'Late':'On time';
}
export function projectOwnAttendance(value,userId){
 if(!uuid.test(userId||''))deny('A verified user is required');
 let state;
 try{state=typeof value==='string'?JSON.parse(value):value;}
 catch{deny('Attendance state is malformed');}
 if(!isRecord(state)||state.version!==1||!Array.isArray(state.records))
  deny('Attendance state contract invalid');
 if(state.records.length>25000)deny('Attendance state exceeds permitted read budget');
 const actor='cloud:'+userId;
 const rows=state.records.filter(x=>isRecord(x)&&x.ownerId===actor&&
   typeof x.id==='string'&&x.id.length<=150&&isRecord(x.clockIn)&&safeTime(x.clockIn.timestamp))
 .map(x=>{
  const out=isRecord(x.clockOut)&&safeTime(x.clockOut.timestamp)?x.clockOut:null;
  const label=x.clockOut&&!out?'Unknown':out?'Completed':'Active';
  return Object.freeze({
   id:x.id,ownerId:x.ownerId,clockIn:x.clockIn.timestamp,clockOut:out?.timestamp||null,
   location:String(x.clockIn.location||'—').slice(0,100),
   department:String(x.clockIn.department||'—').slice(0,100),
   workNote:typeof x.clockIn.workNote==='string'?x.clockIn.workNote.slice(0,500):'',
   status:label,classification:attendanceClassification(x),
   creditedMs:out?creditedAttendanceRecordMs(x,x.clockIn.timestamp,out.timestamp):null,
   workDurationMs:out?completedLogWorkDurationMs(x.clockIn.timestamp,out.timestamp,x.creditedMsOverride):null,
   automatic:out?.automatic===true
  });
 });
 rows.sort((a,b)=>Date.parse(b.clockIn)-Date.parse(a.clockIn));
 if(rows.filter(x=>x.status==='Active').length>1)
  deny('Conflicting active attendance records require reconciliation');
 return rows;
}
export function projectOwnOvertime(value,userId){
 if(!uuid.test(userId||''))deny('A verified user is required');
 let state;
 try{state=typeof value==='string'?JSON.parse(value):value;}
 catch{deny('Overtime state is malformed');}
 if(!isRecord(state)||state.version!==1||!Array.isArray(state.requests))
  deny('Overtime state contract invalid');
 if(state.requests.length>25000)deny('Overtime state exceeds permitted read budget');
 return state.requests.filter(x=>isRecord(x)&&x.ownerId==='cloud:'+userId&&
  typeof x.id==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')&&
  ['Draft','Submitted','Approved','Rejected'].includes(x.status))
 .map(x=>Object.freeze({
   id:x.id.slice(0,140),ownerId:x.ownerId,date:x.date,status:x.status,
   decidedAt:safeTime(x.decidedAt)?x.decidedAt:null,
   start:typeof x.start==='string'?x.start.slice(0,5):'—',
   end:typeof x.end==='string'?x.end.slice(0,5):'—',
   durationMinutes:Number.isInteger(x.durationMinutes)&&x.durationMinutes>=0&&
    x.durationMinutes<=960?x.durationMinutes:null,
   task:String(x.task||'').slice(0,160)
 }))
 .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,200);
}
export function filterMyAttendancePeriod(records,period='all',at=new Date()){
 if(!['all','today','week','month'].includes(period))deny('Unsupported report period');
 const now=new Date(at);
 if(!Number.isFinite(now.getTime()))deny('Invalid report date');
 let startMs=null;
 if(period!=='all'){
  const local=new Date(now.getTime()+TT_PHT_OFFSET_MS);
  const dayMs=24*60*60*1000;
  startMs=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-TT_PHT_OFFSET_MS;
  if(period==='week')startMs-=((local.getUTCDay()+6)%7)*dayMs;
  if(period==='month')startMs=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-TT_PHT_OFFSET_MS;
 }
 return (records||[]).filter(x=>safeTime(x.clockIn)&&
  (startMs===null||(Date.parse(x.clockIn)>=startMs&&
   Date.parse(x.clockIn)<=now.getTime())));
}
function verifiedContext(auth,context,boardId){
 if(!auth||!uuid.test(auth.userId||'')||!isRecord(context)||
  context.user_id!==auth.userId||!uuid.test(context.workspace_id||'')||
  context.profile?.status!=='active'||!uuid.test(boardId||''))
  deny('Active signed APSYNTRA session and dedicated board required');
}
async function checkIdentity(auth,api,expected,boardId){
 const u=await auth.getVerifiedUser();
 const context=await api.context();
 verifiedContext(auth,context,boardId);
 if(u?.id!==expected.userId||context.user_id!==expected.userId||
    context.workspace_id!==expected.workspaceId)
  deny('Signed identity or workspace changed; operation rejected');
 return context;
}
function isMissingClockSnapshot(error){
 return /PGRST202|Could not find the function|Unexpected RPC timetracker_clock_snapshot|function public\.timetracker_clock_snapshot.*does not exist/i
  .test(String(error?.message||error));
}
function normalizeClockSnapshot(response,access,boardId){
 if(!isRecord(response)||response.contract!=='tt-clock-snapshot-1'||
    response.actorId!==access.userId||response.workspaceId!==access.workspaceId||
    response.boardId!==boardId||response.stateKey!==stateKey||
    response.scope!=='shared'||typeof response.rowFound!=='boolean'||
    !Number.isSafeInteger(Number(response.revision))||Number(response.revision)<0||
    typeof response.value!=='string')
  deny('Signed TimeTracker Clock snapshot identity or schema mismatch');
 const revision=Number(response.revision);
 if(response.rowFound){
  if(revision<1||!safeTime(response.updatedAt))
   deny('Invalid authoritative Clock attendance revision');
  return {state_key:stateKey,scope:'shared',revision,value:response.value};
 }
 if(revision!==0||response.updatedAt!==null)
  deny('Empty TimeTracker Clock snapshot has an invalid revision');
 let empty;
 try{empty=JSON.parse(response.value);}
 catch{deny('TimeTracker Clock snapshot value is malformed');}
 if(empty?.version!==1||!Array.isArray(empty.records)||empty.records.length!==0)
  deny('Empty TimeTracker Clock snapshot contract invalid');
 return null;
}
export class TimeTrackerNativeClient{
 constructor({auth,api}){this.auth=auth;this.api=api;}
 async access(boardId,{nativeContext=null,includeDirectory=true}={}){
  const {auth,api}=this;
  // The canonical native resolver already verifies active workspace membership,
  // TimeTracker module access, the module role and the exact canonical board.
  // Reuse its route result when available instead of repeating those signed reads.
  const [who,native]=await Promise.all([
   auth.getVerifiedUser(),
   nativeContext?Promise.resolve(nativeContext):api.nativeApplicationBoardContext(moduleId)
  ]);
  if(native?.userId!==who?.id||!uuid.test(who?.id||'')||
     !uuid.test(native?.workspaceId||'')||native?.board?.id!==boardId||
     (native.board?.workspace_id&&native.board.workspace_id!==native.workspaceId)||
     native.board?.name!=='TimeTracker Attendance')
   deny('TimeTracker native application identity or workspace mismatch');
  let users=null,self=null;
  if(includeDirectory){
   users=await api.rpc('list_module_directory',{p_module_id:moduleId});
   if(!Array.isArray(users))deny('TimeTracker central directory unavailable');
   self=users.find(x=>x?.id===who.id&&x.status==='active');
   if(!self||!TT_ROLES.includes(self.module_role))
    deny('Central TimeTracker role assignment unavailable');
  }
  // The canonical native context already contains the signed module role.
  // Clock does not need the employee directory to establish that role.
  const moduleRole=includeDirectory?self.module_role:native.role;
  if(!TT_ROLES.includes(moduleRole))
   deny('Central TimeTracker role assignment unavailable');
  const ctx=await checkIdentity(auth,api,{
   userId:who.id,workspaceId:native.workspaceId
  },boardId);
  const overviewDirectory=includeDirectory?users.filter(u=>u&&u.status==='active'&&
    typeof u.id==='string'&&(u.id===who.id||TT_TEAM_OVERVIEW_ROLES.includes(moduleRole)))
    .map(u=>Object.freeze({id:u.id,status:'active',
      display_name:String(u.display_name||'Workforce member').slice(0,100)})):[];
  // The employee directory is loaded only for views that render it or use it
  // for team/overview projections. Clock needs only the signed module role.
  let employees=null;
  if(includeDirectory&&canViewTimeTrackerEmployees({moduleRole}))try{
   employees=projectTimeTrackerEmployees(users,{
    userId:who.id,workspaceId:ctx.workspace_id,boardId,validRoles:TT_ROLES
   });
  }catch{/* Fail closed for the optional read-only Employees view. */}
  return Object.freeze({userId:who.id,workspaceId:ctx.workspace_id,boardId,
    platformRole:ctx.profile?.platform_role||'Unassigned',
    moduleRole,name:String(self?.display_name||'Signed user').slice(0,100),
    email:typeof who.email==='string'?who.email.trim().toLowerCase():'',
    overviewDirectory:Object.freeze(overviewDirectory),employees});

 }
 /** Only a current signed, board-scoped server v2 capability can unlock Clock. */
 async attendanceCapability(boardId,access){
  if(!TT_LIVE_ATTENDANCE_WRITES_ACCEPTED)return false;
  try{
   const cap=await this.api.rpc('timetracker_attendance_capabilities',{p_board_id:boardId});
   return isRecord(cap)&&cap.mode==='ACTIVE'&&cap.contract==='tt-attendance-1'&&
    cap.canClock===true&&cap.actorId===access.userId&&
    cap.workspaceId===access.workspaceId&&cap.boardId===boardId;
  }catch{
   // Old or unaccepted backend, revoked role/session, and network failures are read-only.
   return false;
  }
 }
 async snapshot(boardId,{clockOnly=false,nativeContext=null}={}){
  const access=await this.access(boardId,{nativeContext,includeDirectory:!clockOnly});
  const canManageOjt=['System Admin','IT Administrator'].includes(access.moduleRole);
  // Issue independent, read-only RPCs together AFTER signed access verification.
  // Backend scope checks remain authoritative; identity is checked again below.
  const otRead=clockOnly?Promise.resolve(null):
   this.api.rpc('timetracker_ot_snapshot',{p_board_id:boardId})
    .then(response=>({response}),error=>({error}));
  const autoClockoutRead=this.api.rpc('timetracker_auto_clockout_snapshot',{p_board_id:boardId})
   .then(response=>({response}),error=>({error}));
  const clockRead=this.attendanceCapability(boardId,access);
  // Department is a signed, workspace-scoped employee record, not a browser field.
  // A missing deployment leaves Clock In unavailable rather than guessing.
  const catalogRead=!clockOnly&&canManageOjt?
   this.api.rpc('timetracker_department_catalog_snapshot',{p_board_id:boardId})
    .then(response=>({response}),error=>({error})):Promise.resolve(null);
  const employeeDepartmentsRead=!clockOnly&&canManageOjt?
   this.api.rpc('timetracker_employee_department_directory_snapshot',{p_board_id:boardId})
    .then(response=>({response}),error=>({error})):Promise.resolve(null);
  const departmentRead=this.api.rpc('timetracker_employee_department_for_clock',{
   p_board_id:boardId
  }).then(response=>({response}),error=>({error}));
  let raw=null,row=null;
  if(clockOnly){
   try{
    const response=await this.api.rpc('timetracker_clock_snapshot',{p_board_id:boardId});
    row=normalizeClockSnapshot(response,access,boardId);
   }catch(error){
    // Keep the current Clock functional during a staged backend rollout. Only
    // a genuinely missing RPC falls back; permission, scope and data errors do not.
    if(!isMissingClockSnapshot(error))throw error;
    raw=await this.api.rpc('list_module_state',{p_module_id:moduleId});
    if(!Array.isArray(raw))deny('TimeTracker state API contract invalid');
    row=raw.find(x=>x?.state_key===stateKey&&x.scope==='shared');
   }
  }else{
   raw=await this.api.rpc('list_module_state',{p_module_id:moduleId});
   if(!Array.isArray(raw))deny('TimeTracker state API contract invalid');
   row=raw.find(x=>x?.state_key===stateKey&&x.scope==='shared');
  }
  if(row&&(!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1||
    typeof row.value!=='string'))deny('Invalid authoritative attendance revision');
  const records=projectOwnAttendance(row?row.value:{version:1,records:[]},access.userId);
  const overview=clockOnly?null:projectTimeTrackerOverview({
   value:row?row.value:{version:1,records:[]},
   directory:access.overviewDirectory,userId:access.userId,
   moduleRole:access.moduleRole
  });
  const log=clockOnly?null:projectTimeTrackerLog({
   value:row?row.value:{version:1,records:[]},
   directory:access.overviewDirectory,userId:access.userId,
   moduleRole:access.moduleRole
  });
  const otRow=clockOnly?null:raw.find(x=>x?.state_key==='timetracker.ot.v1'&&x.scope==='shared');
  let otRequests=clockOnly?[]:projectOwnOvertime(otRow?.value||{version:1,requests:[]},access.userId)
   .map(row=>Object.freeze({...row,ownerId:'cloud:'+access.userId,name:access.name}));
  let otAccess=Object.freeze({scope:'OWN_OT_ONLY',
   bootstrapApprover:false,manualOtManager:false,otContractActive:false,durationOtContractActive:false,durationOtHrApprover:false,otReviewContractActive:false,otApprover:false,manualDurationOtContractActive:false});
  // The signed snapshot is the source of OT scope and manual-management capability.
  try{
   if(!clockOnly){
   const {response,error}=await otRead;
   if(error)throw error;
   if(!isRecord(response)||response.mode!=='ACTIVE'||
      response.actorId!==access.userId||response.workspaceId!==access.workspaceId||
      !['OWN_OT_ONLY','AUTHORIZED_WORKSPACE_TEAM'].includes(response.scope)||
      typeof response.bootstrapApprover!=='boolean'||
      (response.manualOtManager!==undefined&&typeof response.manualOtManager!=='boolean')||
      !Array.isArray(response.rows))
    deny('Signed OT snapshot identity, scope or schema mismatch');
   const durationOtContractActive=response.durationOtContract==='tt-duration-ot-1';
   const durationOtHrApprover=durationOtContractActive&&response.durationOtHrApprover===true;
   const otReviewContractActive=durationOtContractActive&&response.otReviewContract==='tt-ot-review-2';
   const otApprover=otReviewContractActive&&response.otApprover===true;
   const manualDurationOtContractActive=otReviewContractActive&&response.manualDurationOtContract==='tt-manual-duration-ot-1';
   if(otReviewContractActive&&(typeof response.otApprover!=='boolean'||(otApprover&&!TT_OT_REVIEW_ROLES.includes(access.moduleRole))||
      (response.scope==='AUTHORIZED_WORKSPACE_TEAM')!==otApprover))
    deny('Signed OT review role or scope mismatch');
   if(durationOtHrApprover&&access.moduleRole!=='HR')
    deny('Duration OT review role does not match the signed module role');
   if(response.scope==='AUTHORIZED_WORKSPACE_TEAM'&&response.bootstrapApprover!==true&&!durationOtHrApprover&&!otApprover)
    deny('Team OT access is not bootstrap-authorized or HR-authorized');
   const manualOtManager=response.manualOtManager===true;
   if(manualOtManager&&access.moduleRole!=='System Admin')
    deny('Manual OT management role does not match the signed module role');
   const allowed=new Set(access.overviewDirectory.map(u=>'cloud:'+u.id));
   const projected=projectTimeTrackerOtRows(response.rows).filter(row=>
    row.isManual||(response.scope==='AUTHORIZED_WORKSPACE_TEAM'&&
      (otApprover||response.bootstrapApprover===true||(durationOtHrApprover&&row.otPolicy==='duration-v1'&&allowed.has(row.ownerId))))||(allowed.has(row.ownerId)&&
      row.ownerId==='cloud:'+access.userId));
   otRequests=projected;
   otAccess=Object.freeze({scope:response.scope,
    bootstrapApprover:response.bootstrapApprover,
    manualOtManager,otContractActive:true,durationOtContractActive,durationOtHrApprover,otReviewContractActive,otApprover,manualDurationOtContractActive});
   }
  }catch(error){
   // Only missing RPC is an expected predeployment state. All other errors
   // reject instead of silently substituting potentially stale authority.
   const msg=String(error?.message||error);
   if(!/PGRST202|Could not find the function|Unexpected RPC timetracker_ot_snapshot/.test(msg))
    throw error;
  }
  let autoClockout=null;
  let autoClockoutUnavailable=false;
  try{
   const {response,error}=await autoClockoutRead;
   if(error)autoClockoutUnavailable=true;
   else if(!isRecord(response)||response.mode!=='ACTIVE'||
      response.contract!=='tt-auto-clockout-1'||
      response.actorId!==access.userId||response.workspaceId!==access.workspaceId||
      response.boardId!==boardId)autoClockoutUnavailable=true;
   else if(response.session!==null){
    const session=response.session;
    const active=records.find(x=>x.status==='Active');
    if(!isRecord(session)||!active||session.recordId!==active.id||
       !['MONITORING','GRACE','OVERTIME','PENDING_GPS','ERROR'].includes(session.status)||
       (session.clockInAt!=null&&
        (!safeTime(session.clockInAt)||Date.parse(session.clockInAt)!==Date.parse(active.clockIn)))||
       !safeTime(session.thresholdAt)||
       (session.graceDeadlineAt!=null&&!safeTime(session.graceDeadlineAt))||
       (session.overtimeCutoffAt!=null&&!safeTime(session.overtimeCutoffAt))||
       (session.scheduledClockOutAt!=null&&!safeTime(session.scheduledClockOutAt))||
       (session.pendingAt!=null&&!safeTime(session.pendingAt))||
       (session.nextAt!=null&&!safeTime(session.nextAt))||
       (session.status==='PENDING_GPS'&&
        (!safeTime(session.scheduledClockOutAt)||!safeTime(session.pendingAt)||
         !['nine_hour_threshold_grace_expired','approved_overtime_ended'].includes(session.clockOutReason))))
     autoClockoutUnavailable=true;
    else autoClockout=Object.freeze({
     recordId:session.recordId,status:session.status,
     thresholdAt:session.thresholdAt,
     graceStartedAt:safeTime(session.graceStartedAt)?session.graceStartedAt:null,
     graceDeadlineAt:safeTime(session.graceDeadlineAt)?session.graceDeadlineAt:null,
     overtimeCutoffAt:safeTime(session.overtimeCutoffAt)?session.overtimeCutoffAt:null,
     scheduledClockOutAt:safeTime(session.scheduledClockOutAt)?session.scheduledClockOutAt:null,
     pendingAt:safeTime(session.pendingAt)?session.pendingAt:null,
     nextAt:safeTime(session.nextAt)?session.nextAt:null,
     lastEvaluatedAt:safeTime(session.lastEvaluatedAt)?session.lastEvaluatedAt:null,
     clockOutReason:typeof session.clockOutReason==='string'?session.clockOutReason:null
    });
   }
  }catch{
   autoClockoutUnavailable=true;
  }
  const attendanceWritesAccepted=await clockRead;
  const departmentReply=await departmentRead;
  let employeeDepartment=null;
  if(!departmentReply.error){
   const response=departmentReply.response;
   if(!isRecord(response)||response.contract!=='tt-department-1'||
      response.actorId!==access.userId||response.workspaceId!==access.workspaceId||
      response.boardId!==boardId||
      (response.department!==null&&!validTimeTrackerDepartmentName(response.department)))
    deny('Signed employee department contract invalid');
   employeeDepartment=response.department;
  }else if(!/PGRST202|Could not find the function|Unexpected RPC timetracker_employee_department_for_clock/
    .test(String(departmentReply.error?.message||departmentReply.error))){
   // No stale/fabricated department after a failed authenticated read.
   deny('Signed employee department lookup unavailable');
  }
  let departmentCatalog=null;
  const catalogReply=await catalogRead;
  if(catalogReply&&!catalogReply.error){
   try{departmentCatalog=projectTimeTrackerDepartmentCatalog(catalogReply.response,access);}
   catch{/* Invalid optional catalog cannot affect Clock, but disables editing. */}
  }
  let employees=access.employees;
  const employeeDepartments=await employeeDepartmentsRead;
  if(employees&&employeeDepartments&&!employeeDepartments.error){
   try{employees=projectTimeTrackerEmployeeDepartments(employees,employeeDepartments.response);}
   catch{/* Optional directory corruption cannot block an employee's Clock. */}
  }
  // Optional OJT feature detection uses the already-verified native session.
  // Ordinary TimeTracker snapshots must remain compatible with older backends.
  const designatedSharedOjt=access.userId===TIMETRACKER_SHARED_OJT_USER_ID;
  let ojtRoster=null,ojtAdmin=null,ojtAdminAttendance=null;
  if(designatedSharedOjt){
   try{
    const signedRoster=projectOjtRoster(
     await this.api.rpc('timetracker_ojt_roster',{p_board_id:boardId}),access);
    // An unconfigured shared account cannot use ordinary Employee Clock.
    ojtRoster=signedRoster.mode==='PERSONAL'?
     {mode:'SETUP_REQUIRED',interns:[]} : signedRoster;
   }catch(error){
    if(!/PGRST202|Could not find the function|Unexpected RPC timetracker_ojt_roster/.test(String(error?.message||error)))throw error;
    // Clear front-end-only error state, not an invented signed server roster.
    ojtRoster={mode:'SERVICE_UNAVAILABLE',interns:[]};
   }
  }
  if(!clockOnly&&canManageOjt){
   try{
    ojtAdmin=projectOjtAdmin(
     await this.api.rpc('timetracker_ojt_admin_snapshot',{p_board_id:boardId}),access);
    ojtAdminAttendance=projectOjtAdminAttendance(
     await this.api.rpc('timetracker_ojt_admin_attendance',{p_board_id:boardId}),access);
   }catch(error){
    if(!/PGRST202|Could not find the function|Unexpected RPC timetracker_ojt_/.test(String(error?.message||error)))throw error;
   }
  }
  await checkIdentity(this.auth,this.api,access,boardId);
  return {status:'VERIFIED_READ',clockOnly:clockOnly===true,
   access:{...access,...otAccess,
    attendanceWritesAccepted:designatedSharedOjt?false:attendanceWritesAccepted,
    employeeDepartment,employees,departmentCatalog},
   ojtRoster,ojtAdmin,ojtAdminAttendance,
   records,otRequests,autoClockout,autoClockoutUnavailable,overview,log,
   revision:row?Number(row.revision):0,active:records.find(x=>x.status==='Active')||null};
 }
 /** Signed directory-only refresh; never reads or writes attendance state. */
 async employeeDirectory(boardId){
  const access=await this.access(boardId);
  if(!canViewTimeTrackerEmployees(access)||!access.employees)
   deny('TimeTracker administrator directory required');
  const [department,catalog]=await Promise.all([
   this.api.rpc('timetracker_employee_department_directory_snapshot',{p_board_id:boardId}),
   this.api.rpc('timetracker_department_catalog_snapshot',{p_board_id:boardId})
  ]);
  const employees=projectTimeTrackerEmployeeDepartments(access.employees,department);
  const departmentCatalog=projectTimeTrackerDepartmentCatalog(catalog,access);
  await checkIdentity(this.auth,this.api,access,boardId);
  return Object.freeze({userId:access.userId,workspaceId:access.workspaceId,boardId,
   moduleRole:access.moduleRole,employees,departmentCatalog,overviewDirectory:access.overviewDirectory});
 }
 /** A fresh independently guarded bootstrap read; no Team information for normal users. */
 async teamDirectory(boardId){
  const access=await this.access(boardId);
  const bootstrap=await this.api.rpc('apsyntra_role_is_bootstrap');
  if(bootstrap!==true)deny('Bootstrap Team Directory authorization required');
  const response=await this.api.rpc('timetracker_team_directory_snapshot',{
   p_workspace_id:access.workspaceId
  });
  const directory=projectTimeTrackerTeamDirectory(response,{
   workspaceId:access.workspaceId,actorId:access.userId
  });
  let departmentSnapshot=null;
  try{
   departmentSnapshot=await this.api.rpc('timetracker_employee_department_directory_snapshot',{
    p_board_id:boardId
   });
  }catch(err){
   if(!/PGRST202|Could not find the function|Unexpected RPC timetracker_employee_department_directory_snapshot/
     .test(String(err?.message||err)))throw err;
   // Missing migration: Team remains readable but assignment editing is disabled.
  }
  const result=projectTimeTrackerTeamDepartments(directory,departmentSnapshot,{boardId});
  await checkIdentity(this.auth,this.api,access,boardId);
  if(await this.api.rpc('apsyntra_role_is_bootstrap')!==true)
   deny('Bootstrap authorization changed during Team Directory read');
  return result;
 }
 /** One admin-controlled department change; no optimistic update. */
 async assignTeamDepartment(boardId,userId,department){
  if(!uuid.test(userId||'')||!validTimeTrackerDepartmentName(department))
   deny('Valid employee and department required');
  const before=await this.teamDirectory(boardId);
  if(!before.departmentsReady)deny('Department management is not deployed');
  const member=before.members.find(m=>m.id===userId);
  if(!member||member.status!=='Active'||member.role==='Unassigned')
   deny('Only active TimeTracker members can be assigned');
  const receipt=await this.api.rpc('timetracker_employee_department_set',{
   p_board_id:boardId,p_target_user_id:userId,p_department:department
  });
  if(!isRecord(receipt)||receipt.contract!=='tt-department-set-1'||
     receipt.actorId!==before.actorId||receipt.workspaceId!==before.workspaceId||
     receipt.targetUserId!==userId||receipt.department!==department)
   deny('Signed department update receipt invalid');
  const after=await this.teamDirectory(boardId);
  if(after.members.find(m=>m.id===userId)?.department!==department)
   deny('Department update could not be verified after saving');
  return after;
 }
 /** Administrator-only department mutation with a fresh signed read-back. */
 /** Minimize post-save latency: reuse the signed actor/roster already on screen.
  * The write RPC independently authorizes the actor; two readbacks verify the outcome.
  */
 async assignEmployeeDepartment(boardId,userId,department,{verifiedAccess=null}={}){
  const access=verifiedAccess||await this.access(boardId);
  if(access?.boardId!==boardId||!uuid.test(access?.userId||'')||
     !uuid.test(access?.workspaceId||'')||
     !['System Admin','IT Administrator'].includes(access.moduleRole))
   deny('TimeTracker administrator authorization required');
  if(!uuid.test(userId||'')||!validTimeTrackerDepartmentName(department)||
     !access.employees?.members?.some(member=>member.id===userId))
   deny('Active employee and valid department required');
  // The signed catalog from the current page is used for presentation only.
  // The backend validates current membership again in the same write transaction.
  await checkIdentity(this.auth,this.api,access,boardId);
  const receipt=await this.api.rpc('timetracker_employee_department_set',{
   p_board_id:boardId,p_target_user_id:userId,p_department:department
  },{retryUnauthorized:false});
  if(!isRecord(receipt)||receipt.contract!=='tt-department-set-1'||
     receipt.actorId!==access.userId||receipt.workspaceId!==access.workspaceId||
     receipt.targetUserId!==userId||receipt.department!==department)
   deny('Department write receipt is unverified; refresh before retrying');
  // Concurrent signed readbacks replace the previous full TimeTracker reload.
  const [snapshot,catalogSnapshot]=await Promise.all([
   this.api.rpc('timetracker_employee_department_directory_snapshot',{p_board_id:boardId}),
   this.api.rpc('timetracker_department_catalog_snapshot',{p_board_id:boardId})
  ]);
  const employees=projectTimeTrackerEmployeeDepartments(access.employees,snapshot);
  const catalog=projectTimeTrackerDepartmentCatalog(catalogSnapshot,access);
  if(employees.members.find(m=>m.id===userId)?.department!==department||
     !catalog.departments.some(row=>row.name===department))
   deny('Department update could not be verified; refresh before retrying');
  await checkIdentity(this.auth,this.api,access,boardId);
  return Object.freeze({...employees,departmentCatalog:catalog});
 }
 /** Signed and audited catalog mutations. Never optimistically change roster state. */
 async mutateDepartmentCatalog(boardId,{action,departmentId=null,name=null,expectedRevision,expectedCount=null}={}){
  const access=await this.access(boardId);
  if(!['System Admin','IT Administrator'].includes(access.moduleRole))
   deny('TimeTracker administrator department management required');
  if(!['add','rename','delete'].includes(action)||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
     (action==='add'&&departmentId!==null)||
     (action!=='add'&&!uuid.test(departmentId||''))||
     (action!=='delete'&&!validTimeTrackerDepartmentName(name))||
     (action==='delete'&&(!Number.isSafeInteger(expectedCount)||expectedCount<0)))
   deny('Invalid department management request');
  await checkIdentity(this.auth,this.api,access,boardId);
  const before=projectTimeTrackerDepartmentCatalog(
   await this.api.rpc('timetracker_department_catalog_snapshot',{p_board_id:boardId}),access);
  if(before.revision!==expectedRevision)
   deny('Department list changed; refresh Employees');
  const current=action==='add'?null:before.departments.find(d=>d.id===departmentId);
  if(action!=='add'&&!current)deny('Department no longer exists');
  if(action==='delete'&&current.assignedCount!==expectedCount)
   deny('Assigned employee count changed; refresh and reconfirm deletion');
  if(action==='add'&&before.departments.some(d=>d.name.toLocaleLowerCase()===name.toLocaleLowerCase()))
   deny('Department already exists');
  const result=await this.api.rpc('timetracker_department_catalog_mutate',{
   p_board_id:boardId,p_action:action,p_department_id:departmentId,
   p_name:action==='delete'?null:name,p_expected_revision:expectedRevision,
   p_expected_count:action==='delete'?expectedCount:null
  },{retryUnauthorized:false});
  if(!isRecord(result)||result.contract!=='tt-department-catalog-mutate-1'||
     result.actorId!==access.userId||result.workspaceId!==access.workspaceId||
     result.boardId!==boardId||result.action!==action||!uuid.test(result.departmentId||'')||
     Number(result.revision)!==expectedRevision+1||
     !Number.isSafeInteger(Number(result.affectedEmployees))||
     (action!=='add'&&result.departmentId!==departmentId)||
     (action==='delete'&&Number(result.affectedEmployees)!==expectedCount))
   deny('Department write receipt unverified; refresh before retrying');
  await checkIdentity(this.auth,this.api,access,boardId);
  const after=projectTimeTrackerDepartmentCatalog(
   await this.api.rpc('timetracker_department_catalog_snapshot',{p_board_id:boardId}),access);
  const row=after.departments.find(d=>d.id===result.departmentId);
  if(after.revision!==Number(result.revision)||
     (action==='delete'?row!==undefined:row?.name!==name))
   deny('Catalog change not verified after saving; refresh Employees');
  return after;
 }
 /** Read privileged signed attendance coordinates without exposing raw module state. */
 async gpsEvidence(boardId,{from,to,userId=null}={}){
  const access=await this.access(boardId);
  const bootstrap=await this.api.rpc('apsyntra_role_is_bootstrap');
  if(bootstrap!==true&&access.moduleRole!=='Supervisor')
   deny('Only bootstrap administrators and TimeTracker Supervisors can view GPS evidence');
  const day=/^\d{4}-(0[1-9]|1[0-2])-([0-3]\d)$/;
  if(!day.test(from||'')||!day.test(to||''))
   deny('Valid GPS date range required');
  if(userId!==null&&!uuid.test(userId))
   deny('GPS employee filter invalid');
  const payload=await this.api.rpc('timetracker_gps_snapshot',{
   p_board_id:boardId,p_from:from,p_to:to,p_user_id:userId
  });
  const data=validateTimeTrackerGps(payload,{
   userId:access.userId,workspaceId:access.workspaceId,boardId
  });
  await checkIdentity(this.auth,this.api,access,boardId);
  const fresh=await this.access(boardId);
  if(fresh.moduleRole!=='Supervisor'&&
     await this.api.rpc('apsyntra_role_is_bootstrap')!==true)
   deny('GPS authorization was revoked during the request');
  return data;
 }
 /** Read selected full attendance records for the System Admin editor only. */
 async attendanceAdminRecords(boardId,recordIds=[]){
  const access=await this.access(boardId);
  if(!['System Admin','IT Administrator'].includes(access.moduleRole))deny('TimeTracker administrator attendance management required');
  if(!Array.isArray(recordIds)||recordIds.length<1||recordIds.length>100||
     recordIds.some(id=>!uuid.test(id))||new Set(recordIds).size!==recordIds.length)
   deny('Attendance record selection is invalid');
  await checkIdentity(this.auth,this.api,access,boardId);
  const result=await this.api.rpc('timetracker_attendance_admin_snapshot',{
   p_board_id:boardId,p_record_ids:recordIds
  });
  if(!isRecord(result)||result.mode!=='ACTIVE'||result.contract!=='tt-attendance-admin-1'||
     result.actorId!==access.userId||result.workspaceId!==access.workspaceId||
     result.boardId!==boardId||!Number.isSafeInteger(Number(result.revision))||
     Number(result.revision)<1||!Array.isArray(result.records)||
     result.records.length!==recordIds.length||!Array.isArray(result.directory))
   deny('TimeTracker administrator attendance snapshot is unverified');
  const returned=new Set(result.records.map(record=>record?.id));
  if(recordIds.some(id=>!returned.has(id)))deny('Attendance snapshot did not return every selected record');
  const directory=result.directory.map(member=>{
   if(!isRecord(member)||!uuid.test(member.id||'')||
      typeof member.displayName!=='string'||member.displayName.length>120)
    deny('TimeTracker administrator employee directory is invalid');
   return Object.freeze({id:member.id,displayName:member.displayName});
  });
  const records=result.records.map(record=>{
   if(!isRecord(record)||!uuid.test(record.id||'')||
      typeof record.ownerId!=='string'||!record.ownerId.startsWith('cloud:')||
      !isRecord(record.clockIn)||!safeTime(record.clockIn.timestamp))
    deny('TimeTracker administrator attendance record is invalid');
   return record;
  });
  await checkIdentity(this.auth,this.api,access,boardId);
  return Object.freeze({revision:Number(result.revision),records:Object.freeze(records),
   directory:Object.freeze(directory),actorId:access.userId,workspaceId:access.workspaceId,boardId});
 }
 /** Atomic compare-and-swap edit/delete. A lost response must be reconciled by a fresh read. */
 async manualClockInCapability(boardId){
  const access=await this.access(boardId);
  if(access.moduleRole!=='System Admin')deny('System Admin attendance management required');
  const response=await this.api.rpc('timetracker_attendance_admin_create_capability',{p_board_id:boardId});
  if(!isRecord(response)||response.contract!=='tt-admin-attendance-capability-3'||
     response.actorId!==access.userId||response.workspaceId!==access.workspaceId||
     response.boardId!==boardId||typeof response.activeReady!=='boolean'||
     response.historicalReady!==true||
     !['active','suspended','invalid'].includes(response.schedulerMode)||
     response.activeReady!==(response.schedulerMode==='active'))
   deny('Manual attendance capability is unverified');
  await checkIdentity(this.auth,this.api,access,boardId);
  return Object.freeze({activeReady:response.activeReady,
   historicalReady:response.historicalReady,schedulerMode:response.schedulerMode});
 }
 async createManualClockIn(boardId,entry,expectedRevision){
  const access=await this.access(boardId);
  if(access.moduleRole!=='System Admin'||entry?.employeeType!=='regular'||
     entry.status!=='active'||entry.clockOutAt!==null||entry.clockOutMode!==null||
     !uuid.test(entry.employeeId||'')||!safeTime(entry.clockInAt)||
     !TT_LOCATIONS.includes(entry.location)||typeof entry.reason!=='string'||
     !entry.reason.trim()||entry.reason.length>500||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   deny('Invalid System Admin manual clock-in request');
  const capability=await this.manualClockInCapability(boardId);
  if(capability.activeReady!==true)
   deny('Regular employee auto clock-out is not active; today’s manual clock-in is unavailable');
  await checkIdentity(this.auth,this.api,access,boardId);
  const result=await this.api.rpc('timetracker_attendance_admin_create',{
   p_board_id:boardId,p_employee_id:entry.employeeId,p_clock_in_at:entry.clockInAt,
   p_location:entry.location,p_work_note:entry.workNote,p_reason:entry.reason,
   p_expected_revision:expectedRevision
  },{retryUnauthorized:false});
  if(!isRecord(result)||result.mode!=='COMMITTED'||result.contract!=='tt-admin-clockin-1'||
     result.actorId!==access.userId||result.workspaceId!==access.workspaceId||
     result.boardId!==boardId||result.employeeId!==entry.employeeId||
     !uuid.test(result.recordId||'')||!Number.isSafeInteger(Number(result.revision))||
     Number(result.revision)<=expectedRevision||!safeTime(result.committedAt))
   deny('Manual clock-in receipt is unverified; refresh before retrying');
  await checkIdentity(this.auth,this.api,access,boardId);
  return Object.freeze({recordId:result.recordId,revision:Number(result.revision)});
 }
 async createHistoricalAttendance(boardId,entry,expectedRevision,requestId){
  const access=await this.access(boardId);
  if(access.moduleRole!=='System Admin'||entry?.employeeType!=='regular'||
     entry.status!=='completed'||!uuid.test(entry.employeeId||'')||
     typeof entry.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||
     !safeTime(entry.clockInAt)||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(entry.clockInAt))!==entry.date||!['standard','actual'].includes(entry.clockOutMode)||
     (entry.clockOutMode==='standard'&&entry.clockOutAt!==null)||
     (entry.clockOutMode==='actual'&&(!safeTime(entry.clockOutAt)||
       Date.parse(entry.clockOutAt)<=Date.parse(entry.clockInAt)))||
     !TT_LOCATIONS.includes(entry.location)||typeof entry.reason!=='string'||
     !entry.reason.trim()||entry.reason.length>500||!uuid.test(requestId||'')||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   deny('Invalid System Admin historical attendance request');
  const capability=await this.manualClockInCapability(boardId);
  if(capability.historicalReady!==true)
   deny('Historical attendance service is not ready');
  await checkIdentity(this.auth,this.api,access,boardId);
  const result=await this.api.rpc('timetracker_attendance_admin_create_historical',{
   p_board_id:boardId,p_employee_id:entry.employeeId,p_attendance_day:entry.date,
   p_clock_in_at:entry.clockInAt,p_clock_out_at:entry.clockOutAt,
   p_clock_out_mode:entry.clockOutMode,p_location:entry.location,
   p_work_note:entry.workNote,p_reason:entry.reason,
   p_expected_revision:expectedRevision,p_request_id:requestId
  },{retryUnauthorized:false});
  const expectedMethod=entry.clockOutMode==='standard'?
   'standard_nine_credited_hours':'admin_entered_actual';
  if(!isRecord(result)||result.mode!=='COMMITTED'||
     result.contract!=='tt-admin-historical-attendance-1'||
     result.actorId!==access.userId||result.workspaceId!==access.workspaceId||
     result.boardId!==boardId||result.employeeId!==entry.employeeId||
     !uuid.test(result.recordId||'')||!Number.isSafeInteger(Number(result.revision))||
     Number(result.revision)<=expectedRevision||!safeTime(result.clockOutAt)||
     result.clockOutMethod!==expectedMethod||typeof result.replayed!=='boolean'||
     !safeTime(result.committedAt))
   deny('Historical attendance receipt is unverified; refresh before retrying');
  await checkIdentity(this.auth,this.api,access,boardId);
  return Object.freeze({recordId:result.recordId,revision:Number(result.revision),
   clockOutAt:result.clockOutAt,clockOutMethod:result.clockOutMethod,replayed:result.replayed});
 }
 async mutateAttendanceRecords(boardId,{action,recordIds,patch={},reason='',expectedRevision,manualClockout=false}={}){
  const access=await this.access(boardId);
  if(!['System Admin','IT Administrator'].includes(access.moduleRole))
   deny('TimeTracker administrator attendance management required');
  if(access.moduleRole==='IT Administrator'&&(
     action!=='edit'||recordIds?.length!==1||
     !isRecord(patch)||Object.keys(patch).some(k=>!['clockInAt','clockOutAt'].includes(k))||
     !Object.keys(patch).length))
   deny('IT Administrator may only correct one session’s recorded times');
  if(!['edit','bulk-edit','delete','bulk-delete'].includes(action)||
     !Array.isArray(recordIds)||recordIds.length<1||recordIds.length>100||
     recordIds.some(id=>!uuid.test(id))||new Set(recordIds).size!==recordIds.length||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
     !isRecord(patch)||typeof reason!=='string'||reason.length>500)
   deny('Attendance management request is invalid');
  await checkIdentity(this.auth,this.api,access,boardId);
  if(manualClockout&&(access.moduleRole!=='System Admin'||action!=='edit'||recordIds.length!==1||
     Object.keys(patch).length!==1||!safeTime(patch.clockOutAt)||!reason.trim()))
   deny('System Admin manual clock-out requires a verified timestamp and reason');
  const result=manualClockout?await this.api.rpc('timetracker_attendance_admin_clock_out',{
   p_board_id:boardId,p_record_id:recordIds[0],p_clock_out_at:patch.clockOutAt,
   p_reason:reason,p_expected_revision:expectedRevision
  },{retryUnauthorized:false}):await this.api.rpc('timetracker_attendance_admin_mutate',{
   p_board_id:boardId,p_action:action,p_record_ids:recordIds,
   p_patch:patch,p_reason:reason,p_expected_revision:expectedRevision
  },{retryUnauthorized:false});
  if(!isRecord(result)||result.mode!=='COMMITTED'||
     result.contract!=='tt-attendance-admin-1'||result.actorId!==access.userId||
     result.workspaceId!==access.workspaceId||result.boardId!==boardId||
     result.action!==action||!Number.isSafeInteger(Number(result.revision))||
     Number(result.revision)<=expectedRevision||!Array.isArray(result.recordIds)||
     result.recordIds.length!==recordIds.length||recordIds.some(id=>!result.recordIds.includes(id))||
     (action.includes('delete')?Number(result.deletedCount)!==recordIds.length:
       Number(result.changedCount)!==recordIds.length))
   deny('Attendance management receipt is unverified; refresh before retrying');
  await checkIdentity(this.auth,this.api,access,boardId);
  return Object.freeze({action,recordIds:Object.freeze([...recordIds]),
   revision:Number(result.revision),changedCount:Number(result.changedCount||0),
   deletedCount:Number(result.deletedCount||0),committedAt:result.committedAt});
 }
 async submitOvertime(boardId,draft){
  if(!TT_OT_WRITES_ACCEPTED)deny('Overtime writes require signed backend acceptance');
  const before=await this.snapshot(boardId);
  if(before.access.otContractActive!==true)deny('Authoritative OT contract unavailable');
  const durationMode=before.access.durationOtContractActive===true;
  if(!durationMode&&draft?.durationMinutes!==undefined)deny('Signed duration OT contract unavailable');
  const form=durationMode?validateDurationOvertimeDraft(draft):validateOvertimeDraft(draft);
  if(!form.valid)deny(form.message);
  await checkIdentity(this.auth,this.api,before.access,boardId);
  const receipt=durationMode?await this.api.rpc('timetracker_ot_submit_duration',{
   p_board_id:boardId,p_date:form.date,p_duration_minutes:form.durationMinutes,p_reason:form.reason
  }):await this.api.rpc('timetracker_ot_submit',{
   p_board_id:boardId,p_date:form.date,p_start:form.start,
   p_end:form.end,p_reason:form.reason
  });
  if(!isRecord(receipt)||!uuid.test(receipt.id||'')||
     receipt.workspaceId!==before.access.workspaceId||
     receipt.ownerId!=='cloud:'+before.access.userId||
     receipt.status!=='Submitted'||(durationMode&&(receipt.otPolicy!=='duration-v1'||receipt.durationMinutes!==form.durationMinutes)))
   deny('OT submission receipt is not verified');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({id:receipt.id,status:receipt.status});
 }
 async submitManualOvertime(boardId,draft){
  if(!TT_OT_WRITES_ACCEPTED)deny('Manual OT writes require signed backend acceptance');
  const before=await this.snapshot(boardId);
  if(before.access.otContractActive!==true||before.access.manualOtManager!==true||
     before.access.moduleRole!=='System Admin')
   deny('System Admin manual OT submission is unavailable');
  const durationMode=before.access.manualDurationOtContractActive===true;
  if(!durationMode&&draft?.durationMinutes!==undefined)deny('Signed manual duration OT contract unavailable');
  const form=durationMode?validateManualDurationOvertimeDraft(draft,before.access.overviewDirectory):validateManualOvertimeDraft(draft,before.access.overviewDirectory);
  if(!form.valid)deny(form.message);
  await checkIdentity(this.auth,this.api,before.access,boardId);
  const receipt=durationMode?await this.api.rpc('timetracker_ot_submit_manual_duration',{
   p_board_id:boardId,p_owner_id:form.employeeId,p_date:form.date,p_duration_minutes:form.durationMinutes,p_reason:form.reason
  }):await this.api.rpc('timetracker_ot_submit_manual',{
   p_board_id:boardId,p_owner_id:form.employeeId,p_date:form.date,
   p_start:form.start,p_end:form.end,p_reason:form.reason
  });
  if(!isRecord(receipt)||!uuid.test(receipt.id||'')||
     receipt.workspaceId!==before.access.workspaceId||
     receipt.ownerId!=='cloud:'+form.employeeId||
     receipt.submittedBy!==before.access.userId||
     receipt.submissionSource!=='manual_admin'||receipt.status!=='Submitted'||
     (durationMode&&(receipt.otPolicy!=='manual-duration-v1'||receipt.durationMinutes!==form.durationMinutes)))
   deny('Manual OT submission receipt is not verified');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({id:receipt.id,status:receipt.status,ownerId:receipt.ownerId});
 }
 async withdrawOvertime(boardId,requestId){
  if(!TT_OT_WRITES_ACCEPTED||!uuid.test(requestId||''))deny('Invalid overtime withdrawal');
  const before=await this.snapshot(boardId);
  if(before.access.otContractActive!==true||
     !before.otRequests.some(row=>row.id===requestId&&row.status==='Submitted'&&row.canWithdraw===true))
   deny('Only the creator can remove a pending OT request');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  const receipt=await this.api.rpc('timetracker_ot_withdraw',{
   p_board_id:boardId,p_request_id:requestId
  });
  if(!isRecord(receipt)||receipt.id!==requestId||
     receipt.workspaceId!==before.access.workspaceId||receipt.status!=='Withdrawn'||
     receipt.withdrawnBy!==before.access.userId)deny('Invalid signed OT withdrawal receipt');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({id:receipt.id,status:receipt.status});
 }
 async decideOvertime(boardId,requestId,decision){
  if(!TT_OT_WRITES_ACCEPTED)deny('Overtime decisions require signed backend acceptance');
  if(!uuid.test(requestId||'')||!['Approved','Rejected'].includes(decision))
   deny('Invalid overtime decision');
  const before=await this.snapshot(boardId);
  if(before.access.otContractActive!==true)deny('Authoritative OT contract unavailable');
  const request=before.otRequests.find(r=>r.id===requestId&&r.status==='Submitted'&&
    (before.access.bootstrapApprover===true||r.ownerId!=='cloud:'+before.access.userId));
  if(!request)deny('OT decision target unavailable or already reviewed');
  const durationMode=request.otPolicy==='duration-v1';
  const canReview=canReviewTimeTrackerOt(request,before.access);
  if(!canReview)deny('This OT request is outside the current review scope');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  const receipt=await this.api.rpc(durationMode?'timetracker_ot_decide_duration':'timetracker_ot_decide',{
    p_board_id:boardId,p_request_id:requestId,p_decision:decision
  });
  const expectedSource=request.isManual?'manual_admin':'employee';
  if(!isRecord(receipt)||receipt.id!==requestId||
     receipt.workspaceId!==before.access.workspaceId||
     receipt.status!==decision||receipt.decidedBy!==before.access.userId||
     (durationMode&&receipt.otPolicy!=='duration-v1')||
     (request.isManual&&receipt.submissionSource!=='manual_admin')||
     (receipt.submissionSource!==undefined&&receipt.submissionSource!==expectedSource))
   deny('OT decision receipt is not verified');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({id:requestId,status:decision});
 }
 async completeAutomaticClockOut(boardId,{recordId,geo}={}){
  if(!uuid.test(recordId||''))deny('A valid pending attendance record is required');
  const before=await this.snapshot(boardId,{clockOnly:true});
  if(before.access.attendanceWritesAccepted!==true)
   deny('Server-verified TimeTracker Clock activation required');
  const existing=before.records.find(row=>row.id===recordId);
  if(existing?.status==='Completed')
   return Object.freeze({mode:'ALREADY_CLOSED',recordId});
  if(!before.active||before.active.id!==recordId)
   deny('The pending attendance session is no longer active');
  if(before.autoClockoutUnavailable||before.autoClockout?.recordId!==recordId||
     before.autoClockout.status!=='PENDING_GPS'||
     !safeTime(before.autoClockout.scheduledClockOutAt))
   deny('The signed automatic clock-out is not pending foreground GPS');
  if(!isRecord(geo)||geo.status!=='captured'||geo.source!=='browser-geolocation'||
     !Number.isFinite(geo.latitude)||geo.latitude < -90||geo.latitude>90||
     !Number.isFinite(geo.longitude)||geo.longitude < -180||geo.longitude>180||
     !Number.isFinite(geo.accuracy)||geo.accuracy<0||geo.accuracy>100000||
     !safeTime(geo.capturedAt)||Date.now()-Date.parse(geo.capturedAt)>60000||
     Date.parse(geo.capturedAt)-Date.now()>120000)
   deny('A fresh foreground browser GPS fix is required');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  if(await this.attendanceCapability(boardId,before.access)!==true)
   deny('Signed attendance write capability changed; no action performed');
  const signal=globalThis.AbortSignal?.timeout?.(25000);
  const result=await this.api.rpc('timetracker_auto_clockout_complete',{
   p_board_id:boardId,p_record_id:recordId,p_geo:geo
  },{retryUnauthorized:false,...(signal?{signal}:{})});
  if(!isRecord(result)||result.contract!=='tt-auto-clockout-complete-1'||
     result.actorId!==before.access.userId||result.workspaceId!==before.access.workspaceId||
     result.boardId!==boardId||result.recordId!==recordId||
     !['COMMITTED','ALREADY_COMMITTED','ALREADY_CLOSED'].includes(result.mode))
   deny('Automatic clock-out completion receipt is unverified; refresh before retrying');
  if(result.mode==='ALREADY_CLOSED')return Object.freeze({mode:result.mode,recordId});
  if(!safeTime(result.scheduledClockOutAt)||
     result.scheduledClockOutAt!==before.autoClockout.scheduledClockOutAt||
     (result.mode==='COMMITTED'&&result.gpsCapturedAt!==geo.capturedAt)||
     !safeTime(result.gpsCapturedAt)||!safeTime(result.committedAt)||
     !Number.isSafeInteger(Number(result.revision))||
     (result.mode==='COMMITTED'&&Number(result.revision)<=before.revision)||
     (result.mode==='ALREADY_COMMITTED'&&Number(result.revision)<before.revision))
   deny('Automatic clock-out receipt does not match the pending schedule');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({mode:result.mode,recordId,
   scheduledClockOutAt:result.scheduledClockOutAt,
   gpsCapturedAt:result.gpsCapturedAt,revision:Number(result.revision),
   committedAt:result.committedAt});
 }
 async commit(boardId,{action,location,department,workNote='',geo,expectedRecordId=null}={}){
  if(!['clock-in','clock-out'].includes(action))deny('Unsupported attendance action');
  const before=await this.snapshot(boardId,{clockOnly:true});
  if(before.access.attendanceWritesAccepted!==true)
   deny('Server-verified TimeTracker Clock activation required');
  if(action==='clock-in'&&before.active)deny('Already clocked in');
  if(action==='clock-out'&&!before.active)deny('No active clock-in session');
  if(action==='clock-out'&&expectedRecordId!==null&&before.active.id!==expectedRecordId)
   deny('Active attendance changed; refresh before ending the new session');
  // Clock Out inherits the signed server-recorded context, never mutable form fields.
  const committedLocation=action==='clock-out'?before.active.location:location;
  const committedDepartment=action==='clock-out'?before.active.department:
   before.access.employeeDepartment;
  if(!TT_LOCATIONS.includes(committedLocation)||!validTimeTrackerDepartmentName(committedDepartment))
   deny('A verified employee department and valid location are required');
  // The caller's department field (if supplied by an old client) is NEVER
  // authoritative. The SQL write endpoint independently enforces the mapping.
  const note=String(workNote||'').trim();
  if(note.length>500)deny('Work note exceeds 500 characters');
  if(action==='clock-in'&&isTimeTrackerHomeNoteRequired(committedLocation,before.access.email,before.access.userId)&&!note)
   deny('Offsite Work Note is mandatory');
  if(!isRecord(geo)||geo.status!=='captured'||!Number.isFinite(geo.latitude)||
    geo.latitude < -90||geo.latitude>90||!Number.isFinite(geo.longitude)||
    geo.longitude < -180||geo.longitude>180||!Number.isFinite(geo.accuracy)||
    geo.accuracy<0||geo.accuracy>100000)
   deny('A captured browser GPS fix is required');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  if(await this.attendanceCapability(boardId,before.access)!==true)
   deny('Signed attendance write authorization changed; no action performed');
  // An interrupted write has an unknown outcome until a signed read reconciles it.
  // Never replay this non-idempotent RPC on an HTTP 401 or network timeout.
  const signal=globalThis.AbortSignal?.timeout?.(25000);
  const result=await this.api.rpc('timetracker_attendance_commit_v2',{
   p_board_id:boardId,p_action:action,
   p_record_id:action==='clock-out'?before.active.id:null,
   p_location:committedLocation,p_department:committedDepartment,p_geo:geo,
   p_work_note:note||null
  },{retryUnauthorized:false,...(signal?{signal}:{})});
  if(!isRecord(result)||result.mode!=='COMMITTED'||
    result.contract!=='tt-attendance-1'||
    result.actorId!==before.access.userId||
    result.workspaceId!==before.access.workspaceId||result.boardId!==boardId||
    result.action!==action||!Number.isSafeInteger(Number(result.revision))||
    Number(result.revision)<=before.revision||!safeTime(result.committedAt)||
    typeof result.recordId!=='string'||result.recordId.length<1||
    result.recordId.length>150||'value'in result||'record'in result||'geo'in result)
   deny('Attendance commit receipt is unverified; refresh before trying again');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({action,revision:Number(result.revision),committedAt:result.committedAt,
   recordId:result.recordId});
 }
}
/** Obtain a genuine, recent browser-provided attendance position.
 * Give the high-accuracy provider time to lock, then retry using network
 * positioning. Browser-managed cached fixes are accepted only if fresh;
 * never invent a coordinate or reuse application-stored locations.
 * Called for explicit manual attendance actions, or when TimeTracker opens
 * with a durable automatic clock-out waiting for foreground GPS.
 */
function geolocationRequest(geolocation,options){
 return new Promise((resolve,reject)=>{
  try{geolocation.getCurrentPosition(resolve,reject,options);}
  catch(error){reject(error);}
 });
}
function locationError(reason){
 const code=Number(reason?.code);
 const denied=code===1||reason?.code==='TT_GEO_DENIED'||reason?.name==='NotAllowedError';
 const timedOut=code===3||reason?.code==='TT_GEO_TIMEOUT'||reason?.name==='TimeoutError';
 const kind=denied?'TT_GEO_DENIED':timedOut?'TT_GEO_TIMEOUT':'TT_GEO_UNAVAILABLE';
 const message=denied?'Browser location permission denied':
  timedOut?'Browser GPS acquisition timed out':'Current browser GPS fix unavailable';
 const error=new Error(message);
 error.code=kind;
 return error;
}
function capturePosition(position){
 if(gpsPositionFailureReason(position))return null;
 const {latitude,longitude,accuracy}=position.coords;
 const capturedAt=Number(position.timestamp);
 return {status:'captured',latitude,longitude,accuracy,
  capturedAt:new Date(capturedAt).toISOString(),source:'browser-geolocation'};
}
export async function captureAttendanceGeo(geolocation,{onProgress,freshOnly=false,diagnosticContext={}}={}){
 const action=diagnosticContext?.action||'unknown';
 const captureId=beginTimeTrackerGpsCapture(action);
 const startedAt=Date.now();
 const stopLifecycle=observeTimeTrackerGpsLifecycle(action,captureId);
 const stopPermission=observeTimeTrackerGpsPermission(action,captureId);
 const progress=message=>{if(typeof onProgress==='function'){
  try{onProgress(message);}catch{/* A UI update must not interrupt GPS acquisition. */}
 }};
 try{
  if(globalThis.isSecureContext===false){
   const error=new Error('Location requires a secure HTTPS connection');
   error.code='TT_GEO_INSECURE';
   recordTimeTrackerGpsDiagnostic({phase:'capture-precondition-failed',action,captureId,
    elapsedMs:Date.now()-startedAt,errorCode:error.code,reason:'insecure-context'});
   throw error;
  }
  if(!geolocation||typeof geolocation.getCurrentPosition!=='function'){
   const error=locationError({code:2});
   recordTimeTrackerGpsDiagnostic({phase:'capture-precondition-failed',action,captureId,
    elapsedMs:Date.now()-startedAt,errorCode:error.code,reason:'geolocation-api-missing'});
   throw error;
  }
  const attempts=[
   {options:{enableHighAccuracy:true,timeout:10000,maximumAge:freshOnly===true?0:25000},
    message:'Finding your GPS location…'},
   {options:{enableHighAccuracy:false,timeout:12000,maximumAge:freshOnly===true?0:45000},
    message:'GPS is taking longer; trying network-assisted location…'}
  ];
  let lastError={code:2};
  for(const [index,attempt] of attempts.entries()){
   const attemptNumber=index+1,attemptStartedAt=Date.now();
   progress(attempt.message);
   recordTimeTrackerGpsDiagnostic({phase:'attempt-start',action,captureId,
    attempt:attemptNumber,enableHighAccuracy:attempt.options.enableHighAccuracy,
    timeoutMs:attempt.options.timeout,maximumAgeMs:attempt.options.maximumAge});
   try{
    const position=await geolocationRequest(geolocation,attempt.options);
    const elapsedMs=Date.now()-attemptStartedAt;
    const reason=gpsPositionFailureReason(position);
    if(reason){
     recordTimeTrackerGpsDiagnostic({phase:'attempt-invalid-position',action,captureId,
      attempt:attemptNumber,elapsedMs,reason});
     lastError={code:2};
     continue;
    }
    const fix=capturePosition(position);
    if(fix){
     const positionAgeMs=Math.max(0,Date.now()-Number(position.timestamp));
     recordTimeTrackerGpsDiagnostic({phase:'attempt-success',action,captureId,
      attempt:attemptNumber,elapsedMs,accuracyMeters:fix.accuracy,positionAgeMs});
     recordTimeTrackerGpsDiagnostic({phase:'capture-success',action,captureId,
      elapsedMs:Date.now()-startedAt,accuracyMeters:fix.accuracy,positionAgeMs});
     return fix;
    }
    lastError={code:2};
   }catch(error){
    const code=Number(error?.code);
    const errorCode=error?.code==='TT_GEO_DENIED'?'TT_GEO_DENIED':
     error?.code==='TT_GEO_TIMEOUT'?'TT_GEO_TIMEOUT':
     error?.code==='TT_GEO_UNAVAILABLE'?'TT_GEO_UNAVAILABLE':
     code===1||error?.name==='NotAllowedError'?'TT_GEO_DENIED':
     code===3||error?.name==='TimeoutError'?'TT_GEO_TIMEOUT':'TT_GEO_UNAVAILABLE';
    recordTimeTrackerGpsDiagnostic({phase:'attempt-error',action,captureId,
     attempt:attemptNumber,elapsedMs:Date.now()-attemptStartedAt,errorCode});
    if(code===1||errorCode==='TT_GEO_DENIED'||error?.name==='NotAllowedError')
     throw locationError(error);
    lastError=error;
   }
  }
  throw locationError(lastError);
 }catch(error){
  const code=error?.code==='TT_GEO_INSECURE'?'TT_GEO_INSECURE':
   error?.code==='TT_GEO_DENIED'?'TT_GEO_DENIED':
   error?.code==='TT_GEO_TIMEOUT'?'TT_GEO_TIMEOUT':'TT_GEO_UNAVAILABLE';
  recordTimeTrackerGpsDiagnostic({phase:'capture-failed',action,captureId,
   elapsedMs:Date.now()-startedAt,errorCode:code});
  throw error;
 }finally{
  stopLifecycle();
  stopPermission();
 }
}
