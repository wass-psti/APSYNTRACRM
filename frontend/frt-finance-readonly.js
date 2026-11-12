/** CP-FRT-SEC12: signed FRT board finance snapshot. READ ONLY.
 * Uses existing Supabase RPCs and the existing FRT domain session/role guard.
 * Sensitive amounts, requestor identities, attachments and raw payloads
 * intentionally do not cross this component's output boundary.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const companyPattern=/^[A-Za-z0-9_-]{1,32}$/;
const maxName=120;
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
const denied=(reason)=>({status:'BLOCKED',reason,companies:[],requests:[],
 summary:null,role:'UNVERIFIED',companyCode:null,writesAttempted:0});
const short=(value,length)=>typeof value==='string'&&value.length<=length?value:null;
const validDate=v=>v===null||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v));
export async function loadFRTFinanceReadOnly({auth,api,companyCode=null}={}){
 const result=denied('UNVERIFIED_SIGNED_CONTEXT');
 if(!auth||!api)return denied('SIGNED_AUTH_AND_API_REQUIRED');
 try{
  const user=await auth.getVerifiedUser();
  const context=await api.context();
  if(!uuid.test(user?.id||'')||auth.userId!==user.id||
     context?.user_id!==user.id||!uuid.test(context?.workspace_id||'')||
     context?.profile?.status!=='active')
   return denied('SIGNED_CONTEXT_INVALID');

  const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:context.workspace_id});
  const membership=bootstrap?.membership;
  if(membership?.user_id!==user.id||
     membership?.workspace_id!==context.workspace_id||
     membership?.enabled!==true||membership?.status!=='active'||
     !roles.has(membership?.role)||!Array.isArray(bootstrap?.companies)||
     bootstrap.companies.length>100)
   return denied('FRT_ROLE_OR_COMPANY_CONTRACT_INVALID');

  const companies=[];
  const seen=new Set();
  for(const c of bootstrap.companies){
   if(!companyPattern.test(c?.code||'')||!short(c?.name,maxName)||
      seen.has(c.code))return denied('FRT_COMPANIES_INVALID');
   seen.add(c.code);
   companies.push({code:c.code,name:c.name});
  }
  if(!companies.length)return {...result,status:'PASS',reason:null,
   role:membership.role,companies,summary:null,companyCode:null};
  const selected=companyCode===null?companies[0].code:companyCode;
  if(!companyPattern.test(selected||'')||!seen.has(selected))
   return denied('UNAUTHORIZED_COMPANY_SELECTION');

  const [dashboard,items]=await Promise.all([
   api.rpc('frt_board_dashboard_safe',
    {p_workspace_id:context.workspace_id,p_company:selected}),
   api.rpc('frt_board_list_safe',
    {p_workspace_id:context.workspace_id,p_company:selected,p_search:''})
  ]);
  const keys=['total_requests','pending','in_progress','completed','pending_liquidation_count'];
  if(!dashboard||keys.some(k=>!validCount(dashboard[k]))||
     !Array.isArray(items)||items.length>500)
   return denied('FRT_FINANCE_READ_CONTRACT_INVALID');
  const requests=[];
  for(const item of items){
   if(!uuid.test(item?.id||'')||
      !short(item?.voucher_no,100)&&item?.voucher_no!==null||
      !short(item?.title,250)||!short(item?.status,70)||
      !validDate(item?.date_needed)||!['NOT_FILED','FILED'].includes(item?.filing_status)||
      item?.company_code!==selected)
    return denied('FRT_REQUEST_ROW_CONTRACT_INVALID');
   if(requests.length<100)requests.push({
    requestId:item.id,voucher:item.voucher_no||'—',title:item.title,status:item.status,
    dateNeeded:item.date_needed||'—',filingStatus:item.filing_status
   });
  }
  const second=await auth.getVerifiedUser();
  const after=await api.context();
  if(second?.id!==user.id||auth.userId!==user.id||
     after?.user_id!==user.id||after?.workspace_id!==context.workspace_id||
     after?.profile?.status!=='active')return denied('SIGNED_CONTEXT_CHANGED');
  return {status:'PASS',reason:null,role:membership.role,companies,companyCode:selected,
   summary:Object.fromEntries(keys.map(k=>[k,dashboard[k]])),requests,
   totalVisible:items.length,visibleLimit:100,writesAttempted:0};
 }catch(err){
  return denied(err?.status===401?'SIGNED_SESSION_EXPIRED':
   err?.status===403?'FRT_ACCESS_DENIED':
   err?.code==='PGRST202'?'FRT_READONLY_RPC_MISSING':
   'FRT_READONLY_RPC_UNAVAILABLE');
 }
}
