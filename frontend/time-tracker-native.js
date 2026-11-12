import {TT_LOCATIONS,creditedAttendanceMs,manilaClockMinutes,TT_PHT_OFFSET_MS} from './time-tracker-policy.js';
export {TT_LOCATIONS,creditedAttendanceMs} from './time-tracker-policy.js';
import {projectTimeTrackerOverview,TT_TEAM_OVERVIEW_ROLES} from './time-tracker-overview.js';
import {projectTimeTrackerLog} from './time-tracker-history.js';
import {projectTimeTrackerOtRows,validateOvertimeDraft,TT_OT_WRITES_ACCEPTED} from './time-tracker-overtime.js';
import {projectTimeTrackerTeamDirectory} from './time-tracker-team.js';
import {validateTimeTrackerGps} from './time-tracker-gps.js';
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
export const TT_DEPARTMENTS=Object.freeze([
 'HR','Materials and Logistics','Engineering','Finance and Accounting',
 'Sales and Marketing','Information Technology'
]);
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
   id:x.id,clockIn:x.clockIn.timestamp,clockOut:out?.timestamp||null,
   location:String(x.clockIn.location||'—').slice(0,100),
   department:String(x.clockIn.department||'—').slice(0,100),
   status:label,classification:attendanceClassification(x),
   creditedMs:out?creditedAttendanceMs(x.clockIn.timestamp,out.timestamp):null,
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
   id:x.id.slice(0,140),date:x.date,status:x.status,
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
export class TimeTrackerNativeClient{
 constructor({auth,api}){this.auth=auth;this.api=api;}
 async access(boardId){
  const {auth,api}=this;
  const who=await auth.getVerifiedUser();
  const ctx=await api.context();
  verifiedContext(auth,ctx,boardId);
  if(who?.id!==ctx.user_id)deny('Signed identity mismatch');
  const board=await api.board(boardId);
  if(board?.board?.id!==boardId||board.board.workspace_id!==ctx.workspace_id||
     board.board.name!=='TimeTracker Attendance')
   deny('TimeTracker board identity or workspace mismatch');
  if(await api.allowed(boardId,'view')!==true)
   deny('Board access denied');
  const granted=await api.rpc('has_module_access',{p_module_id:moduleId,p_user_id:who.id});
  if(granted!==true)deny('TimeTracker application grant required');
  const users=await api.rpc('list_module_directory',{p_module_id:moduleId});
  if(!Array.isArray(users))deny('TimeTracker central directory unavailable');
  const self=users.find(x=>x?.id===who.id&&x.status==='active');
  if(!self||!TT_ROLES.includes(self.module_role))
   deny('Central TimeTracker role assignment unavailable');
  await checkIdentity(auth,api,{userId:who.id,workspaceId:ctx.workspace_id},boardId);
  const overviewDirectory=users.filter(u=>u&&u.status==='active'&&
    typeof u.id==='string'&&(u.id===who.id||TT_TEAM_OVERVIEW_ROLES.includes(self.module_role)))
    .map(u=>Object.freeze({id:u.id,status:'active',
      display_name:String(u.display_name||'Workforce member').slice(0,100)}));
  return Object.freeze({userId:who.id,workspaceId:ctx.workspace_id,boardId,
    platformRole:ctx.profile?.platform_role||'Unassigned',
    moduleRole:self.module_role,name:String(self.display_name||'Signed user').slice(0,100),
    overviewDirectory:Object.freeze(overviewDirectory)});

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
 async snapshot(boardId){
  const access=await this.access(boardId);
  // Issue independent, read-only RPCs together AFTER signed access verification.
  // Backend scope checks remain authoritative; identity is checked again below.
  const otRead=this.api.rpc('timetracker_ot_snapshot',{p_board_id:boardId})
   .then(response=>({response}),error=>({error}));
  const clockRead=this.attendanceCapability(boardId,access);
  const raw=await this.api.rpc('list_module_state',{p_module_id:moduleId});
  if(!Array.isArray(raw))deny('TimeTracker state API contract invalid');
  const row=raw.find(x=>x?.state_key===stateKey&&x.scope==='shared');
  if(row&&(!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1||
    typeof row.value!=='string'))deny('Invalid authoritative attendance revision');
  const records=projectOwnAttendance(row?row.value:{version:1,records:[]},access.userId);
  const overview=projectTimeTrackerOverview({
   value:row?row.value:{version:1,records:[]},
   directory:access.overviewDirectory,userId:access.userId,
   moduleRole:access.moduleRole
  });
  const log=projectTimeTrackerLog({
   value:row?row.value:{version:1,records:[]},
   directory:access.overviewDirectory,userId:access.userId,
   moduleRole:access.moduleRole
  });
  const otRow=raw.find(x=>x?.state_key==='timetracker.ot.v1'&&x.scope==='shared');
  let otRequests=projectOwnOvertime(otRow?.value||{version:1,requests:[]},access.userId)
   .map(row=>Object.freeze({...row,ownerId:'cloud:'+access.userId,name:access.name}));
  let otAccess=Object.freeze({scope:'OWN_OT_ONLY',
   bootstrapApprover:false,otContractActive:false});
  // Optional dedicated OT read endpoint. Before activation, degrade to owner-only
  // legacy rows; never infer team permissions from frontend platform role.
  try{
   const {response,error}=await otRead;
   if(error)throw error;
   if(!isRecord(response)||response.mode!=='ACTIVE'||
      response.actorId!==access.userId||response.workspaceId!==access.workspaceId||
      !['OWN_OT_ONLY','AUTHORIZED_WORKSPACE_TEAM'].includes(response.scope)||
      typeof response.bootstrapApprover!=='boolean'||!Array.isArray(response.rows))
    deny('Signed OT snapshot identity, scope or schema mismatch');
   if(response.scope==='AUTHORIZED_WORKSPACE_TEAM'&&response.bootstrapApprover!==true)
    deny('Team OT access is not bootstrap-authorized');
   const allowed=new Set(access.overviewDirectory.map(u=>'cloud:'+u.id));
   const projected=projectTimeTrackerOtRows(response.rows).filter(row=>
    allowed.has(row.ownerId)&&(
      response.scope==='AUTHORIZED_WORKSPACE_TEAM'||
      row.ownerId==='cloud:'+access.userId));
   otRequests=projected;
   otAccess=Object.freeze({scope:response.scope,
    bootstrapApprover:response.bootstrapApprover,otContractActive:true});
  }catch(error){
   // Only missing RPC is an expected predeployment state. All other errors
   // reject instead of silently substituting potentially stale authority.
   const msg=String(error?.message||error);
   if(!/PGRST202|Could not find the function|Unexpected RPC timetracker_ot_snapshot/.test(msg))
    throw error;
  }
  const attendanceWritesAccepted=await clockRead;
  await checkIdentity(this.auth,this.api,access,boardId);
  return {status:'VERIFIED_READ',access:{...access,...otAccess,attendanceWritesAccepted},records,otRequests,overview,log,revision:row?Number(row.revision):0,
   active:records.find(x=>x.status==='Active')||null};
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
  await checkIdentity(this.auth,this.api,access,boardId);
  if(await this.api.rpc('apsyntra_role_is_bootstrap')!==true)
   deny('Bootstrap authorization changed during Team Directory read');
  return directory;
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
 async submitOvertime(boardId,draft){
  if(!TT_OT_WRITES_ACCEPTED)deny('Overtime writes require signed backend acceptance');
  const before=await this.snapshot(boardId);
  if(before.access.otContractActive!==true)deny('Authoritative OT contract unavailable');
  const form=validateOvertimeDraft(draft);
  if(!form.valid)deny(form.message);
  await checkIdentity(this.auth,this.api,before.access,boardId);
  const receipt=await this.api.rpc('timetracker_ot_submit',{
   p_board_id:boardId,p_date:form.date,p_start:form.start,
   p_end:form.end,p_reason:form.reason
  });
  if(!isRecord(receipt)||!uuid.test(receipt.id||'')||
     receipt.workspaceId!==before.access.workspaceId||
     receipt.ownerId!=='cloud:'+before.access.userId||
     receipt.status!=='Submitted')
   deny('OT submission receipt is not verified');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({id:receipt.id,status:receipt.status});
 }
 async decideOvertime(boardId,requestId,decision){
  if(!TT_OT_WRITES_ACCEPTED)deny('Overtime decisions require signed backend acceptance');
  if(!uuid.test(requestId||'')||!['Approved','Rejected'].includes(decision))
   deny('Invalid overtime decision');
  const before=await this.snapshot(boardId);
  if(before.access.otContractActive!==true||before.access.bootstrapApprover!==true||
     before.access.scope!=='AUTHORIZED_WORKSPACE_TEAM')
   deny('Bootstrap OT approval denied');
  const request=before.otRequests.find(r=>r.id===requestId&&r.status==='Submitted'&&
    r.ownerId!=='cloud:'+before.access.userId);
  if(!request)deny('OT decision target unavailable or already reviewed');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  const receipt=await this.api.rpc('timetracker_ot_decide',{
    p_board_id:boardId,p_request_id:requestId,p_decision:decision
  });
  if(!isRecord(receipt)||receipt.id!==requestId||
     receipt.workspaceId!==before.access.workspaceId||
     receipt.status!==decision||receipt.decidedBy!==before.access.userId)
   deny('OT decision receipt is not verified');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({id:requestId,status:decision});
 }
 async commit(boardId,{action,location,department,workNote='',geo}={}){
  if(!['clock-in','clock-out'].includes(action))deny('Unsupported attendance action');
  const before=await this.snapshot(boardId);
  if(before.access.attendanceWritesAccepted!==true)
   deny('Server-verified TimeTracker Clock activation required');
  if(action==='clock-in'&&before.active)deny('Already clocked in');
  if(action==='clock-out'&&!before.active)deny('No active clock-in session');
  // Clock Out inherits the signed server-recorded context, never mutable form fields.
  const committedLocation=action==='clock-out'?before.active.location:location;
  const committedDepartment=action==='clock-out'?before.active.department:department;
  if(!TT_LOCATIONS.includes(committedLocation)||!TT_DEPARTMENTS.includes(committedDepartment))
   deny('Attendance location and department require an authorized session');
  const note=String(workNote||'').trim();
  if(note.length>500)deny('Work note exceeds 500 characters');
  if(committedLocation==='Offsite (Home)'&&before.access.moduleRole!=='System Admin'&&!note)
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
/** Acquire a real browser fix within the existing 12-second sensor budget.
 * Retry sensor acquisition only; never retry an attendance write here.
 */
function geolocationRequest(geolocation,options){
 return new Promise((resolve,reject)=>{
  try{geolocation.getCurrentPosition(resolve,reject,options);}
  catch(error){reject(error);}
 });
}
function locationError(reason){
 const denied=Number(reason?.code)===1;
 const error=new Error(denied?'Browser location permission denied':'Current browser GPS fix unavailable');
 error.code=denied?'TT_GEO_DENIED':'TT_GEO_UNAVAILABLE';
 return error;
}
export async function captureAttendanceGeo(geolocation){
 if(!geolocation||typeof geolocation.getCurrentPosition!=='function')
  throw locationError({code:2});
 let position;
 try{
  position=await geolocationRequest(geolocation,{
   enableHighAccuracy:true,timeout:5000,maximumAge:0
  });
 }catch(first){
  if(Number(first?.code)===1)throw locationError(first);
  if(![2,3].includes(Number(first?.code)))throw locationError(first);
  try{
   position=await geolocationRequest(geolocation,{
    enableHighAccuracy:false,timeout:7000,maximumAge:0
   });
  }catch(second){throw locationError(second);}
 }
 const {latitude,longitude,accuracy}=position?.coords||{};
 const capturedAt=Number(position?.timestamp);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||
   latitude < -90||latitude>90||longitude < -180||longitude>180||
   accuracy<0||accuracy>100000||!Number.isFinite(capturedAt)||
   Date.now()-capturedAt>60000||capturedAt-Date.now()>120000)
  throw locationError({code:2});
 return {status:'captured',latitude,longitude,accuracy,
  capturedAt:new Date(capturedAt).toISOString(),source:'browser-geolocation'};
}
