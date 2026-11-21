/** CP-RC02 User Role Management. Server RPCs, never direct table mutations.
 * The existing module_role_assignments and work_board_members stay authoritative.
 */
import {ROLE_MODULE_OPTIONS} from './role-configuration-ui.js';
import {roleConfigurationIcon} from './role-configuration-visuals.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const APSYNTRA_CRM_PLATFORM_ROLES=Object.freeze(['admin','supervisor','employee','viewer']);
/** Only a changed explicit workspace override is a role mutation. */
export function crmPlatformRoleChangeNeeded(assignedRole,requestedRole){
 return assignedRole!==requestedRole;
}
export const MODULE_ROLE_OPTIONS=Object.freeze({
 'time-tracker':['Employee','OJT','Supervisor','HR','Finance','System Admin','IT Administrator'],
 'fueltrack-plus':['User','Pump Attendant','Admin'],
 'tradelink':['User','Sales Supervisor','General Manager'],
 'toolbox-issues':['admin','supervisor','employee','viewer'],
 'fund-released-tracker':['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'],
 'fueltrans':['Admin','User','Viewer'],
 'order-intake':['Admin','User','Viewer'],
 'tool-traceability':['ADMIN','LOGISTICS','USER','VIEWER'],
 'material-request-hub':['ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER'],
 'aps-aims':['Administrator','AssetManager','Custodian','Viewer'],
 'employee-eval':['admin','supervisor','employee'],
 'charter-navigator':['admin','user']
});
export function effectiveModuleRoleLabel(assignment,options=[]){
 if(!assignment)return 'Unassigned';
 if(!options.includes(assignment.role))
  return assignment.enabled?
   'Unsupported legacy role: '+String(assignment.role??'')+' (not effective)':
   'Disabled legacy role: '+String(assignment.role??'');
 return (assignment.enabled?'Active: ':'Disabled: ')+assignment.role;
}
export function defaultModuleRoleForAssignment(resourceId,assignment,options=[]){
 if(assignment?.role&&options.includes(assignment.role))return assignment.role;
 if(resourceId==='charter-navigator'&&options.includes('user'))return 'user';
 return options[0]||'';
}
export const SCOPED_SIX_MODULE_IDS=Object.freeze([
 'time-tracker','fueltrack-plus','tradelink',
 'order-intake','employee-eval','aps-aims'
]);
export const FUELTRANS_WORKSPACE_ROLES=Object.freeze([
 'admin','fueltrans','watchdog_employee','global_l1_support',
 'local_l2_support','call_center_specialist','viewer'
]);
const delegatedModules=new Set(['time-tracker','fueltrack-plus','tradelink','fund-released-tracker','tool-traceability','material-request-hub','toolbox-issues']);
export class UserRoleManagementClient {
 constructor(api){this.api=api;}
 async snapshot(workspaceId,{includeFuelTrans=false,includeFundTracker=false,includeScopedSix=false,includeCharter=false}={}){
  if(!UUID.test(workspaceId||''))throw Error('Invalid workspace');
  // Always verify the existing server-authorized workspace snapshot first. New optional
  // RPC availability must never bypass the central CRM Administrator scope guard.
  const d=await this.api.rpc('apsyntra_role_user_management_snapshot',{p_workspace_id:workspaceId});
  if(d?.adminVerified!==true||d.workspaceId!==workspaceId||
   !['users','modules','moduleAssignments','boards','boardAssignments'].every(x=>Array.isArray(d[x])))
   throw Error('Invalid server-authorized role management result');
  const workspaceScopeCountsAvailable=d.users.every(u=>
    Number.isInteger(u.activeWorkspaceCount)&&u.activeWorkspaceCount>=1);
  const workspaceScopedMrhAvailable=d.roleManagementContract===
    'cp-rc03-workspace-scoped-mrh-v1'&&workspaceScopeCountsAvailable;
  const scopeMetadata={workspaceScopeCountsAvailable,workspaceScopedMrhAvailable};
  let crm;
  try {
   crm=await this.api.rpc('apsyntra_crm_platform_role_snapshot',{p_workspace_id:workspaceId});
  } catch(error) {
   // Only the exact PostgREST missing-RPC contract permits a temporary
   // read-only compatibility view. Never treat 401/403/other 404 as missing,
   // and never infer, fabricate, or permit assignment of CRM platform roles.
   if(error?.status===404&&error?.code==='PGRST202')
    return {...d,...scopeMetadata,crmPlatformRoles:[],crmPlatformUnavailable:true};
   throw error;
  }
  if(crm?.adminVerified!==true||crm.workspaceId!==workspaceId||
    !Array.isArray(crm.roles)||!crm.roles.every(r=>UUID.test(r.userId||'')&&
      APSYNTRA_CRM_PLATFORM_ROLES.includes(r.effectiveRole)&&
      (r.assignedRole===null||APSYNTRA_CRM_PLATFORM_ROLES.includes(r.assignedRole))))
    throw Error('Invalid server-authorized CRM platform-role snapshot');
  let fueltransWorkspace=null;
  if(includeFuelTrans){
   try{
    fueltransWorkspace=await this.api.rpc('apsyntra_role_fueltrans_workspace_snapshot',{
     p_workspace_id:workspaceId});
   }catch(error){
    if(!(error?.status===404&&error?.code==='PGRST202'))throw error;
   }
  }
  if(fueltransWorkspace!==null&&(
   fueltransWorkspace?.contract!=='cp-urm-fueltrans-workspace-v1'||
   fueltransWorkspace?.workspaceId!==workspaceId||
   !Array.isArray(fueltransWorkspace.assignments)||
   !fueltransWorkspace.assignments.every(a=>UUID.test(a.userId||'')&&
    a.moduleId==='fueltrans'&&typeof a.role==='string'&&
    typeof a.enabled==='boolean'&&typeof a.clientManaged==='boolean'&&
    (a.updatedAt===null||Number.isFinite(Date.parse(a.updatedAt))))))
   throw Error('Invalid authoritative FuelTrans workspace membership response');
  // The domain's workspace membership, not the global legacy role, controls
  // Tool Traceability operational access and must be the role readback source.
  let tooltraceWorkspace=null;
  try {
   tooltraceWorkspace=await this.api.rpc('apsyntra_role_tooltrace_workspace_snapshot',{
    p_workspace_id:workspaceId});
  } catch(error) {
   if(!(error?.status===404&&error?.code==='PGRST202'))throw error;
  }
  if(tooltraceWorkspace!==null&&(
   tooltraceWorkspace?.contract!=='cp-urm-tooltrace-workspace-v1'||
   tooltraceWorkspace.workspaceId!==workspaceId||
   !Array.isArray(tooltraceWorkspace.assignments)||
   !tooltraceWorkspace.assignments.every(a=>UUID.test(a.userId||'')&&
    a.moduleId==='tool-traceability'&&
    MODULE_ROLE_OPTIONS['tool-traceability'].includes(a.role)&&
    typeof a.enabled==='boolean'&&
    (a.updatedAt===null||Number.isFinite(Date.parse(a.updatedAt))))))
   throw Error('Invalid authoritative Tool Traceability workspace membership response');
  let frtWorkspace=null;
  if(includeFundTracker){
   try{
    frtWorkspace=await this.api.rpc('apsyntra_role_frt_workspace_snapshot',{
     p_workspace_id:workspaceId});
   }catch(error){
    if(!(error?.status===404&&error?.code==='PGRST202'))throw error;
   }
  }
  if(frtWorkspace!==null&&(
    frtWorkspace.contract!=='cp-urm-frt-workspace-v1'||
    frtWorkspace.workspaceId!==workspaceId||
    !Array.isArray(frtWorkspace.assignments)||
    !frtWorkspace.assignments.every(a=>UUID.test(a.userId||'')&&
     a.moduleId==='fund-released-tracker'&&
     MODULE_ROLE_OPTIONS['fund-released-tracker'].includes(a.role)&&
     typeof a.enabled==='boolean'&&
     (a.updatedAt===null||Number.isFinite(Date.parse(a.updatedAt))))))
   throw Error('Invalid workspace Fund Tracker role snapshot');
  let scopedSixWorkspace=null;
  if(includeScopedSix){
   try{
    scopedSixWorkspace=await this.api.rpc('apsyntra_role_scoped_six_snapshot',{
     p_workspace_id:workspaceId});
   }catch(error){
    if(!(error?.status===404&&error?.code==='PGRST202'))throw error;
   }
  }
  if(scopedSixWorkspace!==null&&(
   scopedSixWorkspace.contract!=='cp-urm-scoped-six-v1'||
   scopedSixWorkspace.workspaceId!==workspaceId||
   !Array.isArray(scopedSixWorkspace.assignments)||
   !scopedSixWorkspace.assignments.every(a=>UUID.test(a.userId||'')&&
     SCOPED_SIX_MODULE_IDS.includes(a.moduleId)&&
     MODULE_ROLE_OPTIONS[a.moduleId]?.includes(a.role)&&
     typeof a.enabled==='boolean'&&
     (a.updatedAt===null||Number.isFinite(Date.parse(a.updatedAt))))))
   throw Error('Invalid workspace application-role snapshot');
  let charterWorkspace=null;
  if(includeCharter){
   try{
    charterWorkspace=await this.api.rpc('apsyntra_role_charter_workspace_snapshot',{
     p_workspace_id:workspaceId});
   }catch(error){
    if(!(error?.status===404&&error?.code==='PGRST202'))throw error;
   }
  }
  if(charterWorkspace!==null&&(
    charterWorkspace.contract!=='cp-urm-charter-workspace-v1'||
    charterWorkspace.workspaceId!==workspaceId||
    !Array.isArray(charterWorkspace.assignments)||
    !charterWorkspace.assignments.every(a=>UUID.test(a.userId||'')&&
      a.moduleId==='charter-navigator'&&
      MODULE_ROLE_OPTIONS['charter-navigator'].includes(a.role)&&
      typeof a.enabled==='boolean'&&
      (a.updatedAt===null||Number.isFinite(Date.parse(a.updatedAt))))))
   throw Error('Invalid Charter workspace role snapshot');
  const charterWorkspaceAvailable=charterWorkspace!==null;
  const charterAssignments=(charterWorkspace?.assignments||[])
    .map(a=>({...a,scopedSource:true}));
  const charterOverriddenUsers=new Set(charterAssignments.map(a=>a.userId));
  const scopedSixAvailable=scopedSixWorkspace!==null;
  const scopedSixAssignments=(scopedSixWorkspace?.assignments||[])
   .map(a=>({...a,scopedSource:true}));
  const scopedSixKeys=new Set(scopedSixAssignments.map(a=>a.userId+':'+a.moduleId));
  const frtWorkspaceAvailable=frtWorkspace!==null;
  const scopedFrt=(frtWorkspace?.assignments||[]).map(a=>({...a,scopedSource:true}));
  const frtOverriddenUsers=new Set(scopedFrt.map(a=>a.userId));
  const toolTraceabilityWorkspaceAvailable=tooltraceWorkspace!==null;
  const fueltransWorkspaceAvailable=fueltransWorkspace!==null;
  const scoped=fueltransWorkspace?.assignments||[];
  const moduleAssignments=[
   ...d.moduleAssignments.filter(a=>
    !(fueltransWorkspaceAvailable&&a.moduleId==='fueltrans')&&
    !(toolTraceabilityWorkspaceAvailable&&a.moduleId==='tool-traceability')&&
    !(frtWorkspaceAvailable&&a.moduleId==='fund-released-tracker'&&frtOverriddenUsers.has(a.userId))&&
    !(scopedSixAvailable&&scopedSixKeys.has(a.userId+':'+a.moduleId))&&
    !(charterWorkspaceAvailable&&a.moduleId==='charter-navigator'&&charterOverriddenUsers.has(a.userId))),
   ...(fueltransWorkspaceAvailable?scoped:[]),
   ...(toolTraceabilityWorkspaceAvailable?tooltraceWorkspace.assignments:[]),
   ...scopedFrt,
   ...scopedSixAssignments,
   ...charterAssignments
  ];
  return {...d,...scopeMetadata,moduleAssignments,crmPlatformRoles:crm.roles,
   crmPlatformUnavailable:false,fueltransWorkspaceAvailable,
   toolTraceabilityWorkspaceAvailable,frtWorkspaceAvailable,scopedSixAvailable,charterWorkspaceAvailable};
 }
 async mutate({workspaceId,userId,scope,resourceId,role,enabled,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    typeof enabled!=='boolean'||!['module','board'].includes(scope))throw Error('Invalid role change request');
  if(scope==='module'){
   if(!MODULE_ROLE_OPTIONS[resourceId]?.includes(role))throw Error('Unsupported application role');
  }else if(!UUID.test(resourceId||'')||!['viewer','editor'].includes(role))
    throw Error('Unsupported board role');
  const r=await this.api.rpc('apsyntra_role_manage_user_access',{
    p_workspace_id:workspaceId,p_target_user_id:userId,p_scope:scope,
    p_resource_id:resourceId,p_role:role,p_enabled:enabled,
    p_expected_updated_at:expectedUpdatedAt});
  if(r?.effective!==true||r.workspaceId!==workspaceId||r.targetUserId!==userId||
    r.scope!==scope||r.resourceId!==resourceId)throw Error('Backend role change acknowledgement invalid');
  return r;
 }
 async setCharterWorkspaceRole({workspaceId,userId,role,enabled,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    !MODULE_ROLE_OPTIONS['charter-navigator'].includes(role)||
    typeof enabled!=='boolean'||
    (expectedUpdatedAt!==null&&
      (typeof expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(expectedUpdatedAt)))))
   throw Error('Invalid Charter workspace role request');
  const r=await this.api.rpc('apsyntra_role_charter_workspace_set',{
   p_workspace_id:workspaceId,p_target_user_id:userId,p_role:role,p_enabled:enabled,
   p_expected_updated_at:expectedUpdatedAt});
  if(r?.effective!==true||r.workspaceId!==workspaceId||
    r.targetUserId!==userId||r.moduleId!=='charter-navigator'||
    r.role!==role||r.enabled!==enabled)
   throw Error('Invalid Charter workspace role acknowledgement');
  return r;
 }
 async setScopedSixRole({workspaceId,userId,moduleId,role,enabled,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    !SCOPED_SIX_MODULE_IDS.includes(moduleId)||
    !MODULE_ROLE_OPTIONS[moduleId]?.includes(role)||
    typeof enabled!=='boolean'||
    (expectedUpdatedAt!==null&&
      (typeof expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(expectedUpdatedAt)))))
   throw Error('Invalid workspace application role request');
  const result=await this.api.rpc('apsyntra_role_scoped_six_set',{
   p_workspace_id:workspaceId,p_target_user_id:userId,p_module_id:moduleId,
   p_role:role,p_enabled:enabled,p_expected_updated_at:expectedUpdatedAt});
  if(result?.effective!==true||result.workspaceId!==workspaceId||
    result.targetUserId!==userId||result.moduleId!==moduleId||
    result.role!==role||result.enabled!==enabled)
   throw Error('Invalid workspace application role acknowledgement');
  return result;
 }
 async setFrtWorkspaceRole({workspaceId,userId,role,enabled,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    !MODULE_ROLE_OPTIONS['fund-released-tracker'].includes(role)||
    typeof enabled!=='boolean'||
    (expectedUpdatedAt!==null&&
     (typeof expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(expectedUpdatedAt)))))
   throw Error('Invalid Fund Tracker workspace role request');
  const result=await this.api.rpc('apsyntra_role_frt_workspace_set',{
   p_workspace_id:workspaceId,p_target_user_id:userId,p_role:role,
   p_enabled:enabled,p_expected_updated_at:expectedUpdatedAt});
  if(result?.effective!==true||result.workspaceId!==workspaceId||
     result.targetUserId!==userId||result.moduleId!=='fund-released-tracker'||
     result.role!==role||result.enabled!==enabled)
   throw Error('Invalid Fund Tracker role acknowledgement');
  return result;
 }
 async setToolTraceabilityWorkspaceRole({workspaceId,userId,role,enabled,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    !MODULE_ROLE_OPTIONS['tool-traceability'].includes(role)||
    typeof enabled!=='boolean'||
    (expectedUpdatedAt!==null&&
     (typeof expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(expectedUpdatedAt)))))
   throw Error('Invalid Tool Traceability role request');
  const result=await this.api.rpc('apsyntra_role_tooltrace_workspace_set',{
   p_workspace_id:workspaceId,p_target_user_id:userId,p_role:role,
   p_enabled:enabled,p_expected_updated_at:expectedUpdatedAt});
  if(result?.effective!==true||result.workspaceId!==workspaceId||
     result.targetUserId!==userId||result.moduleId!=='tool-traceability'||
     result.role!==role||result.enabled!==enabled)
   throw Error('Invalid Tool Traceability role acknowledgement');
  return result;
 }
 async setFueltransWorkspaceRole({workspaceId,userId,role,enabled,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    !FUELTRANS_WORKSPACE_ROLES.includes(role)||typeof enabled!=='boolean'||
    (expectedUpdatedAt!==null&&
     (typeof expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(expectedUpdatedAt)))))
   throw Error('Invalid FuelTrans workspace role request');
  let r;
  try{
   r=await this.api.rpc('apsyntra_role_fueltrans_workspace_set',{
    p_workspace_id:workspaceId,p_target_user_id:userId,p_role:role,
    p_enabled:enabled,p_expected_updated_at:expectedUpdatedAt});
  }catch(error){
   // The generic HTTP 403 banner hides the domain's actionable denial.
   // Surface only the exact known server contracts; never trust arbitrary
   // response text or relax server-side authority.
   if(error?.status===403){
    const reason=String(error.message||'');
    if(reason==='Invalid or protected FuelTrans role target')
     throw Error('This FuelTrans role target is protected, is your own account, or is not eligible. Choose another active, non-bootstrap workspace member.',{cause:error});
    if(reason==='User not active in selected workspace')
     throw Error('The selected user is no longer active in this workspace. Refresh assignments and select an active member.',{cause:error});
    if(reason==='Client-scoped FuelTrans membership requires domain-specific management')
     throw Error('This FuelTrans membership is client-managed. Use its specialized domain role editor.',{cause:error});
    if(reason==='CRM administrator access denied for current workspace')
     throw Error('Your CRM administrator scope is no longer active in this workspace. Refresh the workspace and your role.',{cause:error});
   }
   throw error;
  }
  if(r?.effective!==true||r.workspaceId!==workspaceId||r.targetUserId!==userId||
     r.scope!=='module'||r.resourceId!=='fueltrans'||
     r.after?.role!==role||r.after?.enabled!==enabled)
   throw Error('FuelTrans workspace role acknowledgement invalid');
  return r;
 }
 async setCrmPlatformRole({workspaceId,userId,role,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    (role!==null&&!APSYNTRA_CRM_PLATFORM_ROLES.includes(role))||
    (expectedUpdatedAt!==null&&
     (typeof expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(expectedUpdatedAt)))))
   throw Error('Invalid CRM platform role request');
  const r=await this.api.rpc('apsyntra_crm_platform_role_set',{
   p_workspace_id:workspaceId,p_target_user_id:userId,p_role:role,
   p_expected_updated_at:expectedUpdatedAt
  });
  if(r?.effective!==true||r.workspaceId!==workspaceId||
   r.targetUserId!==userId||r.scope!=='crm-platform'||
   !APSYNTRA_CRM_PLATFORM_ROLES.includes(r.effectiveRole)||
   (role!==null&&r.effectiveRole!==role))
   throw Error('Backend CRM platform role acknowledgement invalid');
  return r;
 }
}
function selected(data,id){
 return data?.users?.find(u=>u.id===id)||null;
}
// Prefer an actionable member when the page first opens or a stale/protected
// selection disappears. Preserve an explicitly selected, non-protected member;
// multi-workspace targets remain selectable for workspace-scoped board/MRH access.
export function selectDefaultUserRoleTarget(users,actorUserId=null,selectedUserId=null){
 const rows=Array.isArray(users)?users:[];
 const current=rows.find(u=>u.id===selectedUserId);
 if(current&&!current.protected&&current.id!==actorUserId)return current.id;
 return rows.find(u=>!u.protected&&u.id!==actorUserId&&u.activeWorkspaceCount===1)?.id
  ??rows.find(u=>!u.protected&&u.id!==actorUserId)?.id
  ??rows[0]?.id??null;
}
// CRM workspace tier and inherited identity are separate source-of-truth fields.
// Display both so a correctly persisted tier is never disguised as employee.
function crmRoleSourceLabel(crm){
 if(crm?.assignedRole)return 'explicit';
 if(crm?.effectiveRole&&crm?.inheritedRole&&crm.effectiveRole!==crm.inheritedRole)
  return 'workspace owner';
 return 'inherited';
}
function accountRoleLabel(data,user){
 const crm=data.crmPlatformRoles?.find(r=>r.userId===user.id);
 if(data.crmPlatformUnavailable||!crm)return user.platformRole;
 return 'CRM '+crm.effectiveRole+' ('+crmRoleSourceLabel(crm)+')'+
  ' · Identity '+user.platformRole;
}
export function renderSystemAdminSection({data=null,selectedUser=null,actorId=null,busy=false,hidden=false,loading=false,error=''}={}){
 const verified=data?.status==='VERIFIED_SYSTEM_ADMIN';
 const member=verified&&selectedUser?data.roles.find(p=>p.userId===selectedUser.id):null;
 const count=verified?data.roles.filter(p=>p.active).length:null;
 const isSelf=selectedUser?.id===actorId;
 const canEdit=verified&&data.canManage===true&&!busy&&!isSelf&&!!member;
 const protectedIdentity=selectedUser?.protected===true;
 const canRevoke=canEdit&&member.active&&!protectedIdentity&&count>1;
 const canGrant=canEdit&&!member.active;
 const description=member?.designation==='trusted_it'?'Trusted IT administrator':
   member?.designation==='general_manager'?'General Manager / CEO':'No System Admin assignment';
 return '<section class="user-role-access-section" data-role-access-section="system-admins"'+
  ' aria-label="System Admin management"'+(hidden?' hidden':'')+'>'+
  '<div class="section-header user-role-section-header"><strong>System Admin</strong>'+
   '<span class="status '+(verified?'done':'todo')+'">'+
    (verified?'Verified global-role directory':loading?'Checking authorization':'Pending backend activation')+'</span></div>'+
  '<div class="note security-note user-role-ceiling-note">System Admin is an explicitly appointed, global APSYNTRA authority for the trusted IT administration team and General Manager / CEO. Assigning the Information Technology department or the TimeTracker System Admin application role does not confer this role. Operational powers remain subject to each server-side domain policy and signed authorization.</div>'+
  (verified?
   '<div class="panel user-role-platform-panel"><div class="panel-body">'+
    '<div class="settings-detail"><label>Selected account</label><strong>'+
     esc(selectedUser?.name||selectedUser?.email||'None')+'</strong></div>'+
    '<div class="settings-detail"><label>System Admin assignment</label><strong>'+
     (member?.active?'Active — '+esc(description):'Not assigned')+'</strong></div>'+
    '<div class="settings-detail"><label>Verified active members in this workspace</label><strong>'+
     String(count)+'</strong></div>'+
    '<div class="settings-detail"><label>Assignment governance</label><strong>'+
     (data.canManage?'System Admin / bootstrap authorized':'View only — System Admin approval required')+
    '</strong></div>'+
    '<div class="user-role-system-admin-actions">'+
     (!member?.active?
      '<button type="button" class="secondary" data-action="user-role-grant-system-admin" data-user-id="'+
       esc(selectedUser?.id)+'"'+(canGrant?'':' disabled')+'>Assign System Admin</button>':
      '<button type="button" class="secondary" data-action="user-role-revoke-system-admin" data-user-id="'+
       esc(selectedUser?.id)+'"'+(canRevoke?'':' disabled')+'>Revoke System Admin</button>')+
    '</div></div></div>'+
    '<p class="muted user-role-boundary-note">'+
     (isSelf?'Self-assignment and self-revocation are prohibited.':
      protectedIdentity&&member?.active?'Protected bootstrap accounts cannot be demoted from System Admin.':
      count<=1&&member?.active?'The last active System Admin cannot be revoked.':
      'All changes require a recorded justification, server authorization and signed readback.')+
    '</p>':
   '<div class="panel user-role-platform-panel"><div class="panel-body">'+
    '<div class="note" role="status">'+(loading?'Checking signed System Admin authorization…':
     error?esc(error):'The System Admin management backend is not activated. No global administrator accounts have been inferred or changed. A reviewed SQL activation and signed multi-account acceptance are required before assignments can be made.')+'</div>'+
   '</div></div>')+
  '</section>';
}

