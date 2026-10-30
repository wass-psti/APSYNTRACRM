/** CP-FRT-SEC03 — read-only signed-user FRT authorization acceptance.
 * Uses the current Supabase Auth session. Never requests credentials, logs tokens,
 * mutates a role, or treats a mocked identity as a signed acceptance result.
 */
import {RoleConfigurationClient} from './role-configuration-client.js';
import {UserRoleManagementClient,MODULE_ROLE_OPTIONS} from './user-role-management.js';

const OTHER_WORKSPACE='00000000-0000-4000-8000-000000000000';
const FRT_ROLES=['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'];
const deniedStatuses=new Set([403,404]);

async function readDenied(api,name,args){
 try{
  await api.rpc(name,args);
  return false;
 }catch(error){
  // 403 is authorization denial. PostgREST may mask an ungranted RPC as 404.
  if(deniedStatuses.has(error?.status))return true;
  throw error;
 }
}
function check(report,name,passed){
 report.checks.push({name,status:passed?'PASS':'FAIL'});
}
export async function runFRTSec03SignedAcceptance({auth,api}={}){
 const report={
  checkpoint:'CP-FRT-SEC03',status:'BLOCKED',scenario:'UNVERIFIED',
  checks:[],writesAttempted:0,secretValuesIncluded:false
 };
 if(!auth||!api)return {...report,reason:'Authentication client and authorized API required'};
 try{
  const verified=await auth.getVerifiedUser();
  const context=await api.context();
  if(!verified?.id||verified.id!==auth.userId||context?.user_id!==verified.id||
      !context?.workspace_id||context?.profile?.status!=='active')
   throw Error('Signed identity or active workspace context invalid');
  check(report,'verified-signed-identity',true);

  const roleClient=new RoleConfigurationClient(api);
  const bootstrap=await roleClient.bootstrapVerified();
  if(typeof bootstrap!=='boolean')throw Error('Invalid server bootstrap decision');
  report.scenario=bootstrap?'BOOTSTRAP':'NONBOOTSTRAP';

  check(report,'frt-operational-role-vocabulary',
   JSON.stringify(MODULE_ROLE_OPTIONS['fund-released-tracker'])===JSON.stringify(FRT_ROLES));
  check(report,'legacy-frt-admin-list-unavailable',
   await readDenied(api,'frt_admin_users',{p_workspace_id:context.workspace_id}));

  if(bootstrap){
   const roleSnapshot=await roleClient.snapshot(context.workspace_id);
   const userSnapshot=await new UserRoleManagementClient(api).snapshot(context.workspace_id);
   check(report,'bootstrap-role-configuration-snapshot',roleSnapshot.bootstrapVerified===true);
   check(report,'bootstrap-user-management-snapshot',userSnapshot.bootstrapVerified===true);
   check(report,'other-workspace-role-snapshot-denied',
    await readDenied(api,'apsyntra_role_configuration_snapshot',
     {p_workspace_id:OTHER_WORKSPACE}));
   const frt=await api.rpc('frt_bootstrap',{p_workspace_id:context.workspace_id});
   check(report,'existing-frt-operational-context',
    frt?.membership?.user_id===verified.id &&
    FRT_ROLES.includes(frt?.membership?.role) &&
    Array.isArray(frt?.companies));
  }else{
   check(report,'nonbootstrap-role-configuration-denied',
    await readDenied(api,'apsyntra_role_configuration_snapshot',
     {p_workspace_id:context.workspace_id}));
   check(report,'nonbootstrap-user-management-denied',
    await readDenied(api,'apsyntra_role_user_management_snapshot',
     {p_workspace_id:context.workspace_id}));
  }
  report.status=report.checks.every(x=>x.status==='PASS')?'PASS':'FAIL';
 }catch(error){
  report.status='BLOCKED';
  // Do not copy server errors: they can contain account IDs or other sensitive data.
  report.reason=error?.status?'HTTP '+error.status:'Signed authorization context not verified';
 }
 return report;
}
