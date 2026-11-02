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
  const snapshot=await loadFRTFinanceReadOnly({auth,api,secureContracts:true});
  if(snapshot.status!=='PASS')return {...r,reason:snapshot.reason||'RESTRICTED_READ_FAILED'};
  r.checks.push({name:'restricted-summary-list',status:'PASS'});
  r.role=snapshot.role;
  if(snapshot.requests.length){
   const details=await loadFRTRequestDetailReadOnly({auth,api,
    requestId:snapshot.requests[0].requestId,
    companyCode:snapshot.companyCode,workspaceId:ctx.workspace_id,
    allowedRequestIds:snapshot.requests.map(x=>x.requestId),
    expectedRole:snapshot.role});
   r.checks.push({name:'restricted-detail',status:details.status==='PASS'?'PASS':'FAIL'});
  }else r.checks.push({name:'restricted-detail',status:'PENDING'});
  const after=await auth.getVerifiedUser(),next=await api.context();
  const stable=after?.id===who.id&&auth.userId===who.id&&next?.user_id===who.id&&next?.workspace_id===ctx.workspace_id;
  r.checks.push({name:'stable-context',status:stable?'PASS':'FAIL'});
  r.status=r.checks.some(x=>x.status==='FAIL')?'FAIL':r.checks.some(x=>x.status==='PENDING')?'PENDING':'PASS';
  if(r.status==='PENDING')r.reason='NO_EXISTING_FRT_REQUEST';
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
