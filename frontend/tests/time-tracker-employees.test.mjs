import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectTimeTrackerEmployees,renderTimeTrackerEmployees,projectTimeTrackerEmployeeDepartments,projectTimeTrackerDepartmentCatalog}
 from '../time-tracker-application.js';
import {TimeTrackerNativeClient,TT_ROLES} from '../time-tracker-native.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';

const actor='10000000-0000-4000-8000-000000000001';
const colleague='20000000-0000-4000-8000-000000000001';
const disabled='30000000-0000-4000-8000-000000000001';
const workspace='40000000-0000-4000-8000-000000000001';
const board='50000000-0000-4000-8000-000000000001';
const rows=[
 {id:actor,status:'active',module_role:'IT Administrator',
  display_name:'Sam Admin',email:'hidden@example.com',geo:{latitude:10}},
 {id:colleague,status:'active',module_role:'Employee',
  display_name:'Jamie & Taylor'},
 {id:disabled,status:'inactive',module_role:'Employee',
  display_name:'Former Employee'},
 {id:'60000000-0000-4000-8000-000000000001',
  status:'active',module_role:null,display_name:'No TimeTracker access'}
];
const scope={userId:actor,workspaceId:workspace,boardId:board,validRoles:TT_ROLES};

test('existing signed module directory projects only registered active TimeTracker members',()=>{
 const projected=projectTimeTrackerEmployees(rows,scope);
 assert.equal(projected.scope,'SIGNED_TIMETRACKER_EMPLOYEES');
 assert.deepEqual(projected.members.map(m=>m.name),['Jamie & Taylor','Sam Admin']);
 assert.equal(projected.members.length,2);
 assert.doesNotMatch(JSON.stringify(projected),/hidden@example|latitude|Former Employee/);
 assert.equal(Object.isFrozen(projected),true);
 assert.equal(Object.isFrozen(projected.members),true);
});

test('directory rejects cross-workspace results, duplicate identities and missing signed user',()=>{
 assert.throws(()=>projectTimeTrackerEmployees([
  {...rows[0],workspace_id:'70000000-0000-4000-8000-000000000001'}
 ],scope),/Cross-workspace/);
 assert.throws(()=>projectTimeTrackerEmployees([rows[0],rows[0]],scope),/duplicate/);
 assert.throws(()=>projectTimeTrackerEmployees([rows[1]],scope),/missing/);
});

test('roster is escaped, searchable and cannot display private directory fields',()=>{
 const directory=projectTimeTrackerEmployees(rows,scope);
 const html=renderTimeTrackerEmployees({directory,access:scope,search:'jamie'});
 assert.match(html,/2<\/strong>/);
 assert.match(html,/1 of 2 employees/);
 assert.match(html,/Jamie &amp; Taylor/);
 assert.match(html,/data-action="tt-employees-refresh"/);
 assert.match(html,/id="tt-employees-search"/);
 assert.doesNotMatch(html,/hidden@example|latitude|Former Employee/);
 const invalid=renderTimeTrackerEmployees({
  directory,access:{...scope,workspaceId:'70000000-0000-4000-8000-000000000001'}
 });
 assert.match(invalid,/directory is unavailable/);
 assert.doesNotMatch(invalid,/Jamie/);
});

test('Employees tab is immediately beside Clock and preserves the admin-only Team tab',()=>{
 const directory=projectTimeTrackerEmployees(rows,scope);
 const html=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access:{...scope,moduleRole:'IT Administrator',
   employees:directory,attendanceWritesAccepted:true},records:[],active:null},
  view:'employees'
 });
 assert.match(html,/data-target="clock"[\s\S]*?data-target="employees"[\s\S]*?data-target="log"/);
 assert.match(html,/data-tt-view="employees"/);
 assert.match(html,/Registered active TimeTracker users/);
 assert.doesNotMatch(html,/data-target="team"/);
 assert.doesNotMatch(html,/hidden@example/);
 assert.match(renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access:{...scope,employees:directory},records:[]},
  view:'clock',teamEligible:true
 }),/data-target="team"/);
});

