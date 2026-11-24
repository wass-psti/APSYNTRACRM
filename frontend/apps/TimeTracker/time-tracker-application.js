/** CRM-native TimeTracker application route and existing-board discovery. */
import {renderTimeTrackerOjtAdmin} from './time-tracker-ojt.js';
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
const employeeIcons={
 refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 8a7 7 0 0 1 12-2l2 6M4 12l2 6a7 7 0 0 0 12-2"/>',
 edit:'<path d="M12 5H5v14h14v-7M13 11l6-6 2 2-6 6-4 1z"/>',
 delete:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/>',
 attendance:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-9 3v4l3 1"/>'
};
const employeeIcon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+employeeIcons[name]+'</svg>';
/** Only signed TimeTracker administrators may view the employee roster. */
export function canViewTimeTrackerEmployees(access){
 return ['System Admin','IT Administrator'].includes(access?.moduleRole);
}
export function renderTimeTrackerEmployees({directory=null,access={},search='',department='',tab='directory',loading=false,ojtAdmin=null,ojtAttendance=null,ojtBusy=false}={}){
 if(!canViewTimeTrackerEmployees(access))return '';
 const verified=directory?.scope==='SIGNED_TIMETRACKER_EMPLOYEES'&&
  directory.userId===access.userId&&directory.workspaceId===access.workspaceId&&
  directory.boardId===access.boardId&&Array.isArray(directory.members);
 const manager=canViewTimeTrackerEmployees(access);
 const catalog=access?.departmentCatalog;
 const catalogReady=manager&&catalog?.scope==='SIGNED_TIMETRACKER_DEPARTMENT_CATALOG'&&
  catalog.userId===access.userId&&catalog.workspaceId===access.workspaceId&&
  catalog.boardId===access.boardId&&Array.isArray(catalog.departments);
 const canEdit=verified&&manager&&directory.departmentsReady===true&&catalogReady;
 const q=String(search||'').trim().toLocaleLowerCase().slice(0,120);
 const members=verified?directory.members:[];
 const selected=manager&&['departments','ojt'].includes(tab)?tab:'directory';
 const departments=catalogReady?catalog.departments:[];
 const filterDepartment=canEdit&&departments.some(d=>d.name===department)?department:'';
 const searchValue=member=>(member.name+' '+member.role+' '+(canEdit?member.department||'':'')).toLocaleLowerCase();
 const visible=members.filter(m=>searchValue(m).includes(q)&&(!filterDepartment||m.department===filterDepartment));
 const interns=manager&&Array.isArray(ojtAdmin?.groups)?ojtAdmin.groups.reduce((n,g)=>n+g.interns.length,0):null;
 const hidden=key=>selected===key?'':' hidden';
 const panel=(key,content)=>'<div class="tt-employees-panel" data-tt-employees-panel="'+key+'"'+hidden(key)+'>'+content+'</div>';
 const action=(name,label,attrs,icon)=>'<button type="button" class="tt-employee-icon" data-action="'+name+'" '+attrs+' aria-label="'+esc(label)+'" title="'+esc(label)+'"'+(loading?' disabled':'')+'>'+employeeIcon(icon)+'</button>';
 return '<section class="tt-employees-board tt-employees-unified" aria-label="Registered TimeTracker employees">'+
  '<header class="tt-employees-heading"><div><h3>Employees</h3>'+
   (verified?'<p aria-label="Registered active TimeTracker users"><strong>'+members.length+'</strong> registered'+
    (catalogReady?' · '+departments.length+' departments':'')+
    (interns!==null?' · '+interns+' OJT interns':'')+'</p>':
    '<p>Active employees registered for TimeTracker in this workspace.</p>')+'</div>'+
   action('tt-employees-refresh','Refresh registered TimeTracker employees','','refresh')+'</header>'+
  (verified?
   '<div class="tt-employees-segments" role="group" aria-label="Employees sections">'+
    (manager?[['directory','Directory'],['departments','Departments'],['ojt','OJT interns']]:[['directory','Directory']]).map(([key,label])=>
     '<button type="button" data-action="tt-employees-section" data-target="'+key+'" aria-pressed="'+(selected===key)+'"'+(loading?' disabled':'')+'>'+label+'</button>').join('')+'</div>'+
   '<div class="tt-employees-toolbar">'+
    '<label for="tt-employees-search"><span class="tt-employees-visually-hidden">Search employees</span>'+
     '<input type="search" id="tt-employees-search" maxlength="120" autocomplete="off" placeholder="Search…" value="'+esc(search)+'"></label>'+
    (canEdit?'<select id="tt-employees-department-filter" aria-label="Filter directory by department"'+(selected==='directory'?'':' disabled')+'>'+
     '<option value="">All departments</option>'+departments.map(d=>'<option value="'+esc(d.name)+'"'+(d.name===filterDepartment?' selected':'')+'>'+esc(d.name)+'</option>').join('')+'</select>':'')+
    '<span role="status" aria-live="polite" data-tt-employees-count'+hidden('directory')+'>'+visible.length+' of '+members.length+' employees</span></div>'+
   (manager&&!canEdit?'<p class="tt-employees-department-notice" role="status">Department assignments unavailable until the signed Supabase read is deployed.</p>':'')+
   panel('directory','<div class="tt-employees-table-wrap"><table class="tt-employees-table"><thead><tr><th scope="col">Employee</th><th scope="col">'+(manager?'Role · department':'Role')+'</th>'+
     (manager?'<th scope="col">Actions</th>':'')+'</tr></thead><tbody>'+
    members.map(member=>{
     const searchText=searchValue(member);
     const privileged=member.role!=='Employee';
     const role=member.role==='System Admin'?'System admin':member.role;
     const words=member.name.trim().split(/\s+/);
     const initials=(words[0]?.[0]||'')+(words.length>1?words.at(-1)?.[0]||'':'');
     return '<tr class="tt-employee-row" data-tt-employee-search-row data-department="'+esc(canEdit?member.department||'':'')+'" data-search-text="'+esc(searchText)+'"'+
      ((!searchText.includes(q)||(filterDepartment&&member.department!==filterDepartment))?' hidden':'')+'>'+
      '<td><span class="tt-employee-avatar'+(privileged?' is-privileged':'')+'" aria-hidden="true">'+esc(initials.toUpperCase())+'</span><strong>'+esc(member.name)+'</strong></td>'+
      '<td><span class="tt-employee-role'+(privileged?' is-privileged':'')+'">'+esc(role)+'</span>'+
      (manager?'<span class="tt-employee-department-text">'+esc(canEdit?(member.department||'Not assigned'):'Unavailable')+'</span>':'')+'</td>'+
      (manager?'<td class="tt-employee-actions">'+
       (canEdit?action('tt-employees-department-edit','Edit department for '+member.name,'data-user-id="'+esc(member.id)+'"','edit'):'')+
       action('tt-employees-attendance','Attendance for '+member.name,'data-user-id="'+esc(member.id)+'"','attendance')+'</td>':'')+'</tr>';
    }).join('')+'</tbody></table><p data-tt-employees-empty'+(visible.length?' hidden':'')+'>No employees match this search.</p></div>'+
    '<p class="tt-employees-footnote">Scroll for more · Registered active TimeTracker users only.</p>')+
   (manager?panel('departments','<section class="tt-departments-management" aria-label="Department Management">'+
    '<div class="tt-departments-head"><h4>Department Management</h4>'+
    (catalogReady?'<button type="button" data-action="tt-departments-add"'+(loading?' disabled':'')+'>+ Add department</button>':'')+'</div>'+
    (catalogReady?'<div class="tt-departments-list">'+departments.map(dep=>'<div class="tt-department-item" data-tt-employee-search-row data-search-text="'+esc(dep.name.toLocaleLowerCase())+'"'+(!dep.name.toLocaleLowerCase().includes(q)?' hidden':'')+'>'+
     '<div><strong>'+esc(dep.name)+'</strong><span>'+dep.assignedCount+' employee'+(dep.assignedCount===1?'':'s')+' assigned</span></div><div class="tt-department-actions">'+
     action('tt-departments-rename','Rename '+dep.name,'data-department-id="'+esc(dep.id)+'"','edit')+
     action('tt-departments-delete','Delete '+dep.name,'data-department-id="'+esc(dep.id)+'"','delete')+'</div></div>').join('')+'</div>'+
     '<p class="tt-employees-footnote">'+departments.length+' departments · Scroll for more</p>':
     '<p role="status" class="tt-employees-department-notice">Signed department catalog unavailable. Editing is disabled.</p>')+'</section>')+
    panel('ojt',renderTimeTrackerOjtAdmin({admin:ojtAdmin,attendance:ojtAttendance,employees:members,search,busy:loading||ojtBusy})):'')+
   '<p class="tt-employees-visually-hidden">Count includes active members with an assigned TimeTracker role. Supabase accounts without TimeTracker access are not counted. Department changes use the audited server API, never a local personnel registry.</p>':
   '<p class="tt-employees-unavailable" role="status">'+(loading?'Loading current registered employees…':'The signed TimeTracker employee directory is unavailable.')+'</p>')+'</section>';
}
