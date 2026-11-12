/** CP-FRT-BOARD-02: authoritative domain request-date edit.
 * Uses existing frt_update_request role enforcement and signed restricted reads.
 * No finance status, person, attachment, QR or board-mirror mutation.
 */
import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedRoles=new Set(['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER']);
export function validFRTDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);
 const leap=y%4===0&&(y%100!==0||y%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return y>=1&&m>=1&&m<=12&&d>=1&&d<=days[m-1];
}
export async function updateFRTRequestDate({auth,api,requestId,workspaceId,
 companyCode,expectedRole,expectedDate,nextDate,listedRequestIds}={}){
 if(!uuid.test(requestId||'')||!uuid.test(workspaceId||'')||
    !Array.isArray(listedRequestIds)||!listedRequestIds.includes(requestId)||
    typeof companyCode!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(companyCode)||
    !allowedRoles.has(expectedRole)||(expectedDate!==null&&!validFRTDate(expectedDate))||
    !validFRTDate(nextDate))
  throw new ApiError('Invalid or unavailable FRT request date change.',400);
 if(!auth||!api)throw new ApiError('Signed FRT API required.',403);
 const actor=await auth.getVerifiedUser(),context=await api.context();
 if(!uuid.test(actor?.id||'')||auth.userId!==actor.id||
    context?.user_id!==actor.id||context?.workspace_id!==workspaceId||
    context?.profile?.status!=='active')
  throw new ApiError('FRT signed session changed.',403);
 const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const membership=bootstrap?.membership;
 if(membership?.enabled!==true||membership?.status!=='active'||
    membership.workspace_id!==workspaceId||membership.user_id!==actor.id||
    membership.role!==expectedRole||
    !bootstrap?.companies?.some(c=>c?.code===companyCode))
  throw new ApiError('FRT membership or company changed.',403);
 const before=await api.rpc('frt_restricted_request_detail',{
  p_workspace_id:workspaceId,p_request_id:requestId});
 if(before?.id!==requestId||before.workspace_id!==workspaceId||
    before.company_code!==companyCode||before.archived_at!==null||
    before.date_needed!==expectedDate)
  throw new ApiError('Request date changed elsewhere. Refresh before editing.',409);
 if(nextDate===expectedDate)return {status:'UNCHANGED',dateNeeded:nextDate};
 const again=await auth.getVerifiedUser(),afterContext=await api.context();
 if(again?.id!==actor.id||auth.userId!==actor.id||afterContext?.user_id!==actor.id||
    afterContext?.workspace_id!==workspaceId||afterContext?.profile?.status!=='active')
  throw new ApiError('FRT signed session changed before saving.',403);
 // Existing RPC provides server-side FRT role / workspace enforcement.
 // Do not retry ambiguous writes; the RPC has no updated_at CAS argument.
 const receipt=await api.rpc('frt_update_request',{
  p_workspace_id:workspaceId,p_request_id:requestId,
  p_payload:{dateNeeded:nextDate}
 });
 if(receipt?.ok!==true){const e=new ApiError('Date update outcome uncertain. Refresh before retrying.',409);
  e.schemaOutcomeUncertain=true;throw e;}
 const verified=await api.rpc('frt_restricted_request_detail',{
  p_workspace_id:workspaceId,p_request_id:requestId});
 if(verified?.id!==requestId||verified.workspace_id!==workspaceId||
    verified.company_code!==companyCode||verified.date_needed!==nextDate){
  const e=new ApiError('Date update was not confirmed. Refresh the FRT list.',409);
  e.schemaOutcomeUncertain=true;throw e;
 }
 return {status:'SAVED',dateNeeded:nextDate};
}
