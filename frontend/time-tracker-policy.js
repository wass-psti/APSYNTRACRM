/** Shared TimeTracker policy primitives used by the signed client and Overview.
 * Extracted to avoid cyclical application-module initialization.
 */
export const TT_LOCATIONS=Object.freeze([
 'Office-Base Duty','Offsite (Home)','Local Field Works',
 'Out of Town Assignment','International Field Assignments'
]);
const PHT_HOUR_MS=60*60*1000;
export const TT_PHT_OFFSET_MS=8*PHT_HOUR_MS;
const PHT_DAY_MS=24*PHT_HOUR_MS;
/** TimeTracker operational timestamps are evaluated in Philippine Time (UTC+08:00).
 * Use UTC arithmetic on a PHT-shifted timestamp, independent of browser timezone.
 */
export function manilaClockMinutes(value){
 const timestamp=new Date(value).getTime();
 if(!Number.isFinite(timestamp))return null;
 const shifted=new Date(timestamp+TT_PHT_OFFSET_MS);
 return shifted.getUTCHours()*60+shifted.getUTCMinutes();
}
export function creditedAttendanceMs(start,end){
 const a=new Date(start).getTime(),b=new Date(end).getTime();
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;
 let deducted=0;
 const firstDay=Math.floor((a+TT_PHT_OFFSET_MS)/PHT_DAY_MS);
 const lastDay=Math.floor((b+TT_PHT_OFFSET_MS)/PHT_DAY_MS);
 for(let day=firstDay;day<=lastDay&&day<firstDay+370;day++){
  const noon=day*PHT_DAY_MS+4*PHT_HOUR_MS;
  const one=day*PHT_DAY_MS+5*PHT_HOUR_MS;
  deducted+=Math.max(0,Math.min(b,one)-Math.max(a,noon));
 }
 return Math.max(0,b-a-deducted);
}
