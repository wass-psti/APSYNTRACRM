/** Screenshot V2 workspace presentation over the existing signed Teams snapshot.
 * This is a full page, not the older dark Teams modal. Never fabricates staff
 * counts or grants and never reads authorization from the DOM.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=name=>String(name||'?').trim().split(/\s+/).slice(0,2).map(w=>w.slice(0,1)).join('').toUpperCase();
const svg=name=>{
 const paths={
 search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 shield:'<path d="M12 2 20 6v6c0 5-3 7.5-8 10-5-2.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>'
 };
 return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+(paths[name]||'')+'</svg>';
};
const search=(id,placeholder,value)=>'<label class="ap-v2-search">'+svg('search')+
 '<span class="ap-v2-sr">'+esc(placeholder)+'</span><input id="'+id+'" type="text" placeholder="'+esc(placeholder)+
 '" value="'+esc(value)+'" autocomplete="off" maxlength="120"></label>';
const avatar=(p,size='small')=>'<span class="ap-v2-avatar '+size+'" aria-hidden="true">'+esc(initials(p.name))+'</span>';
const pill=(text,kind)=>'<span class="ap-v2-role '+kind+'">'+esc(text)+'</span>';
function menu(items,label='More options'){
 return '<details class="ap-v2-menu"><summary aria-label="'+esc(label)+'">'+svg('more')+'</summary>'+
  '<div class="ap-v2-menu-list" role="group" aria-label="'+esc(label)+'">'+
  items.map(x=>'<button type="button"'+(x.action?' data-action="'+esc(x.action)+'"':'')+
   (x.userId?' data-user-id="'+esc(x.userId)+'"':'')+
   (x.disabled?' disabled':'')+
   (x.title?' title="'+esc(x.title)+'"':'')+'>'+esc(x.label)+'</button>').join('')+'</div></details>';
}
function actions(p,team,snapshot){
 if(!team)return menu([{label:'View profile',action:'teams-view-profile',userId:p.userId}],
  'Actions for '+p.name);
 const canManage=team.canManage===true,system=snapshot.canManageSystemAdmins===true;
 const list=[{label:'View profile',action:'teams-view-profile',userId:p.userId}];
 if(canManage){
  list.unshift(
   {label:p.isOwner?'Remove team owner':'Make team owner',
    action:p.isOwner?'teams-owner-remove':'teams-owner-add',userId:p.userId,
    disabled:p.isOwner&&team.ownerCount<=1,
    title:p.isOwner&&team.ownerCount<=1?'At least one owner is required':''},
   {label:'Move to another team',action:'teams-member-move',userId:p.userId},
   {label:'Add to another team',action:'teams-member-copy',userId:p.userId},
   {label:'Remove from this team',action:'teams-member-remove',userId:p.userId}
  );
 }
 if(system){
  if(!p.systemAdminExplicit)list.push({label:'Grant System Admin',action:'teams-admin-grant',userId:p.userId});
  if(p.systemAdminExplicit)list.push({label:'Revoke System Admin',action:'teams-admin-revoke',userId:p.userId});
  if(p.systemAdminSource==='inherited')list.push({label:'Revoke inherited System Admin',disabled:true,
   title:'Remove this user from General administration to revoke'});
 }
 return menu(list,'Actions for '+p.name);
}
function boardRole(c,team){
 const level=['editor','manager'].includes(c.accessLevel)?'editor':'viewer';
 if(!team.canManage)return pill(level==='editor'?'Editor':'Viewer',level);
 return '<details class="ap-v2-role-switch"><summary class="'+level+'">'+
   (level==='editor'?'Editor':'Viewer')+' '+svg('chevron')+'</summary>'+
  '<span class="ap-v2-role-options">'+['viewer','editor'].map(value=>
   '<button type="button" data-action="teams-content-role" data-content-type="board" data-content-id="'+esc(c.contentId)+
   '" data-access-level="'+value+'">'+(value==='editor'?'Editor':'Viewer')+'</button>').join('')+
  '<button type="button" data-action="teams-content-remove" data-content-type="board" data-content-id="'+
    esc(c.contentId)+'">Remove access</button></span></details>';
}
const sideNav='<aside class="ap-v2-sidebar" aria-label="APSYNTRA navigation">'+
 '<div class="ap-v2-logo"><span>A</span><strong>APSYNTRA CRM</strong></div>'+
 '<div class="ap-v2-nav-group"><p>Workspace</p><a href="#/overview">Dashboard</a><a href="#/boards">My boards</a></div>'+
 '<div class="ap-v2-nav-group"><p>Administration</p><a href="#/user-role-management" class="active" aria-current="page">User Role Management</a><a href="#/settings">Workspace settings</a></div>'+
 '<div class="ap-v2-nav-group"><p>Applications</p><a href="#/boards">FuelTrans Standalone</a><a href="#/boards">Tool Traceability</a><a href="#/boards">Order Intake</a><a href="#/time-tracker">TimeTracker</a></div></aside>';
export function renderWorkspaceRoles({
 snapshot=null,loading=false,error='',selectedTeamId=null,teamSearch='',
 tab='users',userSearch='',contentSearch='',addUsersOpen=false,addUsersSearch=''
}={}){
 const ready=snapshot?.status==='VERIFIED_TEAMS';
 const available=ready?snapshot.teams:[];
 const team=available.find(t=>t.id===selectedTeamId)||
  available.find(t=>t.name==='Information Technology (IT)')||available[0]||null;
 const selectedId=team?.id||'';
 const allMembers=ready&&team?snapshot.members.filter(p=>p.teamId===selectedId):[];
 const allBoards=ready&&team?snapshot.content.filter(c=>c.teamId===selectedId&&c.contentType==='board'):[];
 const members=allMembers.filter(m=>(m.name+' '+m.email).toLowerCase().includes(userSearch.toLowerCase()));
 const boards=allBoards.filter(c=>c.name.toLowerCase().includes(contentSearch.toLowerCase()));
 const displayName=team?.name||'Select a team';
 const canManage=team?.canManage===true;
 const details=loading?'<div class="ap-v2-loading"><div class="ap-v2-skeleton title"></div>'+
  Array.from({length:5},()=>'<div class="ap-v2-skeleton"></div>').join('')+'</div>':
  !ready||!team?'<div class="ap-v2-unavailable" role="status"><h2>'+(ready?'No teams assigned':'Team management is not available yet')+'</h2>'+
   '<p>'+esc(error||(ready?'This account has no authorized team memberships.':'The signed team-management service has not been activated. Existing users and permissions have not changed.'))+'</p>'+
   '<button type="button" class="ap-v2-primary" data-action="teams-retry">Retry</button></div>':
  '<div class="ap-v2-cover"></div><div class="ap-v2-heading"><span class="ap-v2-team-avatar">'+esc(initials(displayName))+'</span>'+
   '<div class="ap-v2-team-title"><h2>'+esc(displayName)+'</h2><p>'+team.memberCount+
   ' members · '+allBoards.length+' boards</p></div>'+
   (canManage?menu([
     {label:'Rename team',action:'teams-rename'},
     {label:'Change avatar and cover',action:'teams-change-cover'},
     {label:'Duplicate team',action:'teams-duplicate'},
     {label:'Delete team',action:'teams-delete',disabled:team.isSystem}
    ],'Team options'):'')+'</div>'+
   '<nav class="ap-v2-tabs" role="tablist" aria-label="Team details">'+
    '<button type="button" role="tab" aria-selected="'+(tab==='users')+'" class="'+(tab==='users'?'active':'')+
     '" data-action="teams-tab" data-tab="users">Users · '+team.memberCount+'</button>'+
    '<button type="button" role="tab" aria-selected="'+(tab==='content')+'" class="'+(tab==='content'?'active':'')+
     '" data-action="teams-tab" data-tab="content">Board access · '+allBoards.length+'</button></nav>'+
    (tab==='users'?
     '<div class="ap-v2-detail-body"><div class="ap-v2-toolbar">'+search('teams-user-search','Search by name or email',userSearch)+
      (canManage?'<button type="button" class="ap-v2-primary" data-action="teams-add-users">+ Add users</button>':'')+
      '</div>'+
      (addUsersOpen&&canManage?'<div class="ap-v2-add-users"><label for="teams-add-user-search">Find workspace members</label>'+
        '<input id="teams-add-user-search" value="'+esc(addUsersSearch)+'" placeholder="Search name or email" autocomplete="off"/>'+
        '<div>'+snapshot.directory.filter(p=>!snapshot.members.some(m=>m.teamId===selectedId&&m.userId===p.userId)&&
         (p.name+' '+p.email).toLowerCase().includes(addUsersSearch.toLowerCase())).slice(0,30).map(p=>
         '<button type="button" data-action="teams-member-add" data-user-id="'+esc(p.userId)+'">'+esc(p.name)+' · '+esc(p.email)+'</button>').join('')+'</div></div>':'')+
      (team.isSystem?'<p class="ap-v2-inherited">'+svg('shield')+' Members of this team are System Admins automatically.</p>':'')+
      '<div class="ap-v2-table-wrap"><table class="ap-v2-table"><thead><tr>'+
      '<th>Name</th><th>Email</th><th>Title</th><th>Workspace role</th><th><span class="ap-v2-sr">Actions</span></th>'+
      '</tr></thead><tbody>'+members.map(p=>
       '<tr><td><div class="ap-v2-name">'+avatar(p)+'<span title="'+esc(p.name)+'">'+esc(p.name)+'</span></div></td>'+
       '<td title="'+esc(p.email)+'"><span class="ap-v2-ellipsis">'+esc(p.email)+'</span></td>'+
       '<td title="'+esc(p.title||'')+'"><span class="ap-v2-ellipsis">'+esc(p.title||'—')+'</span></td>'+
       '<td>'+(
          p.systemAdminSource!=='none'?pill('System Admin','admin'):
          p.isOwner?pill('Team owner','owner'):pill('Member','member'))+'</td><td>'+actions(p,team,snapshot)+'</td></tr>'
      ).join('')+'</tbody></table>'+
      (!members.length?'<div class="ap-v2-empty"><p>No users in this team yet</p>'+
       (canManage?'<button class="ap-v2-primary" data-action="teams-add-users">+ Add users</button>':'')+'</div>':'')+
      '</div>'+renderBoardList(boards,team,allBoards.length)+
      '<aside class="ap-v2-note">App roles such as Approver or Dispatcher are no longer set here. Open the app and go to <strong>Settings &gt; Roles.</strong></aside></div>':
     '<div class="ap-v2-detail-body"><div class="ap-v2-toolbar">'+search('teams-content-search','Search boards',contentSearch)+
      (canManage?'<button type="button" class="ap-v2-primary" data-action="teams-assign-content">+ Give team access to a board</button>':'')+
     '</div>'+renderBoardList(boards,team,allBoards.length,false)+'</div>');
 const selectedRows=available.filter(t=>t.name.toLowerCase().includes(teamSearch.toLowerCase()))
  .sort((a,b)=>a.name.localeCompare(b.name));
 return '<div class="ap-v2-workspace-page">'+sideNav+'<main class="ap-v2-main">'+
  '<header class="ap-v2-page-header"><h1>User Role Management</h1>'+
  '<p>Organize people into teams and set workspace-level roles. Board access is set on each board; app roles are set inside each app.</p></header>'+
  '<div class="ap-v2-columns"><section class="ap-v2-card ap-v2-team-list" aria-label="Teams">'+
   '<button type="button" class="ap-v2-secondary ap-v2-full" data-action="teams-create"'+
    (!ready||snapshot.canManageSystemAdmins!==true?' disabled':'')+'>+ New team</button>'+
   search('teams-search','Search teams',teamSearch)+
   '<nav class="ap-v2-team-items" aria-label="Select team">'+
    '<button type="button" data-action="teams-select" data-team-id="" class="'+(!team?'active':'')+
     '"><span>All teams</span><span>'+(ready?available.length:'—')+'</span></button>'+
    (loading?Array.from({length:7},()=>'<div class="ap-v2-skeleton"></div>').join(''):
     selectedRows.map(t=>'<button type="button" data-action="teams-select" data-team-id="'+esc(t.id)+'"'+
      ' class="'+(selectedId===t.id?'active':'')+'"><span>'+esc(t.name)+'</span><span>'+t.memberCount+
      '</span></button>').join(''))+
   '</nav></section>'+
   '<section class="ap-v2-card ap-v2-detail" aria-label="Team details">'+details+'</section></div>'+
   '<a class="ap-v2-help" href="#/access-model">How access works</a></main></div>';
}
function renderBoardList(boards,team,fullCount,heading=true){
 return '<section class="ap-v2-board-section">'+
  (heading?'<div class="ap-v2-board-heading"><h3>Board access for this team</h3>'+
   '<span>Every member gets this level on the board</span></div>':'')+
  '<div class="ap-v2-board-rows">'+boards.map(c=>
   '<div class="ap-v2-board-row"><span>'+esc(c.name)+'</span>'+boardRole(c,team)+'</div>').join('')+
   (!boards.length?'<p class="ap-v2-board-empty">No board access assigned yet.</p>':'')+'</div>'+
  (heading&&team.canManage?'<button type="button" class="ap-v2-link" data-action="teams-assign-content">+ Give team access to a board</button>':'')+
  '</section>';
}
