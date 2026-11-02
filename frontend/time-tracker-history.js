/** Read-only historical Log projection for the authorized central TimeTracker board.
 * Only trust central signed workspace/module/board access established by native client.
 * A broad module role cannot elevate another role or reveal raw GPS/audit payloads.
 */
import {TT_LOCATIONS,creditedAttendanceMs,manilaClockMinutes} from './time-tracker-policy.js';
import {TT_TEAM_OVERVIEW_ROLES} from './time-tracker-overview.js';

const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const isTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const deny=message=>{throw new Error(message);};
const text=(value,limit)=>String(value??'').slice(0,limit);

/** Project all dates, not just the current day's Overview.
 * Nonmanagement users retain self-only history, even if the API returns broader data.
 * Personnel absent from the authorized active directory are excluded, not guessed.
 */
export function projectTimeTrackerLog({value,directory=[],userId,moduleRole}={}){
 if(typeof userId!=='string'||!userId||!Array.isArray(directory)||
    directory.length>10000)
  deny('Signed TimeTracker Log context is invalid');
 const team=TT_TEAM_OVERVIEW_ROLES.includes(moduleRole);
 const members=new Map();
 for(const member of directory){
  if(!isObject(member)||typeof member.id!=='string'||!member.id||
     member.status!=='active'||(!team&&member.id!==userId))continue;
  members.set('cloud:'+member.id,{
   name:text(member.display_name||'Workforce member',100)
  });
 }
 if(!members.has('cloud:'+userId))
  deny('Signed TimeTracker member is absent from authorized directory');
 let state;
 try{state=typeof value==='string'?JSON.parse(value):value;}
 catch{deny('Attendance Log state is malformed');}
 if(!isObject(state)||state.version!==1||!Array.isArray(state.records)||
    state.records.length>25000)
  deny('Attendance Log schema is invalid');
 const rows=[];
 for(const record of state.records){
  if(!isObject(record)||typeof record.id!=='string'||!record.id||
     record.id.length>150||!members.has(record.ownerId)||
     !isObject(record.clockIn)||!isTime(record.clockIn.timestamp))continue;
  const inTime=record.clockIn.timestamp;
  const outTime=isObject(record.clockOut)&&isTime(record.clockOut.timestamp)?
   record.clockOut.timestamp:null;
  if(outTime&&Date.parse(outTime)<Date.parse(inTime))continue;
  const invalidOut=Boolean(record.clockOut)&&!outTime;
  const closed=record.clockOut?.status==='administratively_closed'||
    record.reconciliation?.type==='legacy_duplicate_session';
  const classification=closed?'Administrative closure':
   manilaClockMinutes(inTime)>480?'Late':'On time';
  const status=outTime?'Completed':invalidOut?'Unknown':'Active';
  const location=TT_LOCATIONS.includes(record.clockIn.location)?
   record.clockIn.location:'Unspecified';
  rows.push(Object.freeze({
   id:record.id,name:members.get(record.ownerId).name,
   clockIn:inTime,clockOut:outTime,
   department:text(record.clockIn.department||'Unassigned',80),
   location,status,classification,
   creditedMs:outTime?creditedAttendanceMs(inTime,outTime):null
  }));
 }
 rows.sort((a,b)=>Date.parse(b.clockIn)-Date.parse(a.clockIn));
 return Object.freeze({
  scope:team?'AUTHORIZED_WORKSPACE_TEAM':'OWN_ATTENDANCE_ONLY',
  rows:Object.freeze(rows)
 });
}
