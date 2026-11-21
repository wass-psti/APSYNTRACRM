import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 timeTrackerLocationKey,readTimeTrackerLocationPreference,
 saveTimeTrackerLocationPreference
} from '../apps/TimeTracker/time-tracker-preferences.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
import {TT_DEPARTMENTS} from '../time-tracker-native.js';

const userA='10000000-0000-4000-8000-000000000001';
const userB='20000000-0000-4000-8000-000000000001';
const wsA='30000000-0000-4000-8000-000000000001';
const wsB='40000000-0000-4000-8000-000000000001';
const storage=()=>{
 const data=new Map();
 return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
};
const verified=(department='Engineering')=>({
 status:'VERIFIED_READ',
 access:{moduleRole:'Employee',attendanceWritesAccepted:true,
  employeeDepartment:department,userId:userA,workspaceId:wsA},
 records:[],active:null,otRequests:[]
});
test('location preference survives new view renders but cannot cross identities or workspaces',()=>{
 const store=storage();
 const own={userId:userA,workspaceId:wsA};
 assert.equal(readTimeTrackerLocationPreference(store,own),'');
 assert.equal(saveTimeTrackerLocationPreference(store,own,'Offsite (Home)'),true);
 assert.equal(readTimeTrackerLocationPreference(store,own),'Offsite (Home)');
 assert.equal(readTimeTrackerLocationPreference(store,{...own,userId:userB}),'');
 assert.equal(readTimeTrackerLocationPreference(store,{...own,workspaceId:wsB}),'');
 assert.equal(saveTimeTrackerLocationPreference(store,own,'Admin'),false);
 assert.equal(readTimeTrackerLocationPreference(store,own),'Offsite (Home)');
 assert.equal(timeTrackerLocationKey({userId:'bad',workspaceId:wsA}),null);
});
test('storage denial does not interrupt the Clock app',()=>{
 const store={getItem(){throw Error('private mode');},setItem(){throw Error('private mode');}};
 const own={userId:userA,workspaceId:wsA};
 assert.equal(readTimeTrackerLocationPreference(store,own),'');
 assert.equal(saveTimeTrackerLocationPreference(store,own,'Office-Base Duty'),false);
});
test('signed department is shown read-only and persisted offsite choice is selected',()=>{
 const html=renderTimeTrackerNative({
  result:verified(),view:'clock',locationPreference:'Offsite (Home)'
 });
 assert.match(html,/value="Offsite \(Home\)" selected/);
 assert.match(html,/aria-label="Assigned employee department"/);
 assert.match(html,/<strong>Engineering<\/strong>/);
 assert.doesNotMatch(html,/<select id="tt-department"/);
 assert.match(html,/textarea id="tt-note" required/);
 assert.match(html,/value="clock-in"/);
});
test('missing department prevents new attendance, never guesses from location or screenshot',()=>{
 const html=renderTimeTrackerNative({result:verified(null),view:'clock'});
 assert.match(html,/Not assigned/);
 assert.match(html,/Ask your TimeTracker administrator/);
 assert.match(html,/value="clock-in" disabled/);
});
test('central catalog includes the separate General Administration department',()=>{
 assert.ok(TT_DEPARTMENTS.includes('General Administration'));
 const sql=readFileSync('supabase/migrations/20261120100000_cp_tt_employee_departments_qol.sql','utf8');
 assert.match(sql,/private\.tt_employee_departments/);
 assert.match(sql,/timetracker_employee_department_for_clock/);
 assert.match(sql,/timetracker_employee_department_set/);
 assert.match(sql,/p_action='clock-in'/);
 assert.match(sql,/p_department IS DISTINCT FROM v_authoritative_department/);
 assert.match(sql,/apsyntra_role_is_bootstrap/);
 assert.match(sql,/IT Administrator/);
 assert.match(sql,/REVOKE ALL ON private\.tt_employee_departments/);
});


test('Home note appears for both exempt accounts but is not required',()=>{
 for(const email of ['asenagan@watchdogautomation.com.ph','mvasquez@watchdogautomation.com.ph']){
  const data=verified();data.access.email=email;
  const html=renderTimeTrackerNative({result:data,view:'clock',locationPreference:'Offsite (Home)'});
  assert.match(html,/id="tt-note-wrap"/);
  assert.doesNotMatch(html,/id="tt-note-wrap" hidden/);
  assert.match(html,/textarea id="tt-note" maxlength/);
  assert.doesNotMatch(html,/textarea id="tt-note" required/);
 }
});

test('verified mvasquez user ID keeps the Home note optional even when snapshot omits email',()=>{
 const data=verified();
 data.access.email='';
 data.access.userId='5655922e-bb42-45e4-bf8b-348a0bf77f3a';
 const html=renderTimeTrackerNative({result:data,view:'clock',locationPreference:'Offsite (Home)'});
 assert.match(html,/id="tt-note-requirement"> \(optional\)<\/span>/);
 assert.doesNotMatch(html,/textarea id="tt-note" required/);
 const nonExempt=verified();
 const mandatory=renderTimeTrackerNative({result:nonExempt,view:'clock',locationPreference:'Offsite (Home)'});
 assert.match(mandatory,/id="tt-note-requirement"> \(required\)<\/span>/);
 assert.match(mandatory,/textarea id="tt-note" required/);
});

test('System Admin is not implicitly exempt and an existing Home note is shown after refresh',()=>{
 const data=verified();data.access.moduleRole='System Admin';data.access.email='other@example.test';
 const html=renderTimeTrackerNative({result:data,view:'clock',locationPreference:'Offsite (Home)'});
 assert.match(html,/textarea id="tt-note" required/);
 data.active={id:'s1',clockIn:'2026-11-21T02:00:00.000Z',department:'Engineering',location:'Offsite (Home)',workNote:'Home network maintenance'};
 data.records=[data.active];
 const active=renderTimeTrackerNative({result:data,view:'clock'});
 assert.match(active,/Home network maintenance/);
 assert.match(active,/textarea id="tt-note" readonly/);
});
