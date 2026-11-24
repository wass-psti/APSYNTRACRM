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
/** ISO calendar day for Philippine attendance, independent of device timezone. */
export function timeTrackerManilaDay(value){
 const ms=new Date(value).getTime();
 if(!Number.isFinite(ms))return null;
 return new Date(ms+TT_PHT_OFFSET_MS).toISOString().slice(0,10);
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

/** Use an explicit System Admin duration override when present; otherwise preserve the existing PHT break policy. */
export function creditedAttendanceRecordMs(record,start,end){
 const override=record?.creditedMsOverride;
 if(!record?.clockOut)return null;
 if(Number.isSafeInteger(override)&&override>=0&&override<=2678400000)
  return override;
 return creditedAttendanceMs(start,end);
}

/** Completed Log work duration. Short sessions retain their exact elapsed
 * duration; longer shifts retain at least nine hours before ordinary
 * lunch-adjusted credits exceed nine. The live Clock and server cutoff are
 * deliberately unchanged. An explicit, valid signed admin override wins.
 */
export function completedLogWorkDurationMs(start,end,override){
 const a=Date.parse(start),b=Date.parse(end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;
 if(Number.isSafeInteger(override)&&override>=0&&override<=2678400000)return override;
 const elapsed=b-a;
 const nine=9*PHT_HOUR_MS;
 return Math.max(Math.min(elapsed,nine),creditedAttendanceMs(start,end));
}
