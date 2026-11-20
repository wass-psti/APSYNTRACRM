/** APSYNTRA Teams / Role Management — signed-data presentation only.
 * Do not infer authority from team names, profile titles, local storage, or icons.
 */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sig=value=>String(value||'').trim().toLocaleLowerCase();
const initials=value=>String(value||'?').trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
const plural=(n,one,many=one+'s')=>n===1?one:many;
const icon=(id,cls='')=>{
 const paths={
  people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  filter:'<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  shield:'<path d="M12 2 21 6v6c0 5-3.4 8-9 10-5.6-2-9-5-9-10V6z"/><path d="m9 12 2 2 4-4"/>',
  crown:'<path d="m2 8 5 4 5-8 5 8 5-4-2 11H4z"/><path d="M5 22h14"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  camera:'<path d="M4 7h4l2-3h5l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="14" r="4"/>',
  close:'<path d="M18 6 6 18M6 6l12 12"/>',
  board:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18"/>'
 };
 return '<svg class="teams-icon '+esc(cls)+'" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[id]||paths.people)+'</svg>';
};
const color=id=>['#684bf1','#2f7bdf','#0fa5a1','#c65eac','#dd7058','#5b7bc7','#8c63b5'][[...String(id||'')].reduce((n,c)=>n+c.charCodeAt(0),0)%7];
const avatar=(name,id,size='small',src=null)=>'<span class="teams-avatar '+size+'" aria-hidden="true" style="--teams-avatar-color:'+color(id)+'">'+
  (typeof src==='string'&&/^https:\/\/(jtlusodorfnyzgyuewkz\.supabase\.co\/storage\/v1\/object\/public\/|wass-psti\.github\.io\/APSYNTRACRM\/)/i.test(src)?
   '<img alt="" src="'+esc(src)+'" loading="lazy">':esc(initials(name)))+'</span>';
