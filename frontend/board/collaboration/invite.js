/**
 * Board-level Invite dialog. Uses only authenticated, exact-board snapshots
 * and the existing signed BS09 viewer grant/revoke transport.
 * This module never writes a database table or enables a permission flag.
 */
import {avatarImageMarkup} from '../../profile-avatar.js';
import {boardInviteCount} from './people.js';
export {boardInviteCount,boardInviteControl} from './people.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
}[c]));
const initials=name=>String(name||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase();
const verifiedMembers=people=>people?.status==='SIGNED_MEMBERSHIP'&&Array.isArray(people.people);
const verifiedCandidates=directory=>directory?.status==='VERIFIED_SIGNED_CANDIDATES'&&Array.isArray(directory.members);
const verifiedTeams=data=>data?.status==='VERIFIED_BOARD_TEAM_CANDIDATES'&&Array.isArray(data.teams);
function teamSuggestions(data,query,{enabled=false}={}){
 if(!verifiedTeams(data)||!query.trim())return '';
 const q=query.trim().toLocaleLowerCase();
 const matches=data.teams.filter(t=>t.name.toLocaleLowerCase().includes(q)).slice(0,6);
 return '<div class="aps-invite-suggestions aps-invite-team-suggestions" role="listbox" id="aps-invite-team-matches" aria-label="Workspace teams">'+
  '<div class="aps-invite-suggestion-head">Teams</div>'+
  (matches.length?matches.map(t=>
   '<button type="button" role="option" class="aps-invite-candidate" data-aps-invite-team="'+esc(t.teamId)+'"'+
    (!enabled||t.hasAccess?' disabled':'')+' aria-selected="false">'+
   '<span class="aps-invite-avatar" aria-hidden="true">♧</span>'+
   '<span class="aps-invite-candidate-copy"><strong>'+highlight(t.name,q)+'</strong><small>'+t.memberCount+
    ' member'+(t.memberCount===1?'':'s')+' · Viewer access for the team</small></span>'+
   '<span class="aps-invite-candidate-state">'+(t.hasAccess?'Already invited':enabled?'Invite team':'Unavailable')+'</span></button>'
  ).join(''):'<p class="aps-invite-none">No matching teams</p>')+'</div>';
}
const cap=v=>v.charAt(0).toUpperCase()+v.slice(1);

function avatar(person){
 const path=person.avatarPath||null;
 return '<span class="aps-invite-avatar" aria-hidden="true">'+
  avatarImageMarkup(initials(person.name),{path,userId:path?person.id:null})+'</span>';
}
function personLine(person,{canRemove=false,highlight=false,currentUserId=null,roleChangeEnabled=false}={}){
 const role=person.role;
 const editable=roleChangeEnabled&&role!=='owner';
 const badge=role==='owner'?
  '<span class="aps-invite-role-pill owner">Owner</span>':
  '<span class="aps-invite-role-select"><select aria-label="Board access for '+esc(person.name)+'"'+
   ' data-aps-invite-role="'+esc(person.id)+'"'+(editable?'':' disabled title="Role changes require signed Viewer/Editor authorization"')+'>'+
    '<option value="viewer"'+(role==='viewer'?' selected':'')+'>Viewer</option>'+
    '<option value="editor"'+(role==='editor'?' selected':'')+'>Editor</option></select></span>';
 return '<div class="aps-invite-person'+(highlight?' is-new':'')+'">'+
  avatar(person)+
  '<div class="aps-invite-person-copy"><strong>'+esc(person.name)+'</strong>'+
  '<small>'+esc(person.title|| (role==='owner'?'Board owner':'Board '+cap(role)))+'</small></div>'+
  badge+
  (canRemove&&role!=='owner'&&person.id!==currentUserId?
   '<button type="button" class="aps-invite-remove" data-aps-invite-revoke="'+esc(person.id)+
   '" aria-label="Remove '+esc(person.name)+' from this board" title="Remove board access">×</button>':
   '<span class="aps-invite-remove-placeholder" aria-hidden="true"></span>')+'</div>';
}
function teamLine(team){
 return '<div class="aps-invite-person">'+
  '<span class="aps-invite-avatar" aria-hidden="true">T</span>'+
  '<div class="aps-invite-person-copy"><strong>'+esc(team.name)+'</strong>'+
  '<small>'+team.memberCount+' member'+(team.memberCount===1?'':'s')+'</small></div>'+
  '<span class="aps-invite-role-pill viewer">Viewer</span>'+
  '<span class="aps-invite-remove-placeholder" aria-hidden="true"></span></div>';
}
function highlight(value,q){
 const name=String(value||''),i=name.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
 return i<0?esc(name):esc(name.slice(0,i))+'<strong>'+esc(name.slice(i,i+q.length))+'</strong>'+esc(name.slice(i+q.length));
}
function suggestions(directory,query,{enabled=false}={}){
 if(!verifiedCandidates(directory))
  return '<div class="aps-invite-help" role="status">Workspace member lookup is not available for this account. Ask an authorized CRM administrator to manage board access.</div>';
 const q=query.trim().toLocaleLowerCase();
 if(!q)return '';
 const matches=directory.members.filter(p=>p.name.toLocaleLowerCase().includes(q)||
  p.email.toLocaleLowerCase().includes(q)).slice(0,6);
 return '<div class="aps-invite-suggestions" role="listbox" id="aps-invite-matches" aria-label="Workspace people">'+
  '<div class="aps-invite-suggestion-head">People</div>'+
  (matches.length?matches.map(p=>
   '<button type="button" role="option" class="aps-invite-candidate" data-aps-invite-assign="'+esc(p.id)+'"'+
   (!enabled||p.boardRole||p.protected?' disabled':'')+' aria-selected="false">'+
   avatar(p)+'<span class="aps-invite-candidate-copy"><strong>'+highlight(p.name,q)+'</strong><small>'+esc(p.email)+'</small></span>'+
   '<span class="aps-invite-candidate-state">'+(p.boardRole?'Already invited':p.protected?'Protected':enabled?'Invite':'Unavailable')+'</span></button>'
  ).join(''):'<p class="aps-invite-none">No matching people</p>')+
  '</div>';
}
export function renderBoardInviteDialog({people,directory,teamDirectory=null,workspaceName='',manage=false,accessEnabled=false,teamInviteEnabled=false,query='',highlightId=null,currentUserId=null,tab='people',isPublic=false,roleChangeEnabled=false}={}){
 const verified=verifiedMembers(people);
 const list=verified?people.people:[];
 const canWrite=manage&&accessEnabled===true&&verifiedCandidates(directory);
 const searchEnabled=manage;
 return '<section class="aps-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="aps-invite-title">'+
  '<header class="aps-invite-heading"><h2 id="aps-invite-title">Invite to this board</h2>'+
   '<div class="aps-invite-heading-actions">'+
   '<button type="button" class="aps-invite-close" data-aps-invite-close aria-label="Close invitation dialog">×</button></div></header>'+
  '<div class="aps-invite-search-region"><label class="aps-invite-sr" for="aps-invite-search">Search by name, team or email</label>'+
   '<input type="text" inputmode="search" id="aps-invite-search" role="combobox" aria-expanded="'+Boolean(query.trim()&&searchEnabled)+
   '" aria-controls="aps-invite-matches" aria-autocomplete="list" placeholder="Search by name, team or email"'+
   ' maxlength="120" autocomplete="off" value="'+esc(query)+'"'+(!searchEnabled?' disabled':'')+' />'+
   '<div class="aps-invite-search-results" data-aps-invite-suggestions>'+
    (query.trim()?(tab==='people'?suggestions(directory,query,{enabled:canWrite}):teamSuggestions(teamDirectory,query,{enabled:manage&&teamInviteEnabled})):'')+
   '</div></div>'+

  '<nav class="aps-invite-tabs" role="tablist" aria-label="Invite type">'+
   '<button type="button" role="tab" data-aps-invite-tab="people" aria-selected="'+(tab==='people')+'">People</button>'+
   '<button type="button" role="tab" data-aps-invite-tab="teams" aria-selected="'+(tab==='teams')+'">Teams</button></nav>'+
  '<button type="button" class="aps-invite-policy" disabled title="Board visibility requires a separately authorized server operation">'+
   '<span aria-hidden="true">▤</span> '+(isPublic?
   'Anyone at '+esc(workspaceName||'APSGroup of Companies')+' can view this board':
   'Only invited people can access this board')+'</button>'+
  '<div class="aps-invite-members-title"><strong>'+(tab==='people'?'People':'Teams')+' invited to this board</strong>'+
   '<small>'+(tab==='people'?(verified?list.length+' assigned':'Unavailable'):
     (verifiedTeams(teamDirectory)?teamDirectory.teams.filter(t=>t.hasAccess).length+' assigned':'Unavailable'))+'</small></div>'+
  '<div class="aps-invite-members" data-aps-invite-members>'+(
   tab==='people'?(!verified?'<p class="aps-invite-help" role="status">Unable to verify board members. Refresh the board and try again.</p>':
   list.length?list.map(p=>personLine(p,{canRemove:canWrite&&(p.role==='viewer'||directory?.source==='SIGNED_ADMIN_BOARD_DIRECTORY'),
    highlight:p.id===highlightId,currentUserId,roleChangeEnabled})).join(''):
   '<p class="aps-invite-help">Invite teammates to view this board.</p>'):
   !verifiedTeams(teamDirectory)?'<p class="aps-invite-help">Authorized team invitations are not activated for this board.</p>':
   teamDirectory.teams.some(t=>t.hasAccess)?teamDirectory.teams.filter(t=>t.hasAccess).map(teamLine).join(''):
   '<p class="aps-invite-help">Invite a team to give every member Viewer access.</p>')+'</div>'+
  '<div class="aps-invite-footer">'+
   (!manage?'<p class="aps-invite-help">Only an authorized board manager can invite people.</p>':
    !verifiedCandidates(directory)?'<p class="aps-invite-help">The authorized workspace member directory is unavailable for your account. The search field cannot return other members until access is granted.</p>':
    !canWrite?'<p class="aps-invite-help">Board access updates are currently disabled. Search is read-only.</p>':'')+
   (!query?'<button type="button" class="aps-invite-request" data-aps-invite-workspace>Request to invite a new member by email</button>':'')+
   '<p class="aps-invite-footnote">New workspace membership is separate from board access. Copying a board link does not grant permission.</p>'+
   '<p class="aps-invite-status" data-aps-invite-status role="status" aria-live="polite"></p>'+
   '</div></section>';
}
let active=null;
export function closeBoardInviteDialog(){
 if(!active)return;
 const {overlay,previous,keyHandler}=active;
 active=null;
 document.removeEventListener('keydown',keyHandler,true);
 overlay.remove();
 if(previous?.isConnected)previous.focus({preventScroll:true});
}
export function openBoardInviteDialog(options={}){
 if(typeof document==='undefined'||!document.body)return null;
 closeBoardInviteDialog();
 const previous=document.activeElement;
 const overlay=document.createElement('div');
 overlay.className='aps-invite-overlay';
 let directory=options.peopleDirectory,people=options.people,teamDirectory=options.teamDirectory;
 let query='',viewTab='people',highlightId=null,working=false,searchToken=0,searchTimer=null;
 const manage=options.manage===true,accessEnabled=manage&&options.accessEnabled===true;
 overlay.innerHTML=renderBoardInviteDialog({people,directory,workspaceName:options.workspaceName,
  manage,accessEnabled,teamDirectory,teamInviteEnabled:options.teamInviteEnabled,currentUserId:options.currentUserId,
  tab:viewTab,isPublic:options.isPublic===true,roleChangeEnabled:typeof options.onChangeBoardRole==='function'});
 const status=(message,isError=false)=>{
  const el=overlay.querySelector('[data-aps-invite-status]');
  if(el){el.textContent=message;el.classList.toggle('is-error',isError);}
 };
 const repaint=(focus=false)=>{
  const existing=overlay.querySelector('.aps-invite-dialog');
  if(!existing||!overlay.isConnected)return;
  existing.outerHTML=renderBoardInviteDialog({people,directory,workspaceName:options.workspaceName,
   manage,accessEnabled,teamDirectory,teamInviteEnabled:options.teamInviteEnabled,query,highlightId,currentUserId:options.currentUserId,
   tab:viewTab,isPublic:options.isPublic===true,roleChangeEnabled:typeof options.onChangeBoardRole==='function'});
  options.onMountAvatars?.(overlay);
  if(focus){
   const field=overlay.querySelector('#aps-invite-search');
   if(field&&!field.disabled){field.focus();field.setSelectionRange(field.value.length,field.value.length);}
  }
 };
 const setCandidates=()=>{
  const host=overlay.querySelector('[data-aps-invite-suggestions]');
  if(host){
   host.innerHTML=query.trim()?(viewTab==='people'?suggestions(directory,query,{enabled:accessEnabled}):
     teamSuggestions(teamDirectory,query,{enabled:manage&&options.teamInviteEnabled===true})):'';
   overlay.querySelector('#aps-invite-search')?.setAttribute('aria-expanded',String(Boolean(query.trim())));
  }
 };
 const reconcile=async()=>{
  const updatedDirectory=await options.onRefreshDirectory?.();
  if(updatedDirectory?.status!=='VERIFIED_SIGNED_CANDIDATES')
   throw Error('Workspace directory refresh could not be verified.');
  directory=updatedDirectory;
  const updatedMembers=await options.onRefreshMembers?.();
  if(!verifiedMembers(updatedMembers))throw Error('Board membership refresh could not be verified.');
  people=updatedMembers;
  options.onCountChange?.(boardInviteCount(people));
 };
 overlay.addEventListener('input',event=>{
  if(event.target?.id!=='aps-invite-search'||working)return;
  query=event.target.value.slice(0,120);
  highlightId=null;setCandidates();
  if(searchTimer!==null)clearTimeout(searchTimer);
  const token=++searchToken;
  if(!query.trim()||typeof options.onSearchDirectory!=='function'&&typeof options.onSearchTeams!=='function')return;
  searchTimer=setTimeout(async()=>{
   try{
    const updates=await Promise.all([
      viewTab==='people'&&typeof options.onSearchDirectory==='function'?options.onSearchDirectory(query):null,
      viewTab==='teams'&&typeof options.onSearchTeams==='function'?options.onSearchTeams(query):null
     ]);
     if(active?.overlay!==overlay||token!==searchToken)return;
     if(updates[0]){
      if(updates[0].status!=='VERIFIED_SIGNED_CANDIDATES')throw Error('unverified people search');
      directory=updates[0];
     }
     if(updates[1]){
      if(!verifiedTeams(updates[1]))throw Error('unverified team search');
      teamDirectory=updates[1];
     }
     setCandidates();
   }catch{
    if(active?.overlay===overlay&&token===searchToken)
     status('Workspace search could not be verified. Retry typing your query.',true);
   }
  },230);
 });
 overlay.addEventListener('keydown',event=>{
  if(event.target?.id!=='aps-invite-search'||!['ArrowDown','ArrowUp','Enter'].includes(event.key))return;
  const candidates=[...overlay.querySelectorAll('.aps-invite-candidate:not(:disabled)')];
  if(!candidates.length)return;
  event.preventDefault();
  (event.key==='ArrowUp'?candidates.at(-1):candidates[0]).focus();
 });
 overlay.addEventListener('keydown',event=>{
  if(!event.target?.matches('.aps-invite-candidate'))return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   const candidates=[...overlay.querySelectorAll('.aps-invite-candidate:not(:disabled)')];
   const index=candidates.indexOf(event.target);
   candidates[(index+(event.key==='ArrowDown'?1:-1)+candidates.length)%candidates.length]?.focus();
   event.preventDefault();
  }
 });
 overlay.addEventListener('change',async event=>{
  const roleSelect=event.target.closest?.('[data-aps-invite-role]');
  if(!roleSelect||working||!options.onChangeBoardRole)return;
  const userId=roleSelect.dataset.apsInviteRole;
  const before=people?.people?.find(p=>p.id===userId);
  const role=roleSelect.value;
  if(!before||before.role==='owner'||!['viewer','editor'].includes(role)||role===before.role){
   repaint();return;
  }
  working=true;roleSelect.disabled=true;
  status('Saving board role…');
  try{
   await options.onChangeBoardRole(userId,role);
   const after=await options.onRefreshMembers?.();
   if(!verifiedMembers(after)||after.people.find(p=>p.id===userId)?.role!==role)
    throw Error('Signed Viewer/Editor readback missing');
   people=after;repaint();
   options.onToast?.('Board role updated to '+role+'.');
  }catch{
   if(active?.overlay===overlay){repaint();status('Board role change could not be verified.',true);}
  }finally{working=false;}
 });
 overlay.addEventListener('click',async event=>{
  const switcher=event.target.closest?.('[data-aps-invite-tab]');
  if(switcher){
   const next=switcher.dataset.apsInviteTab;
   if(!['people','teams'].includes(next))return;
   viewTab=next;query='';highlightId=null;
   if(searchTimer!==null)clearTimeout(searchTimer);
   searchToken++;repaint(true);return;
  }
  if(event.target===overlay||event.target.closest?.('[data-aps-invite-close]')){
   closeBoardInviteDialog();return;
  }
  if(event.target.closest?.('[data-aps-invite-workspace]')){
   closeBoardInviteDialog();options.onInviteWorkspace?.();return;
  }
  const teamButton=event.target.closest?.('[data-aps-invite-team]');
  if(teamButton){
   if(working||options.teamInviteEnabled!==true||!verifiedTeams(teamDirectory))return;
   const team=teamDirectory.teams.find(t=>t.teamId===teamButton.dataset.apsInviteTeam&&!t.hasAccess);
   if(!team)return;
   if(!window.confirm('Invite '+team.name+' as Viewer? Current and future members of this team will inherit Viewer access while the assignment remains active.'))return;
   working=true;teamButton.disabled=true;status('Assigning Viewer access to the team…');
   try{
    if(typeof options.onInviteTeam!=='function')throw Error('Team invite not configured');
    await options.onInviteTeam(team.teamId);
    const updated=await options.onSearchTeams?.('');
    if(active?.overlay!==overlay)return;
    if(!verifiedTeams(updated)||!updated.teams.some(t=>t.teamId===team.teamId&&t.hasAccess))
     throw Error('Team board permission readback failed');
    teamDirectory=updated;query='';repaint();
    options.onToast?.(team.name+' now has Viewer access to this board.');
   }catch(error){
    if(active?.overlay===overlay){
     status('Team permission could not be verified. Refresh and retry.',true);
     teamButton.disabled=false;
    }
   }finally{working=false;}
   return;
  }
  const target=event.target.closest?.('[data-aps-invite-assign],[data-aps-invite-revoke]');
  if(!target||working||!accessEnabled||!verifiedCandidates(directory)||!verifiedMembers(people))return;
  const removing=target.hasAttribute('data-aps-invite-revoke');
  const userId=removing?target.dataset.apsInviteRevoke:target.dataset.apsInviteAssign;
  const person=removing?people.people.find(p=>p.id===userId&&
     (p.role==='viewer'||directory.source==='SIGNED_ADMIN_BOARD_DIRECTORY'&&p.role==='editor')):
   directory.members.find(p=>p.id===userId&&!p.boardRole);
  if(!person||directory.members.find(p=>p.id===userId)?.protected)return;
  if(removing&&userId===options.currentUserId&&!window.confirm('Remove your own access to this board?'))return;
  working=true;target.disabled=true;
  status(removing?'Removing viewer access…':'Adding viewer to this board…');
  try{
   await (removing?options.onRemoveBoard:options.onAssignBoard)(userId);
   if(active?.overlay!==overlay)return;
   await reconcile();
   if(active?.overlay!==overlay)return;
   const current=people.people.find(p=>p.id===userId);
   if((removing&&current)||( !removing&&current?.role!=='viewer'))
     throw Error('Board membership did not reconcile after the signed write.');
   highlightId=removing?null:userId;
   query='';
   repaint();
   options.onToast?.(removing?'Board viewer removed.':person.name+' can now view this board.');
  }catch(error){
   if(active?.overlay===overlay){
    status('Board access could not be verified. Refresh and retry.',true);
    target.disabled=false;
   }
  }finally{working=false;}
 });
 const keyHandler=event=>{
  if(active?.overlay!==overlay)return;
  if(event.key==='Escape'){event.preventDefault();closeBoardInviteDialog();return;}
  if(event.key!=='Tab')return;
  const nodes=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];
  if(!nodes.length)return;
  if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}
  if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
 };
 document.addEventListener('keydown',keyHandler,true);
 document.body.append(overlay);
 active={overlay,previous,keyHandler};
 options.onMountAvatars?.(overlay);
 const field=overlay.querySelector('#aps-invite-search');
 (field&&!field.disabled?field:overlay.querySelector('[data-aps-invite-close]'))?.focus();
 return overlay;
}
