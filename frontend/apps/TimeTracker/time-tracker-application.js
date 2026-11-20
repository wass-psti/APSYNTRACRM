/** CRM-native TimeTracker application route and existing-board discovery. */
export const TIMETRACKER_APPLICATION_ROUTE = "#/time-tracker";
export const TIMETRACKER_ATTENDANCE_BOARD_ID =
  "46bf4ee7-368a-4c35-842c-8593ea1f6ac3";

/** Prefer the canonical attendance board; never substitute a legacy board. */
export function findTimeTrackerAttendanceBoard(boards, resolveModule) {
  if (!Array.isArray(boards) || typeof resolveModule !== "function")
    return null;
  return (
    boards.find(
      (board) =>
        board?.id === TIMETRACKER_ATTENDANCE_BOARD_ID &&
        board.name === "TimeTracker Attendance" &&
        board.status === "active" &&
        resolveModule(board.name)?.key === "timetracker",
    ) || null
  );
}

/** Signed TimeTracker employees view using the existing module directory. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

export function projectTimeTrackerEmployees(users,{
 userId,workspaceId,boardId,validRoles=[]
}={}){
 if(!uuid.test(userId||'')||!uuid.test(workspaceId||'')||
    !uuid.test(boardId||'')||!Array.isArray(users)||users.length>10000)
  throw Error('Signed TimeTracker employee directory required');
 const roles=new Set(validRoles);
 const seen=new Set(),members=[];
 for(const user of users){
  if(!user||user.status!=='active'||!roles.has(user.module_role))continue;
  if(!uuid.test(user.id||'')||seen.has(user.id))
   throw Error('Invalid or duplicate TimeTracker employee');
  if((user.workspace_id&&user.workspace_id!==workspaceId)||
     (user.workspaceId&&user.workspaceId!==workspaceId))
   throw Error('Cross-workspace TimeTracker employee response rejected');
  seen.add(user.id);
  members.push(Object.freeze({
   id:user.id,
   name:String(user.display_name||'Workforce member').trim().slice(0,100)||'Workforce member',
   role:user.module_role
  }));
 }
 if(!seen.has(userId))throw Error('Signed employee missing from module directory');
 members.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 return Object.freeze({
  scope:'SIGNED_TIMETRACKER_EMPLOYEES',userId,workspaceId,boardId,
  members:Object.freeze(members)
 });
}

export function renderTimeTrackerEmployees({directory=null,access={},search='',loading=false}={}){
 const verified=directory?.scope==='SIGNED_TIMETRACKER_EMPLOYEES'&&
  directory.userId===access.userId&&
  directory.workspaceId===access.workspaceId&&
  directory.boardId===access.boardId&&Array.isArray(directory.members);
 const q=String(search||'').trim().toLocaleLowerCase().slice(0,120);
 const members=verified?directory.members:[];
 const visible=members.filter(u=>(u.name+' '+u.role).toLocaleLowerCase().includes(q));
 return '<section class="tt-employees-board" aria-label="Registered TimeTracker employees">'+
  '<header class="tt-employees-heading">'+
   '<div><p class="tt-employees-eyebrow">TIME TRACKER / WORKSPACE DIRECTORY</p>'+
    '<h3>Employees</h3>'+
    '<p>Active employees registered for TimeTracker in this workspace.</p></div>'+
   '<button type="button" data-action="tt-employees-refresh"'+
    (loading?' disabled':'')+' aria-label="Refresh registered TimeTracker employees">↻ Refresh</button>'+
  '</header>'+
  (verified?
   '<div class="tt-employees-summary"><div><strong>'+members.length+'</strong>'+
    '<span>Registered active TimeTracker users</span></div>'+
    '<p>Read-only · Synced from the current signed Supabase directory</p></div>'+
   '<div class="tt-employees-toolbar">'+
    '<label for="tt-employees-search">Find employee'+
     '<input type="search" id="tt-employees-search" maxlength="120" autocomplete="off" '+
      'placeholder="Search name or TimeTracker role…" value="'+esc(search)+'"></label>'+
    '<span role="status" aria-live="polite" data-tt-employees-count>'+
     visible.length+' of '+members.length+' employees</span>'+
   '</div>'+
   '<div class="tt-employees-table-wrap"><table class="tt-employees-table">'+
    '<thead><tr><th scope="col">Employee</th><th scope="col">TimeTracker role</th>'+
     '<th scope="col">Access</th></tr></thead><tbody>'+
    members.map(member=>{
     const searchText=(member.name+' '+member.role).toLocaleLowerCase();
     return '<tr class="tt-employee-row" data-search-text="'+esc(searchText)+'"'+
      (q&&!searchText.includes(q)?' hidden':'')+'>'+
      '<td><span class="tt-employee-avatar" aria-hidden="true">'+
        esc(member.name.split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase())+
       '</span><strong>'+esc(member.name)+'</strong></td>'+
      '<td>'+esc(member.role)+'</td>'+
      '<td><span class="tt-employee-active">Active</span></td></tr>';
    }).join('')+'</tbody></table>'+
    '<p data-tt-employees-empty'+(visible.length?' hidden':'')+
     '>No employees match this search.</p></div>'+
   '<p class="tt-employees-footnote">Count includes active members with an assigned TimeTracker role. '+
    'Supabase accounts without TimeTracker access are not counted. '+
    'Refresh to retrieve current registrations; no employee records are stored in this tab.</p>':
   '<p class="tt-employees-unavailable" role="status">'+
    (loading?'Loading current registered employees…':
     'The signed TimeTracker employee directory is unavailable.')+'</p>')+
 '</section>';
}