test('native reader reuses one existing Supabase directory RPC under signed board scope',async()=>{
 const names=[];
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  nativeApplicationBoardContext:async()=>({
   userId:actor,workspaceId:workspace,
   board:{id:board,name:'TimeTracker Attendance'}
  }),
  rpc:async(name)=>{
   names.push(name);
   if(name==='has_module_access')return true;
   if(name==='list_module_directory')return rows;
   throw Error('Unexpected RPC '+name);
  }
 };
 const client=new TimeTrackerNativeClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},api
 });
 const access=await client.access(board);
 assert.equal(access.employees.members.length,2);
 assert.equal(access.workspaceId,workspace);
 assert.equal(names.filter(x=>x==='list_module_directory').length,1);
 const invalidApi={...api,rpc:async(name,...rest)=>{
  if(name==='list_module_directory')return [
   {...rows[0],workspace_id:'70000000-0000-4000-8000-000000000001'},
   rows[1]
  ];
  return api.rpc(name,...rest);
 }};
 const safe=await new TimeTrackerNativeClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},api:invalidApi
 }).access(board);
 // Optional directory corruption blocks the roster, never core attendance.
 assert.equal(safe.employees,null);
});

test('the menu refreshes on open and search never fetches raw Supabase Auth accounts',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/apps/TimeTracker/time-tracker-refined.css','utf8');
 assert.match(app,/if\(next==='employees'&&!requiresDetail\)await loadTimeTracker\(\)/);
 assert.match(app,/requiresDetail=next!=='clock'&&state\.ttAttendance\?\.clockOnly===true/);
 assert.match(app,/case 'tt-employees-refresh'/);
 assert.match(app,/ttEmployeesSearch/);
 assert.match(app,/id==='tt-employees-search'/);
 assert.match(css,/\.tt-employees-board/);
 assert.match(css,/@media \(max-width: 620px\)/);
 assert.doesNotMatch(app,/auth\.admin\.listUsers/);
});

test('Employees management uses signed department assignments and never invents unavailable values',()=>{
 const directory=projectTimeTrackerEmployees(rows,scope);
 const snapshot={contract:'tt-department-directory-1',actorId:actor,
  workspaceId:workspace,boardId:board,
  assignments:[{userId:colleague,department:'Engineering'}]};
 const assigned=projectTimeTrackerEmployeeDepartments(directory,snapshot);
 const catalog=projectTimeTrackerDepartmentCatalog({
  contract:'tt-department-catalog-1',actorId:actor,workspaceId:workspace,boardId:board,
  revision:1,departments:[
   {id:'70000000-0000-4000-8000-000000000001',name:'Engineering',assignedCount:1},
   {id:'70000000-0000-4000-8000-000000000002',name:'OJT',assignedCount:0}
  ]},scope);
 assert.equal(assigned.departmentsReady,true);
 assert.equal(assigned.members.find(x=>x.id===colleague).department,'Engineering');
 const html=renderTimeTrackerEmployees({directory:assigned,
  access:{...scope,moduleRole:'IT Administrator',departmentCatalog:catalog}});
 assert.match(html,/Engineering/);
 assert.match(html,/data-action="tt-employees-department-edit"/);
 assert.match(html,/data-action="tt-employees-attendance"/);
 assert.match(html,/Department Management/);
 assert.match(html,/data-action="tt-departments-add"/);
 assert.match(html,/data-action="tt-departments-rename"/);
 assert.match(html,/data-action="tt-departments-delete"/);
 assert.match(html,/OJT/);
 assert.match(html,/1 employee assigned/);
 assert.doesNotMatch(renderTimeTrackerEmployees({directory:assigned,
  access:{...scope,moduleRole:'Employee'}}),/tt-employees-department-edit/);
 const unavailable=projectTimeTrackerEmployeeDepartments(directory,null);
 assert.match(renderTimeTrackerEmployees({directory:unavailable,
  access:{...scope,moduleRole:'System Admin'}}),/Department assignments unavailable/);
 assert.doesNotMatch(renderTimeTrackerEmployees({directory:unavailable,
  access:{...scope,moduleRole:'System Admin'}}),/tt-employees-department-edit/);
 for(const bad of [
  {...snapshot,workspaceId:actor},
  {...snapshot,assignments:[{userId:colleague,department:'X'}]},
  {...snapshot,assignments:[{userId:colleague,department:'Engineering'},
   {userId:colleague,department:'Engineering'}]}
 ])assert.throws(()=>projectTimeTrackerEmployeeDepartments(directory,bad));
});

