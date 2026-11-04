/** Read-only clock-out reconciliation. No persistence, privileged reads, or retries.
 * The caller must supply a fresh signed TimeTracker snapshot.
 */
export function clockOutSnapshotOutcome(snapshot,{recordId,userId,workspaceId,boardId}={}){
 if(!recordId||!userId||!workspaceId||!boardId||
    snapshot?.status!=='VERIFIED_READ'||snapshot.access?.userId!==userId||
    snapshot.access?.workspaceId!==workspaceId||snapshot.access?.boardId!==boardId||
    !Array.isArray(snapshot.records))return 'UNVERIFIED';
 const matches=snapshot.records.filter(row=>row?.id===recordId);
 if(matches.length!==1)return 'UNVERIFIED';
 const row=matches[0];
 if(row.status==='Completed'&&typeof row.clockOut==='string'&&
    Number.isFinite(Date.parse(row.clockOut))&&
    snapshot.active?.id!==recordId)return 'CONFIRMED';
 if(row.status==='Active'&&row.clockOut===null&&snapshot.active?.id===recordId)
  return 'STILL_ACTIVE';
 return 'UNVERIFIED';
}
export function attendanceAuthFailure(err){
 const status=Number(err?.status)||0,code=String(err?.code||'');
 return status===401||status===403||code==='42501'||
  /session (?:expired|revoked)|authentication required|access denied|authorization denied/i
   .test(String(err?.message||''));
}
export function attendanceClockError(err,{commitAttempted=false}={}){
 if(attendanceAuthFailure(err))return 'Your signed attendance permission is no longer valid. Sign in again and refresh TimeTracker.';
 if(err?.code==='TT_GEO_DENIED')return 'Location permission was denied. Enable Location Services and browser location access, then try again. No clock-out request was sent.';
 if(err?.code==='TT_GEO_UNAVAILABLE')return 'A current GPS location could not be obtained. Check device location services and network connectivity, then try again. No clock-out request was sent.';
 return commitAttempted?
  'Clock-out confirmation is uncertain. Verify the signed attendance state before trying again.':
  'Clock-out could not start. Refresh your signed attendance session before retrying.';
}
