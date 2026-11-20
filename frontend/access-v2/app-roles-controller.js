import {renderAppRolesSettings,verifyAppRolesSnapshot} from './app-roles-ui.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys=new Set(['fueltrans','tool-traceability','order-intake','time-tracker']);
const actions=new Set(['create','rename','description','duplicate','delete','update_capabilities','assign_member','remove_member']);
const resultFail=()=>Object.freeze({status:'UNAVAILABLE',roles:[],features:[],people:[]});
export class AppRolesController{
 constructor({api,auth,getContext,onToast}={}){
  this.api=api;this.auth=auth;this.getContext=getContext;this.onToast=onToast;
  this.appKey='fueltrans';this.host=null;this.snapshot=null;this.selectedRoleId=null;
  this.loading=false;this.error='';this.pending=[];this.busy=false;this.seq=0;
  this.click=event=>this.handleClick(event).catch(error=>
   this.onToast?.(error?.message||'Application role operation failed.',true));
  this.change=this.change.bind(this);
 }
 setApp(appKey){
  if(!keys.has(appKey))throw Error('Unrecognized app');
  if(this.appKey!==appKey){
   this.appKey=appKey;this.seq++;this.snapshot=null;this.selectedRoleId=null;
   this.pending=[];this.error='';
  }
 }
 mount(host){
  if(this.host!==host){
   this.host?.removeEventListener('click',this.click,true);
   this.host?.removeEventListener('change',this.change,true);
   this.host=host;
   this.host?.addEventListener('click',this.click,true);
   this.host?.addEventListener('change',this.change,true);
  }
  if(host&&!document.head.querySelector('link[data-apsyntra-v2-app-roles-css]')){
   const link=document.createElement('link');link.rel='stylesheet';
   link.href='./frontend/access-v2/app-roles.css';link.dataset.apsyntraV2AppRolesCss='true';
   document.head.append(link);
  }
  this.render();
 }
 unmount(){
  this.seq++;
  this.host?.removeEventListener('click',this.click,true);
  this.host?.removeEventListener('change',this.change,true);
  this.host=null;this.snapshot=null;this.pending=[];this.busy=false;
 }
 identity(){
  const c=this.getContext();
  if(!c||!this.auth.isSignedIn||!UUID.test(c.user_id)||!UUID.test(c.workspace_id)||
     this.auth.userId!==c.user_id)throw Error('Verified workspace identity required');
  return {actorId:c.user_id,workspaceId:c.workspace_id};
 }
 async verified(){
  const ctx=this.identity();
  const [actor,signed]=await Promise.all([this.auth.getVerifiedUser(),this.api.context()]);
  if(actor?.id!==ctx.actorId||signed?.user_id!==ctx.actorId||
    signed?.workspace_id!==ctx.workspaceId)throw Error('Signed application scope changed');
  return ctx;
 }
 async load(){
  const token=++this.seq,key=this.appKey;
  this.loading=true;this.error='';this.render();
  try{
   const ctx=await this.verified();
   let raw;
   try{
    raw=await this.api.rpc('apsyntra_access_app_roles_snapshot_v2',{
     p_workspace_id:ctx.workspaceId,p_app_key:key});
   }catch(e){
    if(e?.status===404&&e?.code==='PGRST202'){
     raw=null;this.error='The app-specific Roles backend is not activated; existing role assignments are unchanged.';
    }else throw e;
   }
   if(token!==this.seq||key!==this.appKey)return;
   const verified=verifyAppRolesSnapshot(raw,{appKey:key,
    workspaceId:ctx.workspaceId,actorId:ctx.actorId});
   if(verified.status!=='VERIFIED_APP_ROLES'){
    this.snapshot=resultFail();
    this.error ||= 'App role data could not be verified for the signed workspace.';
   }else{
    this.snapshot=verified;this.error='';
    if(!verified.roles.some(r=>r.id===this.selectedRoleId))this.selectedRoleId=verified.roles[0]?.id||null;
   }
  }catch(e){if(token!==this.seq)return;
   this.snapshot=resultFail();this.error=e?.message||'Failed to load signed application roles.';
  }finally{if(token===this.seq){this.loading=false;this.render();}}
 }
 render(){
  if(!this.host)return;
  this.host.innerHTML=renderAppRolesSettings({
   appKey:this.appKey,snapshot:this.snapshot,selectedRoleId:this.selectedRoleId,
   loading:this.loading,error:this.error,pending:this.pending});
 }
 async mutate(action,{roleId=null,name=null,description=null,userId=null,capabilities=null}={}){
  if(this.busy||!actions.has(action))throw Error('App role write unavailable');
  const before=this.snapshot,ctx=this.identity();
  if(before?.status!=='VERIFIED_APP_ROLES'||before.actorId!==ctx.actorId||
   before.workspaceId!==ctx.workspaceId||!before.canManage)throw Error('Signed app admin rights are unavailable');
  if(roleId!==null&&!before.roles.some(r=>r.id===roleId))throw Error('Role no longer exists in signed app');
  this.busy=true;this.render();
  try{
   await this.verified();
   const again=await this.api.rpc('apsyntra_access_app_roles_snapshot_v2',{
     p_workspace_id:ctx.workspaceId,p_app_key:this.appKey});
   const latest=verifyAppRolesSnapshot(again,{appKey:this.appKey,
    workspaceId:ctx.workspaceId,actorId:ctx.actorId});
   if(latest.status!=='VERIFIED_APP_ROLES'||latest.revision!==before.revision)
    throw Error('App roles changed in another session. Refresh before editing.');
   this.snapshot=null;this.render();
   const result=await this.api.rpc('apsyntra_access_app_roles_change_v2',{
    p_workspace_id:ctx.workspaceId,p_app_key:this.appKey,
    p_action:action,p_role_id:roleId,p_name:name,p_description:description,
    p_target_user_id:userId,p_capability_patch:capabilities,
    p_expected_revision:before.revision});
   if(result?.contract!=='apsyntra-app-roles-change-v2'||
      result?.state!=='committed'||result?.appKey!==this.appKey||
      result?.workspaceId!==ctx.workspaceId||result?.actorId!==ctx.actorId||
      result?.revision!==before.revision+1||result?.action!==action)
    throw Error('App-role mutation receipt failed server signature checks');
   const after=await this.api.rpc('apsyntra_access_app_roles_snapshot_v2',{
    p_workspace_id:ctx.workspaceId,p_app_key:this.appKey});
   const verified=verifyAppRolesSnapshot(after,{appKey:this.appKey,
    workspaceId:ctx.workspaceId,actorId:ctx.actorId});
   if(verified.status!=='VERIFIED_APP_ROLES'||verified.revision!==result.revision)
    throw Error('App-role readback did not verify the acknowledged change');
   this.snapshot=verified;
   if(result.roleId&&verified.roles.some(r=>r.id===result.roleId))this.selectedRoleId=result.roleId;
   this.pending=[];this.error='';
   this.onToast?.('Application role update saved and verified.');
  }catch(error){
   this.snapshot=null;this.pending=[];
   this.onToast?.(error?.message||'App role update could not be verified.',true);
   try{await this.load();}catch{/* preserve failure */}
  }finally{this.busy=false;this.render();}
 }
 change(event){
  const field=event.target.closest('[data-app-role-action="toggle-capability"]');
  if(!field||!this.host?.contains(field)||this.busy)return;
  const snapshot=this.snapshot,role=snapshot?.roles.find(r=>r.id===this.selectedRoleId);
  const featureKey=field.dataset.featureKey,capability=field.dataset.capability;
  if(!role||!snapshot.features.some(f=>f.key===featureKey&&f.availableCapabilities.includes(capability)))return;
  const original=role.capabilities.find(c=>c.featureKey===featureKey&&c.capability===capability)?.allowed===true;
  const value=field.checked;
  this.pending=this.pending.filter(p=>!(p.roleId===role.id&&p.featureKey===featureKey&&p.capability===capability));
  if(value!==original)this.pending.push({roleId:role.id,featureKey,capability,allowed:value});
  this.render();
 }
 async handleClick(event){
  const button=event.target.closest('[data-app-role-action]');
  if(!button||!this.host?.contains(button))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(this.busy)return;
  const action=button.dataset.appRoleAction;
  if(action==='retry'){await this.load();return;}
  if(action==='select-role'){
   this.selectedRoleId=button.dataset.roleId;this.pending=[];this.render();return;
  }
  if(action==='discard'){this.pending=[];this.render();return;}
  const snapshot=this.snapshot,role=snapshot?.roles.find(r=>r.id===this.selectedRoleId);
  if(snapshot?.status!=='VERIFIED_APP_ROLES'||!snapshot.canManage)return;
  if(action==='save'){
   if(!this.pending.length||!role)return;
   return this.mutate('update_capabilities',{roleId:role.id,
    capabilities:{patch:this.pending.map(x=>({featureKey:x.featureKey,capability:x.capability,allowed:x.allowed}))}});
  }
  if(action==='new-role'){
   const name=window.prompt('New application role name');
   if(name?.trim()&&name.length<=100)return this.mutate('create',{name:name.trim()});
  }
  if(!role)return;
  if(action==='rename'){
   const name=window.prompt('Rename role',role.name);
   if(name?.trim()&&name.length<=100)return this.mutate('rename',{roleId:role.id,name:name.trim()});
  }
  if(action==='edit-description'){
   const description=window.prompt('Edit role description',role.description);
   if(description!==null&&description.length<=500)
    return this.mutate('description',{roleId:role.id,description});
  }
  if(action==='duplicate'){
   if(window.confirm('Duplicate '+role.name+'? The copied role starts without members.'))
    return this.mutate('duplicate',{roleId:role.id});
  }
  if(action==='delete'){
   if(role.memberCount)throw Error('Reassign role members before deleting this role');
   if(window.confirm('Delete role '+role.name+'?'))
    return this.mutate('delete',{roleId:role.id});
  }
  if(action==='assign-person'){
   const candidates=(snapshot.directory||[]).filter(p=>!snapshot.people.some(m=>m.roleId===role.id&&m.userId===p.userId));
   if(!candidates.length){this.onToast?.('No signed app member directory is available.',true);return;}
   const lookup=window.prompt('Select an authorized member email:\n'+candidates.slice(0,12).map(p=>p.email).join('\n'));
   const user=candidates.find(p=>p.email===lookup);
   if(!user)return;
   return this.mutate('assign_member',{roleId:role.id,userId:user.userId});
  }
  if(action==='remove-person'){
   const user=snapshot.people.find(p=>p.roleId===role.id&&p.userId===button.dataset.userId);
   if(user&&window.confirm('Remove '+user.name+' from '+role.name+'?'))
    return this.mutate('remove_member',{roleId:role.id,userId:user.userId});
  }
 }
}
