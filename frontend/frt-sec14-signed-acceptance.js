/* SEC14 read-only signed acceptance. No role or finance writes. */
import {loadFRTFinanceReadOnly} from './frt-finance-readonly.js';
import {loadFRTRequestDetailReadOnly} from './frt-finance-workflow.js';
const roles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const names=new Set(['signed-context','restricted-summary-list','restricted-detail','stable-context']);
export async function runSEC14SignedRead({auth,api}={}){
 const r={checkpoint:'CP-FRT-SEC14',status:'BLOCKED',checks:[],role:'UNVERIFIED',writesAttempted:0,financialWritesVerified:'NOT_VERIFIED'};
 if(!auth||!api)return {...r,reason:'SIGNED_CONTEXT_REQUIRED'};
 try{
  const who=await auth.getVerifiedUser(),ctx=await api.context();
  if(!who?.id||who.id!==auth.userId||ctx?.user_id!==who.id||ctx?.profile?.status!=='active')
   return {...r,reason:'SIGNED_CONTEXT_INVALID'};
  r.checks.push({name:'signed-context',status:'PASS'});
  const first=await loadFRTFinanceReadOnly({auth,api});
  if(first.status!=='PASS')return {...r,reason:first.reason||'RESTRICTED_READ_FAILED'};
  r.role=first.role;
  // Check every company granted by the current backend bootstrap, subject
  // to a fixed audit budget. Do not infer "no existing requests" from the
  // first company when another authorized company may contain records.
  const maxCompanies=12;
  const allowed=first.companies||[];
  if(!allowed.length||!first.companyCode){
   r.checks.push({name:'restricted-summary-list',status:'PENDING'});
   r.checks.push({name:'restricted-detail',status:'PENDING'});
   r.reason='NO_AUTHORIZED_FRT_COMPANY';
  }else{
   let selected=first,checked=1;
   for(const company of allowed.slice(1,maxCompanies)){
    if(selected.requests.length)break;
    if(selected.summary?.total_requests>0)
     return {...r,status:'FAIL',reason:'SUMMARY_LIST_INCONSISTENT'};
    const next=await loadFRTFinanceReadOnly({auth,api,companyCode:company.code});
    if(next.status!=='PASS'||next.role!==first.role||
       next.companyCode!==company.code||
       next.companies.length!==allowed.length||
       next.companies.some((c,i)=>c.code!==allowed[i].code)){
     return {...r,reason:'RESTRICTED_COMPANY_READ_FAILED'};
    }
    selected=next;checked++;
   }
   if(selected.summary?.total_requests>0&&!selected.requests.length)
    return {...r,status:'FAIL',reason:'SUMMARY_LIST_INCONSISTENT'};
   r.checks.push({name:'restricted-summary-list',status:'PASS'});
   if(selected.requests.length){
    const details=await loadFRTRequestDetailReadOnly({auth,api,
     requestId:selected.requests[0].requestId,
     companyCode:selected.companyCode,workspaceId:ctx.workspace_id,
     allowedRequestIds:selected.requests.map(x=>x.requestId),
     expectedRole:first.role});
    r.checks.push({name:'restricted-detail',status:details.status==='PASS'?'PASS':'FAIL'});
   }else{
    r.checks.push({name:'restricted-detail',status:'PENDING'});
    r.reason=checked<allowed.length?'COMPANY_SCAN_INCOMPLETE':'NO_EXISTING_FRT_REQUEST';
   }
  }
  const after=await auth.getVerifiedUser(),next=await api.context();
  const stable=after?.id===who.id&&auth.userId===who.id&&next?.user_id===who.id&&next?.workspace_id===ctx.workspace_id;
  r.checks.push({name:'stable-context',status:stable?'PASS':'FAIL'});
  r.status=r.checks.some(x=>x.status==='FAIL')?'FAIL':r.checks.some(x=>x.status==='PENDING')?'PENDING':'PASS';
  if(r.status==='PENDING'&&!r.reason)r.reason='NO_EXISTING_FRT_REQUEST';
 }catch{r.status='BLOCKED';r.reason='SIGNED_READ_UNAVAILABLE';}
 return r;
}
export function sanitizeSEC14SignedRead(report){
 return JSON.stringify({checkpoint:'CP-FRT-SEC14',
  status:['PASS','PENDING','BLOCKED','FAIL'].includes(report?.status)?report.status:'BLOCKED',
  role:roles.has(report?.role)?report.role:'UNVERIFIED',
  checks:Array.isArray(report?.checks)?report.checks.map(x=>({
   name:names.has(x?.name)?x.name:'invalid-check',
   status:['PASS','PENDING','BLOCKED','FAIL'].includes(x?.status)?x.status:'BLOCKED'})):[],
  reason:/^[A-Z0-9_]{1,75}$/.test(report?.reason||'')?report.reason:undefined,
  writesAttempted:0,financialWritesVerified:'NOT_VERIFIED'},null,2);
}
