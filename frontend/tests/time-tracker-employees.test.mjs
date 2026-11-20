import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectTimeTrackerEmployees,renderTimeTrackerEmployees}
 from '../apps/TimeTracker/time-tracker-employees.js';
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
});

test('the menu refreshes on open and search never fetches raw Supabase Auth accounts',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/apps/TimeTracker/time-tracker-refined.css','utf8');
 assert.match(app,/if\(next==='employees'\)await loadTimeTracker\(\)/);
 assert.match(app,/case 'tt-employees-refresh'/);
 assert.match(app,/ttEmployeesSearch/);
 assert.match(app,/id==='tt-employees-search'/);
 assert.match(css,/\.tt-employees-board/);
 assert.match(css,/@media \(max-width: 620px\)/);
 assert.doesNotMatch(app,/auth\.admin\.listUsers/);
});
