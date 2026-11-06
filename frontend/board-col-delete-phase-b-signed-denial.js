/** CP-BOARD-COL-DELETE Phase B — non-mutating genuine-session denial probe.
 * B5 flags are already off. This probe NEVER enables recovery or changes auth.
 * Results certify only the case directly exercised with the current signed user.
 */
import {validUuid} from './data.js';
import {B4_QA_BOARD_ID} from './board-column-recovery.js';

const STATES=new Set(['PASS','BLOCKED','INCONCLUSIVE']);
const REASONS=new Set([
 'NONE','SIGNED_SESSION_UNAVAILABLE','SIGNED_IDENTITY_CHANGED',
 'MANAGER_ACCESS_UNCERTAIN','RECOVERY_UNEXPECTEDLY_ALLOWED',
 'RECOVERY_DENIAL_NOT_VERIFIED','UNAUTHORIZED_QA_BOARD_READ',
 'SIGNED_API_ERROR'
]);
const OUTCOMES=new Set(['PASS','PENDING','NOT_APPLICABLE']);
const safe=(v,set,otherwise)=>set.has(v)?v:otherwise;
const result=(status,reason,caseType='NONE',managerBoundary='PENDING',
  nonmemberRead='PENDING')=>Object.freeze({
 checkpoint:'CP-BOARD-COL-DELETE-PHASE-B-DENIAL',
 status,reason,caseType,managerBoundary,nonmemberRead,
 foreignWorkspace:'PENDING',revokedSession:'PENDING',expiredSession:'PENDING',
 readOnly:true,writeAttempts:0,activationChanged:false,identifiersDisclosed:false
});
const verifiedSession=async(auth,api,expected=null)=>{
 const user=await auth.getVerifiedUser();
 const context=await api.context();
 if(!validUuid(user?.id)||auth.userId!==user.id||
    context?.user_id!==user.id||!validUuid(context?.workspace_id)||
    context?.profile?.status!=='active')return null;
 if(expected&&(expected.user!==user.id||expected.workspace!==context.workspace_id))
  return null;
 return {user:user.id,workspace:context.workspace_id};
};
const recoveryDenied=(error,manager)=>{
 return String(error?.code)==='42501'&&Number(error?.status)===403&&
  String(error?.message).includes(manager
   ?'COL_RECOVERY_LIST_NOT_ACTIVATED'
   :'COL_RECOVERY_LIST_AUTHORIZATION_DENIED');
};
const boardReadDenied=error=>[403,404].includes(Number(error?.status))&&
  (String(error?.code)==='42501'||Number(error?.status)===404);

