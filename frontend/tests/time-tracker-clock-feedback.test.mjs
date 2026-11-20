import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TimeTrackerNativeClient} from '../time-tracker-native.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';

const actor='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const employee='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
const workspace='00000000-0000-4000-8000-000000000001';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const catalogId='70000000-0000-4000-8000-000000000003';
const nativeSource=readFileSync('frontend/time-tracker-native.js','utf8');
const appSource=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/apps/TimeTracker/time-tracker-refined.css','utf8');

test('Clock-only signed snapshot excludes unrelated OT and department administration RPCs',async()=>{
 const calls=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  nativeApplicationBoardContext:async()=>({userId:actor,workspaceId:workspace,
   board:{id:board,name:'TimeTracker Attendance'}}),
  rpc:async(name)=>{
   calls.push(name);
   if(name==='has_module_access')return true;
   if(name==='list_module_directory')return [{id:actor,status:'active',module_role:'System Admin',
    display_name:'Administrator'}];
   if(name==='list_module_state')return [{state_key:'timetracker.attendance.v1',
    scope:'shared',revision:1,value:JSON.stringify({version:1,records:[]})}];
   if(name==='timetracker_employee_department_for_clock')
    return {contract:'tt-department-1',actorId:actor,workspaceId:workspace,
     boardId:board,department:'OJT'};
   if(name==='timetracker_attendance_capabilities')
    return {mode:'ACTIVE',contract:'tt-attendance-1',canClock:true,
     actorId:actor,workspaceId:workspace,boardId:board};
   if(name==='timetracker_auto_clockout_snapshot')
    return {mode:'ACTIVE',contract:'tt-auto-clockout-1',actorId:actor,
     workspaceId:workspace,boardId:board,session:null};
   throw Error('Unexpected Clock-only RPC '+name);
  }
 };
 const snap=await new TimeTrackerNativeClient({auth,api}).snapshot(board,{clockOnly:true});
 assert.equal(snap.status,'VERIFIED_READ');
 assert.equal(snap.clockOnly,true);
 assert.equal(snap.access.employeeDepartment,'OJT');
 assert.equal(snap.access.attendanceWritesAccepted,true);
 assert.equal(calls.includes('timetracker_ot_snapshot'),false);
 assert.equal(calls.includes('timetracker_department_catalog_snapshot'),false);
 assert.equal(calls.includes('timetracker_employee_department_directory_snapshot'),false);
 assert.equal(calls.includes('list_module_state'),true);
 assert.equal(calls.includes('timetracker_auto_clockout_snapshot'),true);
});

test('confirmed Clock In and Clock Out use prominent green in-context accessible indicators',()=>{
 const result={status:'VERIFIED_READ',records:[],active:null,access:{
  moduleRole:'Employee',employeeDepartment:'Engineering',attendanceWritesAccepted:true
 }};
 const inHtml=renderTimeTrackerNative({result,view:'clock',geoPermission:'granted',
  success:'Clock In successfully recorded and confirmed by the server.'});
 assert.match(inHtml,/tt-clock-confirmed/);
 assert.match(inHtml,/Successfully clocked in/);
 assert.doesNotMatch(inHtml,/<strong>Clock In successful<\/strong>/);
 assert.match(inHtml,/role="status" aria-live="polite"/);
 assert.match(inHtml,/Location access enabled/);
 assert.match(inHtml,/new GPS fix is captured/);
 const outHtml=renderTimeTrackerNative({result,view:'clock',
  success:'Clock Out successfully recorded and confirmed by the server.'});
 assert.match(outHtml,/Successfully clocked out/);
 assert.doesNotMatch(inHtml,/tt-feedback tt-feedback-success/);
});

test('blocked or unknown GPS has specific mobile-friendly remediation and explicit check action',()=>{
 const result={status:'VERIFIED_READ',records:[],active:null,access:{
  moduleRole:'Employee',employeeDepartment:'Engineering',attendanceWritesAccepted:true
 }};
 const denied=renderTimeTrackerNative({result,geoPermission:'denied'});
 assert.match(denied,/Location permission blocked/);
 assert.match(denied,/browser site settings/);
 assert.match(denied,/Location Services/);
 assert.match(denied,/data-action="tt-location-check"/);
 const prompt=renderTimeTrackerNative({result,geoPermission:'prompt'});
 assert.match(prompt,/Enable location/);
 const checking=renderTimeTrackerNative({result,geoPermission:'prompt',geoChecking:true});
 assert.match(checking,/Checking GPS…/);
 assert.match(checking,/disabled/);
 const ready=renderTimeTrackerNative({result,geoPermission:'granted'});
 assert.doesNotMatch(ready,/data-action="tt-location-check"/);
});

