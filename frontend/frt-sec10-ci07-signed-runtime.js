/** CP-FRT-SEC10-CI07: genuine caller-bound FRT positive session check.
 * Read-only. No finance mutations, logout, refresh-token revocations, or secrets in evidence.
 * This does NOT certify expired/revoked tokens or FRT financial writes.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const frtRoles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const validStatus=new Set(['PASS','FAIL','BLOCKED']);
const validCheck=new Set(['signed-authenticated-context','active-module-grant',
 'signed-frt-bootstrap-role-resolved','frt-companies-read-contract',
 'signed-identity-and-workspace-stable']);
const append=(report,name,ok)=>report.checks.push({name,status:ok?'PASS':'FAIL'});
const blank=()=>({checkpoint:'CP-FRT-SEC10-CI07',status:'BLOCKED',checks:[],
 role:'UNVERIFIED',writesAttempted:0,roleChangesAttempted:0,
 revocationVerified:'NOT_VERIFIED',financialOperationsVerified:'NOT_VERIFIED'});
export async function runFRTCI07SignedRoleProbe({auth,api}={}){
 const report=blank();
 if(!auth||!api)return {...report,reason:'SIGNED_AUTH_AND_API_REQUIRED'};
 try{
  const user=await auth.getVerifiedUser();
  const context=await api.context();
  if(!uuid.test(user?.id||'')||auth.userId!==user.id||
    context?.user_id!==user.id||!uuid.test(context?.workspace_id||'')||
    context?.profile?.status!=='active')
   return {...report,reason:'SIGNED_CONTEXT_INVALID'};
  append(report,'signed-authenticated-context',true);
  const granted=await api.rpc('has_module_access',{
   p_module_id:'fund-released-tracker',p_user_id:user.id
  });
  if(granted!==true)
   return {...report,status:'BLOCKED',
    reason:granted===false?'NO_ACTIVE_FRT_MODULE_GRANT':'INVALID_FRT_MODULE_DECISION'};
  append(report,'active-module-grant',true);
  // The deployed frt_bootstrap invokes private.frt_current_role, which now
  // checks the authoritative auth.sessions row on every signed FRT call.
  const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:context.workspace_id});
  const membership=bootstrap?.membership;
  const allowed=membership?.workspace_id===context.workspace_id&&
    membership?.user_id===user.id&&membership?.enabled===true&&
    membership?.status==='active'&&frtRoles.has(membership?.role);
  append(report,'signed-frt-bootstrap-role-resolved',allowed);
  append(report,'frt-companies-read-contract',Array.isArray(bootstrap?.companies));
  if(allowed)report.role=membership.role;

  const again=await auth.getVerifiedUser();
  const after=await api.context();
  append(report,'signed-identity-and-workspace-stable',
   again?.id===user.id&&auth.userId===user.id&&after?.user_id===user.id&&
   after?.workspace_id===context.workspace_id&&after?.profile?.status==='active');
  report.status=report.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';
 }catch(error){
  // No identity values, tokens, payloads or raw backend errors are exported.
  report.status='BLOCKED';
  report.reason=error?.status===401?'SIGNED_SESSION_EXPIRED':
   error?.status===403?'SIGNED_FRT_DOMAIN_ACCESS_DENIED':
   error?.code==='PGRST202'?'FRT_BOOTSTRAP_RPC_UNAVAILABLE':
   'SIGNED_FRT_READONLY_PROBE_INCOMPLETE';
 }
 return report;
}
export function sanitizeFRTCI07Report(report){
 const safe={checkpoint:'CP-FRT-SEC10-CI07',
  status:validStatus.has(report?.status)?report.status:'BLOCKED',
  role:frtRoles.has(report?.role)?report.role:'UNVERIFIED',
  checks:Array.isArray(report?.checks)?report.checks.map(c=>({
   name:validCheck.has(c?.name)?c.name:'invalid-check-name',
   status:validStatus.has(c?.status)?c.status:'BLOCKED'
  })):[],
  writesAttempted:0,roleChangesAttempted:0,
  revocationVerified:'NOT_VERIFIED',financialOperationsVerified:'NOT_VERIFIED'};
 if(typeof report?.reason==='string'&&/^[A-Z0-9_]{1,70}$/.test(report.reason))
  safe.reason=report.reason;
 return JSON.stringify(safe,null,2);
}
