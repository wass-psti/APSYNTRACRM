/** Application-scoped invite/manage surface.
 * The caller must supply a VERIFIED CRM administrator snapshot and server-
 * authorized mutation callbacks. Workspace membership and board assignments
 * NEVER imply application access. No direct table writes or invitation email.
 */
export const APPLICATION_ACCESS_DIALOG_ENABLED=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[89ab0-9a-f]{12}$/i;
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const rolesByModule=Object.freeze({
 'time-tracker':'Employee',
 'fueltrack-plus':'User',
 'tradelink':'User',
 'fund-released-tracker':'REQUESTOR',
 'order-intake':'Viewer',
 'employee-eval':'employee',
 'aps-aims':'Viewer',
 'tool-traceability':'VIEWER',
 'fueltrans':'viewer',
 'charter-navigator':'user'
});
export const APPLICATION_ACCESS_SUPPORTED_MODULES=Object.freeze(Object.keys(rolesByModule));
export function applicationDefaultInviteRole(moduleId,options=[]){
 const preferred=rolesByModule[moduleId];
 return preferred&&options.includes(preferred)?preferred:null;
}
const unavailable=Object.freeze({status:'UNAVAILABLE',members:Object.freeze([])});
/** Accept only data from the pre-existing, signed, admin-only workspace RPC.
 * The UI never accepts a fabricated local member list as an authorization.
 */