const shield=user=>{
 if(user.systemAdminSource!=='inherited'&&user.systemAdminSource!=='explicit')return '';
 const label=user.systemAdminSource==='inherited'?'Inherited from General administration':
  'Granted by '+(user.grantedByName||'an administrator')+(user.grantedAt?' on '+new Date(user.grantedAt).toLocaleDateString():'');
 return '<span class="teams-system-badge" title="'+esc(label)+'">'+icon('shield')+'<span>System Admin</span></span>';
};
function rowMenu(member,team,snapshot){
 const manage=team&&team.canManage===true;
 const sys=snapshot.canManageSystemAdmins===true;
 const inherited=member.systemAdminSource==='inherited';
 const explicit=member.systemAdminExplicit===true;
 const items=[];
 items.push('<button type="button" data-action="teams-view-profile" data-user-id="'+esc(member.userId)+'">View profile</button>');
 if(manage){
  if(!member.isOwner)items.push('<button type="button" data-action="teams-owner-add" data-user-id="'+esc(member.userId)+'">Make team owner</button>');
  else items.push('<button type="button" data-action="teams-owner-remove" data-user-id="'+esc(member.userId)+'"'+(team.ownerCount<=1?' disabled title="A team with members must have an owner"':'')+'>Remove team owner</button>');
  items.push('<button type="button" data-action="teams-member-move" data-user-id="'+esc(member.userId)+'">Move to another team</button>');
  items.push('<button type="button" data-action="teams-member-copy" data-user-id="'+esc(member.userId)+'">Add to another team</button>');
  items.push('<button type="button" data-action="teams-member-remove" data-user-id="'+esc(member.userId)+'">Remove from this team</button>');
 }
 if(sys){
  if(!explicit)items.push('<button type="button" data-action="teams-admin-grant" data-user-id="'+esc(member.userId)+'">'+(inherited?'Grant explicit System Admin':'Grant System Admin')+'</button>');
  if(explicit)items.push('<button type="button" data-action="teams-admin-revoke" data-user-id="'+esc(member.userId)+'">Revoke explicit System Admin</button>');
  if(inherited)items.push('<button disabled title="Remove this user from General administration to revoke">Revoke inherited System Admin</button>');
 }
 return '<details class="teams-menu"><summary aria-label="Actions for '+esc(member.name)+'">'+icon('more')+'</summary><div class="teams-popover" role="group" aria-label="User actions">'+items.join('')+'</div></details>';
}
const uniqueMembers=members=>[...new Map(members.map(m=>[m.userId,m])).values()];
export function renderTeamsConsole({snapshot=null,loading=false,error='',selectedTeamId=null,teamSearch='',teamFilter='all',tab='users',userSearch='',contentSearch='',systemAdminsOnly=false,addUsersOpen=false,addUsersSearch='',theme='dark',filterOpen=false}={}){
 const ready=snapshot?.status==='VERIFIED_TEAMS';
 const teams=ready?snapshot.teams:[];
 const total=teams.length;
 const selected=teams.find(t=>t.id===selectedTeamId)||null;
 const all=ready&&!selected;
 const currentMembers=ready?(all?uniqueMembers(snapshot.members):snapshot.members.filter(m=>m.teamId===selected.id)):[];
 const currentContent=ready?(all?snapshot.content:snapshot.content.filter(c=>c.teamId===selected.id)):[];
 const needle=sig(teamSearch),memberNeedle=sig(userSearch),contentNeedle=sig(contentSearch);
 const visibleTeams=teams.filter(t=>(!needle||sig(t.name).includes(needle))&&
  (teamFilter!=='has-admins'||t.systemAdminCount>0));
 const filteredMembers=currentMembers.filter(m=>(!memberNeedle||sig(m.name+' '+m.email).includes(memberNeedle))&&
  (!systemAdminsOnly||m.systemAdminSource==='inherited'||m.systemAdminSource==='explicit'));
 const filteredContent=currentContent.filter(c=>!contentNeedle||sig(c.name).includes(contentNeedle));
 const canManage=selected?.canManage===true;
 const title=selected?.name||'All teams';
 const memberCount=currentMembers.length;
 const contentCount=currentContent.length;
 const header='<div class="teams-modal-head"><div><h1 id="teams-title">Teams</h1><p>Organize your account users into teams and assign them to content. <a href="https://github.com/wass-psti/APSYNTRACRM/blob/main/docs/CP-SYSADMIN-01-IMPLEMENTATION-AND-ACTIVATION.md" target="_blank" rel="noopener noreferrer">Learn more</a></p></div>'+
  '<div class="teams-header-actions"><button type="button" class="teams-theme" data-action="teams-theme" aria-label="Switch to '+(theme==='dark'?'light':'dark')+' theme" title="Switch to '+(theme==='dark'?'light':'dark')+' theme">'+(theme==='dark'?'☀':'☾')+'</button><button type="button" class="teams-close" data-action="teams-close" aria-label="Close Teams">'+icon('close')+'</button></div></div>';
 const aside='<aside class="teams-sidebar" aria-label="Teams list">'+
  '<button type="button" class="teams-new" data-action="teams-create"'+(!ready||!snapshot.canManageSystemAdmins?' disabled':'')+'>'+icon('plus')+' New team</button>'+
  '<div class="teams-side-search"><label class="teams-sr" for="teams-search">Search teams</label>'+icon('search')+
  '<input id="teams-search" type="text" placeholder="Search teams" autocomplete="off" maxlength="120" value="'+esc(teamSearch)+'">'+
  '<button type="button" data-action="teams-filter" aria-label="Filter teams" aria-expanded="false" title="Filter teams">'+icon('filter')+'</button></div>'+
  '<div class="teams-filter-controls"'+(filterOpen?'':' hidden')+'><label class="teams-sr" for="teams-filter-select">Filter by System Admin</label><select id="teams-filter-select" aria-label="Team filter"><option value="all"'+(teamFilter==='all'?' selected':'')+'>All teams</option><option value="has-admins"'+(teamFilter==='has-admins'?' selected':'')+'>Has System Admins</option></select></div>'+
  '<nav class="teams-nav" aria-label="Choose team">'+
  '<button type="button" data-action="teams-select" data-team-id="" class="teams-nav-row'+(all?' selected':'')+'" aria-current="'+(all?'true':'false')+'"><span class="teams-nav-symbol">'+icon('people')+'</span><span>All teams</span><span class="teams-side-count">'+(ready?total:'—')+'</span></button>'+
  (loading?Array.from({length:7},()=>'<div class="teams-skeleton teams-skeleton-side"></div>').join(''):
   visibleTeams.map(team=>'<button type="button" data-action="teams-select" data-team-id="'+esc(team.id)+'" class="teams-nav-row'+(selected?.id===team.id?' selected':'')+'" aria-current="'+(selected?.id===team.id?'true':'false')+'">'+avatar(team.name,team.id,'nav',team.avatarUrl||null)+
    '<span class="teams-side-name">'+esc(team.name)+(team.isSystem?' '+icon('shield','teams-system-team-icon'):'')+'</span><span class="teams-side-count">'+team.memberCount+'</span></button>').join(''))+'</nav></aside>';
 const avatarBig=avatar(title,selected?.id||'all','large',selected?.avatarUrl||null);
 const media=selected?.coverUrl?'<div class="teams-cover teams-cover-image" style="background-image:url(&quot;'+esc(selected.coverUrl)+'&quot;)"></div>':'<div class="teams-cover"></div>';
 const headerDetail=media+(selected&&canManage?'<button class="teams-change-cover" data-action="teams-change-cover">'+icon('camera')+' Change cover</button>':'')+'<div class="teams-detail-head">'+
  '<div class="teams-head-avatar">'+avatarBig+(canManage?'<button data-action="teams-change-avatar" aria-label="Change team avatar" title="Change avatar">'+icon('camera')+'</button>':'')+'</div>'+
  '<div class="teams-heading"><h2>'+esc(title)+'</h2><small>'+memberCount+' '+plural(memberCount,'member')+'</small></div>'+
  (selected&&canManage?'<details class="teams-menu teams-header-menu"><summary aria-label="Team options">'+icon('more')+'</summary><div class="teams-popover" role="group">'+
   '<button data-action="teams-rename">Rename team</button><button data-action="teams-change-cover">Change avatar and cover</button>'+
   '<button data-action="teams-duplicate">Duplicate team</button><button data-action="teams-delete"'+(selected.isSystem?' disabled title="General administration cannot be deleted"':'')+'>Delete team</button></div></details>':'')+'</div>';
 const tabs='<div class="teams-tabs" role="tablist" aria-label="Team details"><button role="tab" aria-selected="'+(tab==='users')+'" data-action="teams-tab" data-tab="users" class="'+(tab==='users'?'active':'')+'">Users: '+memberCount+'</button>'+
 '<button role="tab" aria-selected="'+(tab==='content')+'" data-action="teams-tab" data-tab="content" class="'+(tab==='content'?'active':'')+'">Content: '+contentCount+'</button></div>';
 const toolbar=tab==='users'?
  '<div class="teams-toolbar"><label class="teams-search">'+icon('search')+'<input id="teams-user-search" type="text" placeholder="Search by name or email" autocomplete="off" value="'+esc(userSearch)+'" aria-label="Search by name or email"></label>'+
  '<div class="teams-toolbar-end"><label class="teams-admin-filter"><input type="checkbox" id="teams-admins-only"'+(systemAdminsOnly?' checked':'')+'> System Admins only</label>'+
  (selected&&canManage?'<button class="teams-primary" data-action="teams-add-users">'+icon('plus')+' Add users</button>':'')+'</div></div>':
  '<div class="teams-toolbar"><label class="teams-search">'+icon('search')+'<input id="teams-content-search" type="text" placeholder="Search content" value="'+esc(contentSearch)+'" aria-label="Search team content"></label>'+
  (selected&&canManage?'<button class="teams-primary" data-action="teams-assign-content">'+icon('plus')+' Assign content</button>':'')+'</div>';
 const rows=tab==='users'?
  '<div class="teams-table-wrap"><table class="teams-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Title</th><th scope="col"><span class="teams-sr">Actions</span></th></tr></thead><tbody>'+
  filteredMembers.map(m=>'<tr><td><div class="teams-name-cell">'+avatar(m.name,m.userId)+'<span class="teams-name-copy"><strong>'+esc(m.name)+'</strong>'+shield(m)+'</span></div></td>'+
   '<td class="teams-email" title="'+esc(m.email)+'">'+esc(m.email)+'</td><td>'+esc(m.title||'—')+'</td>'+
   '<td class="teams-actions">'+(m.isOwner?'<span class="teams-owner" title="Team owner" aria-label="Team owner">'+icon('crown')+'</span>':'')+
    (selected?rowMenu(m,selected,snapshot):'<button data-action="teams-view-profile" data-user-id="'+esc(m.userId)+'" aria-label="View profile">'+icon('more')+'</button>')+'</td></tr>').join('')+
  '</tbody></table>'+(filteredMembers.length?'':'<div class="teams-empty">'+icon('people')+'<h3>'+(currentMembers.length?'No matching users':'No users in this team yet')+'</h3><p>'+(currentMembers.length?'Try another search or filter.':'Add teammates to manage access together.')+'</p>'+
  (!currentMembers.length&&selected&&canManage?'<button class="teams-primary" data-action="teams-add-users">'+icon('plus')+' Add users</button>':'')+'</div>')+'</div>':
  '<div class="teams-table-wrap"><table class="teams-table"><thead><tr><th>Name</th><th>Type</th><th>Access</th><th><span class="teams-sr">Actions</span></th></tr></thead><tbody>'+
  filteredContent.map(c=>'<tr><td><span class="teams-content-name">'+icon('board')+esc(c.name)+'</span></td><td>'+esc(c.contentType)+'</td><td><span class="teams-access-pill">'+esc(c.accessLevel)+'</span></td><td class="teams-actions">'+(selected&&canManage?'<button data-action="teams-content-remove" data-content-type="'+esc(c.contentType)+'" data-content-id="'+esc(c.contentId)+'" aria-label="Remove team content access">'+icon('close')+'</button>':'')+'</td></tr>').join('')+
  '</tbody></table>'+(filteredContent.length?'':'<div class="teams-empty">'+icon('board')+'<h3>No content assigned</h3><p>Assigned boards, folders and apps appear here.</p></div>')+'</div>';
 const addUsers=addUsersOpen&&selected&&canManage?'<div class="teams-add-users" role="group" aria-label="Add team members">'+
  '<label class="teams-search">'+icon('search')+'<input id="teams-add-user-search" placeholder="Search workspace people" value="'+esc(addUsersSearch)+'" autocomplete="off" aria-label="Search workspace members"></label>'+
  '<div class="teams-add-results">'+snapshot.directory.filter(u=>!snapshot.members.some(m=>m.teamId===selected.id&&m.userId===u.userId)&&sig(u.name+' '+u.email).includes(sig(addUsersSearch))).slice(0,24).map(u=>
   '<button data-action="teams-member-add" data-user-id="'+esc(u.userId)+'">'+avatar(u.name,u.userId)+'<span><strong>'+esc(u.name)+'</strong><small>'+esc(u.email)+'</small></span>'+icon('plus')+'</button>').join('')+
   '</div></div>':'';
 const banner=selected?.isSystem?'<div class="teams-system-banner">'+icon('shield')+'Members of this team are System Admins automatically.</div>':'';
 const body=ready?'<div class="teams-detail">'+headerDetail+tabs+banner+'<div class="teams-detail-content">'+toolbar+addUsers+rows+'</div></div>':
  '<div class="teams-detail teams-pending"><div class="teams-cover"></div><div class="teams-pending-body">'+
  (loading?'<div class="teams-skeleton teams-skeleton-heading"></div>'+Array.from({length:5},()=>'<div class="teams-skeleton teams-skeleton-row"></div>').join(''):
   '<h2>Team management is not available yet</h2><p>'+esc(error||'The signed Teams backend has not been activated. No team or role changes were made.')+'</p><button class="teams-primary" data-action="teams-retry">Retry</button>')+
  '</div></div>';
 return '<div class="teams-backdrop" data-teams-backdrop><section class="teams-dialog" role="dialog" aria-modal="true" aria-labelledby="teams-title" data-teams-dialog data-teams-theme="'+esc(theme)+'">'+header+
  '<div class="teams-body">'+aside+body+'</div></section></div>';
}