test('Clock initial loading indicates verification rather than false backend failure',()=>{
 const html=renderTimeTrackerNative({busy:true,result:null});
 assert.match(html,/Connecting to TimeTracker/);
 assert.match(html,/Verifying your signed account/);
 assert.match(html,/tt-loading-indicator/);
 assert.match(html,/Verifying Clock access/);
 assert.doesNotMatch(html,/Clock actions pending backend acceptance/);
 const source=readFileSync('frontend/time-tracker-ui.js','utf8');
 assert.match(source,/tt-clock-sync-status/);
});

test('department assignment uses an existing signed page scope and targeted readbacks',async()=>{
 const calls=[];
 const access={userId:actor,workspaceId:workspace,boardId:board,moduleRole:'IT Administrator',
  employees:{scope:'SIGNED_TIMETRACKER_EMPLOYEES',userId:actor,workspaceId:workspace,
   boardId:board,members:[{id:actor,name:'Admin',role:'IT Administrator'},
    {id:employee,name:'Employee',role:'Employee'}]}};
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  rpc:async(name,args)=>{
   calls.push(name);
   if(name==='timetracker_employee_department_set'){
    assert.equal(args.p_target_user_id,employee);
    assert.equal(args.p_department,'Engineering');
    return {contract:'tt-department-set-1',actorId:actor,
     workspaceId:workspace,targetUserId:employee,department:'Engineering'};
   }
   if(name==='timetracker_employee_department_directory_snapshot')
    return {contract:'tt-department-directory-1',actorId:actor,workspaceId:workspace,
     boardId:board,assignments:[{userId:employee,department:'Engineering'}]};
   if(name==='timetracker_department_catalog_snapshot')
    return {contract:'tt-department-catalog-1',actorId:actor,workspaceId:workspace,
     boardId:board,revision:12,
     departments:[{id:catalogId,name:'Engineering',assignedCount:1}]};
   throw Error('Unexpected post-save read '+name);
  }
 };
 const client=new TimeTrackerNativeClient({auth,api});
 const roster=await client.assignEmployeeDepartment(board,employee,'Engineering',{
  verifiedAccess:access
 });
 assert.equal(roster.members.find(m=>m.id===employee).department,'Engineering');
 assert.equal(roster.departmentCatalog.revision,12);
 assert.deepEqual(calls,[
  'timetracker_employee_department_set',
  'timetracker_employee_department_directory_snapshot',
  'timetracker_department_catalog_snapshot'
 ]);
 await assert.rejects(()=>client.assignEmployeeDepartment(board,employee,'Engineering',{
  verifiedAccess:{...access,moduleRole:'Employee'}
 }),/administrator authorization/);
});

test('Clock write still preserves fresh GPS and signed read-after-write requirements',()=>{
 assert.match(nativeSource,/this\.snapshot\(boardId,\{clockOnly:true\}\)/);
 assert.match(nativeSource,/maximumAge:0/);
 assert.match(nativeSource,/retryUnauthorized:false/);
 assert.match(appSource,/clockOnly:state\.ttView==='clock'/);
 assert.match(appSource,/clockOnly:true/);
 assert.match(appSource,/requiresDetail=next!=='clock'/);
 assert.match(appSource,/case 'tt-location-check'/);
 assert.match(appSource,/verifiedAccess:state\.ttAttendance\.access/);
 assert.doesNotMatch(appSource,/await loadTimeTracker\(seq\);\s*if\(state\.ttAttendance\?\.access\?\.employees\?\.members/);
});

test('responsive feedback includes mobile tap targets and reduced motion',()=>{
 assert.match(css,/\.tt-clock-confirmed/);
 assert.match(css,/\.tt-location-readiness/);
 assert.match(css,/min-height: 44px/);
 assert.match(css,/@media \(max-width: 620px\)/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});
