const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const nonNegativeInteger=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0;

export const TT_LOG_PAGE_SIZE=50;

function invalid(message){
 throw new Error('TimeTracker Log page '+message);
}

/** Validate the signed, bounded page before it enters application state. */
export function validateTimeTrackerLogPage(payload,{
 access,boardId,pageSize=TT_LOG_PAGE_SIZE,sort='newest',summaryFallback=null
}={}){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    payload.mode!=='ACTIVE'||payload.contract!=='tt-attendance-log-page-1'||
    payload.actorId!==access?.userId||payload.workspaceId!==access?.workspaceId||
    payload.boardId!==boardId||!nonNegativeInteger(payload.sourceRevision)||
    !nonNegativeInteger(payload.ojtRevision))
  invalid('identity, contract or source revision is invalid');

 const team=['System Admin','IT Administrator','HR'].includes(access.moduleRole);
 const expectedScope=team?'AUTHORIZED_WORKSPACE_TEAM':'OWN_ATTENDANCE_ONLY';
 if(payload.scope!==expectedScope)invalid('visibility scope does not match the signed role');
 if(!Array.isArray(payload.records)||payload.records.length>pageSize||
    payload.pageSize!==pageSize||typeof payload.hasMore!=='boolean')
  invalid('record count or pagination metadata is invalid');

 const ids=new Set();
 const rows=payload.records.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||
     typeof row.id!=='string'||!row.id||ids.has(row.id)||
     !validTime(row.clockIn)||
     (row.clockOut!==null&&!validTime(row.clockOut))||
     (row.clockOut&&Date.parse(row.clockOut)<Date.parse(row.clockIn))||
     !['Active','Completed'].includes(row.status)||
     !['On time','Late','Administrative closure'].includes(row.classification)||
     typeof row.name!=='string'||!row.name||
     typeof row.department!=='string'||typeof row.location!=='string'||
     typeof row.ownerId!=='string'||
     (row.workNote!==null&&row.workNote!==undefined&&typeof row.workNote!=='string')||
     (row.creditedMs!==null&&!nonNegativeInteger(row.creditedMs))||
     typeof row.isOjt!=='boolean'||
     ![0,1].includes(row.sourceRank)||
     !uuid.test(row.recordId||'')||
     row.isOjt!==(row.sourceRank===1)||
     (row.isOjt?(!row.id.startsWith('ojt:')||!row.ownerId.startsWith('ojt:')):
       (!uuid.test(row.id)||!row.ownerId.startsWith('cloud:')))||
     (row.status==='Active')!==(row.clockOut===null)||
     'geo' in row||'latitude' in row||'longitude' in row)
   invalid('contains an invalid or duplicate attendance record');
  ids.add(row.id);
  return Object.freeze({...row});
 });

 for(let index=1;index<rows.length;index++){
  const previous=rows[index-1],current=rows[index];
  const timeDifference=Date.parse(previous.clockIn)-Date.parse(current.clockIn);
  const tieDifference=previous.sourceRank-current.sourceRank;
  const idDifference=previous.recordId.localeCompare(current.recordId);
  const outOfOrder=sort==='oldest'?
   (timeDifference>0||(timeDifference===0&&
    (tieDifference>0||(tieDifference===0&&idDifference>0)))):
   (timeDifference<0||(timeDifference===0&&
    (tieDifference<0||(tieDifference===0&&idDifference<0))));
  if(outOfOrder)invalid('records are not in stable chronological order');
 }

 const summary=payload.summary??summaryFallback;
 const summaryKeys=['sessions','people','today','historical','completed','active','late',
  'creditedMs','todayOnTime','todayLate','todayActive','todayStagnant',
  'todayOffice','todayCompleted','todayCreditedMs'];
 if(!summary||typeof summary!=='object'||summaryKeys.some(key=>
   !nonNegativeInteger(summary[key])))invalid('aggregate summary is invalid');
 if(!Array.isArray(summary.locationCounts)||summary.locationCounts.length>8||
    summary.locationCounts.some(item=>!item||typeof item.location!=='string'||
     !nonNegativeInteger(item.count)))invalid('location aggregates are invalid');

 let nextCursor=null;
 if(payload.hasMore){
  const cursor=payload.nextCursor;
  if(!cursor||typeof cursor!=='object'||!validTime(cursor.clockIn)||
     ![0,1].includes(cursor.sourceRank)||!uuid.test(cursor.recordId||'')||
     cursor.sourceRevision!==payload.sourceRevision||
     cursor.ojtRevision!==payload.ojtRevision||!rows.length)
   invalid('next cursor is invalid');
  const last=rows.at(-1);
  if(cursor.clockIn!==last.clockIn||cursor.sourceRank!==last.sourceRank||
     cursor.recordId!==last.recordId)invalid('next cursor does not match the final row');
  nextCursor=Object.freeze({...cursor});
 }else if(payload.nextCursor!==null&&payload.nextCursor!==undefined){
  invalid('unexpected cursor after the final page');
 }

 return Object.freeze({
  scope:payload.scope,records:Object.freeze(rows),
  hasMore:payload.hasMore,nextCursor,
  pageSize,summary:Object.freeze({...summary,
   locationCounts:Object.freeze(summary.locationCounts.map(item=>Object.freeze({...item})))
  })
 });
}

/** Append one server page without replacing or duplicating earlier records. */
export function mergeTimeTrackerLogPages(existing=[],incoming=[]){
 const rows=Array.isArray(existing)?existing:[];
 const next=Array.isArray(incoming)?incoming:[];
 const merged=new Map();
 for(const row of rows)if(row&&typeof row.id==='string')merged.set(row.id,row);
 for(const row of next)if(row&&typeof row.id==='string'&&!merged.has(row.id))
  merged.set(row.id,row);
 return [...merged.values()];
}
