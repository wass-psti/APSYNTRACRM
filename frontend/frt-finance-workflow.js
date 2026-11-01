/** CP-FRT-SEC13 — read-only contract projection from existing frt_request_action.
 * IMPORTANT: A 'candidate' is an informational role+state match only.
 * It is NEVER proof of effective authorization, and this module never invokes
 * frt_request_action or creates a mutation button.
 */
const financeApprover=new Set(['FINANCE_APPROVER','GENERAL_MANAGER']);
const financeClose=new Set(['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER']);
const generalManager=new Set(['GENERAL_MANAGER']);
const terminal=new Set(['CLOSED','REJECTED']);
const isTime=x=>typeof x==='string'&&x.length>0;
const entries=Object.freeze([
 {code:'approve',label:'Finance approval',roles:financeApprover,
  eligible:r=>r.status==='PENDING_APPROVAL'},
 {code:'approve/revoke',label:'Revoke finance approval',roles:financeApprover,
  eligible:r=>r.financeApproved&&!terminal.has(r.status)&&r.liquidationStatus==='NOT_SUBMITTED'},
 {code:'reject',label:'Reject request',roles:financeApprover,
  eligible:r=>r.status==='PENDING_APPROVAL'},
 {code:'transfer',label:'General Manager verification',roles:generalManager,
  eligible:r=>r.financeApproved&&!r.transferConfirmed&&!terminal.has(r.status)},
 {code:'transfer/revoke',label:'Revoke GM verification',roles:generalManager,
  eligible:r=>r.transferConfirmed&&!terminal.has(r.status)},
 {code:'close',label:'Close request',roles:financeClose,
  eligible:r=>r.financeApproved&&!terminal.has(r.status)&&r.liquidationStatus==='APPROVED'},
 {code:'archive',label:'Archive request',roles:generalManager,
  eligible:r=>r.archived===false},
 {code:'liquidation/approve',label:'Approve liquidation',roles:financeApprover,
  eligible:r=>r.financeApproved&&!terminal.has(r.status)&&r.liquidationStatus==='SUBMITTED'}
]);
const statusSet=new Set(['PENDING_APPROVAL','IN_PROGRESS','DONE','BLOCKED','CLOSED','REJECTED']);
const liquidationSet=new Set(['NOT_SUBMITTED','SUBMITTED','UNDER_REVIEW','APPROVED','RETURNED']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const short=(s,max)=>typeof s==='string'&&s.length<=max;
const timeOrNull=x=>x===null||(typeof x==='string'&&x.length<80&&!Number.isNaN(Date.parse(x)));
const fail=reason=>({status:'BLOCKED',reason,detail:null,writesAttempted:0});

export function projectFRTRequestDetail(raw,{requestId,companyCode,workspaceId,role}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    !uuid.test(requestId||'')||raw.id!==requestId||
    !uuid.test(workspaceId||'')||raw.workspace_id!==workspaceId||
    typeof companyCode!=='string'||raw.company_code!==companyCode||
    !short(raw.voucher_no,100)||!short(raw.title,250)||
    !date.test(raw.date_needed||'')||
    !statusSet.has(raw.status)||!liquidationSet.has(raw.liquidation_status)||
    !timeOrNull(raw.finance_approved_at)||!timeOrNull(raw.transfer_confirmed_at)||
    !timeOrNull(raw.closed_at)||!timeOrNull(raw.archived_at))
  return fail('FRT_REQUEST_DETAIL_CONTRACT_INVALID');
 // No amount, banking, recipient, requestor, attachment, item, audit,
 // liquidation payload, UUID, or raw RPC result is included in the projection.
 const state={
  status:raw.status,
  liquidationStatus:raw.liquidation_status,
  financeApproved:isTime(raw.finance_approved_at),
  transferConfirmed:isTime(raw.transfer_confirmed_at),
  archived:isTime(raw.archived_at)
 };
 const serverWorkflow=raw.workflow;
 if(!Array.isArray(serverWorkflow)||serverWorkflow.length!==entries.length)
  return fail('FRT_SERVER_WORKFLOW_CONTRACT_INVALID');
 const workflow=[];
 for(let i=0;i<entries.length;i++){
  const entry=entries[i],item=serverWorkflow[i];
  if(!item||item.code!==entry.code||typeof item.eligible!=='boolean'||
     item.authority!=='SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY')
   return fail('FRT_SERVER_WORKFLOW_CONTRACT_INVALID');
  // Fail closed if the server unexpectedly claims more eligibility than
  // this independently restricted informational role/lifecycle envelope.
  if(item.eligible&&!(entry.roles.has(role)&&entry.eligible(state)))
   return fail('FRT_SERVER_WORKFLOW_DIVERGENCE');
  workflow.push({code:entry.code,label:entry.label,
   candidate:item.eligible,authority:'NOT_VERIFIED_FOR_EXECUTION'});
 }
 return {status:'PASS',reason:null,writesAttempted:0,
  detail:{voucher:raw.voucher_no,title:raw.title,dateNeeded:raw.date_needed,
   status:state.status,liquidationStatus:state.liquidationStatus,
   financeApproved:state.financeApproved,
   transferConfirmed:state.transferConfirmed,
   closed:isTime(raw.closed_at),workflow}};
}

export async function loadFRTRequestDetailReadOnly({
 auth,api,requestId,companyCode,allowedRequestIds,workspaceId,expectedRole
}={}){
 if(!auth||!api||!uuid.test(requestId||'')||!uuid.test(workspaceId||'')||
    !Array.isArray(allowedRequestIds)||!allowedRequestIds.includes(requestId)||
    typeof companyCode!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(companyCode))
  return fail('FRT_REQUEST_NOT_IN_SIGNED_LIST');
 try{
  const user=await auth.getVerifiedUser();
  const ctx=await api.context();
  if(!uuid.test(user?.id||'')||auth.userId!==user.id||
     ctx?.user_id!==user.id||ctx?.workspace_id!==workspaceId||
     ctx?.profile?.status!=='active')
   return fail('SIGNED_CONTEXT_INVALID');

  // Revalidate the FRT domain membership before every individual detail.
  const boot=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
  const m=boot?.membership;
  if(m?.user_id!==user.id||m?.workspace_id!==workspaceId||
     m?.status!=='active'||m?.enabled!==true||
     !['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'].includes(expectedRole)||
     m?.role!==expectedRole||
     !Array.isArray(boot?.companies)||
     !boot.companies.some(c=>c?.code===companyCode))
   return fail('FRT_DETAIL_MEMBERSHIP_DENIED');

  // Only a restricted backend projection, never legacy broad detail or frt_request_action.
  const raw=await api.rpc('frt_restricted_request_detail',{
   p_workspace_id:workspaceId,p_request_id:requestId
  });
  const projected=projectFRTRequestDetail(raw,{
   requestId,companyCode,workspaceId,role:m.role
  });
  if(projected.status!=='PASS')return projected;
  const again=await auth.getVerifiedUser();
  const after=await api.context();
  if(again?.id!==user.id||auth.userId!==user.id||
     after?.user_id!==user.id||after?.workspace_id!==workspaceId||
     after?.profile?.status!=='active')
   return fail('SIGNED_CONTEXT_CHANGED');
  return projected;
 }catch(err){
  return fail(err?.status===401?'SIGNED_SESSION_EXPIRED':
   err?.status===403?'FRT_DETAIL_ACCESS_DENIED':
   err?.code==='PGRST202'?'FRT_DETAIL_RPC_UNAVAILABLE':
   'FRT_DETAIL_READ_INCOMPLETE');
 }
}
