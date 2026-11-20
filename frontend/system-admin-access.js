/** Explicit global System Admin management, separate from CRM role ceilings,
 * TimeTracker module "System Admin", department and bootstrap identity.
 * All authority is server-enforced; no local role or department inference.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
}[c]));
export const SYSTEM_ADMIN_DESIGNATIONS=Object.freeze(['trusted_it','general_manager']);
const unavailable=Object.freeze({status:'UNAVAILABLE',roles:[],canManage:false});
export function normalizeSystemAdminSnapshot(raw,{workspaceId,actorId,users}={}){
 if(!uuid.test(workspaceId||'')||!uuid.test(actorId||'')||
    raw?.contract!=='apsyntra-system-admin-v1'||
    raw.workspaceId!==workspaceId||raw.actorId!==actorId||
    raw.authorized!==true||typeof raw.canManage!=='boolean'||
    !Array.isArray(users)||!Array.isArray(raw.rows)||
    raw.rows.length!==users.length||raw.rows.length>500)
   return unavailable;
 const expected=new Set(users.map(u=>u.id));
 if(expected.size!==users.length||[...expected].some(id=>!uuid.test(id)))
   return unavailable;
 const seen=new Set(),roles=[];
 for(const x of raw.rows){
  if(!uuid.test(x?.userId||'')||!expected.has(x.userId)||
     seen.has(x.userId)||typeof x.active!=='boolean'||
     !Number.isSafeInteger(x.revision)||x.revision<0||
     (x.active&&!SYSTEM_ADMIN_DESIGNATIONS.includes(x.designation))||
     (!x.active&&x.designation!==null&&!SYSTEM_ADMIN_DESIGNATIONS.includes(x.designation))||
     (x.active&&x.revision===0))
    return unavailable;
  seen.add(x.userId);
  roles.push(Object.freeze({userId:x.userId,active:x.active,
   designation:x.designation||null,revision:x.revision}));
 }
 return Object.freeze({status:'VERIFIED_SYSTEM_ADMIN',workspaceId,actorId,
  canManage:raw.canManage,roles:Object.freeze(roles)});
}
export class SystemAdminClient {
 constructor(api){this.api=api;}
 async snapshot({workspaceId,actorId,users}){
  if(!uuid.test(workspaceId||'')||!uuid.test(actorId||''))
   throw Error('Signed System Admin scope is unavailable.');
  let raw;
  try{
   raw=await this.api.rpc('apsyntra_system_admin_snapshot',{p_workspace_id:workspaceId});
  }catch(error){
   if(error?.status===404&&error?.code==='PGRST202')return unavailable;
   throw error; // 401/403/other 404, network and malformed responses fail closed
  }
  const data=normalizeSystemAdminSnapshot(raw,{workspaceId,actorId,users});
  if(data.status!=='VERIFIED_SYSTEM_ADMIN')
   throw Error('System Admin authorization snapshot failed verification.');
  return data;
 }
 async change({workspaceId,actorId,userId,action,designation,reason,expectedRevision}){
  if(!uuid.test(workspaceId||'')||!uuid.test(actorId||'')||
     !uuid.test(userId||'')||actorId===userId||
     !['grant','revoke'].includes(action)||
     !SYSTEM_ADMIN_DESIGNATIONS.includes(designation)||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
     typeof reason!=='string'||reason.trim().length<12||reason.trim().length>500)
   throw Error('Invalid, incomplete or self-directed System Admin change.');
  const raw=await this.api.rpc('apsyntra_system_admin_change',{
   p_workspace_id:workspaceId,p_target_user_id:userId,
   p_action:action,p_designation:designation,
   p_reason:reason.trim(),p_expected_revision:expectedRevision
  });
  if(raw?.state!=='committed'||raw.workspaceId!==workspaceId||
     raw.targetUserId!==userId||raw.action!==action||
     raw.active!==(action==='grant')||
     raw.revision!==expectedRevision+1)
   throw Error('System Admin change acknowledgement could not be verified.');
  return raw;
 }
}
export function renderSystemAdminSection({data=null,selectedUser=null,actorId=null,busy=false,hidden=false}={}){
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
    (verified?'Verified global-role directory':'Pending backend activation')+'</span></div>'+
  '<div class="note security-note user-role-ceiling-note">System Admin is an explicitly appointed, global APSYNTRA authority for the trusted IT administration team and General Manager / CEO. Assigning the Information Technology department or the TimeTracker System Admin application role does not confer this role. Operational powers remain subject to each server-side domain policy and signed authorization.</div>'+
  (verified?
   '<div class="panel user-role-platform-panel"><div class="panel-body">'+
    '<div class="settings-detail"><label>Selected account</label><strong>'+
     escape(selectedUser?.name||selectedUser?.email||'None')+'</strong></div>'+
    '<div class="settings-detail"><label>System Admin assignment</label><strong>'+
     (member?.active?'Active — '+escape(description):'Not assigned')+'</strong></div>'+
    '<div class="settings-detail"><label>Verified active members in this workspace</label><strong>'+
     String(count)+'</strong></div>'+
    '<div class="settings-detail"><label>Assignment governance</label><strong>'+
     (data.canManage?'System Admin / bootstrap authorized':'View only — System Admin approval required')+
    '</strong></div>'+
    '<div class="user-role-system-admin-actions">'+
     (!member?.active?
      '<button type="button" class="secondary" data-action="user-role-grant-system-admin" data-user-id="'+
       escape(selectedUser?.id)+'"'+(canGrant?'':' disabled')+'>Assign System Admin</button>':
      '<button type="button" class="secondary" data-action="user-role-revoke-system-admin" data-user-id="'+
       escape(selectedUser?.id)+'"'+(canRevoke?'':' disabled')+'>Revoke System Admin</button>')+
    '</div></div></div>'+
    '<p class="muted user-role-boundary-note">'+
     (isSelf?'Self-assignment and self-revocation are prohibited.':
      protectedIdentity&&member?.active?'Protected bootstrap accounts cannot be demoted from System Admin.':
      count<=1&&member?.active?'The last active System Admin cannot be revoked.':
      'All changes require a recorded justification, server authorization and signed readback.')+
    '</p>':
   '<div class="panel user-role-platform-panel"><div class="panel-body">'+
    '<div class="note" role="status">The System Admin management backend is not activated. No global administrator accounts have been inferred or changed. A reviewed SQL activation and signed multi-account acceptance are required before assignments can be made.</div>'+
   '</div></div>')+
  '</section>';
}