export function normalizeSignedApplicationDirectory(raw,{workspaceId,moduleId,actorId,roleOptions=[]}={}){
 if(!UUID.test(workspaceId||'')||!UUID.test(actorId||'')||
   !APPLICATION_ACCESS_SUPPORTED_MODULES.includes(moduleId)||
   !Array.isArray(roleOptions)||!roleOptions.length||
   raw?.adminVerified!==true||raw.workspaceId!==workspaceId||
   !Array.isArray(raw.users)||raw.users.length>500||
   !Array.isArray(raw.moduleAssignments)||raw.moduleAssignments.length>10000)
  return unavailable;
 const assignments=new Map();
 for(const row of raw.moduleAssignments){
  if(row?.moduleId!==moduleId)continue;
  if(!UUID.test(row.userId||'')||assignments.has(row.userId)||
     typeof row.enabled!=='boolean'||typeof row.role!=='string'||
     typeof row.updatedAt!=='string'&&row.updatedAt!==null&&row.updatedAt!==undefined)
   return unavailable;
  assignments.set(row.userId,row);
 }
 const seen=new Set(),members=[];
 for(const user of raw.users){
  if(!UUID.test(user?.id||'')||seen.has(user.id)||
     typeof user.name!=='string'||!user.name.trim()||user.name.length>180||
     typeof user.email!=='string'||user.email.length>254||!EMAIL.test(user.email)||
     typeof user.protected!=='boolean')return unavailable;
  seen.add(user.id);
  const assignment=assignments.get(user.id);
  if(assignment&&!roleOptions.includes(assignment.role))return unavailable;
  members.push(Object.freeze({
   id:user.id,name:user.name.trim(),email:user.email,
   protected:user.protected||user.id===actorId,
   role:assignment?.enabled?assignment.role:null,
   currentRole:assignment?.role||null,
   revision:assignment?.updatedAt||null
  }));
 }
 if([...assignments.keys()].some(id=>!seen.has(id)))return unavailable;
 return Object.freeze({
  status:'VERIFIED_MANAGER_DIRECTORY',workspaceId,moduleId,
  members:Object.freeze(members)
 });
}
function initials(name){
 return String(name).trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
}
export function renderApplicationAccessDialog({
 moduleName='',directory=unavailable,roleOptions=[],query='',tab='people',
 pending=false,status='',selectedRoles=new Map()
}={}){
 const name=typeof moduleName==='string'&&moduleName.trim()?moduleName.slice(0,100):'Application';
 const verified=directory?.status==='VERIFIED_MANAGER_DIRECTORY';
 const term=String(query||'').trim().toLocaleLowerCase().slice(0,120);
 const members=verified?directory.members.filter(member=>
  (member.name+' '+member.email).toLocaleLowerCase().includes(term)):[];
 const activeCount=verified?directory.members.filter(member=>member.role).length:0;
 const title='Invite to this application';
 const people=tab!=='teams';
 return '<section class="aps-app-invite" role="dialog" aria-modal="true" aria-labelledby="aps-app-invite-title" data-app-invite-dialog>'+
  '<header class="aps-app-invite-head"><div><h2 id="aps-app-invite-title">'+title+'</h2><p>'+esc(name)+'</p></div>'+
  '<button type="button" data-app-invite-close aria-label="Close application invitation" title="Close">×</button></header>'+
  '<label class="aps-app-invite-search-label" for="aps-app-invite-search">Search members</label>'+
  '<input id="aps-app-invite-search" type="search" maxlength="120" autocomplete="off" placeholder="Search by name or email address" value="'+esc(query)+'"/>'+
  '<nav class="aps-app-invite-tabs" aria-label="Application invitation directory">'+
  '<button type="button" data-app-invite-tab="people" aria-current="'+people+'">People</button>'+
  '<button type="button" data-app-invite-tab="teams" aria-current="'+(!people)+'">Teams</button></nav>'+
  (people?'<div class="aps-app-invite-section"><span>People with application access</span><strong>'+ (verified?activeCount:'—')+'</strong></div>'+
   (verified?(members.length?'<div class="aps-app-invite-list" role="list">'+members.map(member=>{
    const assigned=!!member.role;
    const desired=selectedRoles.get(member.id)||member.currentRole||applicationDefaultInviteRole(directory.moduleId,roleOptions);
    const options=roleOptions.map(role=>'<option value="'+esc(role)+'"'+
     (desired===role?' selected':'')+
     '>'+esc(role)+'</option>').join('');
    return '<div class="aps-app-invite-member" role="listitem" data-app-invite-member="'+esc(member.id)+'">'+
      '<span class="aps-app-invite-avatar" aria-hidden="true">'+esc(initials(member.name))+'</span>'+
      '<div class="aps-app-invite-person"><strong>'+esc(member.name)+'</strong>'+
      '<small>'+esc(member.email)+'</small></div>'+
      '<div class="aps-app-invite-member-actions"><select aria-label="Application role for '+esc(member.name)+'" data-app-invite-role="'+esc(member.id)+'"'+
      (member.protected||pending?' disabled':'')+'>'+options+'</select>'+
      (member.protected?'<span class="aps-app-invite-protected">Protected</span>':
       assigned?(desired!==member.role?'<button type="button" class="aps-app-invite-add" data-app-invite-update="'+esc(member.id)+'"'+(pending?' disabled':'')+'>Update</button>':'')+
       '<button type="button" class="aps-app-invite-remove" data-app-invite-remove="'+esc(member.id)+'" aria-label="Remove application access for '+esc(member.name)+'"'+(pending?' disabled':'')+'>×</button>':
       '<button type="button" class="aps-app-invite-add" data-app-invite-add="'+esc(member.id)+'"'+(pending?' disabled':'')+'>Add</button>')+
      '</div></div>';
   }).join('')+'</div>':'<p class="aps-app-invite-empty">No matching workspace members.</p>'):
    '<p class="aps-app-invite-empty">Application member directory has not been verified. No access changes are available.</p>'):
   '<p class="aps-app-invite-empty">Team-level application grants require a separate authorized group directory. No team assignments are enabled.</p>')+
  '<p class="aps-app-invite-note">Application access is separate from workspace and board membership. Only verified workspace administrators can change roles here.</p>'+
  '<p class="aps-app-invite-status" role="status" aria-live="polite">'+esc(status|| (pending?'Verifying application access…':''))+'</p>'+
  '</section>';
}
let active=null;
export function closeApplicationAccessDialog(){
 if(!active)return;
 const {node,keyHandler,priorFocus}=active;
 document.removeEventListener('keydown',keyHandler);
 node.remove();active=null;
 if(priorFocus?.isConnected)priorFocus.focus();
}
export function openApplicationAccessDialog({moduleName,workspaceId,moduleId,actorId,
 roleOptions=[],read,mutate}={}){
 if(typeof document==='undefined'||!document.body)return null;
 closeApplicationAccessDialog();
 const priorFocus=document.activeElement;
 const overlay=document.createElement('div');
 overlay.className='aps-app-invite-overlay';
 let directory=unavailable,query='',tab='people',pending=false;
 let status='Loading authorized workspace members…';
 const selectedRoles=new Map();
 const paint=()=>{
  overlay.innerHTML=renderApplicationAccessDialog({moduleName,directory,
   roleOptions,query,tab,pending,status,selectedRoles});
 };
 paint();document.body.append(overlay);
 const keyHandler=event=>{
  if(event.key==='Escape'){event.preventDefault();closeApplicationAccessDialog();return;}
  if(event.key!=='Tab')return;
  const controls=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
  if(!controls.length)return;
  const first=controls[0],last=controls.at(-1);
  if(!overlay.contains(document.activeElement)){event.preventDefault();first.focus();}
  else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 document.addEventListener('keydown',keyHandler);
 active={node:overlay,keyHandler,priorFocus};
 overlay.querySelector('[data-app-invite-close]')?.focus();
 const reload=async()=>{
  if(typeof read!=='function')throw Error('Signed application directory unavailable');
  const raw=await read();
  const parsed=normalizeSignedApplicationDirectory(raw,{workspaceId,moduleId,actorId,roleOptions});
  if(parsed.status!=='VERIFIED_MANAGER_DIRECTORY')throw Error('Signed application directory could not be verified');
  return parsed;
 };
 Promise.resolve().then(reload).then(parsed=>{
  if(active?.node!==overlay)return;
  directory=parsed;status='';paint();
 }).catch(()=>{
  if(active?.node!==overlay)return;
  status='Authorized application directory unavailable. No changes were made.';paint();
 });
 overlay.addEventListener('input',event=>{
  if(event.target?.id!=='aps-app-invite-search')return;
  query=event.target.value.slice(0,120);
  paint();
  const search=overlay.querySelector('#aps-app-invite-search');
  if(search){search.focus();search.setSelectionRange(query.length,query.length);}
 });
 overlay.addEventListener('change',event=>{
  const id=event.target?.dataset?.appInviteRole;
  if(!id||!directory.members.some(m=>m.id===id)||!roleOptions.includes(event.target.value))return;
  selectedRoles.set(id,event.target.value);
  paint();
  overlay.querySelector('[data-app-invite-role="'+id+'"]')?.focus();
 });
 overlay.addEventListener('click',async event=>{
  if(event.target===overlay||event.target.closest?.('[data-app-invite-close]')){
   closeApplicationAccessDialog();return;
  }
  const nextTab=event.target.closest?.('[data-app-invite-tab]')?.dataset.appInviteTab;
  if(nextTab==='people'||nextTab==='teams'){tab=nextTab;paint();return;}
  const add=event.target.closest?.('[data-app-invite-add]');
  const update=event.target.closest?.('[data-app-invite-update]');
  const remove=event.target.closest?.('[data-app-invite-remove]');
  if((!add&&!update&&!remove)||pending||directory.status!=='VERIFIED_MANAGER_DIRECTORY'||typeof mutate!=='function')return;
  const id=add?.dataset.appInviteAdd||update?.dataset.appInviteUpdate||remove?.dataset.appInviteRemove;
  const member=directory.members.find(m=>m.id===id);
  if(!member||member.protected)return;
  const enabling=!!(add||update),role=selectedRoles.get(id)||member.currentRole||
    applicationDefaultInviteRole(moduleId,roleOptions);
  if(!role||!roleOptions.includes(role)||update&&member.role===role)return;
  if(!window.confirm((enabling?'Set '+member.name+'\'s role in '+moduleName+' to '+role:
     'Remove '+member.name+' from '+moduleName)+'?'))return;
  pending=true;status='Submitting signed application access change…';paint();
  try{
   await mutate({userId:id,role,enabled:enabling,expectedUpdatedAt:member.revision});
   const next=await reload();
   const confirmed=next.members.find(m=>m.id===id);
   if(!confirmed||enabling&&confirmed.role!==role||!enabling&&confirmed.role)
    throw Error('Readback did not confirm the change');
   if(active?.node!==overlay)return;
   directory=next;selectedRoles.delete(id);
   status=enabling?'Application access granted and verified.':'Application access removed and verified.';
  }catch{
   if(active?.node!==overlay)return;
   status='Application access was not confirmed. Refresh this dialog and reconcile before retrying.';
  }finally{
   if(active?.node===overlay){pending=false;paint();}
  }
 });
 return Object.freeze({close:closeApplicationAccessDialog});
}
