/** Workspace-scoped FRT request person assignment via signed domain RPCs. */
import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const writerRoles=new Set(['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER']);
const invalid=(message,status=403)=>new ApiError(message,status);
async function signedScope({auth,api,workspaceId,role,companyCode}){
 const user=await auth.getVerifiedUser(),ctx=await api.context();
 if(!uuid.test(user?.id||'')||auth.userId!==user.id||ctx?.user_id!==user.id||
    ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
  throw invalid('Signed FRT workspace changed. Refresh the board.');
 const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const m=bootstrap?.membership;
 if(m?.workspace_id!==workspaceId||m?.user_id!==user.id||m?.status!=='active'||
    m?.enabled!==true||m?.role!==role||!writerRoles.has(role)||
    !Array.isArray(bootstrap?.companies)||
    !bootstrap.companies.some(c=>c?.code===companyCode))
  throw invalid('FRT workspace membership or company changed.');
 return user.id;
}
export async function loadFRTPersonAssignment({auth,api,requestId,workspaceId,
 companyCode,role,listedRequestIds}={}){
 if(!auth||!api||!uuid.test(requestId||'')||!uuid.test(workspaceId||'')||
   !writerRoles.has(role)||!Array.isArray(listedRequestIds)||
   !listedRequestIds.includes(requestId))throw invalid('Request is not in the signed FRT list.');
 const actor=await signedScope({auth,api,workspaceId,role,companyCode});
 const [assignment,people,detail]=await Promise.all([
  api.rpc('frt_request_assignment',{p_workspace_id:workspaceId,p_request_id:requestId}),
  api.rpc('frt_assignable_people',{p_workspace_id:workspaceId}),
  api.rpc('frt_restricted_request_detail',{p_workspace_id:workspaceId,p_request_id:requestId})
 ]);
 if(assignment?.requestId!==requestId||
    !(assignment.assigneeId===null||uuid.test(assignment.assigneeId))||
    !Array.isArray(people)||people.length>1000||
    detail?.id!==requestId||detail.workspace_id!==workspaceId||
    detail.company_code!==companyCode||detail.archived_at!==null)
  throw invalid('FRT person assignment response cannot be verified.',409);
 const seen=new Set();const members=[];
 for(const p of people){
  if(!uuid.test(p?.id||'')||seen.has(p.id)||typeof p.name!=='string'||p.name.length>120)
   throw invalid('Invalid FRT workspace person directory.',409);
  seen.add(p.id);members.push({id:p.id,name:p.name});
 }
 if(assignment.assigneeId!==null&&!seen.has(assignment.assigneeId))
  members.unshift({id:assignment.assigneeId,name:'Previously assigned (no longer active)'});
 const again=await auth.getVerifiedUser(),ctx=await api.context();
 if(again?.id!==actor||auth.userId!==actor||ctx?.workspace_id!==workspaceId||
    ctx?.user_id!==actor||ctx?.profile?.status!=='active')
  throw invalid('FRT signed session changed.');
 return {requestId,workspaceId,companyCode,role,actorId:actor,
  assigneeId:assignment.assigneeId,people:members};
}
export async function saveFRTPersonAssignment({auth,api,snapshot,nextAssigneeId,
 listedRequestIds}={}){
 if(!snapshot||!(nextAssigneeId===null||uuid.test(nextAssigneeId))||
    !Array.isArray(listedRequestIds)||!listedRequestIds.includes(snapshot.requestId))
  throw invalid('Invalid FRT person assignment selection.',400);
 const selected=snapshot.people.find(p=>p.id===nextAssigneeId);
 if(nextAssigneeId!==null&&(!selected||selected.name==='Previously assigned (no longer active)'))
  throw invalid('Select an active workspace member.',400);
 if(nextAssigneeId===snapshot.assigneeId)return {status:'UNCHANGED',assigneeId:nextAssigneeId};
 const actor=await signedScope({auth,api,workspaceId:snapshot.workspaceId,
  companyCode:snapshot.companyCode,role:snapshot.role});
 if(actor!==snapshot.actorId)throw invalid('FRT actor changed.');
 const current=await api.rpc('frt_request_assignment',{p_workspace_id:snapshot.workspaceId,
  p_request_id:snapshot.requestId});
 if(current?.requestId!==snapshot.requestId||current.assigneeId!==snapshot.assigneeId)
  throw invalid('Assignment changed elsewhere. Refresh and retry.',409);
 const receipt=await api.rpc('frt_assign_request_person',{
  p_workspace_id:snapshot.workspaceId,p_request_id:snapshot.requestId,
  p_expected_assignee_id:snapshot.assigneeId,p_assignee_id:nextAssigneeId});
 if(receipt?.ok!==true||receipt.requestId!==snapshot.requestId||
    receipt.assigneeId!==nextAssigneeId){
  const e=invalid('Assignment outcome uncertain. Refresh before retrying.',409);
  e.schemaOutcomeUncertain=true;throw e;
 }
 const verified=await api.rpc('frt_request_assignment',{
  p_workspace_id:snapshot.workspaceId,p_request_id:snapshot.requestId});
 if(verified?.requestId!==snapshot.requestId||verified.assigneeId!==nextAssigneeId){
  const e=invalid('Assignment persistence could not be verified. Refresh the board.',409);
  e.schemaOutcomeUncertain=true;throw e;
 }
 return {status:'SAVED',assigneeId:nextAssigneeId};
}
