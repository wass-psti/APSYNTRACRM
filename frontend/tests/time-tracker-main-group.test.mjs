import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TIMETRACKER_MAIN_GROUP_HEADINGS,renderTimeTrackerMainGroup} from '../time-tracker-main-group.js';

const actor='20000000-0000-4000-8000-000000000001';
const workspace='10000000-0000-4000-8000-000000000001';
const board='30000000-0000-4000-8000-000000000001';
const item='80000000-0000-4000-8000-000000000002';
const record='80000000-0000-4000-8000-000000000003';
const other='80000000-0000-4000-8000-000000000004';
const fix=(latitude,longitude)=>({latitude,longitude,accuracyM:8.5,
 capturedAt:'2026-11-03T02:10:00Z'});
const row={
 recordId:record,itemId:item,employeeName:'Employee <Sample>',
 clockInAt:'2026-11-03T01:30:00Z',clockOutAt:'2026-11-03T13:30:00Z',
 clockInGps:fix(10.123456,123.987654),clockOutGps:fix(10.54321,123.654321),
 status:'Completed',creditedMs:39600000
};
const verified={status:'VERIFIED_READ',userId:actor,workspaceId:workspace,
 boardId:board,rows:[row],hasMore:false};
const opts={groupId:'group-a',groupItems:[{id:item}],userId:actor,
 workspaceId:workspace,boardId:board};

test('exact seven operational columns in contract order; no database column headers',()=>{
 assert.deepEqual(TIMETRACKER_MAIN_GROUP_HEADINGS,[
  'Employee','Clock-In Time','Clock-In GPS','Clock-Out Time',
  'Clock-Out GPS','Attendance Status','Working Duration'
 ]);
 const html=renderTimeTrackerMainGroup({...opts,projection:verified});
 const headings=[...html.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(m=>m[1]);
 assert.deepEqual(headings,TIMETRACKER_MAIN_GROUP_HEADINGS);
 assert.doesNotMatch(html,/SOURCE RECORD ID|SOURCE REVISION|SYNC STATE|Attendance Ref|<colgroup>/);
 assert.match(html,/board-group-scroll/);
 assert.match(html,/data-group-id="group-a"/);
 assert.match(html,/role="region" tabindex="0"/);
});

test('signed private projection maps identity, Philippine time, two independent GPS fixes and server-credited duration',()=>{
 const html=renderTimeTrackerMainGroup({...opts,projection:verified});
 const fmt=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',
  dateStyle:'medium',timeStyle:'short'});
 assert.match(html,new RegExp(fmt.format(new Date(row.clockInAt)).replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')));
 assert.match(html,new RegExp(fmt.format(new Date(row.clockOutAt)).replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')));
 assert.match(html,/Employee &lt;Sample&gt;/);
 assert.doesNotMatch(html,/<Sample>/);
 assert.match(html,/10\.12346, 123\.98765/);
 assert.match(html,/10\.54321, 123\.65432/);
 assert.match(html,/11\.00 h/);
 assert.match(html,/tt-main-status-completed/);
 assert.doesNotMatch(html,/recordId|source_record_id|clock_in_geo/);
});

test('clock-out fields stay absent for active sessions, with no fabricated elapsed duration',()=>{
 const active={...row,clockOutAt:null,clockOutGps:null,creditedMs:null,status:'Active'};
 const html=renderTimeTrackerMainGroup({...opts,projection:{...verified,rows:[active]}});
 assert.match(html,/Not yet clocked out/);
 assert.match(html,/Not recorded/);
 assert.match(html,/In progress/);
 assert.match(html,/tt-main-status-active/);
 assert.doesNotMatch(html,/10\.54321|11\.00 h/);
});

test('foreign board, workspace, actor and out-of-group private rows never display',()=>{
 for(const mismatch of [
  {...verified,userId:other},{...verified,workspaceId:other},
  {...verified,boardId:other},{...verified,status:'RESTRICTED'},
  {...verified,rows:[{...row,itemId:other}]}
 ]){
  const html=renderTimeTrackerMainGroup({...opts,projection:mismatch});
  assert.doesNotMatch(html,/10\.12346|123\.98765|Employee &lt;Sample&gt;/);
 }
 const html=renderTimeTrackerMainGroup({...opts,projection:null});
 assert.match(html,/restricted by the current signed server scope/);
 assert.doesNotMatch(html,/10\.12346/);
});

test('server-redacted HR and own history joins only matching source record IDs; GPS never leaks',()=>{
 const log={status:'VERIFIED_LOG',userId:actor,workspaceId:workspace,
  boardId:board,scope:'AUTHORIZED_WORKSPACE_TEAM',rows:[{
   id:record,name:'Verified HR employee',clockIn:'2026-11-03T01:30:00Z',
   clockOut:'2026-11-03T13:30:00Z',status:'Completed',creditedMs:39600000,
   clockInGps:fix(66,111),clockOutGps:fix(77,122)
  }]};
 const columns=[{id:'source',name:'Source Record ID',system_key:null},
  {id:'unrelated',name:'GPS coordinates',system_key:null}];
 const values=[{item_id:item,column_id:'source',value:record},
  {item_id:item,column_id:'unrelated',value:'SHOULD_NOT_LEAK'}];
 const html=renderTimeTrackerMainGroup({...opts,projection:log,
  boardColumns:columns,boardValues:values});
 assert.match(html,/Verified HR employee/);
 assert.match(html,/11\.00 h/);
 assert.match(html,/>Restricted<\/span>/);
 assert.doesNotMatch(html,/66|111|77|122|SHOULD_NOT_LEAK/);
 for(const changed of [
  {...log,scope:'OTHER_WORKSPACE'},
  {...log,rows:[{...log.rows[0],id:other}]}
 ]){
  const denied=renderTimeTrackerMainGroup({...opts,projection:changed,
   boardColumns:columns,boardValues:values});
  assert.doesNotMatch(denied,/Verified HR employee|SHOULD_NOT_LEAK/);
 }
});

test('no stale GPS fallback, group-specific replacement and existing 11 boards remain untouched',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const module=readFileSync('frontend/time-tracker-main-group.js','utf8');
 const css=readFileSync('frontend/time-tracker-main-group.css','utf8');
 assert.match(app,/moduleKey==='timetracker'&&String\(g\.title\|\|'\'\)\.trim\(\)\.toLowerCase\(\)==='main group'/);
 assert.match(app,/renderTimeTrackerMainGroup\(/);
 assert.match(app,/loadTimeTrackerBoardGps\(/);
 assert.match(app,/timeTracker\.snapshot\(boardId\)/);
 assert.match(app,/if\(!sameSession\(\)\)return/);
 assert.match(app,/state\.ttBoardAttendance=tab==='items'\?\{status:'LOADING'\}:null/);
 assert.match(app,/status:'VERIFIED_LOG'/);
 assert.match(app,/moduleByBoardName\(b\.name\)\?boardGrid/);
 assert.doesNotMatch(module,/work_board_item_values|fetch\(|localStorage|service_role|gpsEvidence\(/);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|overflow-y:\s*auto/);
});