function renderNativeApplicationBatch({data,actorUserId,busy,batchSelected=[],batchMemberSearch='',
 batchModulesSelected=[],batchModuleRoles={},batchAction='assign',results=[]}){
 const allowed=data.users.filter(member=>!member.protected&&member.id!==actorUserId);
 const memberQuery=String(batchMemberSearch||'').trim().toLocaleLowerCase().slice(0,120);
 const visibleMemberCount=allowed.filter(member=>
  (String(member.name||'')+' '+String(member.email||'')).toLocaleLowerCase().includes(memberQuery)).length;
 const applications=ROLE_MODULE_OPTIONS.map(([moduleId,name])=>{
  const unavailable=(moduleId==='fueltrans'&&data.fueltransWorkspaceAvailable!==true)||
   (moduleId==='tool-traceability'&&data.toolTraceabilityWorkspaceAvailable!==true)||
   (moduleId==='fund-released-tracker'&&data.frtWorkspaceAvailable!==true)||
   (moduleId==='charter-navigator'&&data.charterWorkspaceAvailable!==true)||
   (moduleId==='material-request-hub'&&data.workspaceScopedMrhAvailable!==true);
  const options=unavailable?[]:moduleId==='fueltrans'?FUELTRANS_WORKSPACE_ROLES:
   MODULE_ROLE_OPTIONS[moduleId]||[];
  const role=options.includes(batchModuleRoles[moduleId])?batchModuleRoles[moduleId]:options[0]||'';
  return {moduleId,name,options,role,selected:options.length>0&&batchModulesSelected.includes(moduleId)};
 });
 const selectedApplications=applications.filter(application=>application.selected);
 let html='<section class="panel user-role-batch-panel user-role-native-batch" aria-label="Bulk native application access">'+
  '<div class="user-role-batch-heading"><div class="user-role-batch-eyebrow">NATIVE APPLICATION ACCESS / BULK WORKFLOW</div>'+
  '<div class="user-role-batch-title-row"><div><h2>Configure multiple applications</h2>'+
  '<p>Apply application roles across selected members and applications in one reviewed operation.</p></div>'+
  '<span class="user-role-batch-workspace">Active workspace</span></div></div>'+
  '<div class="panel-body user-role-batch-layout"><div class="user-role-batch-main">'+
  '<fieldset class="user-role-batch-users"><legend><span class="user-role-batch-step">01</span> Select members</legend>'+
  '<div class="user-role-batch-toolbar"><label for="user-role-batch-member-search">Find workspace members</label>'+
  '<input type="search" id="user-role-batch-member-search" name="batchMemberSearch" placeholder="Search by name or email" autocomplete="off" value="'+esc(batchMemberSearch)+'" aria-controls="user-role-batch-user-list" aria-describedby="user-role-batch-search-count">'+
  '<span id="user-role-batch-search-count" role="status" aria-live="polite">'+visibleMemberCount+' matching</span></div>'+
  '<div class="user-role-batch-user-list" id="user-role-batch-user-list">'+allowed.map(member=>
   '<label data-batch-member-row data-search-name="'+esc((String(member.name||'')+' '+String(member.email||'')).toLocaleLowerCase())+'"'+
   ((String(member.name||'')+' '+String(member.email||'')).toLocaleLowerCase().includes(memberQuery)?'':' hidden')+'>'+
   '<input type="checkbox" name="userRoleBatchMember" data-user-role-batch-member value="'+esc(member.id)+'"'+
   (batchSelected.includes(member.id)?' checked':'')+'><span>'+esc(member.name||member.email)+' <small>'+esc(member.email)+'</small></span></label>').join('')+'</div>'+
  '<p class="user-role-batch-count" role="status" aria-live="polite">'+batchSelected.length+' selected of '+allowed.length+' available workspace members</p>'+
  '<div class="user-role-batch-selection-actions"><button type="button" class="secondary" data-action="user-role-batch-select-eligible">Select all available members</button>'+
  '<button type="button" class="secondary" data-action="user-role-batch-clear"'+(batchSelected.length?'':' disabled')+'>Clear selection</button></div></fieldset>'+
  '<fieldset class="user-role-native-app-picker"><legend><span class="user-role-batch-step">02</span> Select applications and roles</legend>'+
  '<div class="user-role-native-app-list">'+applications.map(application=>
   '<div class="user-role-native-app-row" data-native-app-row="'+esc(application.moduleId)+'">'+
   '<label class="user-role-native-app-choice"><input type="checkbox" id="user-role-batch-app-'+esc(application.moduleId)+'" data-user-role-batch-app value="'+esc(application.moduleId)+'"'+
   (application.selected?' checked':'')+(application.options.length?'':' disabled')+'><span><strong>'+esc(application.name)+'</strong>'+
   (application.options.length?'':'<small>Application assignment service unavailable</small>')+'</span></label>'+
   '<label class="user-role-native-app-role">Role<select id="user-role-batch-app-role-'+esc(application.moduleId)+'" data-user-role-batch-app-role data-module-id="'+esc(application.moduleId)+'"'+
   (application.options.length?'':' disabled')+'>'+application.options.map(role=>
    '<option value="'+esc(role)+'"'+(role===application.role?' selected':'')+'>'+esc(role)+'</option>').join('')+'</select></label></div>'
  ).join('')+'</div></fieldset>'+
  '<div class="user-role-native-batch-action"><label for="user-role-batch-action">Operation</label>'+
  '<select id="user-role-batch-action"><option value="assign"'+(batchAction==='assign'?' selected':'')+'>Assign or change access</option>'+
  '<option value="revoke"'+(batchAction==='revoke'?' selected':'')+'>Revoke selected application access</option></select></div>'+
  '</div><aside class="user-role-batch-summary" aria-label="Native application batch review">'+
  '<div class="user-role-batch-summary-top"><span class="user-role-batch-step">03</span><strong>Review &amp; apply</strong></div>'+
  '<p class="user-role-batch-summary-intro">Planned configuration</p><dl>'+
  '<div><dt>Members</dt><dd id="user-role-batch-summary-count">'+batchSelected.length+' selected</dd></div>'+
  '<div><dt>Applications</dt><dd>'+selectedApplications.length+' selected</dd></div>'+
  '<div><dt>Potential pairs</dt><dd>'+batchSelected.length*selectedApplications.length+'</dd></div>'+
  '<div><dt>Operation</dt><dd>'+(batchAction==='revoke'?'Revoke':'Assign / change')+'</dd></div></dl>'+
  '<p class="user-role-batch-hint">Each member/application result is reported separately. Saved changes are verified against refreshed authoritative assignments.</p>'+
  '<button class="primary user-role-batch-review" type="button" data-action="user-role-native-batch-review"'+
  (batchSelected.length&&selectedApplications.length&&!busy?'':' disabled')+'>Review '+(batchSelected.length*selectedApplications.length)+' member/application pairs</button>'+
  '</aside></div></section>';
 if(results.length){
  html+='<section class="panel user-role-native-results" aria-labelledby="user-role-native-results-title"><div class="panel-header"><h3 id="user-role-native-results-title">Latest bulk operation results</h3><span>'+results.length+' member/application pairs</span></div>'+
   '<div class="table-scroll user-role-table-scroll" role="region" aria-label="Bulk application assignment results" tabindex="0"><table class="board-table user-role-table"><thead><tr><th scope="col">Member</th><th scope="col">Application</th><th scope="col">Result</th><th scope="col">Details</th></tr></thead><tbody>'+
   results.map(result=>'<tr><td>'+esc(result.email||result.userId)+'</td><td>'+esc(ROLE_MODULE_OPTIONS.find(([id])=>id===result.moduleId)?.[1]||result.moduleId)+'</td><td><span class="status '+(result.status==='Saved & verified'?'done':result.status==='Unchanged'?'todo':'stuck')+'">'+esc(result.status)+'</span></td><td>'+esc(result.detail||'')+'</td></tr>').join('')+
   '</tbody></table></div></section>';
 }
 return html;
}

