/** Signed FRT domain lifecycle actions; never map decorative status labels to approvals. */
import {ApiError} from './session.js';
import {loadFRTRequestDetailReadOnly} from './frt-finance-workflow.js';
const validId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const spec=Object.freeze({
 'approve':{label:'Approve financial request',payload:'none'},
 'reject':{label:'Reject financial request',payload:'reason'},
 'approve/revoke':{label:'Revoke financial approval',payload:'reason'},
 'transfer':{label:'Confirm General Manager verification',payload:'reference'},
 'transfer/revoke':{label:'Revoke General Manager verification',payload:'reason'},
 'close':{label:'Close financial request',payload:'none'},
 'liquidation/approve':{label:'Approve submitted liquidation',payload:'none'}
});
export const frtActionSpec=code=>Object.prototype.hasOwnProperty.call(spec,code)?spec[code]:null;
const fingerprint=d=>JSON.stringify({status:d.status,liquidationStatus:d.liquidationStatus,
 financeApproved:d.financeApproved,transferConfirmed:d.transferConfirmed,closed:d.closed,
 workflow:d.workflow.map(x=>[x.code,x.candidate])});
export async function executeFRTDomainAction({auth,api,requestId,companyCode,
 workspaceId,role,allowedRequestIds,existingDetail,action,reason='',reference=''}={}){
 const definition=frtActionSpec(action);
 if(!definition||!validId(requestId)||!validId(workspaceId)||
    !Array.isArray(allowedRequestIds)||!allowedRequestIds.includes(requestId)||
    existingDetail?.status!=='PASS'||!existingDetail.detail||
    !existingDetail.detail.workflow.some(x=>x.code===action&&x.candidate===true))
  throw new ApiError('This financial action is unavailable for the selected request.',403);
 const payload={};
 if(definition.payload==='reason'){
  if(typeof reason!=='string'||reason.trim().length<3||reason.length>500)
   throw new ApiError('A reason of 3–500 characters is required.',400);
  payload.reason=reason.trim();
 }else if(definition.payload==='reference'){
  if(typeof reference!=='string'||reference.length>120)
   throw new ApiError('Verification reference exceeds 120 characters.',400);
  if(reference.trim())payload.reference=reference.trim();
 }
 // Authoritative signed detail revalidation (including role, lifecycle, company).
 const current=await loadFRTRequestDetailReadOnly({auth,api,requestId,companyCode,
  allowedRequestIds,workspaceId,expectedRole:role});
 if(current.status!=='PASS'||fingerprint(current.detail)!==fingerprint(existingDetail.detail)||
    !current.detail.workflow.some(x=>x.code===action&&x.candidate===true))
  throw new ApiError('Request state changed. Refresh before confirming.',409);
 const user=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validId(user?.id)||user.id!==auth.userId||ctx?.user_id!==user.id||
    ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
  throw new ApiError('FRT session changed before confirmation.',403);
 // A role/lifecycle preview is NOT authorization: the original FRT RPC
 // enforces signed role, workspace, lifecycle and audit checks itself.
 let receipt;
 try{
  receipt=await api.rpc('frt_request_action',{p_workspace_id:workspaceId,
   p_request_id:requestId,p_action:action,p_payload:payload});
 }catch(error){
  if(error?.status===401||error?.status===403)throw error;
  const uncertain=new ApiError('Action outcome is uncertain. Refresh before retrying.',409);
  uncertain.schemaOutcomeUncertain=true;throw uncertain;
 }
 if(receipt?.ok!==true){
  const uncertain=new ApiError('Action was not confirmed. Refresh before retrying.',409);
  uncertain.schemaOutcomeUncertain=true;throw uncertain;
 }
 return {status:'SENT_AND_ACKNOWLEDGED',action};
}
