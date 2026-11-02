import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 projectTimeTrackerOverview,filterTimeTrackerOverviewRows,
 renderTimeTrackerOverview,manilaDay,timeTrackerOverviewCsv,
 syncTimeTrackerOverviewClock,applyTimeTrackerOverviewFilters,
 TT_TEAM_OVERVIEW_ROLES
} from '../time-tracker-overview.js';

const self='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const teammate='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
const elsewhere='7789347c-49f1-4fb7-b78c-3023e0e60676';
const now=new Date('2026-11-02T07:35:00.000Z');
const directory=[
 {id:self,display_name:'First Employee',status:'active'},
 {id:teammate,display_name:'Second Employee',status:'active'}
];
const entry=(id,owner,clockIn,location,department,extra={})=>({
 id,ownerId:'cloud:'+owner,
 clockIn:{
  timestamp:clockIn,location,department,
  geo:{latitude:10.3,longitude:123.8,accuracy:4},
  memo:'Private location details'
 },clockOut:null,...extra
});
const records=[
 entry('a',self,'2026-11-01T23:00:00.000Z','Local Field Works','Engineering'),
 entry('b',teammate,'2026-11-02T01:36:00.000Z','Out of Town Assignment','Engineering'),
 entry('foreign',elsewhere,'2026-11-02T00:15:00.000Z','Office-Base Duty','Finance'),
 entry('yesterday',teammate,'2026-11-01T00:00:00.000Z','Office-Base Duty','Finance')
];
const source={version:1,records};
const project=(role='IT Administrator',args={})=>projectTimeTrackerOverview({
 value:source,directory,userId:self,moduleRole:role,now,...args
});

