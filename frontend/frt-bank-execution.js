/** Staff-attested bank execution, never inferred from GM verification. */
import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>new ApiError(message,status);
async function signed({auth,api,workspaceId}){
 const user=await auth?.getVerifiedUser(),ctx=await api?.context();
 if(!uuid.test(user?.id||'')||auth.userId!==user.id||ctx?.user_id!==user.id||
  ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
  throw fail('Signed FRT session unavailable',403);
 const boot=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const m=boot?.membership;
 if(m?.user_id!==user.id||m?.workspace_id!==workspaceId||
  m?.status!=='active'||m?.enabled!==true)throw fail('FRT membership denied',403);
 return m.role;
}
function guard(workspaceId,requestId,allowedRequestIds){
 if(!uuid.test(workspaceId||'')||!uuid.test(requestId||'')||
  !allowedRequestIds?.includes(requestId))throw fail('Request not in signed list',403);
}
export function describeFRTBankExecution(s,now=Date.now()){
 if(!s?.recorded)return 'No bank execution recorded — liquidation deadline unavailable';
 const deadline=Date.parse(s.deadlineAt);
 if(!Number.isFinite(deadline))return 'Bank deadline unavailable';
 if(s.liquidationStatus==='APPROVED')return 'Liquidation approved';
 return now>deadline?'Liquidation overdue':'Liquidation due';
}
export async function loadFRTBankExecution({auth,api,workspaceId,requestId,allowedRequestIds}){
 guard(workspaceId,requestId,allowedRequestIds);
 await signed({auth,api,workspaceId});
 const v=await api.rpc('frt_bank_execution_snapshot',{p_workspace_id:workspaceId,p_request_id:requestId});
 if(v?.workspaceId!==workspaceId||v?.requestId!==requestId||
  typeof v.recorded!=='boolean'||typeof v.eligible!=='boolean'||
  !['NO_BANK_EXECUTION','STAFF_RECORDED_BANK_EVIDENCE'].includes(v.source)||
  (v.recorded&&(!v.executedAt||!v.deadlineAt||v.source!=='STAFF_RECORDED_BANK_EVIDENCE'))||
  (!v.recorded&&(v.executedAt!==null||v.deadlineAt!==null)))
  throw fail('Bank execution readback contract invalid',409);
 return v;
}
export async function recordFRTBankExecution({auth,api,workspaceId,requestId,allowedRequestIds,
 snapshot,bankName,transactionReference,executedAt}){
 guard(workspaceId,requestId,allowedRequestIds);
 if(snapshot?.requestId!==requestId||snapshot.workspaceId!==workspaceId||
  !snapshot.eligible||snapshot.recorded)throw fail('Bank recording is unavailable',403);
 if(typeof bankName!=='string'||!bankName.trim()||bankName.trim().length>120||
  typeof transactionReference!=='string'||!transactionReference.trim()||
  transactionReference.trim().length>180||
  typeof executedAt!=='string'||!Number.isFinite(Date.parse(executedAt)))
  throw fail('Provide bank, transaction reference and actual execution date/time');
 const role=await signed({auth,api,workspaceId});
 if(!['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'].includes(role))
  throw fail('Finance role required to record bank execution',403);
 const current=await loadFRTBankExecution({auth,api,workspaceId,requestId,allowedRequestIds});
 if(current.recorded||!current.eligible)throw fail('Bank execution state changed; refresh',409);
 const payload={bankName:bankName.trim(),transactionReference:transactionReference.trim(),
  executedAt:new Date(executedAt).toISOString()};
 const response=await api.rpc('frt_record_bank_execution',{
  p_workspace_id:workspaceId,p_request_id:requestId,p_payload:payload});
 if(response?.ok!==true)throw fail('Bank recording outcome uncertain; refresh before retry',409);
 const after=await loadFRTBankExecution({auth,api,workspaceId,requestId,allowedRequestIds});
 if(!after.recorded||Date.parse(after.executedAt)!==Date.parse(response.executedAt)||
   after.bankName!==payload.bankName||after.transactionReference!==payload.transactionReference||
   Date.parse(after.deadlineAt)!==Date.parse(response.deadlineAt))
  throw fail('Bank execution readback differs; refresh before retry',409);
 return after;
}
