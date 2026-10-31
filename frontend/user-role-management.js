/** CP-RC02 User Role Management. Server RPCs, never direct table mutations.
 * The existing module_role_assignments and work_board_members stay authoritative.
 */
import {ROLE_MODULE_OPTIONS} from './role-configuration-ui.js';
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
  // Always verify the EXISTING bootstrap-only snapshot first. New optional
  // RPC availability must never bypass the central administrator scope guard.
  const d=await this.api.rpc('apsyntra_role_user_management_snapshot',{p_workspace_id:workspaceId});
  if(d?.bootstrapVerified!==true||d.workspaceId!==workspaceId||
   !['users','modules','moduleAssignments','boards','boardAssignments'].every(x=>Array.isArray(d[x])))
   throw Error('Invalid server-authorized role management result');
  let crm;
  try {
   crm=await this.api.rpc('apsyntra_crm_platform_role_snapshot',{p_workspace_id:workspaceId});
  } catch(error) {
   // Only the exact PostgREST missing-RPC contract permits a temporary
   // read-only compatibility view. Never treat 401/403/other 404 as missing,
   // and never infer, fabricate, or permit assignment of CRM platform roles.
   if(error?.status===404&&error?.code==='PGRST202')
    return {...d,crmPlatformRoles:[],crmPlatformUnavailable:true};
   throw error;
  }
  if(crm?.bootstrapVerified!==true||crm.workspaceId!==workspaceId||
    !Array.isArray(crm.roles)||!crm.roles.every(r=>UUID.test(r.userId||'')&&
      APSYNTRA_CRM_PLATFORM_ROLES.includes(r.effectiveRole)&&
      (r.assignedRole===null||APSYNTRA_CRM_PLATFORM_ROLES.includes(r.assignedRole))))
    throw Error('Invalid server-authorized CRM platform-role snapshot');
  return {...d,crmPlatformRoles:crm.roles,crmPlatformUnavailable:false};
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
   !APSYNTRA_CRM_PLATFORM_ROLES.includes(r.effectiveRole))
   throw Error('Backend CRM platform role acknowledgement invalid');
  return r;
 }
}
function selected(data,id){
 return data?.users?.find(u=>u.id===id)||null;
}
export function renderUserRoleManagement({verified=false,data=null,selectedUserId=null,busy=false,error=''}={}){
 if(!verified)return '<div class="access-denied">Role management unavailable</div>';
 let html='<div class="page-head"><div><span class="label-top">Administration / Bootstrap authority</span>'+
 '<h1>User Role Management</h1><p>Manage APSYNTRA CRM platform, application and board roles from the central backend.</p></div>'+
 '<button class="secondary" data-action="user-role-refresh" '+(busy?'disabled':'')+'>Refresh assignments</button></div>'+
 '<div class="note security-note">Only the two verified bootstrap administrators can apply changes. The backend rejects self-promotion, protected administrators, stale updates, and cross-workspace targets. Changes are audited and visible to subsequent signed sessions.</div>';
 if(error)html+='<div class="error-banner" role="alert">'+esc(error)+'</div>';
 if(data?.crmPlatformUnavailable)html+='<div class="note security-note" role="status">APSYNTRA CRM platform role assignments are unavailable because the required backend migration is not installed. CRM changes are disabled. Existing application and board assignments remain governed by the centralized backend.</div>';
 if(!data)return html+'<div class="panel"><p class="muted">Loading authorized workspace members…</p></div>';
 const u=selected(data,selectedUserId)||data.users[0]||null;
 html+='<div class="stat-grid">'+[
  ['Active workspace members',data.users.length],['Application assignments',data.moduleAssignments.length],
  ['Board memberships',data.boardAssignments.length],['Available boards',data.boards.length]
 ].map(([k,v])=>'<div class="stat-card"><span class="stat-label">'+esc(k)+'</span><strong class="stat-value">'+Number(v)+'</strong></div>').join('')+'</div>';
 html+='<div class="panel"><div class="panel-header"><h3>Select user</h3><span>Workspace scoped</span></div>'+
 '<div class="panel-body"><label for="managed-user">Existing account</label><select id="managed-user" class="search-input" data-action="user-role-select">'+
 data.users.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===u?.id?'selected':'')+'>'+esc(x.name||x.email)+' — '+esc(x.platformRole)+(x.protected?' (protected)':'')+'</option>').join('')+
 '</select></div></div>';
 if(!u)return html+'<p class="muted">No active members.</p>';
 html+='<div class="panel"><div class="panel-header"><h3>'+esc(u.name||u.email)+'</h3><span>'+esc(u.platformRole)+'</span></div>'+
 '<div class="panel-body">'+(u.protected||['admin_general_manager'].includes(u.platformRole)?
 '<div class="note security-note">Protected administrator — role modifications are intentionally disabled.</div>':
 '<div class="note">Select a module or board below to update this user’s actual role. The next dialog requires explicit confirmation.</div>')+
 '</div></div>';
 const locked=!!u.protected||u.platformRole==='admin_general_manager'||busy;
 const crm=data.crmPlatformRoles?.find(r=>r.userId===u.id)||null;
 html+='<div class="section-header"><strong>APSYNTRA CRM Platform Role</strong></div>'+
 '<div class="note security-note">This is the CRM-wide authorization ceiling, separate from WatchdogWorkspace identity, application assignments and board membership. Changes cannot grant module roles or board ownership. Explicit Viewer blocks module write-level roles and board edit/manage; existing legacy behavior is preserved until an override is assigned.</div>'+
 '<div class="panel"><div class="panel-body"><div class="settings-detail"><label>Inherited WatchdogWorkspace role</label><strong>'+
 esc(u.platformRole)+'</strong></div><div class="settings-detail"><label>CRM platform role</label><strong>'+
 esc(data.crmPlatformUnavailable?'Unavailable — backend migration pending':crm?.effectiveRole||'Unverified')+(data.crmPlatformUnavailable?'':crm?.assignedRole?' (explicit)':' (inherited)')+
 '</strong></div>'+
 '<button class="secondary" data-action="user-role-edit-crm-platform" data-user-id="'+esc(u.id)+'" '+
 (locked||!crm?'disabled':'')+'>Assign / change CRM role</button> '+
 (crm?.assignedRole?'<button class="secondary" data-action="user-role-revert-crm-platform" data-user-id="'+esc(u.id)+'" '+
 (locked?'disabled':'')+'>Revert to inherited role</button>':'')+
 '</div></div>';
 html+='<div class="section-header"><strong>Application-specific assignments</strong></div>'+
 '<div class="panel"><div class="table-scroll"><table class="board-table"><thead><tr><th>Application</th><th>Effective stored role</th><th>Enforcement</th><th>Action</th></tr></thead><tbody>';
 for(const [id,name] of ROLE_MODULE_OPTIONS){
  const a=data.moduleAssignments.find(x=>x.userId===u.id&&x.moduleId===id);
  const opt=MODULE_ROLE_OPTIONS[id]||[];
  const status=a?.enabled?'Active: '+a.role:a?'Disabled: '+a.role:'Unassigned';
  const note=delegatedModules.has(id)?'Existing domain role handler':'Central role contract';
  html+='<tr><td><strong>'+esc(name)+'</strong></td><td>'+esc(status)+'</td><td>'+esc(note)+'</td><td>'+
   '<button class="secondary" data-action="user-role-edit-module" data-user-id="'+esc(u.id)+'" data-resource="'+esc(id)+'" '+(locked||!opt.length||(id==='toolbox-issues'&&!a?.enabled)?'disabled':'')+'>Assign / change</button> '+
   (a?.enabled?'<button class="secondary" data-action="user-role-revoke-module" data-user-id="'+esc(u.id)+'" data-resource="'+esc(id)+'" '+(locked?'disabled':'')+'>Revoke</button>':'')+
  '</td></tr>';
 }
 html+='</tbody></table></div></div>';
 html+='<div class="section-header"><strong>Individual board access</strong></div>'+
 '<div class="note">Viewer permits reads; Editor permits reads and writes. Owner privileges cannot be granted or changed here. Backend checks are performed on every authorized board request.</div>'+
 '<div class="panel"><div class="table-scroll"><table class="board-table"><thead><tr><th>Board</th><th>Membership</th><th>Action</th></tr></thead><tbody>';
 for(const board of data.boards){
  const a=data.boardAssignments.find(x=>x.userId===u.id&&x.boardId===board.id);
  html+='<tr><td>'+esc(board.name)+'</td><td>'+esc(a?.role||'No membership')+'</td><td>'+
   '<button class="secondary" data-action="user-role-edit-board" data-user-id="'+esc(u.id)+'" data-resource="'+esc(board.id)+'" '+(locked||a?.role==='owner'?'disabled':'')+'>Set access</button> '+
   (a&&a.role!=='owner'?'<button class="secondary" data-action="user-role-revoke-board" data-user-id="'+esc(u.id)+'" data-resource="'+esc(board.id)+'" '+(locked?'disabled':'')+'>Revoke</button>':'')+
  '</td></tr>';
 }
 html+='</tbody></table></div></div><p class="muted">The existing backend still governs approval, export, finance and domain-specific operations separately. A board membership alone does not grant access to sensitive domain records.</p>';
 return html;
}
