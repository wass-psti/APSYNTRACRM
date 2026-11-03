/** CP-BOARD-MENU01 / CP-TT-GPS01 genuine signed-user read-only integration.
 * Uses the caller's current GoTrue bearer. No mutation RPC, credential export,
 * employee GPS disclosure or synthetic JWT impersonation.
 */
import {isProtectedBoard} from './board-card-lifecycle.js';
import {loadTimeTrackerBoardGps} from './time-tracker-board-projection.js';
import {validUuid} from './data.js';

const entry=(id,status,detail)=>Object.freeze({id,status,detail});
const finish=checks=>Object.freeze({
 checkpoint:'CP-BOARD-MENU01 / CP-TT-GPS01',
 status:checks.some(c=>c.status==='FAIL')?'FAIL':
  checks.some(c=>c.status==='BLOCKED')?'BLOCKED':'PASS',
 checks:Object.freeze(checks)
});
const denied=error=>error?.status===401||error?.status===403||
 error?.code==='42501';
const identityValid=(user,ctx)=>validUuid(user?.id)&&validUuid(ctx?.workspace_id)&&
 ctx?.user_id===user.id&&ctx?.profile?.status==='active';

export async function runBoardTtSignedReadOnly({auth,api,timeTracker,isBootstrap=false}){
 const checks=[];
 if(typeof auth?.getVerifiedUser!=='function'||typeof api?.context!=='function'||
  typeof api?.boards!=='function'||typeof api?.allowed!=='function'||
  typeof api?.rpc!=='function'||typeof timeTracker?.snapshot!=='function'){
  return finish([entry('session','BLOCKED','The signed backend test clients are unavailable.')]);
 }
 let user,ctx;
 try{
  user=await auth.getVerifiedUser();
  ctx=await api.context();
 }catch{
  return finish([entry('session','BLOCKED','A current, server-verified user and workspace are required.')]);
 }
 if(!identityValid(user,ctx))
  return finish([entry('session','FAIL','Signed identity and workspace did not match.')]);
 checks.push(entry('session','PASS','GoTrue verified the current user and active workspace.'));

 let boards=[];
 try{
  boards=await api.boards('active');
  if(!Array.isArray(boards))throw Error('Not an array');
 }catch{
  checks.push(entry('board-list','BLOCKED','The authenticated board list could not be read.'));
  return finish(checks);
 }
 checks.push(entry('board-list','PASS','Active board list returned within the signed workspace.'));

 const ordinary=boards.find(board=>validUuid(board?.id)&&!isProtectedBoard(board));
 if(!ordinary)checks.push(entry('board-manage','BLOCKED',
  'No ordinary active board is visible for the manager-capability probe.'));
 else{
  try{
   const allowed=await api.allowed(ordinary.id,'manage');
   checks.push(entry('board-manage',typeof allowed==='boolean'?'PASS':'FAIL',
    typeof allowed==='boolean'?
     'Authoritative manager capability returned '+(allowed?'allowed':'denied')+
      ' without attempting an edit or deletion.':
     'The board manager capability did not return a boolean.'));
  }catch{
   checks.push(entry('board-manage','BLOCKED',
    'The signed board manager capability could not be checked.'));
  }
 }
 const protectedCount=boards.filter(board=>isProtectedBoard(board)).length;
 checks.push(entry('protected-boards',protectedCount>0?'PASS':'BLOCKED',
  protectedCount>0?
    'Application-managed board protections are present; no lifecycle mutations were attempted.':
    'No protected application board was present in the accessible board list.'));

 const board=boards.find(board=>board?.name==='TimeTracker Attendance'&&validUuid(board?.id));
 if(!board)checks.push(entry('private-gps','BLOCKED',
  'TimeTracker Attendance is unavailable to this signed workspace.'));
 else {
  let role=null;
  try{
   const snap=await timeTracker.snapshot(board.id);
   if(snap?.status==='VERIFIED_READ')role=snap?.access?.moduleRole??null;
  }catch{
   // Ineligible users may be denied even a personal attendance snapshot.
  }
  const eligible=isBootstrap===true||role==='Supervisor';
  if(eligible){
   try{
    const response=await loadTimeTrackerBoardGps({
     auth,api,boardId:board.id,workspaceId:ctx.workspace_id,enabled:true
    });
    checks.push(entry('private-gps',response.status==='VERIFIED_READ'?'PASS':'FAIL',
     response.status==='VERIFIED_READ'?
      'Signed restricted GPS read succeeded for the effective privileged role; no location values were reported.':
      'The restricted GPS response was not verified.'));
   }catch{
    checks.push(entry('private-gps','FAIL',
     'An eligible signed bootstrap/Supervisor could not verify the restricted GPS read.'));
   }
  }else{
   try{
    // Read-only negative case; never inspect or render any returned GPS data.
    await api.rpc('timetracker_board_private_snapshot',{
     p_board_id:board.id,p_limit:1
    });
    checks.push(entry('private-gps','FAIL',
     'A nonprivileged TimeTracker user unexpectedly obtained a GPS response.'));
   }catch(error){
    checks.push(entry('private-gps',denied(error)?'PASS':'BLOCKED',
     denied(error)?
      'Restricted GPS endpoint denied the nonprivileged signed user.':
      'Network or backend error prevented a conclusive negative GPS check.'));
   }
  }
 }
 try{
  const [after,afterCtx]=await Promise.all([
    auth.getVerifiedUser(),api.context()
  ]);
  checks.push(entry('session-stability',
   identityValid(after,afterCtx)&&after.id===user.id&&
    afterCtx.workspace_id===ctx.workspace_id?'PASS':'FAIL',
   'User identity and active workspace were rechecked after all read-only requests.'));
 }catch{
  checks.push(entry('session-stability','BLOCKED',
   'Session could not be revalidated at the end of the probe.'));
 }
 return finish(checks);
}
