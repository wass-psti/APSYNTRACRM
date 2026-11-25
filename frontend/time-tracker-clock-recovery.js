/** Read-only attendance reconciliation. No persistence, privileged reads, or retries.
 * The caller must supply a fresh signed TimeTracker snapshot.
 */
const safeTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

export function clockOutSnapshotOutcome(snapshot,{recordId,userId,workspaceId,boardId}={}){
 if(!recordId||!userId||!workspaceId||!boardId||
    snapshot?.status!=='VERIFIED_READ'||snapshot.access?.userId!==userId||
    snapshot.access?.workspaceId!==workspaceId||snapshot.access?.boardId!==boardId||
    !Array.isArray(snapshot.records))return 'UNVERIFIED';
 const matches=snapshot.records.filter(row=>row?.id===recordId);
 if(matches.length!==1)return 'UNVERIFIED';
 const row=matches[0];
 if(row.status==='Completed'&&safeTime(row.clockOut)&&
    snapshot.active?.id!==recordId)return 'CONFIRMED';
 if(row.status==='Active'&&row.clockOut===null&&snapshot.active?.id===recordId)
  return 'STILL_ACTIVE';
 return 'UNVERIFIED';
}

/** Resolve a Clock-In whose HTTP response was lost using a new signed read. */
export function clockInSnapshotOutcome(snapshot,{
 recordId=null,userId,workspaceId,boardId,baselineRevision,
 previousRecordIds=[],location,department
}={}){
 if(!userId||!workspaceId||!boardId||
    snapshot?.status!=='VERIFIED_READ'||snapshot.access?.userId!==userId||
    snapshot.access?.workspaceId!==workspaceId||snapshot.access?.boardId!==boardId||
    !Array.isArray(snapshot.records)||!Number.isSafeInteger(Number(baselineRevision)))
  return 'UNVERIFIED';
 const baseline=Number(baselineRevision),revision=Number(snapshot.revision);
 if(!Number.isSafeInteger(revision)||revision<baseline)return 'UNVERIFIED';
 const previous=new Set(Array.isArray(previousRecordIds)?previousRecordIds:[]);
 // Compare record identity first. A new record with unexpected details is
 // ambiguous; it must not be mistaken for a Clock-In that never committed.
 const newRecords=snapshot.records.filter(row=>row&&typeof row.id==='string'&&
  !previous.has(row.id)&&(!recordId||row.id===recordId));
 if(newRecords.length===0){
  // A receipt already supplies the committed record identity. Missing that
  // exact record is a readback conflict, not proof that the write never ran.
  if(recordId!==null)return 'UNVERIFIED';
  // The revision belongs to the shared workspace document and may advance
  // because another employee changed attendance. No new actor record plus an
  // explicit null active session is sufficient to resolve this Clock-In.
  return snapshot.active===null?'NOT_COMMITTED':'UNVERIFIED';
 }
 if(newRecords.length!==1||revision<=baseline)return 'UNVERIFIED';
 const row=newRecords[0];
 if(row.location!==location||row.department!==department||!safeTime(row.clockIn))
  return 'UNVERIFIED';
 if(row.status==='Active'&&row.clockOut===null&&snapshot.active?.id===row.id)
  return 'CONFIRMED';
 if(row.status==='Completed'&&safeTime(row.clockOut)&&snapshot.active?.id!==row.id)
  return 'CONFIRMED';
 return 'UNVERIFIED';
}

export function attendanceSnapshotOutcome(snapshot,pending){
 return pending?.action==='clock-in'?
  clockInSnapshotOutcome(snapshot,pending):clockOutSnapshotOutcome(snapshot,pending);
}

export function attendanceAuthFailure(err){
 const status=Number(err?.status)||0,code=String(err?.code||'');
 return status===401||status===403||code==='42501'||
  /session (?:expired|revoked)|authentication required|access denied|authorization denied/i
   .test(String(err?.message||''));
}

export function attendanceClockError(err,{commitAttempted=false,action='clock-out'}={}){
 const label=action==='clock-in'?'Clock-in':'Clock-out';
 const verb=action==='clock-in'?'clock-in':'clock-out';
 if(attendanceAuthFailure(err))return 'Your signed attendance permission is no longer valid. Sign in again and refresh TimeTracker.';
 if(err?.code==='TT_GEO_DENIED')return 'Location permission was denied. Enable Location Services and browser location access, then try again. No '+verb+' request was sent.';
 if(err?.code==='TT_GEO_UNAVAILABLE')return 'A current GPS location could not be obtained. Check device location services and network connectivity, then try again. No '+verb+' request was sent.';
 if(err?.code==='TT_GEO_TIMEOUT')return 'GPS acquisition timed out. Turn on device location and Wi-Fi, then retry near a window or outdoors. No '+verb+' request was sent.';
 if(err?.code==='TT_GEO_INSECURE')return 'Browser GPS requires HTTPS. Open APSYNTRA CRM over HTTPS and retry. No '+verb+' request was sent.';
 return commitAttempted?
  label+' confirmation is uncertain. Verify the signed attendance state before trying again.':
  label+' could not start. Refresh your signed attendance session before retrying.';
}
