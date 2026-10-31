/** CP-FRT-SEC07: read-only genuine signed-session activation gate.
 * Never persists a role, reads Auth tokens into the report, or treats a missing
 * server RPC as a successful denial. Existing Supabase Auth is authoritative.
 */
import {UserRoleManagementClient,APSYNTRA_CRM_PLATFORM_ROLES} from './user-role-management.js';

const OTHER_WORKSPACE='00000000-0000-4000-8000-000000000000';

function check(result,name,ok){
 result.checks.push({name,status:ok?'PASS':'FAIL'});
}
function deniedByGuard(err){
 // Only a real authorization denial is acceptance. Missing RPC, invalid
 // argument, expired Auth and network failures cannot count as a PASS.
 return err?.status===403 && err?.code!=='PGRST202';
}
async function requireDenied(api,name,args){
 try{await api.rpc(name,args);return false;}
 catch(err){
  if(deniedByGuard(err))return true;
  throw err;
 }
}
function safeFailure(error){
 if(error?.code==='PGRST202')return 'CRM_ROLE_BACKEND_NOT_INSTALLED';
 if(error?.status===401)return 'SIGNED_SESSION_EXPIRED';
 if(error?.status===403)return 'AUTHORIZATION_PRECONDITION_DENIED';
 if(error?.status===404)return 'RPC_NOT_AVAILABLE_OR_NOT_EXPOSED';
 return 'SIGNED_READ_ONLY_CHECK_INCOMPLETE';
}
export async function runFRTSec07ActivationGate({auth,api}={}){
 const report={
  checkpoint:'CP-FRT-SEC07',scenario:'UNVERIFIED',status:'BLOCKED',
  checks:[],writesAttempted:0,secretValuesIncluded:false
 };
 if(!auth||!api)return {...report,reason:'SIGNED_AUTH_AND_API_REQUIRED'};
 try{
  const signed=await auth.getVerifiedUser();
  const ctx=await api.context();
  if(!signed?.id||signed.id!==auth.userId||signed.id!==ctx?.user_id||
    !ctx?.workspace_id||ctx?.profile?.status!=='active')
   throw Error('Signed session and workspace mismatch');
  check(report,'signed-identity-and-active-workspace',true);

  const bootstrap=await api.rpc('apsyntra_role_is_bootstrap',{});
  if(typeof bootstrap!=='boolean')throw Error('Invalid server role decision');
  report.scenario=bootstrap?'BOOTSTRAP':'NONBOOTSTRAP';
  check(report,'authoritative-bootstrap-decision',true);

  if(bootstrap){
   // This client first requires the existing bootstrap-protected snapshot.
   // Its compatibility fallback must not certify a missing CRM RPC.
   const data=await new UserRoleManagementClient(api).snapshot(ctx.workspace_id);
   if(data.crmPlatformUnavailable===true){
    report.reason='CRM_ROLE_BACKEND_NOT_INSTALLED';return report;
   }
   const roleRows=data.crmPlatformRoles||[];
   const ids=new Set(data.users.map(x=>x.id));
   const seen=new Set();
   check(report,'crm-platform-snapshot-active-and-complete',
    roleRows.length===ids.size&&roleRows.every(x=>{
     if(!ids.has(x.userId)||seen.has(x.userId))return false;
     seen.add(x.userId);
     return APSYNTRA_CRM_PLATFORM_ROLES.includes(x.effectiveRole) &&
       APSYNTRA_CRM_PLATFORM_ROLES.includes(x.inheritedRole) &&
       (x.assignedRole===null||APSYNTRA_CRM_PLATFORM_ROLES.includes(x.assignedRole)) &&
       (x.assignedRole===null||typeof x.updatedAt==='string') &&
       x.effectiveRole===(x.assignedRole??x.inheritedRole);
    }));
   check(report,'other-workspace-crm-snapshot-denied',
    await requireDenied(api,'apsyntra_crm_platform_role_snapshot',
     {p_workspace_id:OTHER_WORKSPACE}));
   const f=await api.rpc('frt_bootstrap',{p_workspace_id:ctx.workspace_id});
   check(report,'frt-operational-context-maintained',
    f?.membership?.user_id===signed.id && Array.isArray(f?.companies));
  }else{
   check(report,'nonbootstrap-crm-platform-snapshot-denied',
    await requireDenied(api,'apsyntra_crm_platform_role_snapshot',
     {p_workspace_id:ctx.workspace_id}));
   check(report,'nonbootstrap-existing-admin-snapshot-denied',
    await requireDenied(api,'apsyntra_role_user_management_snapshot',
     {p_workspace_id:ctx.workspace_id}));
  }
  report.status=report.checks.every(x=>x.status==='PASS')?'PASS':'FAIL';
 }catch(err){
  report.status='BLOCKED';report.reason=safeFailure(err);
 }
 return report;
}
