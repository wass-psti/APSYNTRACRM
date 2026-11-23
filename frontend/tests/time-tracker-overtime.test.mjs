import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeTrackerOtWeek,timeTrackerOtWeekOffsetForDate,overtimeDurationMinutes,
 validateOvertimeDraft,validateManualOvertimeDraft,timeTrackerOtMetrics,
 renderTimeTrackerOvertime,TT_OT_WRITES_ACCEPTED}
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
 assert.throws(()=>timeTrackerOtWeek(5201,now),/Invalid OT week/);
 assert.ok(timeTrackerOtWeekOffsetForDate('2025-01-01',now)<0);
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
test('manual OT accepts historical dates and rejects future or unelapsed work',()=>{
 const directory=[{id:worker,status:'active'}];
 const past={employeeId:worker,date:'2025-01-02',start:'18:00',end:'20:00',
  reason:'Emergency preparation overtime entered by an administrator'};
 assert.equal(validateManualOvertimeDraft(past,directory,now).valid,true);
 assert.equal(validateManualOvertimeDraft({...past,date:'2026-11-03'},directory,now).valid,false);
 assert.equal(validateManualOvertimeDraft({...past,date:'2026-11-02',start:'14:00',end:'15:00'},directory,now).valid,true);
 assert.equal(validateManualOvertimeDraft({...past,date:'2026-11-02',start:'16:00',end:'17:00'},directory,now).valid,false);
 assert.equal(validateManualOvertimeDraft({...past,employeeId:'not-in-directory'},directory,now).valid,false);
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
 assert.equal(TT_OT_WRITES_ACCEPTED,true);
});
function setup({role='System Admin',snapshot=null,rpcHandlers={}}={}){
 const auth={userId:admin,getVerifiedUser:async()=>({id:admin})};
 const api={
  context:async()=>({user_id:admin,workspace_id:workspace,
   profile:{status:'active',platform_role:'admin_general_manager'}}),
  nativeApplicationBoardContext:async moduleId=>({
   contract:'native-app-board-v1',moduleId,userId:admin,workspaceId:workspace,role,
   board:{id:board,workspace_id:workspace,name:'TimeTracker Attendance',status:'active',
    description:'[APSYNTRA:MODULE:timetracker:v1]',archived_at:null,trashed_at:null}
  }),
  board:async()=>({board:{id:board,name:'TimeTracker Attendance',workspace_id:workspace}}),
  allowed:async()=>true,
  rpc:async(name,args)=>{
   if(Object.hasOwn(rpcHandlers,name))return typeof rpcHandlers[name]==='function'?rpcHandlers[name](args):rpcHandlers[name];
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
test('production-accepted OT controls activate only with signed OT contract',()=>{
 const user=renderTimeTrackerOvertime({requests:rows,
  access:{bootstrapApprover:false,otContractActive:true},modalOpen:true,now});
 assert.doesNotMatch(user,/type="submit" disabled/);
 assert.doesNotMatch(user,/tt-ot-review-actions/);
 const bootstrap=renderTimeTrackerOvertime({requests:rows,
  access:{bootstrapApprover:true,otContractActive:true},modalOpen:true,now});
 assert.match(bootstrap,/tt-ot-review-actions/);
 assert.doesNotMatch(bootstrap,/data-action="tt-ot-approve"[^>]* disabled/);
 assert.doesNotMatch(bootstrap,/type="submit" disabled/);
 const absent=renderTimeTrackerOvertime({requests:rows,
  access:{bootstrapApprover:true,otContractActive:false},modalOpen:true,now});
 assert.match(absent,/type="submit" disabled/);
 assert.match(absent,/data-action="tt-ot-approve"[^>]* disabled/);
});

test('dedicated server OT snapshot accepts only matching signed workspace and bootstrap scope',async()=>{
 const valid={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:true,manualOtManager:false,rows};
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
test('legacy signed OT snapshots remain readable before the manual-OT migration is activated',async()=>{
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'OWN_OT_ONLY',bootstrapApprover:false,rows:[]};
 const result=await setup({role:'Employee',snapshot}).snapshot(board);
 assert.equal(result.access.otContractActive,true);
 assert.equal(result.access.manualOtManager,false);
 assert.deepEqual(result.otRequests,[]);
});

test('System Admin sees manual OT controls and manual-only review actions',()=>{
 const manualRow={...rows[0],id:'manual-row',submissionSource:'manual_admin',
  submittedBy:admin,submittedByName:'Administrator'};
 const regularRow={...rows[0],id:'regular-row',submissionSource:'employee'};
 const access={userId:admin,moduleRole:'System Admin',manualOtManager:true,
  bootstrapApprover:false,otContractActive:true,overviewDirectory:[
   {id:admin,status:'active',display_name:'Administrator'},
   {id:worker,status:'active',display_name:'Worker One'}]};
 const html=renderTimeTrackerOvertime({requests:[manualRow,regularRow],access,now});
 assert.match(html,/Manual OT Submission/);
 assert.match(html,/tt-ot-manual-employee/);
 assert.match(html,/Submit Manual OT/);
 assert.match(html,/Manual Entry/);
 assert.match(html,/Entered by Administrator/);
 assert.equal((html.match(/data-action="tt-ot-approve"/g)||[]).length,1);
 const employee=renderTimeTrackerOvertime({requests:[manualRow],
  access:{userId:worker,moduleRole:'Employee',manualOtManager:false,otContractActive:true},now});
 assert.match(employee,/Manual OT Submission/);
 assert.match(employee,/READ-ONLY RECORDS/);
 assert.match(employee,/Read-only view/);
 assert.match(employee,/Worker One/);
 assert.match(employee,/Emergency preparation/);
 assert.doesNotMatch(employee,/tt-ot-manual-form/);
 assert.doesNotMatch(employee,/tt-ot-review-actions/);
});

test('signed manual OT RPC verifies employee owner and administrator submitter',async()=>{
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'OWN_OT_ONLY',bootstrapApprover:false,manualOtManager:true,rows:[]};
 const receipt={id:'50000000-0000-4000-8000-000000000001',workspaceId:workspace,
  ownerId:'cloud:'+worker,submittedBy:admin,submissionSource:'manual_admin',status:'Submitted'};
 let rpcArgs=null;
 const client=setup({role:'System Admin',snapshot,rpcHandlers:{
  timetracker_ot_submit_manual:args=>(rpcArgs=args,receipt)
 }});
 const result=await client.submitManualOvertime(board,{
  employeeId:worker,date:'2025-11-02',start:'18:00',end:'20:00',
  reason:'Emergency preparation overtime entered by an administrator'
 });
 assert.equal(result.id,receipt.id);
 assert.equal(rpcArgs.p_owner_id,worker);
 assert.equal(rpcArgs.p_date,'2025-11-02');
 await assert.rejects(()=>setup({role:'Employee',snapshot:{...snapshot,
  scope:'OWN_OT_ONLY',manualOtManager:false}}).submitManualOvertime(board,{
   employeeId:worker,date:'2025-11-02',start:'18:00',end:'20:00',
   reason:'Emergency preparation overtime entered by an administrator'
  }),/System Admin manual OT submission is unavailable/);
});

test('System Admin may decide manual OT but not regular employee OT',async()=>{
 const manual={...rows[0],id:'50000000-0000-4000-8000-000000000002',
  date:'2025-11-02',submissionSource:'manual_admin'};
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'OWN_OT_ONLY',bootstrapApprover:false,manualOtManager:true,rows:[manual]};
 const client=setup({role:'System Admin',snapshot,rpcHandlers:{
  timetracker_ot_decide:{id:manual.id,workspaceId:workspace,status:'Approved',decidedBy:admin,submissionSource:'manual_admin'}
 }});
 const receipt=await client.decideOvertime(board,manual.id,'Approved');
 assert.equal(receipt.status,'Approved');
 const regular={...manual,id:'50000000-0000-4000-8000-000000000003',submissionSource:'employee'};
 await assert.rejects(()=>setup({role:'System Admin',snapshot:{...snapshot,rows:[regular]}})
  .decideOvertime(board,regular.id,'Approved'),/target unavailable or already reviewed/);
});

test('SQL server contract is staged and enforces bootstrap decision gate and audit',()=>{
 const sql=readFileSync('sql/cp-tt-ot01-staged-bootstrap-approval.sql','utf8');
 assert.match(sql,/STAGED ONLY/);
 assert.match(sql,/public\.apsyntra_role_is_bootstrap\(\)/);
 assert.match(sql,/public\.timetracker_ot_require_scope/);
 assert.match(sql,/Self-approval is not permitted/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/OT audit is immutable/);
 const migration=readFileSync('supabase/migrations/20261123160000_cp_tt_manual_ot_01_manual_submission_and_scoped_review.sql','utf8');
 assert.match(migration,/timetracker_ot_submit_manual/);
 assert.match(migration,/manualOtManager/);
 assert.doesNotMatch(migration,/UPDATE public\.timetracker_ot_requests\s+SET\s+submitted_by/);
 assert.doesNotMatch(migration,/submitted_by SET NOT NULL/);
 assert.match(migration,/v_source='manual_admin'/);
 const historyMigration=readFileSync('supabase/migrations/20261123170000_cp_tt_hr_ot_all_user_log_01.sql','utf8');
 assert.match(historyMigration,/LEFT JOIN public\.workspace_members wm/);
 assert.match(historyMigration,/r\.submission_source='manual_admin'/);
 assert.match(historyMigration,/timetracker_ot_realtime_broadcast_change/);
 assert.match(historyMigration,/realtime\.send/);
 assert.match(historyMigration,/board-change/);
 assert.match(historyMigration,/OT_'\|\|TG_OP/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/tt-ot-open/);
 assert.match(app,/tt-ot-current/);
 assert.match(app,/tt-ot-manual-form/);
 assert.match(app,/tt-ot-week-jump-form/);
 assert.match(app,/TT_OT_WRITES_ACCEPTED/);
 assert.match(app,/case 'tt-ot-manual-more'/);
 assert.match(app,/ttOtManualVisibleCount/);
});

test('overtime search retains same-status request nodes for immediate query broadening',()=>{
 const m=timeTrackerOtMetrics(rows,{status:'Submitted',search:'emergency'},now);
 assert.equal(m.visible.length,1);
 assert.equal(m.statusRows.length,1);
 const html=renderTimeTrackerOvertime({requests:rows,filters:{status:'Submitted',search:'emergency'},now});
 assert.match(html,/data-search-text="worker one emergency preparation and review 2026-11-02"/);
 assert.match(html,/data-tt-ot-empty hidden/);
});