test('department catalog rejects cross-workspace, duplicate names, forged counts and corrupt signatures',()=>{
 const departmentId='70000000-0000-4000-8000-000000000002';
 const signed={contract:'tt-department-catalog-1',
  actorId:actor,workspaceId:workspace,boardId:board,revision:4,
  departments:[{id:departmentId,name:'OJT',assignedCount:0}]};
 const catalog=projectTimeTrackerDepartmentCatalog(signed,scope);
 assert.equal(catalog.revision,4);
 assert.equal(catalog.departments[0].name,'OJT');
 assert.equal(Object.isFrozen(catalog.departments),true);
 for(const bad of [
  {...signed,workspaceId:actor},
  {...signed,actorId:colleague},
  {...signed,revision:-1},
  {...signed,departments:[{id:departmentId,name:'OJT',assignedCount:-1}]},
  {...signed,departments:[{id:departmentId,name:'OJT',assignedCount:0},
    {id:'70000000-0000-4000-8000-000000000003',name:'ojt',assignedCount:0}]},
  {...signed,departments:[{id:departmentId,name:'X',assignedCount:0}]}
 ])assert.throws(()=>projectTimeTrackerDepartmentCatalog(bad,scope));
});
test('signed catalog client checks current assignment count and verifies actual deletion',async()=>{
 const calls=[],id='70000000-0000-4000-8000-000000000002';
 let revision=7,departments=[{id,name:'OJT',assignedCount:2}];
 const api={
  async context(){return {user_id:actor,workspace_id:workspace,profile:{status:'active'}};},
  async nativeApplicationBoardContext(moduleId){return {moduleId,userId:actor,
   workspaceId:workspace,role:'IT Administrator',board:{
    id:board,name:'TimeTracker Attendance',workspace_id:workspace}};},
  async rpc(name,args){
   calls.push({name,args});
   if(name==='has_module_access')return true;
   if(name==='list_module_directory')return [
    {id:actor,status:'active',display_name:'Admin',module_role:'IT Administrator'},
    {id:colleague,status:'active',display_name:'Worker',module_role:'Employee'}
   ];
   if(name==='timetracker_department_catalog_snapshot')return {
    contract:'tt-department-catalog-1',actorId:actor,workspaceId:workspace,
    boardId:board,revision,departments
   };
   if(name==='timetracker_department_catalog_mutate'){
    revision++;
    departments=[];
    return {contract:'tt-department-catalog-mutate-1',
     actorId:actor,workspaceId:workspace,boardId:board,
     action:'delete',departmentId:id,revision,affectedEmployees:2};
   }
   throw Error('Unexpected RPC '+name);
  }
 };
 const client=new TimeTrackerNativeClient({auth:{
  userId:actor,getVerifiedUser:async()=>({id:actor})
 },api});
 await assert.rejects(()=>client.mutateDepartmentCatalog(board,{
  action:'delete',departmentId:id,expectedRevision:7,expectedCount:1
 }),/count changed/);
 assert.equal(calls.filter(x=>x.name==='timetracker_department_catalog_mutate').length,0);
 const result=await client.mutateDepartmentCatalog(board,{
  action:'delete',departmentId:id,expectedRevision:7,expectedCount:2
 });
 assert.equal(result.revision,8);
 assert.equal(result.departments.length,0);
 assert.equal(calls.find(x=>x.name==='timetracker_department_catalog_mutate').args.p_expected_count,2);
});

test('unified Employees shell retains authorized actions, exposes selected sections and filters dynamically',()=>{
 const directory=projectTimeTrackerEmployeeDepartments(projectTimeTrackerEmployees(rows,scope),{
  contract:'tt-department-directory-1',actorId:actor,workspaceId:workspace,boardId:board,
  assignments:[{userId:colleague,department:'Engineering'}]
 });
 const departmentCatalog=projectTimeTrackerDepartmentCatalog({
  contract:'tt-department-catalog-1',actorId:actor,workspaceId:workspace,boardId:board,revision:1,
  departments:[{id:'70000000-0000-4000-8000-000000000001',name:'Engineering',assignedCount:1}]
 },scope);
 const access={...scope,moduleRole:'IT Administrator',departmentCatalog};
 const html=renderTimeTrackerEmployees({directory,access,tab:'departments',department:'Engineering'});
 assert.match(html,/data-target="departments" aria-pressed="true"/);
 assert.match(html,/data-tt-employees-panel="directory" hidden/);
 assert.match(html,/data-tt-employees-panel="departments">/);
 assert.match(html,/Role · department/);
 assert.match(html,/aria-label="Edit department for Jamie &amp; Taylor"/);
 assert.doesNotMatch(html,/tt-employee-active|<th scope="col">Access/);
 assert.match(html,/id="tt-employees-department-filter"/);
 const plain=renderTimeTrackerEmployees({directory,access:{...scope,moduleRole:'Employee'},tab:'ojt'});
 assert.doesNotMatch(plain,/data-target="ojt"|tt-departments-add/);
 assert.match(plain,/data-target="directory" aria-pressed="true"/);
});
