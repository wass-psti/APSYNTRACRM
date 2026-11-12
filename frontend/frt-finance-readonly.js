/** CP-FRT-SEC12 / EXEC-02: signed FRT board projection. READ ONLY.
 * Uses existing Supabase RPCs and the existing FRT domain session/role guard.
 * Financial data crosses only as company-scoped aggregates; individual request
 * amounts, requester identities, banking data and raw row payloads stay excluded.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const companyPattern=/^[A-Za-z0-9_-]{1,32}$/;
const maxName=120;
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
const denied=(reason)=>({status:'BLOCKED',reason,companies:[],requests:[],
 summary:null,analytics:null,analyticsStatus:'UNAVAILABLE',role:'UNVERIFIED',companyCode:null,writesAttempted:0});
const short=(value,length)=>typeof value==='string'&&value.length<=length?value:null;
const validDate=v=>v===null||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v));
const validMoney=v=>typeof v==='string'&&/^\d{1,30}(?:\.\d{1,2})?$/.test(v);
function projectFinancialAnalytics(raw,companyCode){
 if(!raw||raw.company_code!==companyCode||!validMoney(raw.requested_total)||
    !validMoney(raw.spent_total)||!Array.isArray(raw.top_categories)||
    raw.top_categories.length>5||!Array.isArray(raw.monthly_trend)||
    raw.monthly_trend.length!==6)return null;
 const categories=[],seen=new Set();
 for(const item of raw.top_categories){
  if(!item||typeof item.category!=='string'||!item.category.trim()||
     item.category.length>120||!validMoney(item.requested_amount)||
     seen.has(item.category))return null;
  seen.add(item.category);
  categories.push({category:item.category,requestedAmount:item.requested_amount});
 }
 const monthlyTrend=[];let previousMonth=-1;
 for(const item of raw.monthly_trend){
  if(!item||typeof item.month!=='string'||!(/^\d{4}-(0[1-9]|1[0-2])$/).test(item.month)||
     !validMoney(item.requested_amount)||!validMoney(item.spent_amount))return null;
  const [year,month]=item.month.split('-').map(Number);
  const monthIndex=year*12+month-1;
  if(previousMonth!==-1&&monthIndex!==previousMonth+1)return null;
  previousMonth=monthIndex;
  monthlyTrend.push({month:item.month,requestedAmount:item.requested_amount,
   spentAmount:item.spent_amount});
 }
 return {companyCode,requestedTotal:raw.requested_total,spentTotal:raw.spent_total,
  topCategories:categories,monthlyTrend};
}
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
  // Aggregate fields are additive to the existing safe dashboard RPC.
  // Older deployed projections remain usable while aggregate fields are absent.
  const analytics=projectFinancialAnalytics(dashboard,selected);
  const analyticsStatus=analytics?'PASS':
   (dashboard.company_code!==undefined||dashboard.requested_total!==undefined||
    dashboard.spent_total!==undefined||dashboard.top_categories!==undefined||
    dashboard.monthly_trend!==undefined)?'INVALID_CONTRACT':'UNAVAILABLE';
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
   analytics,analyticsStatus,totalVisible:items.length,visibleLimit:100,writesAttempted:0};
 }catch(err){
  return denied(err?.status===401?'SIGNED_SESSION_EXPIRED':
   err?.status===403?'FRT_ACCESS_DENIED':
   err?.code==='PGRST202'?'FRT_READONLY_RPC_MISSING':
   'FRT_READONLY_RPC_UNAVAILABLE');
 }
}
