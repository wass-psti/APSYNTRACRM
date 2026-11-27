import {projectTimeTrackerLog} from './time-tracker-history.js';
import {projectTimeTrackerOtRows} from './time-tracker-overtime.js';
import {TT_LOCATIONS,creditedAttendanceMs,completedLogWorkDurationMs,manilaClockMinutes} from './time-tracker-policy.js';

const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=()=>{throw Error('Shared TimeTracker read snapshot identity or schema mismatch');};

/** The dedicated RPC is a read scope, not a role or write capability. */
export function projectTimeTrackerSharedRead(raw,access){
 if(raw?.contract!=='tt-shared-read-1'||!uuid.test(access?.userId||'')||
    raw.actorId!==access.userId||raw.workspaceId!==access.workspaceId||
    raw.boardId!==access.boardId||!Array.isArray(raw.directory)||
    !Array.isArray(raw.ojtRecords)||raw.ojtRecords.length>25000||
    !Array.isArray(raw.otRows))fail();
 const standard=projectTimeTrackerLog({
  value:raw.attendance,directory:raw.directory,userId:access.userId,
  moduleRole:access.moduleRole,signedTeamRead:true
 });
 const ids=new Set();
 const interns=raw.ojtRecords.map(r=>{
  if(!uuid.test(r?.id||'')||!uuid.test(r?.internId||'')||ids.has(r.id)||
     typeof r.name!=='string'||!validTime(r.clockIn)||
     (r.clockOut!==null&&(!validTime(r.clockOut)||Date.parse(r.clockOut)<Date.parse(r.clockIn))))fail();
  ids.add(r.id);
  return Object.freeze({
   id:'ojt:'+r.id,ownerId:'ojt:'+r.internId,name:r.name.slice(0,100),
   clockIn:r.clockIn,clockOut:r.clockOut,department:'OJT',
   location:TT_LOCATIONS.includes(r.location)?r.location:'Unspecified',
   workNote:typeof r.workNote==='string'?r.workNote.slice(0,500):'',
   status:r.clockOut?'Completed':'Active',
   classification:manilaClockMinutes(r.clockIn)>480?'Late':'On time',
   creditedMs:r.clockOut?creditedAttendanceMs(r.clockIn,r.clockOut):null,
   workDurationMs:r.clockOut?completedLogWorkDurationMs(r.clockIn,r.clockOut):null,
   isOjt:true
  });
 });
 const members=new Set(raw.directory.filter(r=>r?.status==='active').map(r=>'cloud:'+r.id));
 const otRows=projectTimeTrackerOtRows(raw.otRows.map(r=>({
  ...r,canReviewOt:false,canReviewDuration:false,canWithdraw:false,
  submittedBy:null,submittedByName:null,decidedBy:null
 }))).filter(r=>r.ownerId!=='cloud:'+access.userId&&members.has(r.ownerId)&&
    ['Submitted','Approved','Rejected'].includes(r.status));
 return Object.freeze({log:Object.freeze({scope:standard.scope,
  rows:Object.freeze([...standard.rows,...interns].sort((a,b)=>Date.parse(b.clockIn)-Date.parse(a.clockIn)))}),
  otRows:Object.freeze(otRows)});
}

/** Existing signed personal/administrator snapshot wins on every duplicate ID.
 * Peer display records must never become actionable, even on a malformed response.
 */
export function mergeTimeTrackerSharedOt(existing=[],peers=[]){
 const rows=new Map(existing.map(r=>[r.id,r]));
 for(const row of peers){
  if(!rows.has(row.id))rows.set(row.id,Object.freeze({
   ...row,canReviewOt:false,canReviewDuration:false,canWithdraw:false,canDeleteOt:false,canCancelOt:false
  }));
 }
 return [...rows.values()];
}
