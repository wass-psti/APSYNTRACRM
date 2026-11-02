import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeTrackerOtWeek,overtimeDurationMinutes,validateOvertimeDraft,
 timeTrackerOtMetrics,renderTimeTrackerOvertime,TT_OT_WRITES_ACCEPTED}
 from '../time-tracker-overtime.js';
import {TimeTrackerNativeClient} from '../time-tracker-native.js';

const now=new Date('2026-11-02T08:00:00Z');
const admin='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const worker='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
const workspace='00000000-0000-4000-8000-000000000001';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const rows=[
 {id:'one',ownerId:'cloud:'+worker,name:'Worker One',date:'2026-11-02',
  status:'Submitted',start:'18:00',end:'20:00',durationMinutes:120,
  task:'Emergency preparation and review'},
 {id:'two',ownerId:'cloud:'+worker,name:'Worker One',date:'2026-11-02',
  status:'Approved',start:'18:00',end:'20:00',durationMinutes:120,
  task:'Additional site inspection'}
];
test('Philippine Time week boundaries and offset navigation',()=>{
 const week=timeTrackerOtWeek(0,now);
 assert.equal(week.start,'2026-11-01');
 assert.equal(week.end,'2026-11-07');
 assert.equal(timeTrackerOtWeek(-1,now).start,'2026-10-25');
 assert.throws(()=>timeTrackerOtWeek(105,now),/Invalid OT week/);
});
test('duration and reason enforce same-day maximum six-hour contract',()=>{
 assert.equal(overtimeDurationMinutes('18:00','20:00'),120);
 assert.equal(overtimeDurationMinutes('18:00','01:00'),null);
 assert.equal(overtimeDurationMinutes('08:00','15:00'),null);
 assert.equal(overtimeDurationMinutes('25:00','26:00'),null);
 assert.equal(validateOvertimeDraft({date:'2026-11-02',start:'18:00',
  end:'20:00',reason:'Necessary emergency maintenance work'},now).valid,true);
 assert.equal(validateOvertimeDraft({date:'2026-11-02',start:'18:00',
  end:'20:00',reason:'too short'},now).valid,false);
});
test('metrics reflect actual authorized rows and not screenshot demo numbers',()=>{
 const m=timeTrackerOtMetrics(rows,{},now);
 assert.equal(m.all.length,2);
 assert.equal(m.submitted,1);
 assert.equal(m.approved,1);
 assert.equal(m.approvedMinutes,120);
 assert.equal(m.approvalRate,100);
 assert.equal(m.visible.length,1);
 assert.equal(timeTrackerOtMetrics(rows,{status:'Approved'},now).visible.length,1);
 assert.equal(timeTrackerOtMetrics(rows,{search:'not in OT'},now).visible.length,0);
});
test('staged modal is visible but submission and ordinary approvals fail closed',()=>{
 const employee=renderTimeTrackerOvertime({
  requests:rows,access:{bootstrapApprover:false},modalOpen:true,now});
 for(const text of ['Overtime','OT BY DAY','TOP REQUESTORS','Pending',
  'Approved','Rejected','Submit Overtime Request','DURATION'])
  assert.ok(employee.includes(text),text);
 assert.match(employee,/type="submit" disabled/);
 assert.doesNotMatch(employee,/tt-ot-review-actions/);
 const bootstrap=renderTimeTrackerOvertime({
  requests:rows,access:{bootstrapApprover:true},now});
 assert.match(bootstrap,/tt-ot-review-actions/);
 assert.match(bootstrap,/Approve<\/button>/);
 assert.match(bootstrap,/data-action="tt-ot-approve"[^>]* disabled/);
 assert.equal(TT_OT_WRITES_ACCEPTED,false);
});
function setup({role='System Admin',snapshot=null}={}){
 const auth={userId:admin,getVerifiedUser:async()=>({id:admin})};
 const api={
  context:async()=>({user_id:admin,workspace_id:workspace,
   profile:{status:'active',platform_role:'admin_general_manager'}}),
  board:async()=>({board:{id:board,name:'TimeTracker Attendance',workspace_id:workspace}}),
  allowed:async()=>true,
  rpc:async(name)=>{
   if(name==='has_module_access')return true;
   if(name==='list_module_directory')return [
    {id:admin,status:'active',module_role:role,display_name:'Administrator'},
    {id:worker,status:'active',module_role:'Employee',display_name:'Worker One'}];
   if(name==='list_module_state')return [];
   if(name==='timetracker_ot_snapshot'){
    if(snapshot===null)throw Error('PGRST202: Could not find the function');
    return snapshot;
   }
   throw Error('Unexpected RPC '+name);
  }
 };
 return new TimeTrackerNativeClient({auth,api});
}
test('dedicated server OT snapshot accepts only matching signed workspace and bootstrap scope',async()=>{
 const valid={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:true,rows};
 const result=await setup({snapshot:valid}).snapshot(board);
 assert.equal(result.otRequests.length,2);
 assert.equal(result.access.bootstrapApprover,true);
 assert.equal(result.access.otContractActive,true);
 await assert.rejects(()=>setup({snapshot:{...valid,workspaceId:
  '00000000-0000-4000-8000-000000000002'}}).snapshot(board),/mismatch/);
 await assert.rejects(()=>setup({snapshot:{...valid,bootstrapApprover:false}}).snapshot(board),
  /bootstrap-authorized/);
 const missing=await setup().snapshot(board);
 assert.deepEqual(missing.otRequests,[]);
 assert.equal(missing.access.otContractActive,false);
});
test('SQL server contract is staged and enforces bootstrap decision gate and audit',()=>{
 const sql=readFileSync('sql/cp-tt-ot01-staged-bootstrap-approval.sql','utf8');
 assert.match(sql,/STAGED ONLY/);
 assert.match(sql,/public\.apsyntra_role_is_bootstrap\(\)/);
 assert.match(sql,/public\.timetracker_ot_require_scope/);
 assert.match(sql,/Self-approval is not permitted/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/OT audit is immutable/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/tt-ot-open/);
 assert.match(app,/tt-ot-current/);
 assert.match(app,/TT_OT_WRITES_ACCEPTED/);
});
