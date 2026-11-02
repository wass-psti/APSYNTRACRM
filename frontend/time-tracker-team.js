/** Bootstrap-only TimeTracker Team Directory.
 * The server-owned apsyntra_role_configuration_snapshot provides workspace users
 * and module assignments; it independently enforces bootstrap admission.
 * No local role/privilege mutation or parallel personnel registry is created.
 */
export const TT_TEAM_ROLES=Object.freeze([
 'System Admin','HR','Supervisor','Finance','IT Administrator','OJT','Employee'
]);
const adminRoles=new Set(['System Admin','IT Administrator','HR']);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(v,max)=>String(v??'').slice(0,max);
const normalizeStatus=x=>x==='active'?'Active':
 x==='inactive'||x==='deactivated'?'Deactivated':'Unknown';
const roleName=r=>r==='HR'?'HR/Admin':r;
const acronym=name=>name.trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()||'M';

export function projectTimeTrackerTeamDirectory(snapshot,{workspaceId,actorId}={}){
 if(!uuid.test(workspaceId||'')||!uuid.test(actorId||'')||
    snapshot?.bootstrapVerified!==true||snapshot?.mode!=='staged_only'||
    snapshot?.workspaceId!==workspaceId||
    !Array.isArray(snapshot.users)||!Array.isArray(snapshot.assignments)||
    snapshot.users.length>10000||snapshot.assignments.length>25000)
  throw Error('Server-verified bootstrap Team directory contract required');
 const assignments=new Map();
 for(const a of snapshot.assignments){
  if(a?.moduleId==='time-tracker'&&a.enabled===true&&
     uuid.test(a.userId||'')&&TT_TEAM_ROLES.includes(a.role)){
   if(assignments.has(a.userId))throw Error('Conflicting signed TimeTracker roles');
   assignments.set(a.userId,a.role);
  }
 }
 const seen=new Set();
 const members=[];
 for(const u of snapshot.users){
  if(!uuid.test(u?.id||'')||seen.has(u.id))throw Error('Invalid or duplicate workspace member');
  seen.add(u.id);
  const role=assignments.get(u.id)||'Unassigned';
  members.push(Object.freeze({
   id:u.id,name:text(u.displayName||'Workforce member',100),
   email:text(u.email||'',180),status:normalizeStatus(u.status),
   role,bootstrapProtected:u.bootstrapProtected===true
  }));
 }
 if(!seen.has(actorId))throw Error('Signed bootstrap identity missing from workspace');
 members.sort((a,b)=>a.name.localeCompare(b.name));
 return Object.freeze({
  workspaceId,actorId,scope:'BOOTSTRAP_WORKSPACE_DIRECTORY',
  members:Object.freeze(members)
 });
}
export function filterTimeTrackerTeam(data,{search='',role='All',layout='list'}={}){
 if(data?.scope!=='BOOTSTRAP_WORKSPACE_DIRECTORY'||!Array.isArray(data.members))
  throw Error('Verified Team directory required');
 const selected=role==='All'||role==='Unassigned'||TT_TEAM_ROLES.includes(role)?
  role:'All';
 const query=text(search,120).trim().toLocaleLowerCase();
 const members=data.members.filter(m=>
  (selected==='All'||m.role===selected)&&
  (!query||[m.name,m.email,m.role,roleName(m.role)].some(v=>
   v.toLocaleLowerCase().includes(query))));
 return Object.freeze({
  selected,layout:layout==='grid'?'grid':'list',
  members:Object.freeze(members),search:query
 });
}
export function timeTrackerTeamSummary(data){
 if(data?.scope!=='BOOTSTRAP_WORKSPACE_DIRECTORY'||!Array.isArray(data.members))
  throw Error('Verified Team directory required');
 return Object.freeze({
  total:data.members.length,
  active:data.members.filter(m=>m.status==='Active').length,
  deactivated:data.members.filter(m=>m.status==='Deactivated').length,
  unknown:data.members.filter(m=>m.status==='Unknown').length,
  admins:data.members.filter(m=>m.status==='Active'&&adminRoles.has(m.role)).length
 });
}
function memberCard(m,layout){
 const statusClass=m.status==='Active'?'active':m.status==='Deactivated'?'deactivated':'unknown';
 return '<article class="tt-team-member tt-team-'+layout+'">'+
  '<div class="tt-team-avatar" aria-hidden="true">'+esc(acronym(m.name))+'</div>'+
  '<div class="tt-team-member-main"><strong>'+esc(m.name)+'</strong>'+
   '<span class="tt-team-role tt-team-role-'+
     esc(m.role.toLowerCase().replaceAll(/[^a-z]+/g,'-'))+'">'+
    esc(roleName(m.role))+'</span>'+
   '<small>'+esc(m.email||'Email unavailable')+'</small></div>'+
  '<span class="tt-team-status tt-team-status-'+statusClass+'">'+esc(m.status)+'</span>'+
  '<span class="tt-team-locked" title="Role changes are managed only through centralized User Role Management" aria-label="Central role management only">♙</span>'+
 '</article>';
}
const filterRoles=['All',...TT_TEAM_ROLES,'Unassigned'];
export function renderTimeTrackerTeam({
 directory=null,access={},filters={},loading=false,error='',now=new Date()
}={}){
 const valid=access?.bootstrapTeamEligible===true&&directory?.scope==='BOOTSTRAP_WORKSPACE_DIRECTORY'&&
  directory?.workspaceId===access.workspaceId&&directory?.actorId===access.userId;
 if(access?.bootstrapTeamEligible!==true)
  return '<section class="tt-team-directory"><p>Bootstrap administrator verification required.</p></section>';
 const summary=valid?timeTrackerTeamSummary(directory):null;
 const state=valid?filterTimeTrackerTeam(directory,filters):null;
 const date=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',
  weekday:'long',month:'long',day:'numeric'}).format(new Date(now));
 return '<section class="tt-team-directory" aria-label="Bootstrap-only TimeTracker Team Directory">'+
  '<header class="tt-team-head"><div><h3>Team Directory</h3><p>'+esc(date)+'</p></div>'+
   '<div class="tt-team-header-actions"><button type="button" data-action="tt-team-refresh"'+
    (loading?' disabled':'')+' aria-label="Refresh Team Directory">↻</button>'+
    '<button type="button" data-action="tt-team-export"'+
    (!valid||loading||!state.members.length?' disabled':'')+
    ' aria-label="Export authorized Team Directory CSV">↓</button></div></header>'+
  (error?'<p class="tt-team-error" role="alert">'+esc(error)+'</p>':'')+
  (loading?'<p class="tt-team-loading" role="status">Verifying bootstrap authorization and loading current workspace members…</p>':
   !valid?'<p class="tt-team-loading">Team directory unavailable until signed bootstrap authorization is verified.</p>':
   '<div class="tt-team-toolbar"><label>Search member'+
    '<input id="tt-team-search" type="search" maxlength="120" placeholder="Search by name, email, role…"'+
    ' value="'+esc(filters.search||'')+'"></label>'+
    '<div class="tt-team-layout" role="group" aria-label="Member layout">'+
     '<button type="button" data-action="tt-team-layout" data-layout="grid"'+
      ' aria-pressed="'+(state.layout==='grid')+'">▦</button>'+
     '<button type="button" data-action="tt-team-layout" data-layout="list"'+
      ' aria-pressed="'+(state.layout==='list')+'">☷</button></div>'+
    '<strong class="tt-team-count">'+summary.total+' <span>MEMBERS</span></strong></div>'+
   '<div class="tt-team-stats">'+[
    ['TOTAL',summary.total],['ACTIVE',summary.active],
    ['DEACTIVATED',summary.deactivated],['ADMINS',summary.admins]
   ].map(([label,value])=>'<div><strong>'+value+'</strong><span>'+label+'</span></div>').join('')+'</div>'+
   (summary.unknown?'<p class="tt-team-warning">'+summary.unknown+
     ' member(s) have unverified status and are not counted as active.</p>':'')+
   '<div class="tt-team-section-title"><strong>FILTER BY ROLE</strong></div>'+
   '<div class="tt-team-filters" role="group" aria-label="Filter Team by TimeTracker role">'+
    filterRoles.map(role=>'<button type="button" data-action="tt-team-role" data-role="'+esc(role)+
     '" aria-pressed="'+(state.selected===role)+'">'+esc(roleName(role))+'</button>').join('')+'</div>'+
   '<div class="tt-team-section-title"><strong>MEMBER LIST</strong><span>'+
     state.members.length+' of '+summary.total+' members</span></div>'+
   (state.members.length?'<div class="tt-team-members tt-team-members-'+state.layout+'">'+
     state.members.map(m=>memberCard(m,state.layout)).join('')+'</div>':
     '<p class="tt-team-empty">No authorized workspace members match your filters.</p>')+
   '<p class="tt-team-footnote">Only verified bootstrap administrators can view this workspace directory. TimeTracker role assignments originate from centralized role management; member changes must be made there. Email, status, and counts reflect the signed workspace snapshot, not screenshot sample data.</p>')+
 '</section>';
}
export function timeTrackerTeamCsv(data){
 if(data?.scope!=='BOOTSTRAP_WORKSPACE_DIRECTORY')throw Error('Bootstrap-verified export required');
 const quote=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'").replaceAll('"','""')+'"';
 const rows=[['Name','Email','TimeTracker Role','Status'],
 ...data.members.map(m=>[m.name,m.email,m.role,m.status])];
 return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
