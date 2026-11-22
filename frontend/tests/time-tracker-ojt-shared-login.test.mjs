import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 projectOjtRoster,projectOjtAdmin,projectOjtAttendance,projectOjtAdminAttendance,
 TimeTrackerOjtClient,TIMETRACKER_SHARED_OJT_USER_ID,
 isEligibleTimeTrackerSharedOjtAccount,renderTimeTrackerOjtAdmin,renderTimeTrackerOjtClock
} from '../apps/TimeTracker/time-tracker-ojt.js';

const app=readFileSync('frontend/app.js','utf8');
const ui=readFileSync('frontend/time-tracker-ui.js','utf8');
const native=readFileSync('frontend/time-tracker-native.js','utf8');
const firstMigration=readFileSync('supabase/migrations/20261123100000_cp_tt_ojt_shared_identities.sql','utf8');
const correction=readFileSync('supabase/migrations/20261123130000_cp_tt_ojt_employee_department_identity.sql','utf8');
const dropdownMigration=readFileSync('supabase/migrations/20261123140000_cp_tt_ojt_dropdown_identity.sql','utf8');
const docs=readFileSync('docs/CP-TT-OJT-01-SHARED-LOGIN.md','utf8');
const migrationManifest=JSON.parse(readFileSync('supabase/migration-source-manifest.json','utf8'));
const scope={userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 workspaceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3'};
const intern='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const record='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const intern2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const fresh=(mode='SHARED_LOGIN')=>({
 contract:'tt-ojt-roster-1',actorId:scope.userId,
 workspaceId:scope.workspaceId,boardId:scope.boardId,mode,
 interns:mode==='SHARED_LOGIN'?[{id:intern,name:'Intern Alpha'}]:[]
});
const stamp='2026-11-23T08:00:00.000Z';
const attendance=(clockOut=null)=>({
 contract:'tt-ojt-attendance-1',actorId:scope.userId,
 workspaceId:scope.workspaceId,boardId:scope.boardId,internId:intern,
 name:'Intern Alpha',records:[{id:record,clockIn:stamp,clockOut,
  location:'Office-Base Duty',workNote:null}]
});
const adminRaw=()=>({contract:'tt-ojt-admin-1',actorId:scope.userId,
 workspaceId:scope.workspaceId,boardId:scope.boardId,
 groups:[{userId:TIMETRACKER_SHARED_OJT_USER_ID,enabled:true,interns:[
  {id:intern,name:'Intern Alpha',active:true},
  {id:intern2,name:'Intern Beta',active:false}
 ]}]});
const adminAttendance=()=>({contract:'tt-ojt-admin-attendance-1',
 actorId:scope.userId,workspaceId:scope.workspaceId,boardId:scope.boardId,
 records:[{id:record,internId:intern,name:'Intern Alpha',clockIn:stamp,
  clockOut:null,location:'Office-Base Duty'}]});

test('signed dropdown roster is scoped and exposes active names only',()=>{
 assert.deepEqual(projectOjtRoster(fresh(),scope).interns,[{id:intern,name:'Intern Alpha'}]);
 for(const key of ['actorId','workspaceId','boardId'])
  assert.throws(()=>projectOjtRoster({...fresh(),[key]:intern},scope),/roster/);
 assert.throws(()=>projectOjtRoster({...fresh(),interns:[
  {id:intern,name:'Intern Alpha'},{id:intern,name:'Intern Beta'}
 ]},scope),/roster/);
 assert.throws(()=>projectOjtRoster({...fresh(),mode:'SHARED_DISABLED'},scope),/roster/);
 assert.equal(projectOjtRoster(fresh('PERSONAL'),scope).mode,'PERSONAL');
});

test('admin projection retains inactive profiles for roster management only',()=>{
 const projected=projectOjtAdmin(adminRaw(),scope);
 assert.equal(projected.groups[0].interns[0].active,true);
 assert.equal(projected.groups[0].interns[1].active,false);
 assert.throws(()=>projectOjtAdmin({...adminRaw(),workspaceId:intern},scope),/roster/);
 assert.deepEqual(projectOjtAdminAttendance(adminAttendance(),scope).records[0],
  {id:record,internId:intern,name:'Intern Alpha',clockIn:stamp,
   clockOut:null,location:'Office-Base Duty'});
});

test('attendance projection is bound to the selected intern and rejects conflicting active rows',()=>{
 const projected=projectOjtAttendance(attendance(),scope,intern);
 assert.equal(projected.active.id,record);
 assert.throws(()=>projectOjtAttendance(attendance(),scope,scope.userId),/attendance/);
 assert.throws(()=>projectOjtAttendance({...attendance(),workspaceId:scope.userId},scope,intern),/attendance/);
 assert.throws(()=>projectOjtAttendance({...attendance(),records:[
  ...attendance().records,{...attendance().records[0],id:intern2}
 ]},scope,intern),/Conflicting active/);
});

test('client uses scoped intern-ID RPCs and does not issue identity tokens',async()=>{
 const calls=[];
 const api={context:async()=>({user_id:scope.userId,workspace_id:scope.workspaceId,
   profile:{status:'active'}}),
  rpc:async(method,args)=>{
   calls.push({method,args});
   if(method==='timetracker_ojt_roster')return fresh();
   if(method==='timetracker_ojt_admin_snapshot')return adminRaw();
   if(method==='timetracker_ojt_admin_attendance')return adminAttendance();
   if(method==='timetracker_ojt_snapshot')return attendance();
   if(method==='timetracker_ojt_commit')return{
    contract:'tt-ojt-commit-1',mode:'COMMITTED',actorId:scope.userId,
    workspaceId:scope.workspaceId,boardId:scope.boardId,internId:intern,
    recordId:record,action:'clock-in',committedAt:stamp
   };
   if(method==='timetracker_ojt_intern_set')return{
    contract:'tt-ojt-admin-write-1',workspaceId:scope.workspaceId,
    boardId:scope.boardId,internId:intern,active:true
   };
   if(method==='timetracker_ojt_group_set')return{
    contract:'tt-ojt-admin-write-1',workspaceId:scope.workspaceId,
    boardId:scope.boardId,userId:TIMETRACKER_SHARED_OJT_USER_ID,enabled:true
   };
   throw Error('Unexpected RPC '+method);
  }};
 const auth={isSignedIn:true,getVerifiedUser:async()=>({id:scope.userId})};
 const client=new TimeTrackerOjtClient({auth,api});
 assert.equal((await client.roster(scope)).interns[0].id,intern);
 assert.equal((await client.admin(scope)).groups[0].interns[1].active,false);
 assert.equal((await client.adminAttendance(scope)).records[0].name,'Intern Alpha');
 const snap=await client.snapshot(scope,intern);
 assert.equal(snap.internId,intern);
 assert.deepEqual(calls[3].args,{p_board_id:scope.boardId,p_intern_id:intern});
 await client.commit(scope,intern,{action:'clock-in',location:'Office-Base Duty',
  geo:{status:'captured'},workNote:''});
 assert.equal(calls[4].method,'timetracker_ojt_commit');
 assert.equal(calls[4].args.p_intern_id,intern);
 assert.equal(calls[4].args.p_action,'clock-in');
 await client.setIntern(scope,{userId:TIMETRACKER_SHARED_OJT_USER_ID,
  name:'Intern Alpha',active:true});
 assert.equal(calls[5].method,'timetracker_ojt_intern_set');
 assert.deepEqual(Object.keys(calls[5].args).sort(),
  ['p_active','p_board_id','p_intern_id','p_name','p_shared_user_id'].sort());
 await client.setGroup(scope,TIMETRACKER_SHARED_OJT_USER_ID,true);
 assert.equal(calls[6].method,'timetracker_ojt_group_set');
 assert.doesNotMatch(JSON.stringify(calls),/pin|token/i);
});

test('client rejects an account or workspace change before using the selected intern',async()=>{
 const auth={isSignedIn:true,getVerifiedUser:async()=>({id:scope.userId})};
 const api={context:async()=>({user_id:scope.userId,
  workspace_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',profile:{status:'active'}}),
  rpc:async()=>{throw Error('RPC must not run after identity mismatch');}};
 const client=new TimeTrackerOjtClient({auth,api});
 await assert.rejects(client.snapshot(scope,intern),/session or workspace changed/);
});

test('Clock uses a dropdown and loads the selected intern before exposing clock actions',()=>{
 const html=renderTimeTrackerOjtClock({roster:fresh()});
 assert.match(html,/<select id="tt-ojt-intern-select"/);
 assert.match(html,/Choose an intern/);
 assert.match(html,/Intern Alpha/);
 assert.doesNotMatch(html,/data-action="tt-ojt-clock"/);
 assert.doesNotMatch(html,/PIN|Verify identity|tt-ojt-choose/);
 const active=renderTimeTrackerOjtClock({roster:fresh(),
  selected:{id:intern,name:'Intern Alpha',scope},
  attendance:projectOjtAttendance(attendance(),scope,intern)});
 assert.match(active,/End Session/);
 assert.doesNotMatch(active,/data-action="tt-ojt-leave"/);
 const idle=renderTimeTrackerOjtClock({roster:fresh(),
  selected:{id:intern,name:'Intern Alpha',scope},
  attendance:projectOjtAttendance({...attendance(),records:[]},scope,intern)});
 assert.match(idle,/Switch intern/);
 assert.match(idle,/Start Session/);
});

test('Employees admin UI adds, edits and deactivates names without PIN fields',()=>{
 const html=renderTimeTrackerOjtAdmin({admin:adminRaw(),
  employees:[{id:TIMETRACKER_SHARED_OJT_USER_ID,name:'OJT Account',
   role:'Employee',department:'OJT'}]});
 assert.match(html,/OJT Interns/);
 assert.match(html,/Add intern/);
 assert.match(html,/Edit/);
 assert.match(html,/Active/);
 assert.match(html,/Inactive/);
 assert.doesNotMatch(html,/PIN|password|verification code/i);
});

test('only the designated Employee in OJT department qualifies for the shared login',()=>{
 const approved={id:TIMETRACKER_SHARED_OJT_USER_ID,role:'Employee',
  department:'OJT',name:'OJT Account'};
 assert.equal(isEligibleTimeTrackerSharedOjtAccount(approved),true);
 assert.equal(isEligibleTimeTrackerSharedOjtAccount({...approved,role:'OJT'}),false);
 assert.equal(isEligibleTimeTrackerSharedOjtAccount({...approved,department:'HR'}),false);
 assert.equal(isEligibleTimeTrackerSharedOjtAccount({...approved,id:scope.userId}),false);
 assert.equal(isEligibleTimeTrackerSharedOjtAccount({...approved,department:null}),false);
 const roster=renderTimeTrackerOjtAdmin({admin:{groups:[]},employees:[
  approved,{...approved,id:scope.userId,name:'Other intern'}]});
 assert.match(roster,/data-action="tt-ojt-group-enable"/);
 assert.match(roster,/OJT Account/);
 assert.doesNotMatch(roster,/Other intern/);
});

test('app wires dropdown selection, signed attendance and admin roster actions',()=>{
 assert.match(app,/root\.addEventListener\('change',async event=>/);
 assert.match(app,/tt-ojt-intern-select/);
 assert.match(app,/timeTrackerOjt\.snapshot\(scope,id\)/);
 assert.match(app,/timeTrackerOjt\.commit\(scope,selected\.id/);
 assert.match(app,/timeTrackerOjt\.snapshot\(scope,selected\.id/);
 assert.match(app,/timeTrackerOjt\.setIntern\(scope/);
 assert.match(app,/timeTrackerOjt\.setGroup\(scope/);
 assert.match(app,/Select your name from the list before starting/);
 const dropdownStart=app.indexOf("root.addEventListener('change',async event=>");
 const dropdownEnd=app.indexOf("root.addEventListener('input',event=>",dropdownStart);
 assert.ok(dropdownStart>=0&&dropdownEnd>dropdownStart);
 assert.doesNotMatch(app.slice(dropdownStart,dropdownEnd),/captureAttendanceGeo/);
 const draftWrite=app.indexOf("ttWorkNoteDraft.write(timeTrackerWorkNoteScope(selected.id)");
 const gpsCapture=app.indexOf("captureAttendanceGeo(navigator.geolocation)",draftWrite);
 assert.ok(draftWrite>=0&&gpsCapture>draftWrite,
  'OJT work-plan draft must be persisted before requesting GPS');
 assert.doesNotMatch(app,/timeTrackerOjt\.select\(|timeTrackerOjt\.leave\(|tt-ojt-choose|ojtPin|p_pin|private PIN/i);
 assert.match(ui,/renderTimeTrackerOjtClock/);
 assert.match(ui,/renderTimeTrackerOjtAdmin/);
 assert.match(native,/attendanceWritesAccepted:designatedSharedOjt\?false/);
 assert.match(native,/timetracker_ojt_roster/);
 assert.match(native,/timetracker_ojt_admin_snapshot/);
});

test('forward migration removes PIN/session infrastructure and preserves historical names',()=>{
 for(const fragment of [
  'DROP TABLE IF EXISTS private.tt_ojt_sessions',
  'DROP COLUMN IF EXISTS pin_hash',
  'DROP COLUMN IF EXISTS failed_attempts',
  'DROP COLUMN IF EXISTS locked_until',
  'DROP FUNCTION IF EXISTS public.timetracker_ojt_select',
  'DROP FUNCTION IF EXISTS public.timetracker_ojt_leave',
  'p_board_id uuid,p_intern_id uuid',
  'i.shared_user_id=auth.uid() AND i.active',
  'a.intern_id=v_id AND a.shared_user_id=auth.uid()',
  'ADD COLUMN IF NOT EXISTS intern_name text',
  'UPDATE private.tt_ojt_attendance a',
  'intern_id,intern_name',
  "'name',a.intern_name"
 ])assert.ok(dropdownMigration.includes(fragment),fragment);
 assert.doesNotMatch(dropdownMigration,/p_pin|pin_hash text|extensions\.crypt|gen_salt|token_hash|tt_ojt_sessions\s*\(/i);
 assert.match(firstMigration,/CREATE UNIQUE INDEX tt_ojt_one_active_per_intern/);
 assert.match(firstMigration,/CREATE TABLE private\.tt_ojt_attendance/);
 assert.match(firstMigration,/CREATE TRIGGER tt_ojt_block_legacy_clock/);
 assert.match(correction,/ojt@watchdogautomation\.com\.ph/);
 assert.match(correction,/d\.department='OJT'/);
 assert.match(correction,/module_role_for\('time-tracker',p_user_id\)='Employee'/);
 assert.doesNotMatch(dropdownMigration,/CREATE\s+USER|INSERT INTO auth\.users/i);
 assert.match(docs,/self-identification, not proof/i);
 assert.match(docs,/intern_name|historical attendance/i);
 const entry=migrationManifest.forward_migrations.find(x=>x.file==='20261123140000_cp_tt_ojt_dropdown_identity.sql');
 assert.ok(entry,'dropdown migration must be registered in the source manifest');
 assert.equal(entry.bytes,Buffer.byteLength(dropdownMigration,'utf8'));
 assert.equal(entry.sha256,createHash('sha256').update(dropdownMigration,'utf8').digest('hex'));
});
