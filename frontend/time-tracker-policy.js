/** Shared TimeTracker policy primitives used by the signed client and Overview.
 * Extracted to avoid cyclical application-module initialization.
 */
export const TT_LOCATIONS=Object.freeze([
 'Office-Base Duty','Offsite (Home)','Local Field Works',
 'Out of Town Assignment','International Field Assignments'
]);
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
