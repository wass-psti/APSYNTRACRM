/** CP-FRT-FLOW-03K: signed payee-only CAS, never the legacy broad request edit. */
import {ApiError} from './session.js';
const requestUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles=new Set(['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER']);
const invalid=(message,status=409)=>new ApiError(message,status);
export function validFRTPayee(value){
 const name=typeof value==='string'?value.trim():'';
 return name.length>=2&&name.length<=180&&!/^(none|n\/a|na|unknown|not recorded)$/i.test(name);
}
async function scope({auth,api,workspaceId,companyCode,role}){
 const user=await auth.getVerifiedUser();const ctx=await api.context();
 if(!requestUuid.test(user?.id||'')||auth.userId!==user.id||
  ctx?.user_id!==user.id||ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
  throw invalid('Signed FRT session changed. Reopen the request.',403);
 const b=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const m=b?.membership;
 if(m?.workspace_id!==workspaceId||m?.user_id!==user.id||m?.enabled!==true||
  m?.status!=='active'||m?.role!==role||!roles.has(role)||
  !b?.companies?.some(c=>c?.code===companyCode))
  throw invalid('FRT company or membership changed.',403);
 return user.id;
}
export async function loadFRTPayeeCorrection({auth,api,requestId,workspaceId,
 companyCode,role,listedRequestIds,expectedVoucher}={}){
 if(!requestUuid.test(requestId||'')||!requestUuid.test(workspaceId||'')||
  !roles.has(role)||!/^[A-Z0-9_-]{1,32}$/.test(companyCode||'')||
  !Array.isArray(listedRequestIds)||!listedRequestIds.includes(requestId))
  throw invalid('Request is unavailable in the signed FRT list.',403);
 const actorId=await scope({auth,api,workspaceId,companyCode,role});
 const detail=await api.rpc('frt_restricted_request_detail',{
  p_workspace_id:workspaceId,p_request_id:requestId});
 if(detail?.id!==requestId||detail.workspace_id!==workspaceId||
  detail.company_code!==companyCode||detail.archived_at!==null||
  detail.voucher_no!==expectedVoucher||detail.status!=='PENDING_APPROVAL'||
  detail.finance_approved_at!==null||detail.transfer_confirmed_at!==null||
  detail.liquidation_status!=='NOT_SUBMITTED'||
  typeof detail.voucher?.payee!=='string')
  throw invalid('Request is not eligible for payee correction. Refresh the Fund Tracker.');
 return {requestId,workspaceId,companyCode,role,actorId,
  voucherNumber:detail.voucher_no,expectedPayee:detail.voucher.payee};
}
export async function saveFRTPayeeCorrection({auth,api,snapshot,nextPayee,
 listedRequestIds}={}){
 if(!snapshot||!requestUuid.test(snapshot.requestId||'')||
  !Array.isArray(listedRequestIds)||!listedRequestIds.includes(snapshot.requestId)||
  !validFRTPayee(nextPayee))throw invalid('Enter the actual payee or supplier name.',400);
 const name=nextPayee.trim();
 if(name===snapshot.expectedPayee)return {status:'UNCHANGED',payee:name};
 const actorId=await scope({auth,api,workspaceId:snapshot.workspaceId,
  companyCode:snapshot.companyCode,role:snapshot.role});
 if(actorId!==snapshot.actorId)throw invalid('FRT signed actor changed.',403);
 const before=await api.rpc('frt_restricted_request_detail',{
  p_workspace_id:snapshot.workspaceId,p_request_id:snapshot.requestId});
 if(before?.voucher?.payee!==snapshot.expectedPayee||
  before?.voucher_no!==snapshot.voucherNumber||before?.status!=='PENDING_APPROVAL'||
  before?.finance_approved_at!==null||before?.transfer_confirmed_at!==null)
  throw invalid('Payee or financial state changed. Refresh the request.');
 const beforeSave=await auth.getVerifiedUser();
 if(beforeSave?.id!==actorId||auth.userId!==actorId)
  throw invalid('FRT session changed before payee correction.',403);
 const receipt=await api.rpc('frt_correct_request_payee_cas',{
  p_workspace_id:snapshot.workspaceId,p_request_id:snapshot.requestId,
  p_expected_payee:snapshot.expectedPayee,p_next_payee:name});
 if(receipt?.ok!==true||receipt.requestId!==snapshot.requestId||
  receipt.voucherNumber!==snapshot.voucherNumber||receipt.payee!==name){
  const error=invalid('Payee correction outcome uncertain. Refresh before retrying.');
  error.schemaOutcomeUncertain=true;throw error;
 }
 const after=await api.rpc('frt_restricted_request_detail',{
  p_workspace_id:snapshot.workspaceId,p_request_id:snapshot.requestId});
 const afterUser=await auth.getVerifiedUser();
 if(afterUser?.id!==actorId||auth.userId!==actorId)
  throw invalid('FRT session changed during payee readback.',403);
 if(after?.id!==snapshot.requestId||after.voucher_no!==snapshot.voucherNumber||
  after.voucher?.payee!==name){
  const error=invalid('Payee correction readback not verified. Refresh before retrying.');
  error.schemaOutcomeUncertain=true;throw error;
 }
 return {status:'SAVED',payee:name,voucherNumber:snapshot.voucherNumber};
}
