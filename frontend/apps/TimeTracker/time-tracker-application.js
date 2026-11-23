/** CRM-native TimeTracker application route and existing-board discovery. */
import {validTimeTrackerDepartmentName} from '../../time-tracker-team.js';
import {WORK_MANAGEMENT_BOARD_IDS} from '../../workspace-application-ownership.js';
export const TIMETRACKER_APPLICATION_ROUTE = "#/time-tracker";
export const TIMETRACKER_ATTENDANCE_BOARD_ID = WORK_MANAGEMENT_BOARD_IDS.timetracker;

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

/** Signed, workspace-bound projection; absence of a department is not inferred. */
export function projectTimeTrackerEmployeeDepartments(directory,snapshot){
 if(directory?.scope!=='SIGNED_TIMETRACKER_EMPLOYEES'||!Array.isArray(directory.members))
  throw Error('Signed TimeTracker employee directory required');
 if(snapshot===null)return Object.freeze({...directory,departmentsReady:false,
  members:Object.freeze(directory.members.map(m=>Object.freeze({...m,department:null})))});
 if(snapshot?.contract!=='tt-department-directory-1'||snapshot.actorId!==directory.userId||
    snapshot.workspaceId!==directory.workspaceId||snapshot.boardId!==directory.boardId||
    !Array.isArray(snapshot.assignments)||snapshot.assignments.length>10000)
  throw Error('Employee department read scope is invalid');
 const known=new Set(directory.members.map(m=>m.id)),departments=new Map();
 for(const row of snapshot.assignments){
  if(!uuid.test(row?.userId||'')||departments.has(row.userId)||
     !validTimeTrackerDepartmentName(row.department))
   throw Error('Employee department snapshot has an invalid assignment');
  if(known.has(row.userId))departments.set(row.userId,row.department);
 }
 return Object.freeze({...directory,departmentsReady:true,
  members:Object.freeze(directory.members.map(m=>Object.freeze({
   ...m,department:departments.get(m.id)||null
  })))});
}
/** Catalog records are trusted only after signed workspace and actor verification. */
export function projectTimeTrackerDepartmentCatalog(snapshot,{userId,workspaceId,boardId}={}){
 if(snapshot?.contract!=='tt-department-catalog-1'||snapshot.actorId!==userId||
    snapshot.workspaceId!==workspaceId||snapshot.boardId!==boardId||
    !Number.isSafeInteger(Number(snapshot.revision))||Number(snapshot.revision)<1||
    !Array.isArray(snapshot.departments)||snapshot.departments.length>500)
  throw Error('Signed department catalog scope is invalid');
 const ids=new Set(),names=new Set();
 const departments=snapshot.departments.map(row=>{
  if(!uuid.test(row?.id||'')||!validTimeTrackerDepartmentName(row.name)||
     !Number.isSafeInteger(Number(row.assignedCount))||Number(row.assignedCount)<0||
     ids.has(row.id)||names.has(row.name.toLocaleLowerCase()))
   throw Error('Signed department catalog contains invalid entry');
  ids.add(row.id);names.add(row.name.toLocaleLowerCase());
  return Object.freeze({id:row.id,name:row.name,assignedCount:Number(row.assignedCount)});
 });
 return Object.freeze({scope:'SIGNED_TIMETRACKER_DEPARTMENT_CATALOG',
  userId,workspaceId,boardId,revision:Number(snapshot.revision),
  departments:Object.freeze(departments)});
}
export function renderTimeTrackerEmployees({directory=null,access={},search='',loading=false}={}){
 const verified=directory?.scope==='SIGNED_TIMETRACKER_EMPLOYEES'&&
  directory.userId===access.userId&&
  directory.workspaceId===access.workspaceId&&
  directory.boardId===access.boardId&&Array.isArray(directory.members);
 const manager=['System Admin','IT Administrator'].includes(access.moduleRole);
 const catalog=access?.departmentCatalog;
 const catalogReady=manager&&catalog?.scope==='SIGNED_TIMETRACKER_DEPARTMENT_CATALOG'&&
  catalog.userId===access.userId&&catalog.workspaceId===access.workspaceId&&
  catalog.boardId===access.boardId&&Array.isArray(catalog.departments);
 const canEdit=verified&&manager&&directory.departmentsReady===true&&catalogReady;
 const q=String(search||'').trim().toLocaleLowerCase().slice(0,120);
 const members=verified?directory.members:[];
 const searchValue=member=>(member.name+' '+member.role+' '+(canEdit?member.department||'':'')).toLocaleLowerCase();
 const visible=members.filter(m=>searchValue(m).includes(q));
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
    '<p>Synced from the current signed Supabase directory</p></div>'+
   (manager?'<p class="tt-employees-department-notice">'+
    (canEdit?'Edit employee assignments here, manage department names below, or open Attendance to correct times.':
     'Department assignments unavailable until the signed Supabase read is deployed.')+
    '</p>':'')+
    (manager?'<section class="tt-departments-management" aria-label="Department Management">'+
     '<div class="tt-departments-head"><div><h4>Department Management</h4>'+
     '<p>Workspace departments are stored and audited in Supabase.</p></div>'+
     (catalogReady?'<button type="button" data-action="tt-departments-add">+ Add department</button>':'')+
     '</div>'+
     (catalogReady?'<div class="tt-departments-list">'+
       catalog.departments.map(dep=>'<div class="tt-department-item">'+
        '<div><strong>'+esc(dep.name)+'</strong><span>'+dep.assignedCount+
        ' employee'+(dep.assignedCount===1?'':'s')+' assigned</span></div>'+
        '<div class="tt-department-actions">'+
        '<button type="button" data-action="tt-departments-rename" data-department-id="'+esc(dep.id)+'">Rename</button>'+
        '<button type="button" class="tt-department-danger" data-action="tt-departments-delete" data-department-id="'+esc(dep.id)+'">Delete</button>'+
        '</div></div>').join('')+'</div>':
       '<p role="status" class="tt-employees-department-notice">Signed department catalog unavailable. Editing is disabled.</p>')+
     '</section>':'')+
   '<div class="tt-employees-toolbar">'+
    '<label for="tt-employees-search">Find employee'+
     '<input type="search" id="tt-employees-search" maxlength="120" autocomplete="off" '+
      'placeholder="Search name or TimeTracker role…" value="'+esc(search)+'"></label>'+
    '<span role="status" aria-live="polite" data-tt-employees-count>'+
     visible.length+' of '+members.length+' employees</span>'+
   '</div>'+
   '<div class="tt-employees-table-wrap"><table class="tt-employees-table">'+
    '<thead><tr><th scope="col">Employee</th><th scope="col">TimeTracker role</th>'+
     (manager?'<th scope="col">Department</th>':'')+
     '<th scope="col">Access</th>'+
     (manager?'<th scope="col">Actions</th>':'')+'</tr></thead><tbody>'+
    members.map(member=>{
     const searchText=searchValue(member);
     return '<tr class="tt-employee-row" data-search-text="'+esc(searchText)+'"'+
      (q&&!searchText.includes(q)?' hidden':'')+'>'+
      '<td><span class="tt-employee-avatar" aria-hidden="true">'+
        esc(member.name.split(/\\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase())+
       '</span><strong>'+esc(member.name)+'</strong></td>'+
      '<td>'+esc(member.role)+'</td>'+
      (manager?'<td>'+esc(canEdit?(member.department||'Not assigned'):'Unavailable')+'</td>':'')+
      '<td><span class="tt-employee-active">Active</span></td>'+
      (manager?'<td class="tt-employee-actions">'+
       (canEdit?'<button type="button" data-action="tt-employees-department-edit" data-user-id="'+esc(member.id)+'">Edit department</button>':'')+
       '<button type="button" data-action="tt-employees-attendance" data-user-id="'+esc(member.id)+'">Attendance</button>'+
       '</td>':'')+'</tr>';
    }).join('')+'</tbody></table>'+
    '<p data-tt-employees-empty'+(visible.length?' hidden':'')+
     '>No employees match this search.</p></div>'+
   '<p class="tt-employees-footnote">Count includes active members with an assigned TimeTracker role. '+
    'Supabase accounts without TimeTracker access are not counted. '+
    'Department changes use the audited server API, never a local personnel registry.</p>':
   '<p class="tt-employees-unavailable" role="status">'+
    (loading?'Loading current registered employees…':
     'The signed TimeTracker employee directory is unavailable.')+'</p>')+
 '</section>';
}
