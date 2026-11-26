// CP-TT-MANUAL-ATTENDANCE: shared client-side date and payload rules.
// The signed database RPC independently enforces every rule.
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
 if(!validDay(day))return {allowed:false,activeAllowed:false,historicalAllowed:false,defaultStatus:null};
 const today=manualAttendanceToday(now);
 if(day>today)return {allowed:false,activeAllowed:false,historicalAllowed:false,defaultStatus:null};
 const activeAllowed=day===today;
 return {allowed:true,activeAllowed,historicalAllowed:!activeAllowed,
  defaultStatus:activeAllowed?'active':'completed'};
}
function wallTime(day,time){
 if(!validDay(day)||typeof time!=='string'||!timePattern.test(time))
  throw Error('Select a valid Philippine date and time.');
 return new Date(day+'T'+time+':00+08:00');
}
export function buildManualAttendanceEntry(input,{now=new Date(),roster=[]}={}){
 const {employeeId,employeeType,date,clockInTime,status,clockOutMode='standard',
  clockOutDate,clockOutTime,location}=input||{};
 const member=roster.find(r=>r.id===employeeId&&r.type==='regular'&&r.active===true);
 if(!uuid.test(employeeId||'')||employeeType!=='regular'||!member)
  throw Error('Select an active regular employee from the authorized roster.');
 const policy=manualAttendanceDatePolicy(date,now);
 if(!policy.allowed)throw Error('Attendance date is invalid or in the future.');
 if(status!==policy.defaultStatus)
  throw Error(policy.activeAllowed?
   'Today’s manual clock-in must remain an active session.':
   'Past attendance must be completed; active entries are allowed only today.');
 const start=wallTime(date,clockInTime);
 if(start>now)throw Error('Clock-in cannot be in the future.');
 let end=null;
 if(status==='active'){
  if(clockOutDate||clockOutTime)
   throw Error('A current-day manual clock-in must remain active without a clock-out.');
 }else{
  if(!['standard','actual'].includes(clockOutMode))
   throw Error('Choose a valid historical clock-out method.');
  if(clockOutMode==='actual'){
   end=wallTime(clockOutDate||date,clockOutTime);
   if(end<=start)throw Error('Clock-out must be later than clock-in.');
   if(end>now)throw Error('Clock-out cannot be in the future.');
   if(end.getTime()-start.getTime()>48*60*60*1000)
    throw Error('Clock-out must be within 48 hours of clock-in.');
  }else if(clockOutTime){
   throw Error('Clear the actual clock-out time or choose the actual-time method.');
  }
 }
 if(!TT_MANUAL_LOCATIONS.includes(location))throw Error('Select a valid work location.');
 const reason=String(input.reason||'').trim();
 const workNote=String(input.workNote||'').trim();
 if(!reason||reason.length>500)throw Error('Provide a manual entry reason of 1–500 characters.');
 if(workNote.length>500||(location==='Offsite (Home)'&&!workNote))
  throw Error('Offsite work requires a work note (maximum 500 characters).');
 return Object.freeze({
  employeeId,employeeType,date,clockInAt:start.toISOString(),
  clockOutAt:end?.toISOString()??null,
  clockOutMode:status==='completed'?clockOutMode:null,
  status,location,workNote:workNote||null,reason
 });
}
