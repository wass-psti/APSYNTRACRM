/**
 * TimeTracker native APSYNTRA adapter. Source reference: TimeTracker v2.0.14.
 * No standalone app, storage shim, local JWT, synthetic rows, or privileged key.
 * All attendance mutations use the existing atomic signed PostgreSQL RPC.
 */
const moduleId='time-tracker';
// Fail closed until backend offsite-note/audit acceptance and signed runtime proof.
export const TT_LIVE_ATTENDANCE_WRITES_ACCEPTED=false;
const stateKey='timetracker.attendance.v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TT_LOCATIONS=Object.freeze([
 'Office-Base Duty','Offsite (Home)','Local Field Works',
 'Out of Town Assignment','International Field Assignments'
]);
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
export function creditedAttendanceMs(start,end){
 const a=new Date(start).getTime(),b=new Date(end).getTime();
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;
 let deducted=0;
 const cursor=new Date(a);cursor.setHours(0,0,0,0);
 const final=new Date(b);final.setHours(0,0,0,0);
 for(let day=0;cursor.getTime()<=final.getTime()&&day<370;day++){
  const noon=new Date(cursor);noon.setHours(12,0,0,0);
  const one=new Date(cursor);one.setHours(13,0,0,0);
  deducted+=Math.max(0,Math.min(b,one.getTime())-Math.max(a,noon.getTime()));
  cursor.setDate(cursor.getDate()+1);
 }
 return Math.max(0,b-a-deducted);
}
export function attendanceClassification(record){
 if(record?.clockOut?.status==='administratively_closed'||record?.reconciliation?.type==='legacy_duplicate_session')
  return 'Administrative closure';
 if(!safeTime(record?.clockIn?.timestamp))return 'Unknown';
 const t=new Date(record.clockIn.timestamp);
 return t.getHours()*60+t.getMinutes()>TT_POLICY.standardClockInMinutes?'Late':'On time';
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
  return Object.freeze({userId:who.id,workspaceId:ctx.workspace_id,boardId,
    platformRole:ctx.profile?.platform_role||'Unassigned',
    moduleRole:self.module_role,name:String(self.display_name||'Signed user').slice(0,100)});
 }
 async snapshot(boardId){
  const access=await this.access(boardId);
  const raw=await this.api.rpc('list_module_state',{p_module_id:moduleId});
  if(!Array.isArray(raw))deny('TimeTracker state API contract invalid');
  const row=raw.find(x=>x?.state_key===stateKey&&x.scope==='shared');
  if(row&&(!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1||
    typeof row.value!=='string'))deny('Invalid authoritative attendance revision');
  const records=projectOwnAttendance(row?row.value:{version:1,records:[]},access.userId);
  await checkIdentity(this.auth,this.api,access,boardId);
  return {status:'VERIFIED_READ',access,records,revision:row?Number(row.revision):0,
   active:records.find(x=>x.status==='Active')||null};
 }
 async commit(boardId,{action,location,department,workNote='',geo}={}){
  if(!['clock-in','clock-out'].includes(action))deny('Unsupported attendance action');
  const before=await this.snapshot(boardId);
  if(!TT_LOCATIONS.includes(location)||!TT_DEPARTMENTS.includes(department))
   deny('Select an approved work location and department');
  const note=String(workNote||'').trim();
  if(note.length>500)deny('Work note exceeds 500 characters');
  if(location==='Offsite (Home)'&&before.access.moduleRole!=='System Admin'&&!note)
   deny('Offsite Work Note is mandatory');
  if(action==='clock-in'&&before.active)deny('Already clocked in');
  if(action==='clock-out'&&!before.active)deny('No active clock-in session');
  if(!isRecord(geo)||geo.status!=='captured'||!Number.isFinite(geo.latitude)||
    geo.latitude < -90||geo.latitude>90||!Number.isFinite(geo.longitude)||
    geo.longitude < -180||geo.longitude>180||!Number.isFinite(geo.accuracy)||
    geo.accuracy<0||geo.accuracy>100000)
   deny('A captured browser GPS fix is required');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  const result=await this.api.rpc('commit_timetracker_attendance_action',{
   p_action:action,p_record_id:action==='clock-out'?before.active.id:null,
   p_location:location,p_department:department,p_geo:geo,
   p_work_note:note||null,p_attendance_policy:TT_POLICY
  });
  if(!isRecord(result)||result.action!==action||result.state_key!==stateKey||
    !Number.isSafeInteger(Number(result.revision))||Number(result.revision)<=before.revision||
    !safeTime(result.committed_at)||!isRecord(result.record)||
    result.record.ownerId!=='cloud:'+before.access.userId)
   deny('Attendance commit receipt is unverified; refresh before trying again');
  await checkIdentity(this.auth,this.api,before.access,boardId);
  return Object.freeze({action,revision:Number(result.revision),committedAt:result.committed_at,
   recordId:result.record.id});
 }
}
export async function captureAttendanceGeo(geolocation){
 if(!geolocation||typeof geolocation.getCurrentPosition!=='function')
  deny('Browser geolocation is unavailable');
 const position=await new Promise((resolve,reject)=>geolocation.getCurrentPosition(resolve,reject,
  {enableHighAccuracy:true,timeout:12000,maximumAge:0}));
 const {latitude,longitude,accuracy}=position?.coords||{};
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy)||
   latitude < -90||latitude>90||longitude < -180||longitude>180||accuracy<0)
  deny('GPS fix is invalid');
 return {status:'captured',latitude,longitude,accuracy,
  capturedAt:new Date(position.timestamp||Date.now()).toISOString(),source:'browser-geolocation'};
}
