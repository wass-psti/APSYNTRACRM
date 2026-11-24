import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 validateTimeTrackerLogPage,mergeTimeTrackerLogPages
} from '../time-tracker-log-pagination.js';

const actor='00000000-0000-4000-8000-000000000001';
const workspace='00000000-0000-4000-8000-000000000002';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const employee='00000000-0000-4000-8000-000000000003';
const intern='00000000-0000-4000-8000-000000000004';
const recordOne='00000000-0000-4000-8000-000000000010';
const recordTwo='00000000-0000-4000-8000-000000000011';
const older='2026-11-22T08:00:00.000Z';
const newer='2026-11-23T08:00:00.000Z';
const summary={
 sessions:67,people:12,today:4,historical:63,completed:62,active:5,late:8,
 creditedMs:90000000,todayOnTime:2,todayLate:1,todayActive:1,todayStagnant:0,
 todayOffice:3,todayCompleted:3,todayCreditedMs:12000000,
 locationCounts:[{location:'Office-Base Duty',count:50},{location:'Offsite (Home)',count:17}]
};
const standard={
 id:recordTwo,recordId:recordTwo,sourceRank:0,ownerId:'cloud:'+employee,
 name:'Employee One',clockIn:newer,clockOut:null,department:'Engineering',
 location:'Office-Base Duty',status:'Active',classification:'Late',
 workNote:null,creditedMs:null,isOjt:false,revision:4
};
const ojt={
 id:'ojt:'+recordOne,recordId:recordOne,sourceRank:1,ownerId:'ojt:'+intern,
 name:'Intern One',clockIn:older,clockOut:'2026-11-22T17:00:00.000Z',
 department:'OJT',location:'Offsite (Home)',status:'Completed',
 classification:'On time',workNote:'Field work',creditedMs:28800000,
 isOjt:true,revision:2
};
const access={userId:actor,workspaceId:workspace,boardId:board,moduleRole:'System Admin'};
const payload=(overrides={})=>({
 mode:'ACTIVE',contract:'tt-attendance-log-page-1',actorId:actor,
 workspaceId:workspace,boardId:board,scope:'AUTHORIZED_WORKSPACE_TEAM',
 records:[standard,ojt],hasMore:true,
 nextCursor:{clockIn:older,sourceRank:1,recordId:recordOne,
  sourceRevision:4,ojtRevision:3},
 sourceRevision:4,ojtRevision:3,
 pageSize:2,summary,...overrides
});

test('validates a stable, bounded mixed standard and OJT page',()=>{
 const page=validateTimeTrackerLogPage(payload(),{access,boardId:board,pageSize:2});
 assert.equal(page.records.length,2);
 assert.equal(page.records[0].id,recordTwo);
 assert.equal(page.records[1].id,'ojt:'+recordOne);
 assert.equal(page.hasMore,true);
 assert.equal(page.nextCursor.recordId,recordOne);
 assert.equal(page.summary.sessions,67);
 assert.equal(page.summary.locationCounts.length,2);
});

test('rejects identity or visibility-scope mismatches',()=>{
 assert.throws(()=>validateTimeTrackerLogPage(payload({actorId:employee}),
  {access,boardId:board,pageSize:2}),/identity, contract or source revision/);
 assert.throws(()=>validateTimeTrackerLogPage(payload({scope:'OWN_ATTENDANCE_ONLY'}),
  {access,boardId:board,pageSize:2}),/visibility scope/);
});

test('rejects duplicate, malformed, out-of-order and GPS-bearing records',()=>{
 assert.throws(()=>validateTimeTrackerLogPage(payload({records:[standard,standard]}),
  {access,boardId:board,pageSize:2}),/invalid or duplicate/);
 assert.throws(()=>validateTimeTrackerLogPage(payload({records:[ojt,standard]}),
  {access,boardId:board,pageSize:2}),/stable chronological order/);
 assert.throws(()=>validateTimeTrackerLogPage(payload({records:[{...standard,latitude:10},ojt]}),
  {access,boardId:board,pageSize:2}),/invalid or duplicate/);
 assert.throws(()=>validateTimeTrackerLogPage(payload({records:[{...standard,geo:{latitude:10}},ojt]}),
  {access,boardId:board,pageSize:2}),/invalid or duplicate/);
});

