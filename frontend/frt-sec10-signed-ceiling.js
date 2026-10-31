import {inspectMySignedEffectiveAccess} from './signed-effective-access.js';

/** CP-FRT-SEC10 read-only signed capabilities after an independently authorized
 * nonproduction transition. This function DOES NOT change roles, make a new
 * Auth session, establish prior board ownership or certify token issuance.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stages={
 VIEWER:{view:true,edit:false,manage:false,frt:false},
 SUPERVISOR:{view:true,edit:true,manage:false,frt:true},
 RESTORED:{view:true,edit:true,manage:true,frt:true}
};
const check=(r,name,ok)=>r.checks.push({name,status:ok?'PASS':'FAIL'});
export async function runFRTSec10SignedCeilingProbe({auth,api,boardId,stage}={}){
 const report={checkpoint:'CP-FRT-SEC10',status:'BLOCKED',scenario:'UNVERIFIED',
  phase:Object.hasOwn(stages,stage)?stage:'INVALID',checks:[],
  writesAttempted:0,roleChangesAttempted:0,
  freshSessionIssued:'NOT_VERIFIED',prerequisiteOwnershipVerified:'NOT_VERIFIED'};
 if(!auth||!api||!uuid.test(boardId||'')||!Object.hasOwn(stages,stage))
  return {...report,reason:'INVALID_SIGNED_PROBE_INPUT'};
 try{
  const user=await auth.getVerifiedUser();
  const original=await api.context();
  if(!uuid.test(user?.id||'')||auth.userId!==user.id||
     original?.user_id!==user.id||!uuid.test(original?.workspace_id||'')||
     original?.profile?.status!=='active')
   return {...report,reason:'SIGNED_CONTEXT_INVALID'};

  // No platform role/permission is inferred from a JWT, UI label or
  // the chosen phase. Only authoritative server RPC decisions are evaluated.
  const bootstrap=await api.rpc('apsyntra_role_is_bootstrap',{});
  if(bootstrap===true){
   report.scenario='BOOTSTRAP';
   return {...report,reason:'BOOTSTRAP_SESSION_INELIGIBLE'};
  }
  if(bootstrap!==false)
   return {...report,reason:'INVALID_BOOTSTRAP_DECISION'};
  report.scenario='NONBOOTSTRAP';
  const boards=await api.boards('active');
  if(!Array.isArray(boards)||!boards.some(b=>b?.id===boardId))
   return {...report,reason:'EXISTING_ACCESSIBLE_BOARD_REQUIRED'};

  // CP11 is the existing authoritative, caller-only effective access RPC.
  // Never certify the operator's SELECTED stage merely because board/member
  // permissions happen to match the expected Viewer/Supervisor/Restored shape.
  const self=await inspectMySignedEffectiveAccess({auth,api});
  if(self.status!=='PASS'||self.scenario!=='NONBOOTSTRAP')
   return {...report,reason:'SIGNED_SELF_ACCESS_PRECONDITION_FAILED'};
  const inspectedBoard=self.boards.find(b=>b.id===boardId);
  if(!inspectedBoard)
   return {...report,reason:'BOARD_NOT_IN_SELF_ACCESS_SNAPSHOT'};
  const explicit=self.explicitPlatformRole;
  const stageMatches=stage==='VIEWER'
   ? explicit==='viewer'&&self.effectivePlatformRole==='viewer'
   : stage==='SUPERVISOR'
    ? explicit==='supervisor'&&self.effectivePlatformRole==='supervisor'
    : explicit===null;
  if(!stageMatches)
   return {...report,reason:'STAGE_NOT_CONFIRMED_BY_BACKEND'};
  if(stage==='RESTORED'&&(
     inspectedBoard.memberRole!=='owner'||
     self.modules.find(m=>m.moduleId==='fund-released-tracker')?.allowed!==true))
   return {...report,reason:'ORIGINAL_OPERATIONAL_PREREQUISITES_MISSING'};
  check(report,'authoritative-stage-confirmed',true);

  const views=await api.allowed(boardId,'view');
  const edits=await api.allowed(boardId,'edit');
  const manages=await api.allowed(boardId,'manage');
  const moduleAccess=await api.rpc('has_module_access',{
   p_module_id:'fund-released-tracker',p_user_id:user.id
  });
  if([views,edits,manages,moduleAccess].some(x=>typeof x!=='boolean'))
   return {...report,reason:'INVALID_SERVER_PERMISSION_RESPONSE'};
  const expected=stages[stage];
  check(report,'existing-board-view',views===expected.view);
  check(report,'board-edit-ceiling',edits===expected.edit);
  check(report,'board-manage-ceiling',manages===expected.manage);
  check(report,'frt-module-access-ceiling',moduleAccess===expected.frt);

  // Validate the role-admin view still rejects the signed nonbootstrap.
  let denial=false;
  try{
   await api.rpc('apsyntra_crm_platform_role_snapshot',{
    p_workspace_id:original.workspace_id
   });
  }catch(e){
   if(e?.status!==403)throw e;
   denial=true;
  }
  check(report,'nonbootstrap-admin-snapshot-denied',denial);

  const after=await auth.getVerifiedUser();
  const ctx=await api.context();
  const afterBootstrap=await api.rpc('apsyntra_role_is_bootstrap',{});
  check(report,'signed-workspace-identity-stable',
   after?.id===user.id&&auth.userId===user.id&&ctx?.user_id===user.id&&
   ctx?.workspace_id===original.workspace_id&&ctx?.profile?.status==='active'&&
   afterBootstrap===false);
  report.status=report.checks.every(x=>x.status==='PASS')?'PASS':'FAIL';
 }catch(e){
  report.status='BLOCKED';
  report.reason=e?.status===401?'SIGNED_SESSION_EXPIRED':
   e?.code==='PGRST202'?'MISSING_AUTHORIZATION_RPC':
   'SIGNED_CAPABILITY_READ_INCOMPLETE';
 }
 return report;
}
export function sanitizeFRTSec10Report(result){
 const valid=new Set(['PASS','FAIL','BLOCKED']);
 const clean={
  checkpoint:'CP-FRT-SEC10',
  status:valid.has(result?.status)?result.status:'BLOCKED',
  scenario:['BOOTSTRAP','NONBOOTSTRAP'].includes(result?.scenario)?result.scenario:'UNVERIFIED',
  phase:Object.hasOwn(stages,result?.phase)?result.phase:'INVALID',
  checks:Array.isArray(result?.checks)?result.checks.map(c=>({
   name:/^[a-z0-9-]{1,70}$/.test(c?.name||'')?c.name:'invalid-check-name',
   status:valid.has(c?.status)?c.status:'BLOCKED'
  })):[],
  writesAttempted:Number.isSafeInteger(result?.writesAttempted)&&result.writesAttempted>=0?result.writesAttempted:-1,
  roleChangesAttempted:Number.isSafeInteger(result?.roleChangesAttempted)&&result.roleChangesAttempted>=0?result.roleChangesAttempted:-1,
  freshSessionIssued:'NOT_VERIFIED',
  prerequisiteOwnershipVerified:'NOT_VERIFIED'
 };
 if(typeof result?.reason==='string'&&/^[A-Z0-9_]{1,64}$/.test(result.reason))
  clean.reason=result.reason;
 return JSON.stringify(clean,null,2);
}
