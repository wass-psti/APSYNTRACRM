/** Signed FRT creation and atomic filing-state persistence. No privileged browser client. */
import {ApiError} from './session.js';
import {validFRTDate} from './frt-board-date-edit.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const companyPattern=/^[A-Za-z0-9_-]{1,32}$/;
const states=new Set(['NOT_FILED','FILED']);
function fail(message,status=400){throw new ApiError(message,status);}
function uncertain(message){
 const error=new ApiError(message,409);
 error.schemaOutcomeUncertain=true;
 return error;
}
async function context({auth,api,workspaceId,companyCode,role}){
 if(!auth||!api||!uuid.test(workspaceId||'')||!companyPattern.test(companyCode||''))
  fail('Valid signed FRT workspace and company are required.',403);
 const user=await auth.getVerifiedUser(),ctx=await api.context();
 if(!uuid.test(user?.id||'')||auth.userId!==user.id||ctx?.user_id!==user.id||
    ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
  fail('FRT signed session changed. Refresh the board.',403);
 const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const member=bootstrap?.membership;
 if(member?.enabled!==true||member?.status!=='active'||member?.user_id!==user.id||
    member?.workspace_id!==workspaceId||member?.role!==role||
    !Array.isArray(bootstrap?.companies)||!bootstrap.companies.some(c=>c?.code===companyCode))
  fail('FRT workspace membership or company changed.',403);
 return user.id;
}
async function ensureSameActor({auth,api,workspaceId,actorId}){
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(actor?.id!==actorId||auth.userId!==actorId||ctx?.user_id!==actorId||
    ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
  fail('FRT session changed before saving.',403);
}
function normalizeRequest(data){
 const trim=(v,max=250)=>typeof v==='string'&&v.trim().length<=max?v.trim():'';
 const title=trim(data?.title),department=trim(data?.department),
  fundSource=trim(data?.fundSource),description=trim(data?.description,2500),
  category=trim(data?.category),dateNeeded=data?.dateNeeded;
 const amount=Number(data?.amount);
 if(title.length<3||department.length<2||fundSource.length<2||
   description.length<3||category.length<1||!validFRTDate(dateNeeded)||
   !Number.isFinite(amount)||amount<=0||amount>999999999999.99||
   !/^\d+(?:\.\d{1,2})?$/.test(String(data?.amount||'')))
  fail('Complete the fund request, date, expense category, and positive amount.');
 return {title,department,fundSource,description,dateNeeded,
  items:[{category,amount}]};
}
export async function createSignedFRTRequest({auth,api,workspaceId,companyCode,role,
 data}={}){
 const payload=normalizeRequest(data);
 const actor=await context({auth,api,workspaceId,companyCode,role});
 await ensureSameActor({auth,api,workspaceId,actorId:actor});
 // A single write only. On ambiguous network failure, never reissue a create.
 let row;
 try{
  row=await api.rpc('frt_create_request',{p_workspace_id:workspaceId,
   p_payload:{...payload,company:companyCode}});
 }catch(error){
  if([400,401,403,404,409,422].includes(Number(error?.status)))throw error;
  throw uncertain('Request creation may have succeeded. Refresh before submitting again.');
 }
 if(!uuid.test(row?.id||'')||row.workspace_id!==workspaceId||
    row.requestor_id!==actor||row.title!==payload.title||
    row.filing_status!=='NOT_FILED'){
  throw uncertain('FRT creation outcome is uncertain. Refresh requests before trying again.');
 }
 let list;
 try{
  list=await api.rpc('frt_board_list_safe',{
   p_workspace_id:workspaceId,p_company:companyCode,p_search:''});
 }catch{
  throw uncertain('Request saved but readback is unavailable. Refresh before submitting again.');
 }
 if(!Array.isArray(list)||!list.some(r=>r.id===row.id&&r.filing_status==='NOT_FILED')){
  throw uncertain('Created request was not verified in the signed list. Refresh before retrying.');
 }
 return {status:'SAVED',requestId:row.id,filingStatus:'NOT_FILED'};
}
export async function updateSignedFRTFiling({auth,api,workspaceId,companyCode,role,
 requestId,expectedStatus,nextStatus,listedRequestIds}={}){
 if(!uuid.test(requestId||'')||!Array.isArray(listedRequestIds)||
    !listedRequestIds.includes(requestId)||!states.has(expectedStatus)||
    !states.has(nextStatus)||nextStatus===expectedStatus)
  fail('Select a current, listed FRT request and a different filing state.');
 const actor=await context({auth,api,workspaceId,companyCode,role});
 const before=await api.rpc('frt_board_list_safe',{
  p_workspace_id:workspaceId,p_company:companyCode,p_search:''});
 if(!Array.isArray(before)||!before.some(r=>r.id===requestId&&r.filing_status===expectedStatus))
  fail('Filing status changed elsewhere. Refresh before saving.',409);
 await ensureSameActor({auth,api,workspaceId,actorId:actor});
 const receipt=await api.rpc('frt_set_request_filing_status',{
  p_workspace_id:workspaceId,p_request_id:requestId,p_company:companyCode,
  p_expected_status:expectedStatus,p_next_status:nextStatus});
 if(receipt?.ok!==true||receipt.requestId!==requestId||receipt.filingStatus!==nextStatus){
  const err=new ApiError('Filing outcome uncertain. Refresh before retrying.',409);
  err.schemaOutcomeUncertain=true;throw err;
 }
 const after=await api.rpc('frt_board_list_safe',{
  p_workspace_id:workspaceId,p_company:companyCode,p_search:''});
 if(!Array.isArray(after)||!after.some(r=>r.id===requestId&&r.filing_status===nextStatus)){
  const err=new ApiError('Filing persistence could not be verified. Refresh requests.',409);
  err.schemaOutcomeUncertain=true;throw err;
 }
 return {status:'SAVED',filingStatus:nextStatus};
}
