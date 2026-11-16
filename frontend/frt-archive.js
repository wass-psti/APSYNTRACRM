/** CP-FRT-WF-05A signed archive retrieval and soft recovery. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readRoles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const fail=message=>{throw new Error(message);};
const validTime=value=>typeof value==='string'&&value.length>0&&!Number.isNaN(Date.parse(value));
async function signedScope({auth,api,workspaceId,companyCode,expectedRole}={}){
 if(!auth||!api||!uuid.test(workspaceId||'')||
  typeof companyCode!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(companyCode))
  fail('A signed FRT company context is required.');
 const user=await auth.getVerifiedUser();
 const context=await api.context();
 if(!uuid.test(user?.id||'')||auth.userId!==user.id||
  context?.user_id!==user.id||context?.workspace_id!==workspaceId||
  context?.profile?.status!=='active')
  fail('The signed FRT session is unavailable. Refresh and try again.');
 const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const membership=bootstrap?.membership;
 if(membership?.user_id!==user.id||membership?.workspace_id!==workspaceId||
  membership?.enabled!==true||membership?.status!=='active'||
  !readRoles.has(membership?.role)||!Array.isArray(bootstrap?.companies)||
  !bootstrap.companies.some(company=>company?.code===companyCode)||
  (expectedRole&&membership.role!==expectedRole))
  fail('The signed FRT membership or selected company is unavailable.');
 return {userId:user.id,role:membership.role};
}
async function verifyUnchanged({auth,api,workspaceId,userId}){
 const user=await auth.getVerifiedUser();
 const context=await api.context();
 if(user?.id!==userId||auth.userId!==userId||
  context?.user_id!==userId||context?.workspace_id!==workspaceId||
  context?.profile?.status!=='active')
  fail('The signed FRT session changed while the operation was running.');
}
function projectArchivedRequest(row){
 if(!row||!uuid.test(row.request_id||'')||
  !(row.voucher_no===null||typeof row.voucher_no==='string'&&row.voucher_no.length<=100)||
  typeof row.title!=='string'||row.title.length>250||
  typeof row.status!=='string'||row.status.length>70||
  typeof row.liquidation_status!=='string'||row.liquidation_status.length>70||
  !/^\d{4}-\d{2}-\d{2}$/.test(row.date_needed||'')||
  !validTime(row.created_at)||!validTime(row.archived_at))return null;
 return {requestId:row.request_id,voucher:row.voucher_no||'—',title:row.title,
  status:row.status,liquidationStatus:row.liquidation_status,
  dateNeeded:row.date_needed,createdAt:row.created_at,archivedAt:row.archived_at};
}
export async function loadFRTArchive({auth,api,workspaceId,companyCode,expectedRole}={}){
 const scope=await signedScope({auth,api,workspaceId,companyCode,expectedRole});
 const rows=await api.rpc('frt_archive_list',{
  p_workspace_id:workspaceId,p_company:companyCode,p_search:'',p_limit:500
 });
 if(!Array.isArray(rows)||rows.length>500)fail('FRT archive response is invalid.');
 const requests=rows.map(projectArchivedRequest);
 if(requests.some(row=>!row))fail('FRT archive contains an invalid record.');
 await verifyUnchanged({auth,api,workspaceId,userId:scope.userId});
 return {status:'PASS',companyCode,role:scope.role,requests};
}
export async function restoreFRTRequest({
 auth,api,workspaceId,companyCode,requestId,expectedRole
}={}){
 if(!uuid.test(requestId||''))fail('An archived request must be selected.');
 const scope=await signedScope({auth,api,workspaceId,companyCode,expectedRole});
 if(scope.role!=='GENERAL_MANAGER')
  fail('The existing General Manager archive-recovery action is required.');
 const before=await loadFRTArchive({auth,api,workspaceId,companyCode,expectedRole:scope.role});
 if(!before.requests.some(row=>row.requestId===requestId))
  fail('The request is not present in this company archive.');
 const receipt=await api.rpc('frt_restore_request',{
  p_workspace_id:workspaceId,p_request_id:requestId
 });
 if(receipt?.ok!==true||receipt.requestId!==requestId||receipt.archivedAt!==null)
  fail('The restore operation was not acknowledged. Refresh the archive before retrying.');
 await verifyUnchanged({auth,api,workspaceId,userId:scope.userId});
 const after=await loadFRTArchive({auth,api,workspaceId,companyCode,expectedRole:scope.role});
 if(after.requests.some(row=>row.requestId===requestId))
  fail('The restore was acknowledged but the request remains in the archive. Refresh before retrying.');
 return {status:'RESTORED',requestId};
}
