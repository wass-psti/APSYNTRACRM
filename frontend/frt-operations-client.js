/** CP-FRT-WF-05A signed activity, comments and archive operations. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readRoles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const fail=message=>{throw new Error(message);};
const isTime=value=>typeof value==='string'&&value.length>0&&!Number.isNaN(Date.parse(value));
const short=(value,max)=>typeof value==='string'&&value.length<=max;
const safeDetails=value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const out={};
 for(const key of ['voucher','total','company','fromStatus','toStatus','reference',
  'bankName','transactionReference','executedAt','file','category']){
  const item=value[key];
  if((typeof item==='string'&&item.length<=250)||
     (typeof item==='number'&&Number.isFinite(item)))out[key]=item;
 }
 return out;
};
async function signedScope({auth,api,workspaceId,companyCode}={}){
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
    !bootstrap.companies.some(company=>company?.code===companyCode))
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
function projectActivity(row){
 if(!row||!(Number.isSafeInteger(row.id)&&row.id>0||
    (typeof row.id==='string'&&/^\d{1,20}$/.test(row.id)))||
    !uuid.test(row.request_id||'')||!short(row.request_title,250)||
    !short(row.voucher_no,100)||!short(row.action,100)||
    !short(row.actor_name,180)||!isTime(row.created_at))
  return null;
 return {id:String(row.id),requestId:row.request_id,title:row.request_title,
  voucher:row.voucher_no,action:row.action,actorName:row.actor_name,
  createdAt:row.created_at,details:safeDetails(row.details)};
}
function projectComment(row){
 if(!row||!uuid.test(row.id||'')||!short(row.body,4000)||
    row.body.trim().length<1||!short(row.author_name,180)||
    !isTime(row.created_at)||typeof row.is_mine!=='boolean')return null;
 return {id:row.id,body:row.body,authorName:row.author_name,
  createdAt:row.created_at,isMine:row.is_mine};
}
function projectArchive(row){
 if(!row||!uuid.test(row.request_id||'')||!short(row.voucher_no,100)||
    !short(row.title,250)||!short(row.status,60)||
    !short(row.liquidation_status,60)||!/^\d{4}-\d{2}-\d{2}$/.test(row.date_needed||'')||
    !isTime(row.created_at)||!isTime(row.archived_at))return null;
 return {requestId:row.request_id,voucher:row.voucher_no,title:row.title,
  status:row.status,liquidationStatus:row.liquidation_status,
  dateNeeded:row.date_needed,createdAt:row.created_at,archivedAt:row.archived_at};
}
export async function loadFRTActivity({auth,api,workspaceId,companyCode}={}){
 const scope=await signedScope({auth,api,workspaceId,companyCode});
 const rows=await api.rpc('frt_activity_list',{
  p_workspace_id:workspaceId,p_company:companyCode,p_limit:1000
 });
 if(!Array.isArray(rows)||rows.length>1000)fail('FRT activity response is invalid.');
 const events=rows.map(projectActivity);
 if(events.some(row=>!row))fail('FRT activity contains an invalid record.');
 await verifyUnchanged({auth,api,workspaceId,userId:scope.userId});
 return {status:'PASS',companyCode,role:scope.role,events};
}
export async function loadFRTComments({
 auth,api,workspaceId,companyCode,requestId,allowedRequestIds
}={}){
 if(!uuid.test(requestId||'')||!Array.isArray(allowedRequestIds)||
    !allowedRequestIds.includes(requestId))
  fail('The request is not in the current signed FRT list.');
 const scope=await signedScope({auth,api,workspaceId,companyCode});
 const rows=await api.rpc('frt_request_comments_list',{
  p_workspace_id:workspaceId,p_request_id:requestId,p_company:companyCode
 });
 if(!Array.isArray(rows)||rows.length>500)fail('FRT discussion response is invalid.');
 const comments=rows.map(projectComment);
 if(comments.some(row=>!row))fail('FRT discussion contains an invalid comment.');
 await verifyUnchanged({auth,api,workspaceId,userId:scope.userId});
 return {status:'PASS',role:scope.role,requestId,comments};
}
export async function addFRTComment({
 auth,api,workspaceId,companyCode,requestId,allowedRequestIds,body
}={}){
 if(!uuid.test(requestId||'')||!Array.isArray(allowedRequestIds)||
    !allowedRequestIds.includes(requestId))
  fail('The request is not in the current signed FRT list.');
 if(typeof body!=='string'||body.trim().length<1||body.length>4000)
  fail('Enter a comment of 1–4,000 characters.');
 const scope=await signedScope({auth,api,workspaceId,companyCode});
 const receipt=await api.rpc('frt_add_comment',{
  p_workspace_id:workspaceId,p_request_id:requestId,p_body:body.trim()
 });
 if(receipt?.ok!==true||!uuid.test(receipt.commentId||''))
  fail('The comment save was not acknowledged. Refresh the discussion before retrying.');
 await verifyUnchanged({auth,api,workspaceId,userId:scope.userId});
 const readback=await loadFRTComments({
  auth,api,workspaceId,companyCode,requestId,allowedRequestIds
 });
 const saved=readback.comments.find(comment=>comment.id===receipt.commentId&&
  comment.body===body.trim()&&comment.isMine);
 if(!saved)fail('The comment was acknowledged but its saved record could not be verified. Refresh before retrying.');
 return saved;
}
export async function loadFRTArchive({auth,api,workspaceId,companyCode,search=''}={}){
 if(typeof search!=='string'||search.length>120)fail('Archive search is too long.');
 const scope=await signedScope({auth,api,workspaceId,companyCode});
 const rows=await api.rpc('frt_archive_list',{
  p_workspace_id:workspaceId,p_company:companyCode,p_search:search,p_limit:500
 });
 if(!Array.isArray(rows)||rows.length>500)fail('FRT archive response is invalid.');
 const requests=rows.map(projectArchive);
 if(requests.some(row=>!row))fail('FRT archive contains an invalid record.');
 await verifyUnchanged({auth,api,workspaceId,userId:scope.userId});
 return {status:'PASS',companyCode,role:scope.role,requests};
}
export async function restoreFRTRequest({
 auth,api,workspaceId,companyCode,requestId
}={}){
 if(!uuid.test(requestId||''))fail('An archived request must be selected.');
 const scope=await signedScope({auth,api,workspaceId,companyCode});
 if(scope.role!=='GENERAL_MANAGER')
  fail('The existing General Manager archive-recovery action is required.');
 const before=await loadFRTArchive({auth,api,workspaceId,companyCode});
 if(!before.requests.some(row=>row.requestId===requestId))
  fail('The request is not present in this company archive.');
 const receipt=await api.rpc('frt_restore_request',{
  p_workspace_id:workspaceId,p_request_id:requestId
 });
 if(receipt?.ok!==true||receipt.requestId!==requestId||receipt.archivedAt!==null)
  fail('The restore operation was not acknowledged. Refresh the archive before retrying.');
 await verifyUnchanged({auth,api,workspaceId,userId:scope.userId});
 const after=await loadFRTArchive({auth,api,workspaceId,companyCode});
 if(after.requests.some(row=>row.requestId===requestId))
  fail('The restore was acknowledged but the request remains in the archive. Refresh before retrying.');
 return {status:'RESTORED',requestId};
}
