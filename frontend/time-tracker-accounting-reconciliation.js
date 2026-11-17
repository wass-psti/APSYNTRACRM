/**
 * Read-only comparison of signed approved OT intervals against completed
 * attendance sessions. This is reconciliation evidence, NEVER a replacement
 * for the authoritative PostgreSQL creditedMs or payroll calculations.
 */
import {timeTrackerManilaDay} from './time-tracker-policy.js';

const PHT_OFFSET_MS=8*60*60*1000;
const MINUTE_MS=60000;
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value+'T00:00:00Z'))&&
 new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const validClock=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function otInterval(row){
 if(row?.status!=='Approved'||!validDate(row.date)||!validClock(row.start)||
    !validClock(row.end)||typeof row.ownerId!=='string')return null;
 const startMinutes=Number(row.start.slice(0,2))*60+Number(row.start.slice(3));
 const endMinutes=Number(row.end.slice(0,2))*60+Number(row.end.slice(3));
 if(startMinutes<18*60||endMinutes<=startMinutes||
    endMinutes-startMinutes>360||endMinutes-startMinutes<30)return null;
 const day=Date.parse(row.date+'T00:00:00Z')-PHT_OFFSET_MS;
 return {ownerId:row.ownerId,start:day+startMinutes*MINUTE_MS,
  end:day+endMinutes*MINUTE_MS};
}
function unionMinutes(intervals){
 if(!intervals.length)return 0;
 intervals.sort((a,b)=>a.start-b.start);
 let start=intervals[0].start,end=intervals[0].end,total=0;
 for(const interval of intervals.slice(1)){
  if(interval.start>end){total+=end-start;start=interval.start;end=interval.end;}
  else end=Math.max(end,interval.end);
 }
 return Math.floor((total+end-start)/MINUTE_MS);
}
export function reconcileTimeTrackerAccounting({
 records=[],otRequests=[],otContractActive=false
}={}){
 if(!Array.isArray(records)||!Array.isArray(otRequests))
  throw new TypeError('Authorized accounting inputs must be arrays');
 const completed=records.filter(row=>row?.status==='Completed'&&
  validTime(row.clockIn)&&validTime(row.clockOut)&&
  Date.parse(row.clockOut)>Date.parse(row.clockIn));
 const creditedMs=completed.reduce((sum,row)=>
  sum+(Number.isFinite(row.creditedMs)&&row.creditedMs>=0?row.creditedMs:0),0);
 if(!otContractActive)
  return Object.freeze({status:'OT_CONTRACT_UNAVAILABLE',completed:completed.length,
   creditedMs,matchedSessions:0,approvedOverlapMinutes:0,
   evaluatedApprovedRequests:0});
 const approved=otRequests.map(otInterval).filter(Boolean);
 let matchedSessions=0;
 const overlaps=[];
 for(const row of completed){
  const begin=Date.parse(row.clockIn),finish=Date.parse(row.clockOut);
  const ownerId=row.ownerId;
  if(!ownerId||!timeTrackerManilaDay(row.clockIn))continue;
  const matching=approved.filter(ot=>ot.ownerId===ownerId&&
   Math.max(begin,ot.start)<Math.min(finish,ot.end));
  if(matching.length)matchedSessions++;
  for(const ot of matching)overlaps.push({ownerId,start:Math.max(begin,ot.start),
   end:Math.min(finish,ot.end)});
 }
 // Combine per employee to avoid counting overlapping approved requests twice.
 const byOwner=new Map();
 for(const row of overlaps){
  const entries=byOwner.get(row.ownerId)||[];
  entries.push(row);byOwner.set(row.ownerId,entries);
 }
 const approvedOverlapMinutes=[...byOwner.values()]
  .reduce((sum,intervals)=>sum+unionMinutes(intervals),0);
 return Object.freeze({status:'SIGNED_READ_ONLY',completed:completed.length,
  creditedMs,matchedSessions,approvedOverlapMinutes,
  evaluatedApprovedRequests:approved.length});
}
