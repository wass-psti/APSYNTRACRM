/** Central TimeTracker presentation-only Philippine clock formatting.
 * Persisted instants, arithmetic, audit values, and RPC contracts remain unchanged.
 */
const ZONE='Asia/Manila';
const valid=value=>value instanceof Date?Number.isFinite(value.getTime()):
  (typeof value==='string'||typeof value==='number')&&Number.isFinite(new Date(value).getTime());
export function formatTimeTrackerClock(value,{seconds=false}={}){
  if(!valid(value))return '—';
  return new Intl.DateTimeFormat('en-US',{timeZone:ZONE,hour:'2-digit',
    minute:'2-digit',...(seconds?{second:'2-digit'}:{}),hour12:true}).format(new Date(value));
}
export function formatTimeTrackerDateTime(value,{seconds=false}={}){
  if(!valid(value))return '—';
  const date=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,month:'short',day:'numeric',
    year:'numeric'}).format(new Date(value));
  return date+', '+formatTimeTrackerClock(value,{seconds});
}
export function formatTimeTrackerShortDateTime(value){
  if(!valid(value))return '—';
  const date=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,month:'short',day:'numeric'}).format(new Date(value));
  return date+', '+formatTimeTrackerClock(value);
}
export function parseTimeTrackerClockInput(value){
  const text=String(value??'').trim();
  const m=/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(text);
  if(m){
    const hour=(Number(m[1])%12)+(m[3].toUpperCase()==='PM'?12:0);
    return String(hour).padStart(2,'0')+':'+m[2];
  }
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(text))return text;
  throw Error('Enter a valid time, such as 07:30 PM.');
}
export function formatTimeTrackerWallClock(value){
  try {
    const machine=parseTimeTrackerClockInput(value);
    const hour=Number(machine.slice(0,2));
    return String(hour%12||12).padStart(2,'0')+machine.slice(2)+(hour<12?' AM':' PM');
  }catch{return '—';}
}
export function formatTimeTrackerAdminWallDateTime(value){
  const m=/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value??''));
  return m?m[1]+' '+formatTimeTrackerWallClock(m[2]+':'+m[3]):'';
}
export function parseTimeTrackerAdminWallDateTime(value){
  const text=String(value??'').trim();
  const m=/^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(text);
  if(!m)throw Error('Enter a Philippine date and 12-hour time, e.g. 2026-11-20 07:30 PM.');
  return m[1]+'T'+parseTimeTrackerClockInput(m[2]);
}