test('requires the cursor to identify the last visible record',()=>{
 assert.throws(()=>validateTimeTrackerLogPage(payload({
  nextCursor:{clockIn:newer,sourceRank:0,recordId:recordTwo,
   sourceRevision:4,ojtRevision:3}
 }),{access,boardId:board,pageSize:2}),/does not match the final row/);
 assert.throws(()=>validateTimeTrackerLogPage(payload({
  nextCursor:{clockIn:older,sourceRank:1,recordId:recordOne,
   sourceRevision:5,ojtRevision:3}
 }),{access,boardId:board,pageSize:2}),/next cursor is invalid/);
 assert.throws(()=>validateTimeTrackerLogPage(payload({hasMore:false}),
  {access,boardId:board,pageSize:2}),/unexpected cursor/);
});

test('accepts a final page without a cursor',()=>{
 const final=validateTimeTrackerLogPage(payload({
  records:[standard],hasMore:false,nextCursor:null,pageSize:2
 }),{access,boardId:board,pageSize:2});
 assert.equal(final.hasMore,false);
 assert.equal(final.nextCursor,null);
});

test('merges appended pages without replacing or duplicating existing rows',()=>{
 const updated={...standard,name:'Updated name'};
 const result=mergeTimeTrackerLogPages([standard,ojt],[updated,{...ojt},{
  ...standard,id:employee,recordId:employee
 }]);
 assert.equal(result.length,3);
 assert.equal(result[0],standard);
 assert.equal(result[0].name,'Employee One');
 assert.equal(result[1],ojt);
 assert.equal(result[2].id,employee);
});


test('later pages reuse the first-page aggregate without recomputing it',()=>{
 const page=validateTimeTrackerLogPage(payload({summary:null}),{
  access,boardId:board,pageSize:2,summaryFallback:summary
 });
 assert.equal(page.summary.sessions,67);
 assert.equal(page.summary.today,4);
});


test('pagination uses server keyset predicates and keeps aggregate search aligned with page filters',()=>{
 const migration=readFileSync('supabase/migrations/20261124110000_cp_tt_log_progressive_pagination_01.sql','utf8');
 const summary=migration.slice(migration.indexOf('IF v_include_summary THEN'),
  migration.indexOf("IF v_sort='newest' THEN"));
 const pages=migration.slice(migration.indexOf("IF v_sort='newest' THEN"));
 assert.match(migration,/tt_attendance_log_page_idx/);
 assert.match(migration,/tt_ojt_attendance_log_page_idx/);
 assert.ok(migration.includes("'moduleRole',v_role"));
 assert.ok(migration.includes("v_role:=public.module_role_for('time-tracker',v_actor)"));
 assert.ok(migration.includes('v_cursor_source_revision IS DISTINCT FROM v_source_revision'));
 assert.ok(migration.includes("'mode','STALE_SNAPSHOT'"));
 assert.ok(migration.includes("'sourceRevision',v_source_revision"));
 assert.ok(migration.includes("'ojtRevision',v_ojt_revision"));
 assert.ok(pages.includes('LIMIT v_page_size+1'));
 assert.ok(pages.includes('(p.clock_in_at,0,p.record_id)<(v_cursor_at,v_cursor_rank,v_cursor_id)'));
 assert.ok(pages.includes('(p.clock_in_at,0,p.record_id)>(v_cursor_at,v_cursor_rank,v_cursor_id)'));
 assert.ok(summary.includes("ILIKE '%'||v_search||'%'"));
 assert.ok(summary.includes('p.record_id=v_record_id'));
 assert.ok(summary.includes('a.id=v_record_id'));
 assert.ok(summary.includes('AND p_employee_id IS NULL'));
});

test('Load More resets instead of using a stale cursor while search debounce is pending',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf("case 'tt-log-load-more':{");
 const end=app.indexOf("case 'tt-employees-refresh':",start);
 const action=app.slice(start,end);
 assert.ok(action.includes('const pendingSearch=Boolean(state.ttLogSearchTimer)'));
 assert.ok(action.includes('clearTimeout(state.ttLogSearchTimer)'));
 assert.ok(action.includes('const initial=pendingSearch||state.ttLogPageRetryReset||'));
 assert.ok(action.includes('loadTimeTrackerLogPage(routeSerial,{reset:initial})'));
});
