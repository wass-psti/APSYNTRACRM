import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 projectOjtRoster,projectOjtAdmin,projectOjtAttendance,
 projectOjtAdminAttendance,TimeTrackerOjtClient,
 TIMETRACKER_SHARED_OJT_USER_ID,isEligibleTimeTrackerSharedOjtAccount,
 renderTimeTrackerOjtAdmin,renderTimeTrackerOjtClock
} from '../apps/TimeTracker/time-tracker-ojt.js';
const root='frontend/';
const app=readFileSync(root+'app.js','utf8');
const ui=readFileSync(root+'time-tracker-ui.js','utf8');
const native=readFileSync(root+'time-tracker-native.js','utf8');
const sql=readFileSync('supabase/migrations/20261123100000_cp_tt_ojt_shared_identities.sql','utf8');
const correction=readFileSync('supabase/migrations/20261123130000_cp_tt_ojt_employee_department_identity.sql','utf8');
const css=readFileSync(root+'apps/TimeTracker/time-tracker-ojt.css','utf8');
const bundle=readFileSync(root+'apsyntra-styles.bundle.css','utf8');
const manifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
const index=readFileSync('index.html','utf8');
const scope={userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 workspaceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3'};
const intern='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fresh=(mode='SHARED_LOGIN')=>({
 contract:'tt-ojt-roster-1',actorId:scope.userId,
 workspaceId:scope.workspaceId,boardId:scope.boardId,mode,
 interns:mode==='SHARED_LOGIN'?[{id:intern,name:'Intern Alpha'}]:[]
});
test('signed OJT roster projects independent subprofiles without trust in client names',()=>{
 assert.deepEqual(projectOjtRoster(fresh(),scope).interns,[{id:intern,name:'Intern Alpha'}]);
 for(const key of ['actorId','workspaceId','boardId']){
  assert.throws(()=>projectOjtRoster({...fresh(),[key]:intern},scope),
   /roster/);
 }
 assert.throws(()=>projectOjtRoster({...fresh(),interns:[
  {id:intern,name:'Intern Alpha'},{id:intern,name:'Intern Beta'}
 ]},scope),/roster/);
 assert.throws(()=>projectOjtRoster({...fresh(),mode:'SHARED_DISABLED'},scope),/roster/);
 assert.equal(projectOjtRoster(fresh('PERSONAL'),scope).mode,'PERSONAL');
});
test('verified attendance is isolated by intern UUID and rejects a duplicate active session',()=>{
 const stamp='2026-11-23T08:00:00.000Z';
 const raw={contract:'tt-ojt-attendance-1',actorId:scope.userId,
  workspaceId:scope.workspaceId,boardId:scope.boardId,internId:intern,
  name:'Intern Alpha',records:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   clockIn:stamp,clockOut:null,location:'Office-Base Duty',workNote:null}]};
 const projected=projectOjtAttendance(raw,scope,intern);
 assert.equal(projected.active.status,'Active');
 assert.throws(()=>projectOjtAttendance(raw,scope,scope.userId),/attendance/);
 assert.throws(()=>projectOjtAttendance({...raw,records:[raw.records[0],raw.records[0]]},
  scope,intern),/attendance/);
 assert.throws(()=>projectOjtAttendance({...raw,workspaceId:scope.userId},
  scope,intern),/attendance/);
});
test('OJT administrative metadata is explicitly scoped, never exposes PINs',()=>{
 const admin={contract:'tt-ojt-admin-1',actorId:scope.userId,
  workspaceId:scope.workspaceId,boardId:scope.boardId,
  groups:[{userId:scope.userId,enabled:true,interns:[
   {id:intern,name:'Intern Alpha',active:true}]}]};
 const projected=projectOjtAdmin(admin,scope);
 assert.equal(projected.groups[0].interns[0].name,'Intern Alpha');
 assert.throws(()=>projectOjtAdmin({...admin,workspaceId:intern},scope),/roster/);
 const rows={contract:'tt-ojt-admin-attendance-1',actorId:scope.userId,
  workspaceId:scope.workspaceId,boardId:scope.boardId,records:[]};
 assert.deepEqual(projectOjtAdminAttendance(rows,scope).records,[]);
});
test('PIN selection uses only signed RPC; tokens remain in transient JavaScript memory',async()=>{
 const calls=[];
 const api={context:async()=>({user_id:scope.userId,workspace_id:scope.workspaceId,
   profile:{status:'active'}}),
  rpc:async(method,args)=>{calls.push({method,args});return{
   contract:'tt-ojt-select-1',ok:true,actorId:scope.userId,
   workspaceId:scope.workspaceId,boardId:scope.boardId,internId:intern,
   name:'Intern Alpha',token:'a'.repeat(64),expiresAt:'2026-11-24T00:00:00Z'
  };}};
 const auth={isSignedIn:true,getVerifiedUser:async()=>({id:scope.userId})};
 const selected=await new TimeTrackerOjtClient({auth,api}).select(scope,intern,'12345678');
 assert.equal(selected.id,intern);
 assert.equal(calls[0].method,'timetracker_ojt_select');
 assert.deepEqual(Object.keys(calls[0].args).sort(),['p_board_id','p_intern_id','p_pin']);
 assert.throws(()=>projectOjtRoster({...fresh(),interns:[{id:intern,name:'a'}]},scope),/roster/);
 await assert.rejects(new TimeTrackerOjtClient({auth,api}).select(scope,intern,'1'),
  /individual PIN/);
 assert.doesNotMatch(app,/localStorage\.setItem\(['"]ttOjt|sessionStorage\.setItem\(['"]ttOjt/);
});
test('migration enforces separate row identity and no direct table access',()=>{
 const contracts=[
  'CREATE TABLE private.tt_ojt_shared_accounts',
  'CREATE TABLE private.tt_ojt_interns',
  'CREATE TABLE private.tt_ojt_attendance',
  'CREATE TABLE private.tt_ojt_sessions',
  'CREATE UNIQUE INDEX tt_ojt_one_active_per_intern',
  'WHERE clock_out_at IS NULL',
  "extensions.crypt(p_pin,extensions.gen_salt('bf',12))",
  "locked_until=CASE WHEN failed_attempts>=4",
  "interval '15 minutes'",
  "extensions.gen_random_bytes(32)",
  "extensions.digest(p_token,'sha256')",
  "interval '8 hours'",
  "private.tt_ojt_verify(p_board_id,p_token)",
  'timetracker_ojt_group_set',
  'timetracker_ojt_intern_set',
  'timetracker_ojt_commit',
  'timetracker_ojt_admin_attendance',
  'private.tt_ojt_block_legacy_clock',
  'CREATE TRIGGER tt_ojt_block_legacy_clock',
  'ALTER TABLE private.tt_ojt_sessions ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON private.tt_ojt_shared_accounts'
 ];
 for(const c of contracts)assert.ok(sql.includes(c),c);
 assert.doesNotMatch(sql,/CREATE\s+USER|INSERT INTO auth\.users/i);
 assert.doesNotMatch(sql,/service_role|SECURITY\s+INVOKER/i);
});
test('UI allows OJT roster selection but prevents legacy shared-account Clock',()=>{
 for(const part of [
  "TimeTrackerOjtClient","tt-ojt-choose","tt-ojt-clock",
  "tt-ojt-leave","tt-ojt-group-enable","tt-ojt-intern-add",
  "tt-ojt-intern-edit","captureAttendanceGeo(navigator.geolocation)",
  "ttOjtSelected:null","clearTimeTrackerOjtSelection()"
 ])assert.ok(app.includes(part),part);
 for(const part of [
  "renderTimeTrackerOjtClock","renderTimeTrackerOjtAdmin",
  "const sharedOjt=verified","if(sharedOjt)","return html;"
 ])assert.ok(ui.includes(part),part);
 assert.match(native,/attendanceWritesAccepted:designatedSharedOjt\?false/);
 assert.match(index,/frontend\/apps\/TimeTracker\/time-tracker-ojt\.css/);
 assert.equal((index.match(/<link rel="stylesheet"/g)||[]).length,1);
 assert.match(manifest,/frontend\/apps\/TimeTracker\/time-tracker-ojt\.css/);
 assert.match(bundle,/\/\* frontend\/apps\/TimeTracker\/time-tracker-ojt\.css \*\//);
 assert.match(css,/\.tt-native \.tt-ojt/);
});

test('only the designated Employee in OJT department qualifies for shared login',()=>{
 const approved={id:TIMETRACKER_SHARED_OJT_USER_ID,role:'Employee',department:'OJT',name:'OJT Account'};
 assert.equal(TIMETRACKER_SHARED_OJT_USER_ID,'d613280d-907b-418f-b872-c0f6dd53e580');
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
test('unconfigured and missing OJT service fail closed to ordinary Employee Clock',()=>{
 for(const mode of ['SETUP_REQUIRED','SERVICE_UNAVAILABLE','SHARED_DISABLED']){
  const view=renderTimeTrackerOjtClock({roster:{mode,interns:[]}});
  assert.doesNotMatch(view,/data-action="tt-ojt-clock"/);
  assert.doesNotMatch(view,/data-action="tt-ojt-choose"/);
 }
 assert.match(native,/const designatedSharedOjt=access.userId===TIMETRACKER_SHARED_OJT_USER_ID/);
 assert.match(native,/ojtRoster=\{mode:'SERVICE_UNAVAILABLE',interns:\[\]\}/);
 assert.match(native,/mode:'SETUP_REQUIRED'/);
 assert.match(ui,/SERVICE_UNAVAILABLE','SETUP_REQUIRED/);
 assert.match(app,/isEligibleTimeTrackerSharedOjtAccount\(u\)/);
});
test('corrective SQL validates Employee, OJT, exact user and legacy trigger',()=>{
 for(const fragment of [
  'd613280d-907b-418f-b872-c0f6dd53e580',
  'ojt@watchdogautomation.com.ph',
  "m.active","p.status='active'","d.department='OJT'",
  "public.module_role_for('time-tracker',p_user_id)='Employee'",
  'private.tt_ojt_eligible_shared(v_ws,p_shared_user_id)',
  'CREATE OR REPLACE FUNCTION private.tt_ojt_shared',
  'CREATE OR REPLACE FUNCTION public.timetracker_ojt_group_set',
  'CREATE OR REPLACE FUNCTION private.tt_ojt_block_legacy_clock',
  'g.workspace_id=NEW.workspace_id','g.shared_user_id=auth.uid()'
 ])assert.ok(correction.includes(fragment),fragment);
 const guard=correction.split('CREATE OR REPLACE FUNCTION private.tt_ojt_block_legacy_clock')[1].split('-- A previously enabled')[0];
 assert.doesNotMatch(guard,/46bf4ee7-368a-4c35-842c-8593ea1f6ac3/);
 assert.doesNotMatch(correction,/CREATE\s+USER|INSERT INTO auth\.users/i);
 assert.match(correction,/WHERE revoked_at IS NULL/);
});
