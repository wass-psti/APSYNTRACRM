import {TeamsClient} from './teams-client.js';
import {renderWorkspaceRoles} from '../access-v2/workspace-ui.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const field=(label,name,value='',type='text')=>'<label class="teams-dialog-field">'+esc(label)+
 '<input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value)+'" autocomplete="off" required></label>';
const choice=(label,name,options)=>'<label class="teams-dialog-field">'+esc(label)+'<select name="'+esc(name)+'">'+
 options.map(([v,k])=>'<option value="'+esc(v)+'">'+esc(k)+'</option>').join('')+'</select></label>';
export class TeamsController {
 constructor({api,auth,getContext,getBoards,onClose,onToast}){
  this.api=api;this.auth=auth;this.getContext=getContext;this.getBoards=getBoards;
  this.onClose=onClose;this.onToast=onToast;this.client=new TeamsClient(api);
  this.host=null;this.seq=0;this.busy=false;this.loading=false;this.error='';
  this.snapshot=null;this.selectedTeamId=null;this.teamSearch='';this.teamFilter='all';this.filterOpen=false;
  this.tab='users';this.userSearch='';this.contentSearch='';this.systemAdminsOnly=false;
  this.addUsersOpen=false;this.addUsersSearch='';this.theme='dark';this.modal=null;
  this.onClick=this.onClick.bind(this);this.onInput=this.onInput.bind(this);
  this.onChange=this.onChange.bind(this);this.onKey=this.onKey.bind(this);
  this.onOutside=this.onOutside.bind(this);this.globalBound=false;
 }
 mount(host){
  // Preserve APSYNTRA's single initial stylesheet and startup module budget.
  // Load the Teams-only CSS on first authorized visit, not on every page.
  if(host&&!document.head.querySelector('link[data-apsyntra-teams-css]')){
   const sheet=document.createElement('link');
   sheet.rel='stylesheet';
   sheet.href='./frontend/teams/teams.css';
   sheet.dataset.apsyntraTeamsCss='true';
   document.head.append(sheet);
  }
  if(host&&!document.head.querySelector('link[data-apsyntra-access-v2-css]')){
   const pageCss=document.createElement('link');
   pageCss.rel='stylesheet';
   pageCss.href='./frontend/access-v2/workspace.css';
   pageCss.dataset.apsyntraAccessV2Css='true';
   document.head.append(pageCss);
  }
  if(this.host!==host){
   this.host?.removeEventListener('click',this.onClick,true);
   this.host?.removeEventListener('input',this.onInput,true);
   this.host?.removeEventListener('change',this.onChange,true);
   this.host=host;
   host?.addEventListener('click',this.onClick,true);
   host?.addEventListener('input',this.onInput,true);
   host?.addEventListener('change',this.onChange,true);
  }
  this.render();
 }
 unmount(){
  this.seq++;this.host?.removeEventListener('click',this.onClick,true);
  this.host?.removeEventListener('input',this.onInput,true);
  this.host?.removeEventListener('change',this.onChange,true);
  document.removeEventListener('keydown',this.onKey,true);
  document.removeEventListener('pointerdown',this.onOutside,true);
  this.globalBound=false;this.host=null;this.modal=null;this.snapshot=null;this.busy=false;this.loading=false;
 }
 current(){
  const ctx=this.getContext();return !!ctx&&this.auth.isSignedIn&&
   ctx.user_id===this.auth.userId&&uuid.test(ctx.user_id)&&uuid.test(ctx.workspace_id);
 }
 async load(){
  const seq=++this.seq,ctx=this.getContext();
  this.loading=true;this.error='';this.render();
  try{
   if(!this.current())throw Error('Teams requires an active verified session.');
   const verified=await this.auth.getVerifiedUser();
   const current=await this.api.context();
   if(verified?.id!==ctx.user_id||current.user_id!==ctx.user_id||
    current.workspace_id!==ctx.workspace_id)throw Error('Teams signed context changed.');
   const snapshot=await this.client.snapshot({workspaceId:ctx.workspace_id,actorId:ctx.user_id});
   if(seq!==this.seq||!this.current())return;
   this.snapshot=snapshot;
   if(snapshot.status==='UNAVAILABLE')this.error=
    'The Teams backend has not been activated. No roles or team assignments have been changed.';
   if(snapshot.status==='VERIFIED_TEAMS'&&this.selectedTeamId&&
      !snapshot.teams.some(t=>t.id===this.selectedTeamId))this.selectedTeamId=null;
  }catch(error){
   if(seq!==this.seq)return;
   this.snapshot=null;this.error='Unable to verify Teams access. '+String(error?.message||'Please retry.');
  }finally{
   if(seq===this.seq){this.loading=false;this.render();
     this.host?.querySelector('#teams-search')?.focus({preventScroll:true});}
  }
 }
 render(){
  if(!this.host)return;
  this.host.innerHTML=renderWorkspaceRoles({
   snapshot:this.snapshot,loading:this.loading,error:this.error,selectedTeamId:this.selectedTeamId,
   teamSearch:this.teamSearch,teamFilter:this.teamFilter,filterOpen:this.filterOpen,tab:this.tab,userSearch:this.userSearch,
   contentSearch:this.contentSearch,systemAdminsOnly:this.systemAdminsOnly,
   addUsersOpen:this.addUsersOpen,addUsersSearch:this.addUsersSearch,theme:this.theme
  })+(this.modal||'');
 }
 scope(){
  const s=this.snapshot,ctx=this.getContext();
  if(!this.current()||s?.status!=='VERIFIED_TEAMS'||s.actorId!==ctx.user_id||
   s.workspaceId!==ctx.workspace_id)throw Error('Signed Teams permissions are unavailable.');
  return {s,ctx,team:s.teams.find(t=>t.id===this.selectedTeamId)};
 }
 async mutate(action,args={}){
  if(this.busy)throw Error('Another Teams change is in progress.');
  const {s,ctx}=this.scope();
  this.busy=true;this.modal=null;this.render();
  try{
   const identity=await this.auth.getVerifiedUser(),current=await this.api.context();
   if(identity?.id!==ctx.user_id||current.user_id!==ctx.user_id||
      current.workspace_id!==ctx.workspace_id)throw Error('Signed Teams identity changed.');
   const latest=await this.client.snapshot({workspaceId:ctx.workspace_id,actorId:ctx.user_id});
   if(latest.status!=='VERIFIED_TEAMS'||latest.revision!==s.revision)
    throw Error('Team membership changed in another session. Refresh before retrying.');
   this.snapshot=null;this.render();
   const receipt=await this.client.change({workspaceId:ctx.workspace_id,actorId:ctx.user_id,
    action,expectedRevision:s.revision,...args});
   const after=await this.client.snapshot({workspaceId:ctx.workspace_id,actorId:ctx.user_id});
   if(!this.current()||after.status!=='VERIFIED_TEAMS'||after.revision!==receipt.revision)
    throw Error('Team write acknowledgement was not confirmed by a new signed readback.');
   this.snapshot=after;
   if(action==='create'&&receipt.teamId)this.selectedTeamId=receipt.teamId;
   this.onToast?.('Team change verified and audited.');
  }catch(error){
   this.error=String(error?.message||'Team update failed.');
   try{await this.load();}catch{/* preserve fail-closed */}
   throw error;
  }finally{this.busy=false;this.render();}
 }
 ask(title,message,action,args={},fields='',submit='Confirm',danger=false){
  this.modal='<div class="teams-subdialog-backdrop" data-teams-subdialog>'+
   '<form class="teams-subdialog" data-teams-confirm><h3>'+esc(title)+'</h3><p>'+esc(message)+'</p>'+
   fields+'<div class="teams-dialog-buttons"><button type="button" data-teams-cancel>Cancel</button>'+
   '<button type="submit" class="'+(danger?'danger':'')+'">'+esc(submit)+'</button></div></form></div>';
  this.pending={action,args};this.render();
  this.host.querySelector('.teams-subdialog input,.teams-subdialog select,.teams-subdialog button')?.focus();
 }
 closeDialog(){this.modal=null;this.pending=null;this.render();}
 onKey(event){
  if(!this.host)return;
  if(event.key==='Escape'){
   if(!this.modal)return;
   event.preventDefault();event.stopImmediatePropagation();
   this.closeDialog();
   return;
  }
  if(event.key!=='Tab')return;
  const panel=this.modal?this.host.querySelector('.teams-subdialog'):
   this.host.querySelector('.ap-v2-workspace-page');
  if(!panel)return;
  const eligible=[...panel.querySelectorAll(
   'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
  )].filter(el=>el.getClientRects().length>0&&!el.closest('[hidden]'));
  if(!eligible.length){event.preventDefault();panel.focus();return;}
  const first=eligible[0],last=eligible[eligible.length-1];
  if(event.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){
   event.preventDefault();last.focus();
  }else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){
   event.preventDefault();first.focus();
  }
 }
 onOutside(event){
  if(!this.host)return;
  for(const menu of this.host.querySelectorAll('.teams-menu[open],.ap-v2-menu[open],.ap-v2-role-switch[open]')){
   if(!menu.contains(event.target))menu.open=false;
  }
 }
 onInput(event){
  if(!this.host?.contains(event.target))return;
  const names={'teams-search':'teamSearch','teams-user-search':'userSearch',
   'teams-content-search':'contentSearch','teams-add-user-search':'addUsersSearch'};
  const key=names[event.target.id];if(!key)return;
  event.stopImmediatePropagation();
  const pos=event.target.selectionStart;
  this[key]=String(event.target.value).slice(0,120);
  this.render();
  const target=this.host.querySelector('#'+event.target.id);
  target?.focus({preventScroll:true});
  if(target&&pos!==null)target.setSelectionRange(pos,pos);
 }
 onChange(event){
  if(!this.host?.contains(event.target))return;
  if(event.target.id==='teams-filter-select'){
   event.stopImmediatePropagation();this.teamFilter=['has-admins','without-admins'].includes(event.target.value)?event.target.value:'all';this.filterOpen=false;
   this.render();
  }else if(event.target.id==='teams-admins-only'){
   event.stopImmediatePropagation();this.systemAdminsOnly=event.target.checked===true;this.render();
  }
 }
 async onClick(event){
  if(!this.host?.contains(event.target))return;
  const summary=event.target.closest('.teams-menu > summary');
  if(summary){
   const details=summary.parentElement;
   // Table menus float over the scroll viewport without clipping the rows.
   requestAnimationFrame(()=>{
    if(!details.open||!this.host?.contains(details))return;
    const panel=details.querySelector('.teams-popover'),rect=summary.getBoundingClientRect();
    if(!panel)return;
    panel.style.position='fixed';
    const width=panel.offsetWidth||235;
    panel.style.left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8))+'px';
    panel.style.top=(rect.bottom+Math.min(panel.scrollHeight||0,400)>window.innerHeight-8?
      Math.max(8,rect.top-Math.min(panel.scrollHeight||0,400)):rect.bottom)+'px';
   });
   return;
  }
  if(event.target.matches('[data-teams-backdrop]')){
   event.preventDefault();event.stopImmediatePropagation();this.onClose?.();return;
  }
  const cancel=event.target.closest('[data-teams-cancel]');
  if(cancel){event.preventDefault();event.stopImmediatePropagation();this.closeDialog();return;}
  const button=event.target.closest('[data-action^="teams-"]');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  const action=button.dataset.action;
  try{await this.act(action,button);}catch(error){
   this.onToast?.(String(error?.message||error),true);
  }
 }
 async act(action,button){
  if(action==='teams-close')return this.onClose?.();
  if(action==='teams-retry')return this.load();
  if(action==='teams-theme'){this.theme=this.theme==='dark'?'light':'dark';this.render();return;}
  if(action==='teams-select'){this.selectedTeamId=button.dataset.teamId||null;
   this.addUsersOpen=false;this.tab='users';this.render();return;}
  if(action==='teams-tab'){this.tab=button.dataset.tab==='content'?'content':'users';
   this.addUsersOpen=false;this.render();return;}
  if(action==='teams-filter'){this.filterOpen=!this.filterOpen;this.render();if(this.filterOpen)this.host.querySelector('#teams-filter-select')?.focus();return;}
  const {s,team}=this.scope();
  const userId=button.dataset.userId;
  const member=s.members.find(m=>m.userId===userId&&m.teamId===team?.id);
  const sys=s.canManageSystemAdmins===true,manage=team?.canManage===true;
  if(action==='teams-view-profile'){
   const person=s.directory.find(u=>u.userId===userId);
   if(!person)return;
   this.ask('User profile',person.name+' · '+person.email,'none');
   return;
  }
  if(action==='teams-create'&&sys)
   return this.ask('New team','Create a team in this workspace.','create',{},field('Team name','name'),'Create');
  if(action==='teams-rename'&&manage)
   return this.ask('Rename team','Rename '+team.name+'.','rename',{teamId:team.id},
    field('Team name','name',team.name),'Save');
  if(action==='teams-duplicate'&&manage)
   return this.ask('Duplicate team','Create an empty duplicate without copying users or privileges?',
    'duplicate',{teamId:team.id},'','Duplicate');
  if(action==='teams-delete'&&manage&&!team.isSystem)
   return this.ask('Delete team','Deleting '+team.name+' removes all assigned memberships and content access.',
    'delete',{teamId:team.id},'','Delete team',true);
  if((action==='teams-change-avatar'||action==='teams-change-cover')&&manage){
   const avatar=action==='teams-change-avatar';
   return this.ask('Change '+(avatar?'avatar':'cover'),'Use a verified HTTPS image URL from an approved host.',
    avatar?'set_avatar':'set_cover',{teamId:team.id},
    field('HTTPS image URL','assetUrl',avatar?team.avatarUrl||'':team.coverUrl||'','url'),'Save image');
  }
  if(action==='teams-add-users'&&manage){
   this.addUsersOpen=!this.addUsersOpen;this.render();
   this.host.querySelector('#teams-add-user-search')?.focus();return;
  }
  if(action==='teams-member-add'&&manage&&s.directory.some(p=>p.userId===userId))
   return this.mutate('add_member',{teamId:team.id,userId});
  if(!member)return;
  if(action==='teams-owner-add'&&manage&&!member.isOwner)
   return this.mutate('make_owner',{teamId:team.id,userId});
  if(action==='teams-owner-remove'&&manage&&member.isOwner&&team.ownerCount>1)
   return this.ask('Remove team owner','Remove the team-owner crown from '+member.name+'?',
    'remove_owner',{teamId:team.id,userId},'','Remove owner',true);
  if(action==='teams-member-remove'&&manage)
   return this.ask('Remove team member',member.name+' may lose inherited content access.',
    'remove_member',{teamId:team.id,userId},'','Remove member',true);
  if((action==='teams-member-copy'||action==='teams-member-move')&&manage){
   const targets=s.teams.filter(t=>t.id!==team.id&&t.canManage);
   if(!targets.length)throw Error('No other manageable team is available.');
   return this.ask('Choose destination team','A person can belong to multiple teams.',
    action==='teams-member-copy'?'add_other_team':'move_member',
    {teamId:team.id,userId},
    choice('Destination team','destinationTeamId',targets.map(t=>[t.id,t.name])),
    action==='teams-member-copy'?'Add to team':'Move');
  }
  if(action==='teams-admin-grant'&&sys&&!member.systemAdminExplicit)
   return this.ask('Grant System Admin',member.name+' will get full control of the entire app. Continue?',
    'grant_admin',{teamId:team.id,userId},'','Grant');
  if(action==='teams-admin-revoke'&&sys&&member.systemAdminExplicit)
   return this.ask('Revoke System Admin','Revoke '+member.name+' explicit System Admin assignment?',
    'revoke_admin',{teamId:team.id,userId},'','Revoke',true);
  if(action==='teams-assign-content'&&manage){
   const boards=(this.getBoards()||[]).filter(b=>uuid.test(b.id||'')&&
    !s.content.some(c=>c.teamId===team.id&&c.contentType==='board'&&c.contentId===b.id));
   if(!boards.length)throw Error('No additional accessible boards are available.');
   return this.ask('Assign content','Give this team Viewer or Editor access to a board.',
    'assign_content',{teamId:team.id,contentType:'board'},
    choice('Board','contentId',boards.map(b=>[b.id,b.name]))+
    choice('Access level','accessLevel',[['viewer','Viewer'],['editor','Editor']]),'Assign');
  }
  if(action==='teams-content-remove'&&manage)
   return this.ask('Remove content','Remove this team permission?',
    'remove_content',{teamId:team.id,contentType:button.dataset.contentType,
     contentId:button.dataset.contentId},'','Remove',true);
 }
 bindGlobal(){
  if(this.globalBound)return;
  this.globalBound=true;
  document.addEventListener('keydown',this.onKey,true);
  document.addEventListener('pointerdown',this.onOutside,true);
 }
 handleSubmit(event){
  if(!this.host?.contains(event.target)||!event.target.matches('[data-teams-confirm]'))return false;
  event.preventDefault();event.stopImmediatePropagation();
  if(!this.pending)return true;
  const {action,args}=this.pending;
  if(action==='none'){this.closeDialog();return true;}
  const form=new FormData(event.target);
  const payload={...args};
  for(const key of ['name','destinationTeamId','contentId','accessLevel','assetUrl'])
   if(form.has(key))payload[key]=String(form.get(key)||'').trim()||null;
  void this.mutate(action,payload).catch(error=>this.onToast?.(String(error?.message||error),true));
  return true;
 }
}
