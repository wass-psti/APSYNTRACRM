/** CP-FRT-SEC11: signed, read-only inspection of SELF permissions.
 * This does not replace CP-FRT-SEC10 controlled transition acceptance.
 * Backend alone decides which modules and boards the caller may access.
 */
const roles=new Set(['admin','supervisor','employee','viewer']);
const modules=new Set(['aps-aims','charter-navigator','employee-eval','fueltrack-plus',
 'fueltrans','fund-released-tracker','material-request-hub','order-intake',
 'time-tracker','tool-traceability','toolbox-issues','tradelink']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[89ab0-9a-f]{12}$/i;
const boolean=v=>typeof v==='boolean';
const fail=(reason)=>({checkpoint:'CP-FRT-SEC11',status:'BLOCKED',reason,
  checks:[],modules:[],boards:[],writesAttempted:0,roleChangesAttempted:0});

export async function inspectMySignedEffectiveAccess({auth,api}={}){
 if(!auth||!api)return fail('SIGNED_AUTH_AND_API_REQUIRED');
 try{
  const user=await auth.getVerifiedUser();
  const ctx=await api.context();
  if(!uuid.test(user?.id||'')||auth.userId!==user.id||
     ctx?.user_id!==user.id||!uuid.test(ctx?.workspace_id||'')||
     ctx.profile?.status!=='active')return fail('SIGNED_CONTEXT_INVALID');

  const raw=await api.rpc('apsyntra_crm_my_effective_access',{});
  if(raw?.schemaVersion!==1||raw.workspaceId!==ctx.workspace_id||
     raw.platformRole!==ctx.profile.platform_role||
     !roles.has(raw.effectivePlatformRole)||
     (raw.explicitPlatformRole!==null&&!roles.has(raw.explicitPlatformRole))||
     !boolean(raw.bootstrap)||!Array.isArray(raw.modules)||
     !Array.isArray(raw.boards))return fail('INVALID_SELF_AUTHORIZATION_SNAPSHOT');

  const seenModules=new Set();
  const moduleRows=[];
  for(const m of raw.modules){
   if(!modules.has(m?.moduleId)||seenModules.has(m.moduleId)||
      !boolean(m.allowed)||(m.role!==null&&typeof m.role!=='string'))
    return fail('INVALID_MODULE_ACCESS_SNAPSHOT');
   seenModules.add(m.moduleId);
   moduleRows.push({moduleId:m.moduleId,role:m.role,allowed:m.allowed});
  }
  if(seenModules.size!==modules.size)return fail('INCOMPLETE_MODULE_ACCESS_SNAPSHOT');

  const seenBoards=new Set();
  const boardRows=[];
  for(const b of raw.boards){
   if(!uuid.test(b?.id||'')||seenBoards.has(b.id)||
      typeof b.name!=='string'||b.name.length>250||
      !boolean(b.view)||!boolean(b.edit)||!boolean(b.manage)||
      b.view!==true||(b.edit&&!b.view)||(b.manage&&!b.edit)||
      (b.memberRole!==null&&typeof b.memberRole!=='string'))
     return fail('INVALID_BOARD_ACCESS_SNAPSHOT');
   seenBoards.add(b.id);
   boardRows.push({id:b.id,name:b.name,memberRole:b.memberRole,
    view:b.view,edit:b.edit,manage:b.manage});
  }
  const again=await auth.getVerifiedUser();
  const current=await api.context();
  if(again?.id!==user.id||auth.userId!==user.id||current?.user_id!==user.id||
     current?.workspace_id!==ctx.workspace_id||current?.profile?.status!=='active')
   return fail('SIGNED_CONTEXT_CHANGED');

  return {checkpoint:'CP-FRT-SEC11',status:'PASS',
   scenario:raw.bootstrap?'BOOTSTRAP':'NONBOOTSTRAP',
   platformRole:raw.platformRole,effectivePlatformRole:raw.effectivePlatformRole,
   explicitPlatformRole:raw.explicitPlatformRole,
   modules:moduleRows,boards:boardRows,boardsEmpty:boardRows.length===0,
   checks:[{name:'signed-identity-and-workspace',status:'PASS'},
    {name:'authoritative-self-platform-role',status:'PASS'},
    {name:'central-module-authorization',status:'PASS'},
    {name:'workspace-scoped-board-authorization',status:'PASS'},
    {name:'signed-context-remained-stable',status:'PASS'}],
   writesAttempted:0,roleChangesAttempted:0};
 }catch(e){
  const reason=e?.status===401?'SIGNED_SESSION_EXPIRED':
   e?.code==='PGRST202'?'SELF_AUTHORIZATION_BACKEND_NOT_INSTALLED':
   e?.status===403?'SIGNED_SELF_AUTHORIZATION_DENIED':
   'SIGNED_SELF_INSPECTION_INCOMPLETE';
  return fail(reason);
 }
}

export function sanitizeEffectiveAccessReport(report){
 const safe=(v)=>/^[a-z0-9-]{1,70}$/.test(v||'')?v:'invalid-check-name';
 const result={checkpoint:'CP-FRT-SEC11',
  status:['PASS','BLOCKED','FAIL'].includes(report?.status)?report.status:'BLOCKED',
  scenario:['BOOTSTRAP','NONBOOTSTRAP'].includes(report?.scenario)?report.scenario:'UNVERIFIED',
  platformRole:typeof report?.platformRole==='string'&&/^[a-z_]{2,40}$/.test(report.platformRole)?report.platformRole:'UNVERIFIED',
  effectivePlatformRole:roles.has(report?.effectivePlatformRole)?report.effectivePlatformRole:'UNVERIFIED',
  checks:Array.isArray(report?.checks)?report.checks.map(x=>({
   name:safe(x?.name),status:['PASS','BLOCKED','FAIL'].includes(x?.status)?x.status:'BLOCKED'})):[],
  modulePermissions:Array.isArray(report?.modules)?report.modules
   .filter(x=>modules.has(x?.moduleId)&&boolean(x?.allowed))
   .map(x=>({moduleId:x.moduleId,allowed:x.allowed,role:typeof x.role==='string'&&/^[A-Za-z_ -]{1,45}$/.test(x.role)?x.role:null})):[],
  boardPermissions:Array.isArray(report?.boards)?report.boards
   .filter(x=>boolean(x?.view)&&boolean(x?.edit)&&boolean(x?.manage))
   .map(x=>({view:x.view,edit:x.edit,manage:x.manage})):[],
  writesAttempted:0,roleChangesAttempted:0
 };
 if(typeof report?.reason==='string'&&/^[A-Z0-9_]{1,70}$/.test(report.reason))
  result.reason=report.reason;
 return JSON.stringify(result,null,2);
}
