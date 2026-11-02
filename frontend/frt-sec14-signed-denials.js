/** CP-FRT-SEC14: genuine caller-bound NONBOOTSTRAP / foreign-workspace
 * negative authorization probes. No finance writes, role mutations, session
 * issuance, or access to unrelated workspace data. The server automatically
 * selects an existing foreign workspace and never returns its UUID.
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
export async function runSEC14SignedDenials({auth,api}={}){
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

  const evidence=await api.rpc('frt_sec14_auto_foreign_denials',{
   p_workspace_id:ctx.workspace_id
  });
  // Backend returns fixed verdicts only. Never trust a client-supplied UUID
  // or infer existence from denial against a random, nonexistent workspace.
  const expected=['status','reason','foreignWorkspaceExistence','dashboard','list'];
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)||
   Object.keys(evidence).length!==expected.length||
   !expected.every(k=>Object.hasOwn(evidence,k)))
   return {...r,reason:'AUTO_FOREIGN_WORKSPACE_CONTRACT_INVALID'};
  if(evidence.status==='PENDING'&&
   evidence.reason==='NO_INDEPENDENT_FOREIGN_WORKSPACE'&&
   evidence.foreignWorkspaceExistence==='NOT_VERIFIED'&&
   evidence.dashboard==='PENDING'&&evidence.list==='PENDING')
   return {...r,status:'PENDING',reason:'NO_INDEPENDENT_FOREIGN_WORKSPACE'};
  const denyBoth=evidence.dashboard==='PASS'&&evidence.list==='PASS';
  if(evidence.foreignWorkspaceExistence!=='VERIFIED'||
   !['PASS','FAIL'].includes(evidence.dashboard)||
   !['PASS','FAIL'].includes(evidence.list)||
   evidence.status!==(denyBoth?'PASS':'FAIL')||
   evidence.reason!==(denyBoth?'FOREIGN_WORKSPACE_DENIAL_VERIFIED':
    'FOREIGN_WORKSPACE_ACCESS_NOT_DENIED'))
   return {...r,reason:'AUTO_FOREIGN_WORKSPACE_CONTRACT_INVALID'};
  r.foreignWorkspaceExistence='VERIFIED';
  add(r,'foreign-workspace-dashboard-denied',evidence.dashboard);
  add(r,'foreign-workspace-list-denied',evidence.list);
  const again=await auth.getVerifiedUser(),after=await api.context();
  const rechecked=await api.rpc('apsyntra_role_is_bootstrap',{});
  add(r,'stable-signed-context',
   again?.id===first.id&&auth.userId===first.id&&
   after?.user_id===first.id&&after?.workspace_id===ctx.workspace_id&&
   after?.profile?.status==='active'&&rechecked===false?'PASS':'FAIL');
  r.status=r.checks.some(x=>x.status==='FAIL')?'FAIL':
   r.checks.some(x=>x.status==='BLOCKED')?'BLOCKED':'PASS';
  r.reason=r.status==='PASS'?'FOREIGN_WORKSPACE_DENIAL_VERIFIED':
   r.status==='FAIL'?'FOREIGN_WORKSPACE_ACCESS_NOT_DENIED':'DENIAL_TEST_INCOMPLETE';
 }catch(e){
  r.status='BLOCKED';
  r.reason=e?.status===401?'SIGNED_SESSION_EXPIRED':
   e?.code==='PGRST202'?'AUTO_FOREIGN_WORKSPACE_RPC_NOT_ACTIVE':
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
  foreignWorkspaceExistence:report?.foreignWorkspaceExistence==='VERIFIED'?
   'VERIFIED':'NOT_VERIFIED',
  writesAttempted:0,roleChangesAttempted:0,
  financialWritesVerified:'NOT_VERIFIED'
 },null,2);
}