export function renderUserRoleManagement({verified=false,data=null,selectedUserId=null,actorUserId=null,busy=false,error='',accessSection='applications',systemAdminData=null,systemAdminBusy=false,systemAdminError='',boardSearch='',batchMode=false,batchSelected=[],batchScope='module',batchResource='',batchRole='viewer',batchAction='assign',batchMemberSearch='',applicationAccessOnly=false,batchModulesSelected=[],batchModuleRoles={},nativeBatchResults=[]}={}){
 if(!verified)return '<div class="access-denied">Role management unavailable</div>';
 let html='<div class="aps-user-role-management'+(applicationAccessOnly?' native-application-access':'')+'"><section class="page-head user-role-hero user-role-entrance" aria-labelledby="user-role-title"><div class="user-role-hero-copy"><span class="label-top"><span class="user-role-hero-dot" aria-hidden="true"></span>Administration / '+(applicationAccessOnly?'Native applications':'CRM Admin')+'</span>'+
 '<h1 id="user-role-title">'+(applicationAccessOnly?'Native Application Access':'User Role Management')+'<span class="user-role-heading-stop">.</span></h1><p>'+(applicationAccessOnly?'Configure individual and bulk access to the twelve native APSYNTRA applications.':'Manage APSYNTRA CRM platform, application and board roles from the central backend.')+'</p></div>'+
 (applicationAccessOnly?'':'<button class="secondary user-role-refresh" data-action="user-role-refresh" '+(busy?'disabled':'')+'>'+roleConfigurationIcon('refresh')+'<span>Refresh assignments</span></button>')+
 '<svg class="user-role-hero-decoration" viewBox="0 0 420 210" aria-hidden="true" focusable="false" fill="none"><circle cx="345" cy="0" r="122" stroke="currentColor" stroke-opacity=".16"/><circle cx="345" cy="0" r="192" stroke="currentColor" stroke-opacity=".07"/><path d="M95 230C201 80 319 86 449 139" stroke="currentColor" stroke-opacity=".18"/></svg></section>'+
 (applicationAccessOnly?'<div class="note user-role-warning user-role-entrance"><span class="user-role-warning-icon" aria-hidden="true">'+roleConfigurationIcon('boards')+'</span><div>Individual and bulk application changes use the existing native assignment services and are checked against refreshed assignment records.</div></div>':'<div class="note security-note user-role-warning user-role-entrance"><span class="user-role-warning-icon" aria-hidden="true">'+roleConfigurationIcon('lock')+'</span><div>Verified CRM Administrators can manage roles in their active workspace. The two designated bootstrap identities remain protected. The backend rejects self-promotion, protected administrators, stale updates, and cross-workspace targets. Changes are audited and visible to subsequent signed sessions.</div></div>');
 if(error)html+='<div class="error-banner" role="alert">'+esc(error)+'</div>';
 if(!applicationAccessOnly&&data?.crmPlatformUnavailable)html+='<div class="note security-note" role="status">APSYNTRA CRM platform role assignments are unavailable because the required backend migration is not installed. CRM changes are disabled. Existing application and board assignments remain governed by the centralized backend.</div>';
 if(!data)return html+'<div class="panel user-role-loading"><p class="muted">Loading authorized workspace members…</p></div></div>';
 const defaultTargetId=selectDefaultUserRoleTarget(data.users,actorUserId,selectedUserId);
 const u=selected(data,selectedUserId)||selected(data,defaultTargetId)||data.users[0]||null;
 html+='<section class="stat-grid user-role-stat-grid user-role-entrance" aria-label="'+(applicationAccessOnly?'Native application access statistics':'User role management statistics')+'">'+(applicationAccessOnly?[
  ['Active workspace members',data.users.length,'users'],['Native applications',ROLE_MODULE_OPTIONS.length,'roles'],
  ['Application assignments',data.moduleAssignments.length,'proposals']]:[
  ['Active workspace members',data.users.length,'users'],['Application assignments',data.moduleAssignments.length,'roles'],
  ['Board memberships',data.boardAssignments.length,'boards'],['Available boards',data.boards.length,'proposals']]).map(([k,v,icon])=>'<div class="stat-card user-role-stat-card user-role-stat-'+icon+'"><span class="user-role-stat-icon" aria-hidden="true">'+roleConfigurationIcon(icon)+'</span><span class="stat-label">'+esc(k)+'</span><strong class="stat-value">'+Number(v)+'</strong></div>').join('')+'</section>';
 html+='<div class="user-role-mode-nav" role="group" aria-label="Configuration workflow">'+
  '<button type="button" data-action="user-role-mode" data-mode="individual" aria-pressed="'+(!batchMode)+'">Individual configuration</button>'+
  '<button type="button" data-action="user-role-mode" data-mode="batch" aria-pressed="'+batchMode+'">Batch configuration</button></div>';
 if(batchMode){
  if(applicationAccessOnly)return html+renderNativeApplicationBatch({data,actorUserId,busy,batchSelected,
   batchMemberSearch,batchModulesSelected,batchModuleRoles,batchAction,results:nativeBatchResults})+'</div>';
  const allowed=data.users.filter(member=>!member.protected&&member.id!==actorUserId);
  const resourceEntries=batchScope==='module'?ROLE_MODULE_OPTIONS:data.boards.map(board=>[board.id,board.name]);
  const resource=resourceEntries.some(([id])=>id===batchResource)?batchResource:resourceEntries[0]?.[0]||'';
  const roles=batchScope==='module'?
   (resource==='fueltrans'?(data.fueltransWorkspaceAvailable?FUELTRANS_WORKSPACE_ROLES:[]):
    MODULE_ROLE_OPTIONS[resource]||[]):['viewer','editor'];
  const currentRole=roles.includes(batchRole)?batchRole:roles[0]||'';
  const memberQuery=String(batchMemberSearch||'').trim().toLocaleLowerCase().slice(0,120);
  const visibleMemberCount=allowed.filter(member=>
   (String(member.name||'')+' '+String(member.email||'')).toLocaleLowerCase().includes(memberQuery)).length;
  html+='<section class="panel user-role-batch-panel" aria-label="Batch configuration">'+
   '<div class="user-role-batch-heading"><div class="user-role-batch-eyebrow">ACCESS MANAGEMENT / BATCH WORKFLOW</div>'+
   '<div class="user-role-batch-title-row"><div><h2>Configure access for your team</h2>'+
   '<p>One configuration, multiple members. Review every change before applying.</p></div>'+
   '<span class="user-role-batch-workspace">Active workspace only</span></div></div>'+
   '<div class="panel-body user-role-batch-layout">'+
   '<div class="user-role-batch-main">'+
   '<fieldset class="user-role-batch-users"><legend><span class="user-role-batch-step">01</span> Select members</legend>'+
   '<div class="user-role-batch-toolbar"><label for="user-role-batch-member-search">Find workspace members</label>'+
   '<input type="search" id="user-role-batch-member-search" name="batchMemberSearch" placeholder="Search by name or email" autocomplete="off" value="'+esc(batchMemberSearch)+'" aria-controls="user-role-batch-user-list" aria-describedby="user-role-batch-search-count">'+
   '<span id="user-role-batch-search-count" role="status" aria-live="polite">'+visibleMemberCount+' matching</span></div>'+
   '<div class="user-role-batch-user-list" id="user-role-batch-user-list">'+allowed.map(member=>
     '<label data-batch-member-row data-search-name="'+esc((String(member.name||'')+' '+String(member.email||'')).toLocaleLowerCase())+'"'+
     ((String(member.name||'')+' '+String(member.email||'')).toLocaleLowerCase().includes(memberQuery)?'':' hidden')+
     '><input type="checkbox" name="userRoleBatchMember" data-user-role-batch-member value="'+esc(member.id)+'"'+(batchSelected.includes(member.id)?' checked':'')+'>'+
     '<span>'+esc(member.name||member.email)+' <small>'+esc(member.email)+'</small></span></label>').join('')+'</div>'+
   '<p class="user-role-batch-count" role="status" aria-live="polite">'+batchSelected.length+' selected of '+allowed.length+' available workspace members</p>'+
   '<div class="user-role-batch-selection-actions"><button type="button" class="secondary" data-action="user-role-batch-select-eligible">Select eligible users</button>'+
   '<button type="button" class="secondary" data-action="user-role-batch-clear"'+(batchSelected.length?'':' disabled')+'>Clear selection</button></div></fieldset>'+
   '<div class="user-role-batch-fields"><fieldset class="user-role-batch-scope"><legend><span class="user-role-batch-step">02</span> Configure access</legend>'+
   '<label><input type="radio" name="user-role-batch-scope" value="module"'+(batchScope==='module'?' checked':'')+'> Application access</label>'+
   '<label><input type="radio" name="user-role-batch-scope" value="board"'+(batchScope==='board'?' checked':'')+'> Board access</label></fieldset>'+
   '<label>Application or board<select id="user-role-batch-resource">'+resourceEntries.map(([id,name])=>
    '<option value="'+esc(id)+'"'+(id===resource?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>'+
   '<label>Role<select id="user-role-batch-role">'+roles.map(role=>
    '<option value="'+esc(role)+'"'+(role===currentRole?' selected':'')+'>'+esc(role)+'</option>').join('')+'</select></label>'+
   '<label>Change<select id="user-role-batch-action"><option value="assign"'+(batchAction==='assign'?' selected':'')+'>Assign or change</option><option value="revoke"'+(batchAction==='revoke'?' selected':'')+'>Revoke existing access</option></select></label></div>'+
   '</div><aside class="user-role-batch-summary" aria-label="Batch review summary">'+
   '<div class="user-role-batch-summary-top"><span class="user-role-batch-step">03</span><strong>Review &amp; apply</strong></div>'+
   '<p class="user-role-batch-summary-intro">Your planned change</p>'+
   '<dl><div><dt>Members</dt><dd id="user-role-batch-summary-count">'+batchSelected.length+' selected</dd></div>'+
   '<div><dt>Access</dt><dd>'+(batchScope==='module'?'Application':'Board')+'</dd></div>'+
   '<div><dt>Resource</dt><dd>'+esc(resourceEntries.find(([id])=>id===resource)?.[1]||'Not available')+'</dd></div>'+
   '<div><dt>Role</dt><dd>'+esc(currentRole||'Not available')+'</dd></div>'+
   '<div><dt>Operation</dt><dd>'+(batchAction==='revoke'?'Revoke existing access':'Assign / change')+'</dd></div></dl>'+
   '<p class="user-role-batch-hint">No changes are applied until you review and confirm. Existing access safeguards and audit checks remain in force.</p>'+
   '<button class="primary user-role-batch-review" type="button" data-action="user-role-batch-review"'+(batchSelected.length&&resource&&currentRole&&!busy?'':' disabled')+'>Review batch changes ('+batchSelected.length+')</button>'+
   '</aside></div></section></div>';
  return html;
 }
 html+='<section class="panel user-role-selection-panel user-role-entrance" aria-labelledby="user-role-select-title"><div class="panel-header"><h3 id="user-role-select-title">Select user</h3><span>Workspace scoped</span></div>'+
 '<div class="panel-body"><label for="managed-user">Workspace member email</label><select id="managed-user" class="search-input user-role-account-select" data-action="user-role-select" aria-label="Select a member by email address">'+
 data.users.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===u?.id?'selected':'')+'>'+esc(x.email)+'</option>').join('')+
 '</select></div></section>';
 if(!u)return html+'<p class="muted">No active members.</p></div>';
 const activeWorkspaceCount=Number.isInteger(u.activeWorkspaceCount)?
  u.activeWorkspaceCount:null;
 const isSelf=!!actorUserId&&u.id===actorUserId;
 const otherAssignableMembers=data.users.filter(member=>
  !member.protected&&member.id!==actorUserId);
 const globalModuleRoleBlocked=activeWorkspaceCount===null||activeWorkspaceCount>1;
 if(applicationAccessOnly){
  html+='<section class="panel user-role-selected-panel user-role-entrance" aria-label="Selected workspace member"><div class="panel-header"><h3>'+esc(u.name||u.email)+'</h3><span>Selected member</span></div><div class="panel-body"><div class="settings-detail"><label>Workspace account</label><strong>'+esc(u.email)+'</strong></div>'+(u.protected?'<div class="note user-role-protected">Protected account — existing application assignments are displayed without modification controls.</div>':isSelf?'<div class="note user-role-self">Select another workspace member to configure application assignments.</div>':'<div class="note user-role-helper">Choose an application below to assign, change, or revoke this member’s native application role.</div>')+'</div></section>';
 }else{
 html+='<section class="panel user-role-selected-panel user-role-entrance" aria-label="Selected user authorization"><div class="panel-header"><h3>'+esc(u.name||u.email)+'</h3><span>'+esc(accountRoleLabel(data,u))+'</span></div>'+
 '<div class="panel-body"><div class="settings-detail user-role-effective-summary"><label>Current CRM role / identity</label><strong>'+esc(accountRoleLabel(data,u))+'</strong></div>'+(u.protected?
 '<div class="note security-note user-role-protected">Protected administrator — role modifications are intentionally disabled.</div>':
 isSelf?
 '<div class="note security-note user-role-self">The signed-in administrator cannot assign or modify roles on their own account. Select another active workspace member.</div>':
 '<div class="note user-role-helper">Select an application or board below to update this user’s actual role. Changes require explicit confirmation.</div>')+
 (!otherAssignableMembers.length?'<div class="note security-note user-role-no-targets">There are no other eligible active members in this workspace. Self-assignment and protected administrator changes are not permitted. Add another member to this workspace before assigning application or board access.</div>':'')+
 (globalModuleRoleBlocked?'<div class="note security-note user-role-workspace-scope">This account has '+(activeWorkspaceCount===null?'an unverified number of ':activeWorkspaceCount)+' active workspace memberships. Legacy application roles are global across workspaces, so changes to those roles are blocked to prevent cross-workspace permission changes. Toolbox Issues, Tool Traceability, and Material Request Hub have workspace-scoped records. FuelTrans uses its own workspace-scoped membership when that signed backend contract is available; board access is also workspace-scoped.</div>':'')+
 (!data.fueltransWorkspaceAvailable?'<div class="note user-role-fueltrans-scope-unavailable">FuelTrans role changes require its authoritative workspace membership integration. The legacy global role action is disabled to prevent assigning a role in another workspace.</div>':'')+
 (!data.workspaceScopedMrhAvailable?'<div class="note security-note user-role-mrh-scope-unavailable">Workspace-scoped Material Request Hub role management is not yet confirmed by the backend. Its role changes remain disabled until the CP-RC03 migration is installed.</div>':'')+
 '</div></section>';
 }
 const section=['applications','boards','system-admins'].includes(accessSection)?accessSection:'applications';
 if(!applicationAccessOnly)html+='<nav class="user-role-access-nav" aria-label="Access configuration sections" role="group">'+
  '<button type="button" data-action="user-role-section" data-section="applications" aria-pressed="'+(section==='applications')+'">Application access</button>'+
  '<button type="button" data-action="user-role-section" data-section="boards" aria-pressed="'+(section==='boards')+'">Board access ('+data.boards.length.toLocaleString('en-US')+')</button>'+
  '<button type="button" data-action="user-role-section" data-section="system-admins" aria-pressed="'+(section==='system-admins')+'">System Admin</button></nav>';
 html+='<section class="user-role-access-section" data-role-access-section="applications" aria-label="Application access settings"'+(section==='applications'?'':' hidden')+'>';
 const locked=!!u.protected||isSelf||busy;
 const crm=data.crmPlatformRoles?.find(r=>r.userId===u.id)||null;
 if(!applicationAccessOnly)html+='<div class="section-header user-role-section-header user-role-entrance"><strong>APSYNTRA CRM Platform Role</strong></div>'+
 '<div class="note security-note user-role-ceiling-note">This is the CRM-wide authorization ceiling. CRM tier assignments are workspace-specific, not changes to the inherited WatchdogWorkspace account role. Admin grants CRM administrative authority for the active workspace, not unrelated module assignments or board ownership. Explicit Viewer blocks module write-level roles and board edit/manage; existing legacy behavior is preserved until an override is assigned.</div>'+
 '<div class="panel user-role-platform-panel"><div class="panel-body"><div class="settings-detail"><label>Assigned workspace role</label><strong>'+
 esc(data.crmPlatformUnavailable?'Unavailable — backend migration pending':crm?.effectiveRole||'Unverified')+
 (data.crmPlatformUnavailable||!crm?'':' ('+crmRoleSourceLabel(crm)+')')+
 '</strong></div><div class="settings-detail"><label>WatchdogWorkspace identity (not an assignment)</label><strong>'+
 esc(u.platformRole)+'</strong></div>'+
 '<button class="secondary" data-action="user-role-edit-crm-platform" data-user-id="'+esc(u.id)+'" '+
 (locked||data.crmPlatformUnavailable||!crm?'disabled':'')+'>Assign / change CRM role</button> '+
 (crm?.assignedRole?'<button class="secondary" data-action="user-role-revert-crm-platform" data-user-id="'+esc(u.id)+'" '+
 (locked||data.crmPlatformUnavailable?'disabled':'')+'>Revert to inherited role</button>':'')+
 '</div></div>';
 html+='<div class="section-header user-role-section-header"><strong>'+(applicationAccessOnly?'Native Application Assignments':'Application-specific assignments')+'</strong></div>'+
 '<div class="panel user-role-table-panel"><div class="table-scroll user-role-table-scroll" role="region" aria-label="Application assignments, scroll horizontally for more columns" tabindex="0"><table class="board-table user-role-table" aria-label="Application-specific assignments"><thead><tr><th scope="col">Application</th><th scope="col">Effective stored role</th><th scope="col">Enforcement</th><th scope="col">Action</th></tr></thead><tbody>';
 for(const [id,name] of ROLE_MODULE_OPTIONS){
  const a=data.moduleAssignments.find(x=>x.userId===u.id&&x.moduleId===id);
  const fueltransScoped=id==='fueltrans'&&data.fueltransWorkspaceAvailable===true;
  const opt=fueltransScoped?FUELTRANS_WORKSPACE_ROLES:(MODULE_ROLE_OPTIONS[id]||[]);
  const frtScoped=id==='fund-released-tracker'&&data.frtWorkspaceAvailable===true;
  const sixScoped=SCOPED_SIX_MODULE_IDS.includes(id)&&data.scopedSixAvailable===true;
  const charterScoped=id==='charter-navigator'&&data.charterWorkspaceAvailable===true;
  const status=effectiveModuleRoleLabel(a,opt);
  const note=fueltransScoped?'Workspace FuelTrans membership':
   id==='tool-traceability'&&data.toolTraceabilityWorkspaceAvailable?'Workspace Tool Traceability membership':
   frtScoped?'Workspace Fund Tracker membership':
   sixScoped?'Workspace application membership':
   charterScoped?'Workspace Charter membership':
   delegatedModules.has(id)?'Existing domain role handler':'Central role contract';
  const tooltraceScoped=id==='tool-traceability'&&data.toolTraceabilityWorkspaceAvailable===true;
  const workspaceScopedModule=id==='material-request-hub'||id==='toolbox-issues'||fueltransScoped||tooltraceScoped||frtScoped||sixScoped||charterScoped;
  const editBlocked=locked||!opt.length||(id==='fueltrans'&&!fueltransScoped)||
   (id==='tool-traceability'&&!tooltraceScoped)||
   (id==='fund-released-tracker'&&!frtScoped)||
   (id==='charter-navigator'&&!charterScoped)||

   (fueltransScoped&&a?.clientManaged===true)||activeWorkspaceCount===null||
   (globalModuleRoleBlocked&&!workspaceScopedModule)||
   (id==='material-request-hub'&&!data.workspaceScopedMrhAvailable);
  const editReason=busy?'Another role change is in progress.':
   id==='fueltrans'&&!fueltransScoped?'FuelTrans workspace membership backend is not activated.':
   id==='tool-traceability'&&!tooltraceScoped?'Tool Traceability workspace membership backend is not activated.':
   id==='fund-released-tracker'&&!frtScoped?'Fund Tracker workspace membership backend is not activated.':
   id==='charter-navigator'&&!charterScoped?'Charter Navigator requires its workspace membership backend.':

   fueltransScoped&&a?.clientManaged===true?'Client-specific FuelTrans membership requires its domain assignment editor.':
   u.protected?'Protected administrator accounts cannot be modified.':
   isSelf?'Self-assignment is not permitted.':
   !opt.length?'No supported role options are configured for this application.':
   activeWorkspaceCount===null?'The backend has not verified this account’s active workspace scope.':
   globalModuleRoleBlocked&&!workspaceScopedModule?'This legacy application role is global and this member belongs to multiple workspaces.':
   id==='material-request-hub'&&!data.workspaceScopedMrhAvailable?'Workspace-scoped Material Request Hub role management is not verified.':'';
  const revokeBlocked=locked||(id==='charter-navigator'&&!charterScoped)||
   (id==='fueltrans'&&!fueltransScoped)||
   (id==='tool-traceability'&&!tooltraceScoped)||
   (id==='fund-released-tracker'&&!frtScoped)||
   (fueltransScoped&&a?.clientManaged===true)||activeWorkspaceCount===null||
   (globalModuleRoleBlocked&&!workspaceScopedModule)||
   (id==='material-request-hub'&&!data.workspaceScopedMrhAvailable);
  html+='<tr><td><strong>'+esc(name)+'</strong></td><td>'+esc(status)+'</td><td>'+esc(note)+'</td><td>'+
   '<button class="secondary" aria-label="Assign or change '+esc(name)+' application role" data-action="user-role-edit-module" data-user-id="'+esc(u.id)+'" data-resource="'+esc(id)+'" '+
   (editBlocked?'disabled title="'+esc(editReason)+'"':'')+'>Assign / change</button> '+
   (a?.enabled&&opt.includes(a.role)?'<button class="secondary" aria-label="Revoke '+esc(name)+' application role" data-action="user-role-revoke-module" data-user-id="'+esc(u.id)+'" data-resource="'+esc(id)+'" '+
    (revokeBlocked?'disabled title="'+esc(editReason||'This application role cannot be changed for the selected member.')+'"':'')+'>Revoke</button>':'')+
  '</td></tr>';
 }
 html+='</tbody></table></div></div>'+(applicationAccessOnly?'</section></div>':'');
 if(applicationAccessOnly)return html;
 html+='</section><section class="user-role-access-section" data-role-access-section="boards" aria-label="Board access settings"'+(section==='boards'?'':' hidden')+'>';
 const boardNeedle=String(boardSearch||'').trim().toLocaleLowerCase().slice(0,120);
 const visibleBoardCount=data.boards.filter(board=>String(board.name||'').toLocaleLowerCase().includes(boardNeedle)).length;
 html+='<div class="user-role-board-filter-wrap"><label for="user-role-board-filter">Find board access</label>'+
  '<input id="user-role-board-filter" class="user-role-board-filter" type="search" placeholder="Search boards by name" aria-controls="user-role-board-table" aria-describedby="user-role-board-filter-result" value="'+esc(boardSearch)+'" autocomplete="off">'+
  '<p id="user-role-board-filter-result" role="status" aria-live="polite" aria-atomic="true">'+visibleBoardCount.toLocaleString('en-US')+' of '+data.boards.length.toLocaleString('en-US')+' boards</p></div>';
 html+='<div class="section-header user-role-section-header"><strong>Individual board access</strong></div>'+
 '<div class="note user-role-board-note">Viewer permits reads; Editor permits reads and writes. Owner privileges cannot be granted or changed here. Backend checks are performed on every authorized board request.</div>'+
 '<div class="panel user-role-table-panel"><div class="table-scroll user-role-table-scroll" role="region" aria-label="Board access, scroll horizontally for more columns" tabindex="0"><table id="user-role-board-table" class="board-table user-role-table" aria-label="Individual board access"><thead><tr><th scope="col">Board</th><th scope="col">Membership</th><th scope="col">Action</th></tr></thead><tbody>';
 for(const board of data.boards){
  const a=data.boardAssignments.find(x=>x.userId===u.id&&x.boardId===board.id);
  html+='<tr data-role-board-row data-board-name="'+esc(String(board.name||'').toLocaleLowerCase())+'"'+(String(board.name||'').toLocaleLowerCase().includes(boardNeedle)?'':' hidden')+'><td>'+esc(board.name)+'</td><td>'+esc(a?.role||'No membership')+'</td><td>'+
   '<button class="secondary" aria-label="Set access for '+esc(board.name)+' (board '+esc(String(board.id).slice(-8))+')" data-action="user-role-edit-board" data-user-id="'+esc(u.id)+'" data-resource="'+esc(board.id)+'" '+(locked||a?.role==='owner'?'disabled':'')+'>Set access</button> '+
   (a&&a.role!=='owner'?'<button class="secondary" aria-label="Revoke access for '+esc(board.name)+' (board '+esc(String(board.id).slice(-8))+')" data-action="user-role-revoke-board" data-user-id="'+esc(u.id)+'" data-resource="'+esc(board.id)+'" '+(locked?'disabled':'')+'>Revoke</button>':'')+
  '</td></tr>';
 }
 html+='</tbody></table></div></div><p class="muted user-role-boundary-note">'+roleConfigurationIcon('shield')+'<span>The existing backend still governs approval, export, finance and domain-specific operations separately. A board membership alone does not grant access to sensitive domain records.</span></p>';
 return html+'</section>'+renderSystemAdminSection({data:systemAdminData,
   selectedUser:u,actorId:actorUserId,busy,hidden:section!=='system-admins',loading:systemAdminBusy,error:systemAdminError})+'</div>';
}
