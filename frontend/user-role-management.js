/** CP-RC02 User Role Management. Server RPCs, never direct table mutations.
 * The existing module_role_assignments and work_board_members stay authoritative.
 */
import {ROLE_MODULE_OPTIONS} from './role-configuration-ui.js';
import {roleConfigurationIcon} from './role-configuration-visuals.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const APSYNTRA_CRM_PLATFORM_ROLES=Object.freeze(['admin','supervisor','employee','viewer']);
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
 'charter-navigator':['Admin','Supervisor','Employee','Viewer']
});
const delegatedModules=new Set(['time-tracker','fueltrack-plus','tradelink','fund-released-tracker','tool-traceability','material-request-hub']);
export class UserRoleManagementClient {
 constructor(api){this.api=api;}
 async snapshot(workspaceId){
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
  return {...d,...scopeMetadata,crmPlatformRoles:crm.roles,crmPlatformUnavailable:false};
 }
 async mutate({workspaceId,userId,scope,resourceId,role,enabled,expectedUpdatedAt=null}){
  if(!UUID.test(workspaceId||'')||!UUID.test(userId||'')||
    typeof enabled!=='boolean'||!['module','board'].includes(scope))throw Error('Invalid role change request');
  if(scope==='module'){
   if(!MODULE_ROLE_OPTIONS[resourceId]?.includes(role))throw Error('Unsupported application role');
   if(resourceId==='toolbox-issues'&&enabled)throw Error('Toolbox source authorization must be reconciled before granting a central role');
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
export function renderUserRoleManagement({verified=false,data=null,selectedUserId=null,actorUserId=null,busy=false,error=''}={}){
 if(!verified)return '<div class="access-denied">Role management unavailable</div>';
 let html='<div class="aps-user-role-management"><section class="page-head user-role-hero user-role-entrance" aria-labelledby="user-role-title"><div class="user-role-hero-copy"><span class="label-top"><span class="user-role-hero-dot" aria-hidden="true"></span>Administration / CRM Admin</span>'+
 '<h1 id="user-role-title">User Role Management<span class="user-role-heading-stop">.</span></h1><p>Manage APSYNTRA CRM platform, application and board roles from the central backend.</p></div>'+
 '<button class="secondary user-role-refresh" data-action="user-role-refresh" '+(busy?'disabled':'')+'>'+roleConfigurationIcon('refresh')+'<span>Refresh assignments</span></button>'+
 '<svg class="user-role-hero-decoration" viewBox="0 0 420 210" aria-hidden="true" focusable="false" fill="none"><circle cx="345" cy="0" r="122" stroke="currentColor" stroke-opacity=".16"/><circle cx="345" cy="0" r="192" stroke="currentColor" stroke-opacity=".07"/><path d="M95 230C201 80 319 86 449 139" stroke="currentColor" stroke-opacity=".18"/></svg></section>'+
 '<div class="note security-note user-role-warning user-role-entrance"><span class="user-role-warning-icon" aria-hidden="true">'+roleConfigurationIcon('lock')+'</span><div>Verified CRM Administrators can manage roles in their active workspace. The two designated bootstrap identities remain protected. The backend rejects self-promotion, protected administrators, stale updates, and cross-workspace targets. Changes are audited and visible to subsequent signed sessions.</div></div>';
 if(error)html+='<div class="error-banner" role="alert">'+esc(error)+'</div>';
 if(data?.crmPlatformUnavailable)html+='<div class="note security-note" role="status">APSYNTRA CRM platform role assignments are unavailable because the required backend migration is not installed. CRM changes are disabled. Existing application and board assignments remain governed by the centralized backend.</div>';
 if(!data)return html+'<div class="panel user-role-loading"><p class="muted">Loading authorized workspace members…</p></div></div>';
 const defaultTargetId=selectDefaultUserRoleTarget(data.users,actorUserId,selectedUserId);
 const u=selected(data,selectedUserId)||selected(data,defaultTargetId)||data.users[0]||null;
 html+='<section class="stat-grid user-role-stat-grid user-role-entrance" aria-label="User role management statistics">'+[
  ['Active workspace members',data.users.length,'users'],['Application assignments',data.moduleAssignments.length,'roles'],
  ['Board memberships',data.boardAssignments.length,'boards'],['Available boards',data.boards.length,'proposals']
 ].map(([k,v,icon])=>'<div class="stat-card user-role-stat-card user-role-stat-'+icon+'"><span class="user-role-stat-icon" aria-hidden="true">'+roleConfigurationIcon(icon)+'</span><span class="stat-label">'+esc(k)+'</span><strong class="stat-value">'+Number(v)+'</strong></div>').join('')+'</section>';
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
 html+='<section class="panel user-role-selected-panel user-role-entrance" aria-label="Selected user authorization"><div class="panel-header"><h3>'+esc(u.name||u.email)+'</h3><span>'+esc(accountRoleLabel(data,u))+'</span></div>'+
 '<div class="panel-body"><div class="settings-detail user-role-effective-summary"><label>Current CRM role / identity</label><strong>'+esc(accountRoleLabel(data,u))+'</strong></div>'+(u.protected?
 '<div class="note security-note user-role-protected">Protected administrator — role modifications are intentionally disabled.</div>':
 isSelf?
 '<div class="note security-note user-role-self">The signed-in administrator cannot assign or modify roles on their own account. Select another active workspace member.</div>':
 '<div class="note user-role-helper">Select an application or board below to update this user’s actual role. Changes require explicit confirmation.</div>')+
 (!otherAssignableMembers.length?'<div class="note security-note user-role-no-targets">There are no other eligible active members in this workspace. Self-assignment and protected administrator changes are not permitted. Add another member to this workspace before assigning application or board access.</div>':'')+
 (globalModuleRoleBlocked?'<div class="note security-note user-role-workspace-scope">This account has '+(activeWorkspaceCount===null?'an unverified number of ':activeWorkspaceCount)+' active workspace memberships. Legacy application roles are global across workspaces, so changes to those roles are blocked to prevent cross-workspace permission changes. Material Request Hub uses a separate workspace-scoped role record; board access is also workspace-scoped.</div>':'')+
 (!data.workspaceScopedMrhAvailable?'<div class="note security-note user-role-mrh-scope-unavailable">Workspace-scoped Material Request Hub role management is not yet confirmed by the backend. Its role changes remain disabled until the CP-RC03 migration is installed.</div>':'')+
 '</div></section>';
 const locked=!!u.protected||isSelf||busy;
 const crm=data.crmPlatformRoles?.find(r=>r.userId===u.id)||null;
 html+='<div class="section-header user-role-section-header user-role-entrance"><strong>APSYNTRA CRM Platform Role</strong></div>'+
 '<div class="note security-note user-role-ceiling-note">This is the CRM-wide authorization ceiling. CRM tier assignments are workspace-specific, not changes to the inherited WatchdogWorkspace account role. Admin grants CRM administrative authority for the active workspace, not unrelated module assignments or board ownership. Explicit Viewer blocks module write-level roles and board edit/manage; existing legacy behavior is preserved until an override is assigned.</div>'+
 '<div class="panel user-role-platform-panel"><div class="panel-body"><div class="settings-detail"><label>Inherited WatchdogWorkspace role</label><strong>'+
 esc(u.platformRole)+'</strong></div><div class="settings-detail"><label>CRM platform role</label><strong>'+
 esc(data.crmPlatformUnavailable?'Unavailable — backend migration pending':crm?.effectiveRole||'Unverified')+
 (data.crmPlatformUnavailable||!crm?'':' ('+crmRoleSourceLabel(crm)+')')+
 '</strong></div>'+
 '<button class="secondary" data-action="user-role-edit-crm-platform" data-user-id="'+esc(u.id)+'" '+
 (locked||data.crmPlatformUnavailable||!crm?'disabled':'')+'>Assign / change CRM role</button> '+
 (crm?.assignedRole?'<button class="secondary" data-action="user-role-revert-crm-platform" data-user-id="'+esc(u.id)+'" '+
 (locked||data.crmPlatformUnavailable?'disabled':'')+'>Revert to inherited role</button>':'')+
 '</div></div>';
 html+='<div class="section-header user-role-section-header"><strong>Application-specific assignments</strong></div>'+
 '<div class="panel user-role-table-panel"><div class="table-scroll user-role-table-scroll" role="region" aria-label="Application assignments, scroll horizontally for more columns" tabindex="0"><table class="board-table user-role-table" aria-label="Application-specific assignments"><thead><tr><th scope="col">Application</th><th scope="col">Effective stored role</th><th scope="col">Enforcement</th><th scope="col">Action</th></tr></thead><tbody>';
 for(const [id,name] of ROLE_MODULE_OPTIONS){
  const a=data.moduleAssignments.find(x=>x.userId===u.id&&x.moduleId===id);
  const opt=MODULE_ROLE_OPTIONS[id]||[];
  const status=a?.enabled?'Active: '+a.role:a?'Disabled: '+a.role:'Unassigned';
  const note=delegatedModules.has(id)?'Existing domain role handler':'Central role contract';
  const editBlocked=locked||!opt.length||(globalModuleRoleBlocked&&id!=='material-request-hub')||
   (id==='material-request-hub'&&!data.workspaceScopedMrhAvailable)||
   (id==='toolbox-issues'&&!a?.enabled);
  const editReason=busy?'Another role change is in progress.':
   u.protected?'Protected administrator accounts cannot be modified.':
   isSelf?'Self-assignment is not permitted.':
   !opt.length?'No supported role options are configured for this application.':
   globalModuleRoleBlocked&&id!=='material-request-hub'?'This legacy application role is global and this member belongs to multiple workspaces.':
   id==='material-request-hub'&&!data.workspaceScopedMrhAvailable?'Workspace-scoped Material Request Hub role management is not verified.':
   id==='toolbox-issues'&&!a?.enabled?'An existing Toolbox Issues source membership is required before changing its role.':'';
  const revokeBlocked=locked||(globalModuleRoleBlocked&&id!=='material-request-hub')||
   (id==='material-request-hub'&&!data.workspaceScopedMrhAvailable);
  html+='<tr><td><strong>'+esc(name)+'</strong></td><td>'+esc(status)+'</td><td>'+esc(note)+'</td><td>'+
   '<button class="secondary" aria-label="Assign or change '+esc(name)+' application role" data-action="user-role-edit-module" data-user-id="'+esc(u.id)+'" data-resource="'+esc(id)+'" '+
   (editBlocked?'disabled title="'+esc(editReason)+'"':'')+'>Assign / change</button> '+
   (a?.enabled?'<button class="secondary" aria-label="Revoke '+esc(name)+' application role" data-action="user-role-revoke-module" data-user-id="'+esc(u.id)+'" data-resource="'+esc(id)+'" '+
    (revokeBlocked?'disabled title="'+esc(editReason||'This application role cannot be changed for the selected member.')+'"':'')+'>Revoke</button>':'')+
  '</td></tr>';
 }
 html+='</tbody></table></div></div>';
 html+='<div class="section-header user-role-section-header"><strong>Individual board access</strong></div>'+
 '<div class="note user-role-board-note">Viewer permits reads; Editor permits reads and writes. Owner privileges cannot be granted or changed here. Backend checks are performed on every authorized board request.</div>'+
 '<div class="panel user-role-table-panel"><div class="table-scroll user-role-table-scroll" role="region" aria-label="Board access, scroll horizontally for more columns" tabindex="0"><table class="board-table user-role-table" aria-label="Individual board access"><thead><tr><th scope="col">Board</th><th scope="col">Membership</th><th scope="col">Action</th></tr></thead><tbody>';
 for(const board of data.boards){
  const a=data.boardAssignments.find(x=>x.userId===u.id&&x.boardId===board.id);
  html+='<tr><td>'+esc(board.name)+'</td><td>'+esc(a?.role||'No membership')+'</td><td>'+
   '<button class="secondary" aria-label="Set access for '+esc(board.name)+' (board '+esc(String(board.id).slice(-8))+')" data-action="user-role-edit-board" data-user-id="'+esc(u.id)+'" data-resource="'+esc(board.id)+'" '+(locked||a?.role==='owner'?'disabled':'')+'>Set access</button> '+
   (a&&a.role!=='owner'?'<button class="secondary" aria-label="Revoke access for '+esc(board.name)+' (board '+esc(String(board.id).slice(-8))+')" data-action="user-role-revoke-board" data-user-id="'+esc(u.id)+'" data-resource="'+esc(board.id)+'" '+(locked?'disabled':'')+'>Revoke</button>':'')+
  '</td></tr>';
 }
 html+='</tbody></table></div></div><p class="muted user-role-boundary-note">'+roleConfigurationIcon('shield')+'<span>The existing backend still governs approval, export, finance and domain-specific operations separately. A board membership alone does not grant access to sensitive domain records.</span></p>';
 return html+'</div>';
}
