/** B4.1 genuine signed-user recovery preflight. Read-only.
 * No privileged calls or creation, deletion, restoration, or activation writes.
 */
import {inspectB2SignedQaFixture} from './board-col-delete-b2-signed-fixture.js';
import {B4_QA_BOARD_ID,B4_QA_EXPIRES_AT} from './board-column-recovery.js';

const validStates=new Set(['PASS','BLOCKED','PENDING']);
const validReasons=new Set(['NONE','SIGNED_SESSION_UNAVAILABLE','QA_FIXTURE_NOT_VERIFIED',
 'RECOVERY_WINDOW_EXPIRED','SIGNED_RECOVERY_INDEX_DENIED','EXISTING_RECOVERY_SNAPSHOT',
 'SIGNED_SESSION_CHANGED']);
const validStages=new Set(['prerequisites','scope-window','signed-fixture',
 'signed-index','signed-readback','completed']);
const safe=(x,set,fallback)=>set.has(x)?x:fallback;
const report=(status,stage,reason)=>Object.freeze({
 checkpoint:'CP-BOARD-COL-DELETE-B4-1',
 status,stage,reason,expectedCells:4,readOnly:true,
 activationChanged:false,recoveryWritesAttempted:0,boardIdentifierDisclosed:false
});

/** Proves recovery RPC authorization with the actual GoTrue user session. */
export async function runB4SignedRecoveryPreflight({auth,api,now=Date.now()}={}){
 if(typeof auth?.getVerifiedUser!=='function'||
    typeof api?.boards!=='function'||typeof api?.board!=='function'||
    typeof api?.allowed!=='function'||typeof api?.rpc!=='function'||
    typeof api?.context!=='function')
  return report('BLOCKED','prerequisites','SIGNED_SESSION_UNAVAILABLE');
 if(!Number.isFinite(now)||now>=B4_QA_EXPIRES_AT)
  return report('BLOCKED','scope-window','RECOVERY_WINDOW_EXPIRED');
 try{
  const fixture=await inspectB2SignedQaFixture({auth,api});
  if(fixture.status!=='PASS'||fixture.boardId!==B4_QA_BOARD_ID||
     fixture.completedCells!==4)
   return report('BLOCKED','signed-fixture','QA_FIXTURE_NOT_VERIFIED');
  const index=await api.rpc('wm_list_recoverable_board_columns',{
   p_board_id:B4_QA_BOARD_ID
  });
  if(!Array.isArray(index))
   return report('BLOCKED','signed-index','SIGNED_RECOVERY_INDEX_DENIED');
  if(index.length!==0)
   return report('PENDING','signed-index','EXISTING_RECOVERY_SNAPSHOT');
  const finalFixture=await inspectB2SignedQaFixture({auth,api});
  if(finalFixture.status!=='PASS'||finalFixture.boardId!==B4_QA_BOARD_ID)
   return report('BLOCKED','signed-readback','SIGNED_SESSION_CHANGED');
  return report('PASS','completed','NONE');
 }catch{
  return report('BLOCKED','signed-index','SIGNED_RECOVERY_INDEX_DENIED');
 }
}
export function sanitizeB4SignedRecoveryReport(value){
 return JSON.stringify({
  checkpoint:'CP-BOARD-COL-DELETE-B4-1',
  status:safe(value?.status,validStates,'BLOCKED'),
  stage:safe(value?.stage,validStages,'prerequisites'),
  reason:safe(value?.reason,validReasons,'SIGNED_SESSION_UNAVAILABLE'),
  expectedCells:4,readOnly:true,
  activationChanged:false,recoveryWritesAttempted:0,
  boardIdentifierDisclosed:false,
  acceptanceBoundary:'SIGNED_RECOVERY_INDEX_READ_ONLY_NOT_DELETION_OR_RESTORATION'
 },null,2);
}
export function renderB4SignedRecoveryPreflight({busy=false,report:result=null}={}){
 const status=result?'<p><strong>Signed B4 recovery preflight: '+
  safe(result.status,validStates,'BLOCKED')+'</strong> · '+
  safe(result.reason,validReasons,'SIGNED_SESSION_UNAVAILABLE')+'</p>':'';
 return '<section class="panel" aria-label="B4 signed recovery preflight">'+
  '<h3>Board recovery B4.1 — signed access preflight</h3>'+
  '<p class="muted">Uses your active signed session to read the approved QA fixture and recovery index. '+
  'No column is deleted, restored or activated by this check.</p>'+
  '<button type="button" data-action="security-b4-qa-preflight"'+
  (busy?' disabled':'')+'>Verify signed B4 recovery access</button> '+
  (result?'<button type="button" data-action="security-b4-qa-copy"'+
   (busy?' disabled':'')+'>Copy nonsecret B4 report</button>':'')+
  status+'</section>';
}
