// CP-TT-MANUAL-ATTENDANCE: shared client-side date and payload rules.
// The signed database RPC must independently enforce all of these rules.
export const TT_MANUAL_LOCATIONS=Object.freeze([
 'Office-Base Duty','Offsite (Home)','Local Field Works',
 'Out of Town Assignment','International Field Assignments'
]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const formatter=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
});
export function manualAttendanceToday(now=new Date()){
 const parts=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function validDay(day){
 if(typeof day!=='string'||!dayPattern.test(day))return false;
 const d=new Date(day+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day;
}
export function manualAttendanceDatePolicy(day,now=new Date()){
 if(!validDay(day))return {allowed:false,activeAllowed:false,defaultStatus:null};
 const today=manualAttendanceToday(now);
 if(day>today)return {allowed:false,activeAllowed:false,defaultStatus:null};
 return {allowed:true,activeAllowed:day===today,defaultStatus:day===today?'active':'completed'};
}
export function normalizeManualAttendanceTime(value){
 const time=String(value??'').trim();
 if(timePattern.test(time))return time;
 const match=/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(time);
 if(!match)return null;
 const hour=Number(match[1])%12+(match[3].toUpperCase()==='PM'?12:0);
 return String(hour).padStart(2,'0')+':'+match[2];
}
export function formatManualAttendanceTime(value){
 const time=normalizeManualAttendanceTime(value);
 if(!time)return String(value??'');
 const hour=Number(time.slice(0,2));
 return (hour%12||12)+':'+time.slice(3)+(hour<12?' AM':' PM');
}
function wallTime(day,time){
 const normalized=normalizeManualAttendanceTime(time);
 if(!validDay(day)||!normalized)
  throw Error('Select a valid Philippine date and time (e.g. 8:45 AM).');
 return new Date(day+'T'+normalized+':00+08:00');
}
export function buildManualAttendanceEntry(input,{now=new Date(),roster=[]}={}){
 const {employeeId,employeeType,date,clockInTime,status,clockOutDate,clockOutTime,location}=input||{};
 const member=roster.find(r=>r.id===employeeId&&r.type===employeeType&&r.active===true);
 if(!uuid.test(employeeId||'')||!['regular','ojt'].includes(employeeType)||!member)
  throw Error('Select an active employee or intern from the authorized roster.');
 const policy=manualAttendanceDatePolicy(date,now);
 if(!policy.allowed)throw Error('Attendance date is invalid or in the future.');
 if(!['active','completed'].includes(status)||(!policy.activeAllowed&&status!=='completed'))
  throw Error('Past attendance must be completed; active entries are allowed only today.');
 const start=wallTime(date,clockInTime);
 if(start>now)throw Error('Clock-in cannot be in the future.');
 let end=null;
 if(status==='completed'){
  end=wallTime(clockOutDate||date,clockOutTime);
  if(end<=start)throw Error('Clock-out must be later than clock-in.');
  if(end>now)throw Error('Clock-out cannot be in the future.');
  if(end-start>370*86400000)throw Error('Attendance duration exceeds 370 days.');
 }else if(clockOutDate||clockOutTime){
  throw Error('Active attendance cannot have a clock-out timestamp.');
 }
 if(!TT_MANUAL_LOCATIONS.includes(location))throw Error('Select a valid work location.');
 const reason=String(input.reason||'').trim();
 const workNote=location==='Offsite (Home)'?String(input.workNote||'').trim():'';
 if(!reason||reason.length>500)throw Error('Provide a manual entry reason of 1–500 characters.');
 if(workNote.length>500||(location==='Offsite (Home)'&&!workNote))
  throw Error('Offsite work requires a work note (maximum 500 characters).');
 return Object.freeze({employeeId,employeeType,clockInAt:start.toISOString(),
  clockOutAt:end?.toISOString()??null,status,location,workNote:workNote||null,reason});
}