/** A real signed REST request, not a forged SQL auth.uid() or an impersonation. */
export async function runPhaseBSignedDenial({auth,api}={}){
 if(typeof auth?.getVerifiedUser!=='function'||typeof api?.context!=='function'||
    typeof api?.allowed!=='function'||typeof api?.board!=='function'||
    typeof api?.rpc!=='function')
  return result('BLOCKED','SIGNED_SESSION_UNAVAILABLE');
 let original;
 try{original=await verifiedSession(auth,api);}
 catch{return result('BLOCKED','SIGNED_SESSION_UNAVAILABLE');}
 if(!original)return result('BLOCKED','SIGNED_SESSION_UNAVAILABLE');
 let manage,view;
 try{
  manage=await api.allowed(B4_QA_BOARD_ID,'manage');
  view=await api.allowed(B4_QA_BOARD_ID,'view');
 }catch{return result('INCONCLUSIVE','MANAGER_ACCESS_UNCERTAIN');}
 if(typeof manage!=='boolean'||typeof view!=='boolean')
  return result('INCONCLUSIVE','MANAGER_ACCESS_UNCERTAIN');
 let readBoundary='NOT_APPLICABLE';
 if(!view){
  try{
   await api.board(B4_QA_BOARD_ID);
   return result('BLOCKED','UNAUTHORIZED_QA_BOARD_READ',
    'NONMEMBER',manage?'NOT_APPLICABLE':'PASS','PENDING');
  }catch(error){
   if(!boardReadDenied(error))
    return result('INCONCLUSIVE','SIGNED_API_ERROR','NONMEMBER',
     manage?'NOT_APPLICABLE':'PASS','PENDING');
   readBoundary='PASS';
  }
 }
 let denied=false,unexpected=false;
 try{
  await api.rpc('wm_list_recoverable_board_columns',{p_board_id:B4_QA_BOARD_ID});
  unexpected=true;
 }catch(error){denied=recoveryDenied(error,manage);}
 if(unexpected)return result('BLOCKED','RECOVERY_UNEXPECTEDLY_ALLOWED',
  manage?'SIGNED_MANAGER':'SIGNED_NONMANAGER',
  manage?'NOT_APPLICABLE':'PASS',readBoundary);
 if(!denied)return result('INCONCLUSIVE','RECOVERY_DENIAL_NOT_VERIFIED',
  manage?'SIGNED_MANAGER':'SIGNED_NONMANAGER',
  manage?'NOT_APPLICABLE':'PASS',readBoundary);
 try{
  if(!await verifiedSession(auth,api,original))
   return result('BLOCKED','SIGNED_IDENTITY_CHANGED');
 }catch{return result('BLOCKED','SIGNED_IDENTITY_CHANGED');}
 return result('PASS','NONE',manage?'SIGNED_MANAGER':'SIGNED_NONMANAGER',
  manage?'NOT_APPLICABLE':'PASS',readBoundary);
}
/** Whitelist only nonsecret results. Never return JWT, actor, workspace or board IDs. */
export function sanitizePhaseBDenialReport(value){
 return JSON.stringify({
  checkpoint:'CP-BOARD-COL-DELETE-PHASE-B-DENIAL',
  status:safe(value?.status,STATES,'BLOCKED'),
  reason:safe(value?.reason,REASONS,'SIGNED_SESSION_UNAVAILABLE'),
  caseType:safe(value?.caseType,new Set(['NONE','SIGNED_MANAGER','SIGNED_NONMANAGER','NONMEMBER']),'NONE'),
  managerBoundary:safe(value?.managerBoundary,OUTCOMES,'PENDING'),
  nonmemberRead:safe(value?.nonmemberRead,OUTCOMES,'PENDING'),
  foreignWorkspace:'PENDING',revokedSession:'PENDING',expiredSession:'PENDING',
  readOnly:true,writeAttempts:0,activationChanged:false,identifiersDisclosed:false,
  acceptanceBoundary:'CURRENT_SIGNED_USER_POST_B5_DENIAL_ONLY'
 },null,2);
}
export function renderPhaseBSignedDenial({busy=false,report:outcome=null}={}){
 const status=outcome?'<p><strong>Signed denial: '+
  safe(outcome.status,STATES,'BLOCKED')+'</strong> · '+
  safe(outcome.reason,REASONS,'SIGNED_SESSION_UNAVAILABLE')+'</p>':'';
 return '<section class="panel" aria-label="Column recovery signed denial acceptance">'+
  '<h3>Board recovery Phase B — signed denial acceptance</h3>'+
  '<p class="muted">After B5 deactivation, check recovery-index denial using this real signed session. '+
  'The current manager/non-manager case is tested; separate foreign-workspace, revoked-session '+
  'and expired-session cases remain pending unless genuinely exercised. No mutations or logouts.</p>'+
  '<button type="button" data-action="security-col-delete-denial-run"'+
  (busy?' disabled':'')+'>Verify signed recovery denial</button> '+
  (outcome?'<button type="button" data-action="security-col-delete-denial-copy"'+
   (busy?' disabled':'')+'>Copy nonsecret denial report</button>':'')+
  status+'</section>';
}
