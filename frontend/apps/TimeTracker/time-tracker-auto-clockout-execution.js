import {recordTimeTrackerGpsDiagnostic} from '../../time-tracker-gps-diagnostics.js';
/**
 * Complete one persisted automatic clock-out when the TimeTracker module is
 * foregrounded. All state and services are injected to keep this workflow testable.
 */
export async function runPendingTimeTrackerAutoClockout({
 state,seq,getRouteSerial,identity,workspaceId,boardId,auth,navigator,
 captureAttendanceGeo,timeTracker,render,formatTimeTrackerAutoClockoutTime,errorMessage
}={}){
 const pending=state?.ttAttendance?.autoClockout;
 if(!pending||pending.status!=='PENDING_GPS'||!pending.recordId||
    state.ttAutoClockoutBusy||state.ttBusy||state.ttClockPending||
    state.view!=='board'||state.tab!=='attendance'||state.boardId!==boardId||
    state.context?.user_id!==identity||state.context?.workspace_id!==workspaceId||
    state.ttAttendance?.active?.id!==pending.recordId)return;
 // Clock-only reads omit OT and other secondary-view data.
 const readAttendance=()=>timeTracker.snapshot(boardId,{clockOnly:state.ttView==='clock'});
 const attempt=++state.ttAutoClockoutRunId;
 const sameSession=()=>attempt===state.ttAutoClockoutRunId&&seq===getRouteSerial()&&
  auth.isSignedIn&&state.view==='board'&&state.tab==='attendance'&&
  state.boardId===boardId&&state.context?.user_id===identity&&
  state.context?.workspace_id===workspaceId;
 state.ttAutoClockoutBusy=true;state.ttBusy=true;
 state.ttGeoPromptVisible=true;state.ttGeoPermission='unknown';
 state.ttGeoMessage='Automatic clock-out is pending. Acquiring a fresh device GPS fix…';
 state.ttClockStage='auto-location';state.ttError='';state.ttSuccess='';render();
 let commitAttempted=false,commitSucceeded=false;
 try{
  const geo=await captureAttendanceGeo(navigator.geolocation,{
   freshOnly:true,diagnosticContext:{action:'automatic-clock-out'},
   onProgress:message=>{
    if(!sameSession())return;
    state.ttGeoMessage=message;render();
   }
  });
  if(!sameSession()){
   recordTimeTrackerGpsDiagnostic({phase:'session-context-changed-after-gps',
    action:'automatic-clock-out'});
   return;
  }
  recordTimeTrackerGpsDiagnostic({phase:'gps-fix-ready',action:'automatic-clock-out',
   accuracyMeters:geo.accuracy,positionAgeMs:Math.max(0,Date.now()-Date.parse(geo.capturedAt))});
  state.ttGeoPermission='granted';
  state.ttGeoMessage='Fresh GPS captured. Completing the scheduled clock-out…';
  state.ttClockStage='auto-saving';render();
  recordTimeTrackerGpsDiagnostic({phase:'attendance-commit-start',action:'automatic-clock-out'});
  commitAttempted=true;
  const receipt=await timeTracker.completeAutomaticClockOut(boardId,{
   recordId:pending.recordId,geo
  });
  commitSucceeded=true;
  recordTimeTrackerGpsDiagnostic({phase:'attendance-commit-success',action:'automatic-clock-out',
   result:receipt.mode||'committed'});
  if(!sameSession()){
   recordTimeTrackerGpsDiagnostic({phase:'session-context-changed-after-commit',
    action:'automatic-clock-out'});
   return;
  }
  const snapshot=await readAttendance();
  recordTimeTrackerGpsDiagnostic({phase:'attendance-readback-success',
   action:'automatic-clock-out',result:snapshot?.status==='VERIFIED_READ'?'verified':'unverified'});
  if(!sameSession()){
   recordTimeTrackerGpsDiagnostic({phase:'session-context-changed-after-readback',
    action:'automatic-clock-out'});
   return;
  }
  state.ttAttendance=snapshot;
  const completed=snapshot.records.find(row=>row.id===pending.recordId);
  if(receipt.mode==='ALREADY_CLOSED'){
   state.ttSuccess=completed?.automatic===true?
    'Automatic Clock Out was already completed and confirmed in attendance history.':
    'This attendance session was closed manually before automatic completion. No duplicate clock-out was created.';
  }else{
   if(!completed||completed.status!=='Completed'||completed.automatic!==true||
      completed.clockOut!==receipt.scheduledClockOutAt)
    throw new Error('The completed attendance record did not match the scheduled automatic clock-out.');
   state.ttSuccess='Automatic Clock Out completed. Scheduled: '+
    formatTimeTrackerAutoClockoutTime(receipt.scheduledClockOutAt)+
    '. GPS captured: '+formatTimeTrackerAutoClockoutTime(receipt.gpsCapturedAt)+'.';
  }
  state.ttGeoPromptVisible=false;state.ttGeoMessage='';
  state.ttError='';
 }catch(error){
  recordTimeTrackerGpsDiagnostic({phase:commitSucceeded?'attendance-readback-failed':
   commitAttempted?'attendance-commit-failed':'attendance-action-failed',
   action:'automatic-clock-out',errorCode:typeof error?.code==='string'?error.code:undefined,
   httpStatus:error?.status});
  if(!sameSession())return;
  if(commitAttempted){
   try{
    const latest=await readAttendance();
    if(!sameSession())return;
    state.ttAttendance=latest;
    const reconciled=latest.records.find(row=>row.id===pending.recordId);
    if(reconciled?.status==='Completed'){
     state.ttSuccess=reconciled.automatic===true?
      'Automatic Clock Out was committed and verified from the signed attendance record.':
      'This attendance session was closed manually before automatic completion. No duplicate clock-out was created.';
     state.ttGeoPromptVisible=false;state.ttGeoMessage='';state.ttError='';
     return;
    }
    if(!reconciled){
     state.ttError='Automatic clock-out outcome could not be reconciled. Reopen TimeTracker to verify the saved session.';
     state.ttGeoMessage='The signed attendance read-back did not include the pending record.';
     state.ttSuccess='';
     return;
    }
   }catch{
    if(!sameSession())return;
    state.ttError='Automatic clock-out outcome is uncertain. The next TimeTracker visit will reconcile the saved session before another attempt.';
    state.ttGeoMessage='The server response could not be verified. The attendance record has not been assumed complete.';
    state.ttSuccess='';
    return;
   }
  }
  if(error?.code==='TT_GEO_DENIED'){
   state.ttGeoPermission='denied';
   state.ttGeoMessage='Location permission is blocked. Allow Location for this site and reopen TimeTracker to retry.';
  }else if(error?.code==='TT_GEO_UNAVAILABLE'||error?.code==='TT_GEO_TIMEOUT'){
   state.ttGeoPermission='unavailable';
   state.ttGeoMessage='A fresh GPS fix was unavailable. Check device Location Services and signal, then reopen TimeTracker to retry.';
  }else{
   state.ttGeoMessage='Automatic clock-out remains pending. '+errorMessage(error);
  }
  state.ttError='Automatic clock-out remains pending. No clock-out was confirmed; reopen TimeTracker after resolving the issue.';
  state.ttSuccess='';
 }finally{
  if(attempt===state.ttAutoClockoutRunId){
   state.ttAutoClockoutBusy=false;state.ttBusy=false;
   state.ttClockStage='idle';render();
  }
 }
}