test('today is based on Philippine time rather than UTC',()=>{
 assert.equal(manilaDay(new Date('2026-11-01T23:59:59Z')),'2026-11-02');
 assert.equal(manilaDay(new Date('2026-11-02T15:59:59Z')),'2026-11-02');
 assert.equal(manilaDay(new Date('2026-11-02T16:00:00Z')),'2026-11-03');
});
test('admin and HR see signed-workspace members clocked in today only',()=>{
 for(const role of TT_TEAM_OVERVIEW_ROLES){
  const view=project(role);
  assert.equal(view.scope,'AUTHORIZED_WORKSPACE_TEAM');
  assert.equal(view.peopleCount,2);
  assert.equal(view.activeCount,2);
  assert.equal(view.completedCount,0);
  assert.equal(view.lateCount,1);
  assert.equal(view.onsiteCount,0);
  assert.equal(view.onTimeRate,50);
  assert.equal(view.arrivalBeforeEight,1);
  assert.equal(view.rows.length,2);
  assert.equal(view.rows.some(x=>x.ownerId==='cloud:'+elsewhere),false);
  assert.equal(view.rows.some(x=>x.id==='yesterday'),false);
  assert.equal(JSON.stringify(view).includes('latitude'),false);
  assert.equal(JSON.stringify(view).includes('longitude'),false);
  assert.equal(JSON.stringify(view).includes('Private location details'),false);
 }
});
test('Employee OJT Supervisor Finance do not see other colleagues from broad data',()=>{
 for(const role of ['Employee','OJT','Supervisor','Finance']){
  const view=project(role);
  assert.equal(view.scope,'OWN_ATTENDANCE_ONLY');
  assert.equal(view.rows.length,1);
  assert.equal(view.rows[0].ownerId,'cloud:'+self);
  assert.equal(JSON.stringify(view).includes('Second Employee'),false);
 }
});
test('foreign directory member and malformed records fail closed',()=>{
 assert.equal(project('HR',{directory:[directory[0]]}).rows.length,1);
 assert.throws(()=>project('HR',{directory:[directory[1]]}),/does not include signed user/);
 assert.throws(()=>projectTimeTrackerOverview({
  value:'not-json',directory,userId:self,moduleRole:'HR',now
 }),/malformed/);
 assert.throws(()=>project('HR',{value:{version:8,records:[]}}),/schema/);
 assert.throws(()=>project('HR',{value:{version:1,records:'object'}}),/schema/);
});
test('derived metrics use genuine clock in and completed session state',()=>{
 const view=project('HR',{value:{version:1,records:[
  entry('c',self,'2026-11-01T23:00:00.000Z','Office-Base Duty','HR',
   {clockOut:{timestamp:'2026-11-02T02:00:00.000Z'}})
 ]}});
 assert.equal(view.completedCount,1);
 assert.equal(view.activeCount,0);
 assert.equal(view.onsiteCount,0);
 assert.equal(view.locations.reduce((sum,x)=>sum+x.count,0),0);
});
test('search location department and status filters only affect authorized rows',()=>{
 const rows=project().rows;
 assert.equal(filterTimeTrackerOverviewRows(rows,{search:'Second'}).length,1);
 assert.equal(filterTimeTrackerOverviewRows(rows,{department:'Engineering'}).length,2);
 assert.equal(filterTimeTrackerOverviewRows(rows,{location:'Office-Base Duty'}).length,0);
 assert.equal(filterTimeTrackerOverviewRows(rows,{status:'Late'}).length,1);
 assert.equal(filterTimeTrackerOverviewRows(rows,{status:'Completed'}).length,0);
 assert.deepEqual(filterTimeTrackerOverviewRows(rows,{sort:'oldest'}).map(x=>x.id),['a','b']);
});
test('visual reference sections render with live data and escape injected personnel names',()=>{
 const compromised=[
 {id:self,display_name:'<img src=x onerror=alert(1)>',status:'active'},
 directory[1]
 ];
 const view=project('HR',{directory:compromised});
 const html=renderTimeTrackerOverview({
  overview:view,access:{name:'Signed user'},now
 });
 for(const text of [
  'Clock-In Distribution','Attendance Pulse','Late Arrivals','Arrival Pattern',
  'Department Breakdown','Employee Whereabouts','Attendance Records',
  'Location distribution','All Locations','All Departments','All Status'
 ])assert.match(html,new RegExp(text));
 assert.match(html,/First Employee|&lt;img src=x/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotMatch(html,/123\.8|Private location details|latitude/);
 assert.match(html,/tt-overview-search/);
 assert.match(html,/tt-overview-export/);
 assert.match(html,/Philippine Time/);
});
test('overview CSV protects spreadsheet formula injection and omits GPS',()=>{
 const r=project('HR').rows;
 const csv=timeTrackerOverviewCsv([{...r[0],name:'=IMPORTXML("https://bad.example")'}]);
 assert.match(csv,/' =IMPORTXML/);
 assert.doesNotMatch(csv,/longitude|latitude|geo/);
 assert.match(csv,/Engineering/);
});
test('overview live ticker updates one scoped text node only',()=>{
 const node={textContent:''};
 const root={querySelector:id=>id==='#tt-overview-time'?node:null};
 assert.equal(syncTimeTrackerOverviewClock(root,now),true);
 assert.match(node.textContent,/03:35:00 PM/);
 assert.equal(syncTimeTrackerOverviewClock({querySelector:()=>null},now),false);
});
test('DOM filtering hides unauthorized filter matches without network calls',()=>{
 const el=[
  {dataset:{ttSearch:'first employee engineering',ttLocation:'Local Field Works',
   ttDepartment:'Engineering',ttStatus:'Active',ttLate:'false'},tagName:'TR',hidden:false},
  {dataset:{ttSearch:'second employee engineering',ttLocation:'Out of Town Assignment',
   ttDepartment:'Engineering',ttStatus:'Active',ttLate:'true'},tagName:'TR',hidden:false}
 ];
 const nodes={
  '#tt-overview-search':{value:'second'},
  '#tt-overview-location':{value:'all'},
  '#tt-overview-department':{value:'all'},
  '#tt-overview-status':{value:'Late'}
 };
 const section={
  querySelector:id=>nodes[id]||null,
  querySelectorAll:selector=>selector==='.tt-overview-filterable'?el:[]
 };
 const root={querySelector:s=>s==='.tt-overview'?section:null};
 assert.equal(applyTimeTrackerOverviewFilters(root),1);
 assert.equal(el[0].hidden,true);
 assert.equal(el[1].hidden,false);
});
test('native CRM app wires Overview, role isolation, and no new backend',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const native=readFileSync('frontend/time-tracker-native.js','utf8');
 const ui=readFileSync('frontend/time-tracker-ui.js','utf8');
 assert.match(app,/tt-overview-export/);
 assert.match(app,/syncTimeTrackerOverviewClock/);
 assert.match(app,/applyTimeTrackerOverviewFilters/);
 assert.match(native,/projectTimeTrackerOverview/);
 assert.match(native,/TT_TEAM_OVERVIEW_ROLES/);
 assert.match(ui,/\['overview','Overview',true\]/);
 assert.match(ui,/renderTimeTrackerOverview/);
 assert.doesNotMatch(ui,/iframe|embed|time-tracker\.zip/);
});
