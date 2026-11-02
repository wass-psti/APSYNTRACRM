/** CP-FRT-SEC14: genuine caller-bound NONBOOTSTRAP / foreign-workspace
 * negative authorization probes. No finance writes, role mutations, session
 * issuance, or access to unrelated workspace data. The operator must supply
 * an existing foreign workspace UUID from an independent approved inventory;
 * the probe cannot verify that identifier's existence.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const checks=new Set(['signed-context','nonbootstrap-classification',
 'active-frt-module-grant','signed-frt-own-workspace',
 'foreign-workspace-dashboard-denied','foreign-workspace-list-denied',
 'stable-signed-context']);
const states=new Set(['PASS','PENDING','FAIL','BLOCKED']);
const blank=()=>({checkpoint:'CP-FRT-SEC14-DENIAL',status:'BLOCKED',
 scenario:'UNVERIFIED',role:'UNVERIFIED',checks:[],
 foreignWorkspaceExistence:'NOT_VERIFIED',writesAttempted:0,
 roleChangesAttempted:0,financialWritesVerified:'NOT_VERIFIED'});
const add=(r,name,status)=>r.checks.push({name,status});
const denied=e=>e?.code==='42501' || (e?.status===403&&e?.code==='PGRST301');
async function expectDeny(api,name,args){
 try { await api.rpc(name,args);return 'FAIL'; }
 catch(e){return denied(e)?'PASS':'BLOCKED';}
}
export async function runSEC14SignedDenials({auth,api,foreignWorkspaceId}={}){
 const r=blank();
 if(!auth||!api)return {...r,reason:'SIGNED_CONTEXT_REQUIRED'};
 try{
  const first=await auth.getVerifiedUser(),ctx=await api.context();
  if(!uuid.test(first?.id||'')||auth.userId!==first.id||
   ctx?.user_id!==first.id||!uuid.test(ctx?.workspace_id||'')||
   ctx?.profile?.status!=='active')
   return {...r,reason:'SIGNED_CONTEXT_INVALID'};
  add(r,'signed-context','PASS');

  const boot=await api.rpc('apsyntra_role_is_bootstrap',{});
  if(typeof boot!=='boolean')return {...r,reason:'BOOTSTRAP_CLASSIFICATION_UNAVAILABLE'};
  r.scenario=boot?'BOOTSTRAP':'NONBOOTSTRAP';
  if(boot)return {...r,reason:'NONBOOTSTRAP_SESSION_REQUIRED'};
  add(r,'nonbootstrap-classification','PASS');

  // A nonbootstrap FRT grantee is necessary for a meaningful isolation test:
  // an account lacking *any* FRT grant would be denied in both workspaces.
  const access=await api.rpc('has_module_access',{
   p_module_id:'fund-released-tracker',p_user_id:first.id
  });
  if(access!==true)return {...r,reason:access===false?
   'NONBOOTSTRAP_FRT_GRANT_REQUIRED':'INVALID_FRT_GRANT_DECISION'};
  add(r,'active-frt-module-grant','PASS');
  const scope=await api.rpc('frt_bootstrap',{p_workspace_id:ctx.workspace_id});
  const member=scope?.membership;
  if(member?.user_id!==first.id||member?.workspace_id!==ctx.workspace_id||
   member?.enabled!==true||member?.status!=='active'||
   !roles.has(member?.role)||!Array.isArray(scope?.companies))
   return {...r,reason:'SIGNED_FRT_OWN_SCOPE_NOT_VERIFIED'};
  r.role=member.role;
  add(r,'signed-frt-own-workspace','PASS');

  // Cannot prove a cross-workspace denial against a fabricated random UUID.
  // Reject the active workspace, and never send it to the foreign RPC probes.
  if(!uuid.test(foreignWorkspaceId||'')||
   foreignWorkspaceId===ctx.workspace_id)
   return {...r,status:'PENDING',reason:'EXISTING_FOREIGN_WORKSPACE_ID_REQUIRED'};
  const company=scope.companies.find(c=>/^[A-Za-z0-9_-]{1,32}$/.test(c?.code||''))?.code||'WAO';
  const base={p_workspace_id:foreignWorkspaceId,p_company:company};
  const [dashboard,list]=await Promise.all([
   expectDeny(api,'frt_board_dashboard_safe',base),
   expectDeny(api,'frt_board_list_safe',{...base,p_search:''})
  ]);
  add(r,'foreign-workspace-dashboard-denied',dashboard);
  add(r,'foreign-workspace-list-denied',list);
  const again=await auth.getVerifiedUser(),after=await api.context();
  const rechecked=await api.rpc('apsyntra_role_is_bootstrap',{});
  add(r,'stable-signed-context',
   again?.id===first.id&&auth.userId===first.id&&
   after?.user_id===first.id&&after?.workspace_id===ctx.workspace_id&&
   after?.profile?.status==='active'&&rechecked===false?'PASS':'FAIL');
  r.status=r.checks.some(x=>x.status==='FAIL')?'FAIL':
   r.checks.some(x=>x.status==='BLOCKED')?'BLOCKED':'PENDING';
  // Even 42501 on a distinct UUID cannot independently establish that
  // it names a real other workspace. This must be externally attested.
  r.reason=r.status==='PENDING'?'FOREIGN_WORKSPACE_EXISTENCE_NOT_VERIFIED':
   r.status==='FAIL'?'FOREIGN_WORKSPACE_ACCESS_NOT_DENIED':'DENIAL_TEST_INCOMPLETE';
 }catch(e){
  r.status='BLOCKED';
  r.reason=e?.status===401?'SIGNED_SESSION_EXPIRED':
   'SIGNED_DENIAL_PROBE_INCOMPLETE';
 }
 return r;
}
export function sanitizeSEC14SignedDenials(report){
 return JSON.stringify({
  checkpoint:'CP-FRT-SEC14-DENIAL',
  status:states.has(report?.status)?report.status:'BLOCKED',
  scenario:['NONBOOTSTRAP','BOOTSTRAP'].includes(report?.scenario)?
    report.scenario:'UNVERIFIED',
  role:roles.has(report?.role)?report.role:'UNVERIFIED',
  checks:Array.isArray(report?.checks)?report.checks.map(c=>({
   name:checks.has(c?.name)?c.name:'invalid-check',
   status:states.has(c?.status)?c.status:'BLOCKED'})):[],
  reason:/^[A-Z0-9_]{1,75}$/.test(report?.reason||'')?report.reason:undefined,
  foreignWorkspaceExistence:'NOT_VERIFIED',
  writesAttempted:0,roleChangesAttempted:0,
  financialWritesVerified:'NOT_VERIFIED'
 },null,2);
}
