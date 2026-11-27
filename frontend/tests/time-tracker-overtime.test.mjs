import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeTrackerOtWeek,timeTrackerOtWeekOffsetForDate,overtimeDurationMinutes,
 validateOvertimeDraft,validateDurationOvertimeDraft,validateManualOvertimeDraft,
 validateManualDurationOvertimeDraft,timeTrackerOtMetrics,
 renderTimeTrackerOvertime,timeTrackerOtDurationLabel,updateTimeTrackerOvertimePreview,
 updateTimeTrackerManualOtPreview,TT_OT_WRITES_ACCEPTED}
 from '../time-tracker-overtime.js';
import {TimeTrackerNativeClient} from '../time-tracker-native.js';

const now=new Date('2026-11-02T08:00:00Z');
const admin='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const worker='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
const workspace='00000000-0000-4000-8000-000000000001';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const rows=[
 {id:'one',ownerId:'cloud:'+worker,name:'Worker One',date:'2026-11-02',
  status:'Submitted',start:'18:00',end:'20:00',otPolicy:'legacy-range',canReviewOt:false,durationMinutes:120,
  task:'Emergency preparation and review'},
 {id:'two',ownerId:'cloud:'+worker,name:'Worker One',date:'2026-11-02',
  status:'Approved',start:'18:00',end:'20:00',otPolicy:'legacy-range',canReviewOt:false,durationMinutes:120,
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
test('manual OT accepts historical dates using duration only',()=>{
 const directory=[{id:worker,status:'active'}];
 const past={employeeId:worker,date:'2025-01-02',durationMinutes:120,
  reason:'Emergency preparation overtime entered by an administrator'};
 assert.equal(validateManualDurationOvertimeDraft(past,directory,now).valid,true);
 assert.equal(validateManualDurationOvertimeDraft({...past,date:'2026-11-02'},directory,now).valid,false);
 assert.equal(validateManualDurationOvertimeDraft({...past,date:'2026-11-03'},directory,now).valid,false);
 assert.equal(validateManualDurationOvertimeDraft({...past,durationMinutes:29},directory,now).valid,false);
 assert.equal(validateManualDurationOvertimeDraft({...past,durationMinutes:45},directory,now).valid,false);
 assert.equal(validateManualDurationOvertimeDraft({...past,durationMinutes:361},directory,now).valid,false);
 assert.equal(validateManualDurationOvertimeDraft({...past,employeeId:'not-in-directory'},directory,now).valid,false);
});

test('metrics reflect actual authorized rows and not screenshot demo numbers',()=>{
 const m=timeTrackerOtMetrics(rows,{},now);
 assert.equal(m.all.length,2);
 assert.equal(m.submitted,1);
 assert.equal(m.approved,1);
 assert.equal(m.approvedMinutes,120);
 assert.equal(m.approvalRate,100);
 assert.equal(m.visible.length,2);
 assert.equal(timeTrackerOtMetrics(rows,{status:'Approved'},now).visible.length,1);
 assert.equal(timeTrackerOtMetrics(rows,{search:'not in OT'},now).visible.length,0);
});
test('staged duration-only modal remains read-only until the signed duration contract is active',()=>{
 const employee=renderTimeTrackerOvertime({
  requests:rows,access:{bootstrapApprover:false,otContractActive:true,durationOtContractActive:false},
  modalOpen:true,now});
 assert.match(employee,/id="tt-ot-duration-hours"/);
 assert.doesNotMatch(employee,/id="tt-ot-(start|end)"/);
 assert.match(employee,/type="submit" disabled/);
 assert.doesNotMatch(employee,/tt-ot-review-actions/);
 const bootstrap=renderTimeTrackerOvertime({
  requests:[{...rows[0],canReviewOt:true}],
  access:{bootstrapApprover:true,otContractActive:true,durationOtContractActive:true},modalOpen:true,now});
 assert.match(bootstrap,/tt-ot-review-actions/);
 assert.match(bootstrap,/Approve<\/button>/);
 assert.doesNotMatch(bootstrap,/type="submit" disabled/);
 assert.equal(TT_OT_WRITES_ACCEPTED,true);
});
function setup({role='System Admin',snapshot=null,rpcHandlers={},platformRole=role==='Employee'?'employee':'admin_general_manager'}={}){
 const auth={userId:admin,getVerifiedUser:async()=>({id:admin})};
 const api={
  context:async()=>({user_id:admin,workspace_id:workspace,
   profile:{status:'active',platform_role:platformRole}}),
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
test('duration-only OT controls activate only with the signed duration contract',()=>{
 const user=renderTimeTrackerOvertime({requests:rows,
  access:{bootstrapApprover:false,otContractActive:true,durationOtContractActive:true},
  modalOpen:true,now});
 assert.doesNotMatch(user,/type="submit" disabled/);
 assert.match(user,/id="tt-ot-duration-hours"/);
 assert.doesNotMatch(user,/tt-ot-review-actions/);
 const bootstrap=renderTimeTrackerOvertime({requests:[{...rows[0],canReviewOt:true}],
  access:{bootstrapApprover:true,otContractActive:true,durationOtContractActive:true},
  modalOpen:true,now});
 assert.match(bootstrap,/tt-ot-review-actions/);
 assert.doesNotMatch(bootstrap,/data-action="tt-ot-approve"[^>]* disabled/);
 const absent=renderTimeTrackerOvertime({requests:rows,
  access:{bootstrapApprover:true,otContractActive:true,durationOtContractActive:false},
  modalOpen:true,now});
 assert.match(absent,/type="submit" disabled/);
});
test('signed OT snapshot accepts workspace-authorized HR, System Admin and bootstrap scopes',async()=>{
 const reviewRows=[{...rows[0],canReviewOt:true}];
 const valid={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:false,manualOtManager:false,
  durationOtContract:'tt-duration-ot-1',durationOtHrApprover:true,durationOtApprover:true,rows:reviewRows};
 const hr=await setup({role:'HR',snapshot:valid}).snapshot(board);
 assert.equal(hr.otRequests.length,1);
 assert.equal(hr.access.durationOtApprover,true);
 assert.equal(hr.otRequests[0].canReviewOt,true);
 const systemAdmin=await setup({role:'System Admin',snapshot:{...valid,durationOtHrApprover:false}}).snapshot(board);
 assert.equal(systemAdmin.access.durationOtApprover,true);
 assert.equal(systemAdmin.otRequests[0].canReviewOt,true);
 const bootstrap=await setup({role:'System Admin',snapshot:{...valid,bootstrapApprover:true,
  durationOtApprover:false,durationOtHrApprover:false}}).snapshot(board);
 assert.equal(bootstrap.access.bootstrapApprover,true);
 assert.equal(bootstrap.otRequests.length,1);
 await assert.rejects(()=>setup({role:'Employee',snapshot:valid}).snapshot(board),
  /approver role does not match/);
 await assert.rejects(()=>setup({role:'HR',snapshot:{...valid,workspaceId:
  '00000000-0000-4000-8000-000000000002'}}).snapshot(board),/mismatch/);
 await assert.rejects(()=>setup({role:'Employee',snapshot:{...valid,durationOtApprover:false}}).snapshot(board),
  /Team OT access is not authorized/);
});
test('legacy signed OT snapshots remain readable before the manual-OT migration is activated',async()=>{
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'OWN_OT_ONLY',bootstrapApprover:false,rows:[]};
 const result=await setup({role:'Employee',snapshot}).snapshot(board);
 assert.equal(result.access.otContractActive,true);
 assert.equal(result.access.manualOtManager,false);
 assert.deepEqual(result.otRequests,[]);
});

test('System Admin sees hours-only manual OT controls and review actions only for signed pending requests',()=>{
 const manualRow={...rows[0],id:'manual-row',submissionSource:'manual_admin',
  otPolicy:'manual-duration-v1',canReviewOt:true,submittedBy:admin,submittedByName:'Administrator'};
 const regularRow={...rows[0],id:'regular-row',submissionSource:'employee',
  otPolicy:'duration-v1',canReviewOt:false};
 const access={userId:admin,moduleRole:'System Admin',manualOtManager:true,
  otContractActive:true,durationOtContractActive:true,overviewDirectory:[
   {id:admin,status:'active',display_name:'Administrator'},
   {id:worker,status:'active',display_name:'Worker One'}]};
 const html=renderTimeTrackerOvertime({requests:[manualRow,regularRow],access,now,modalOpen:'manual'});
 assert.match(html,/File Overtime/);
 assert.match(html,/tt-ot-manual-employee/);
 assert.match(html,/ADMINISTRATIVE ENTRY/);
 assert.match(html,/Manual Entry/);
 assert.match(html,/Entered by Administrator/);
 assert.match(html,/id="tt-ot-manual-duration-hours"/);
 assert.doesNotMatch(html,/id="tt-ot-manual-(start|end)"/);
 assert.equal((html.match(/data-action="tt-ot-approve"/g)||[]).length,1);
 const platformAdmin=renderTimeTrackerOvertime({requests:[],access:{
  ...access,moduleRole:'Employee',manualOtManager:true},now,modalOpen:'manual'});
 assert.match(platformAdmin,/tt-ot-manual-form/);
 const employee=renderTimeTrackerOvertime({requests:[{...manualRow,canReviewOt:false}],
  access:{userId:worker,moduleRole:'Employee',manualOtManager:false,otContractActive:true},now});
 assert.match(employee,/File Overtime/);
 assert.doesNotMatch(employee,/tt-ot-manual-open/);
 assert.match(employee,/Worker One/);
 assert.doesNotMatch(employee,/tt-ot-manual-form/);
 assert.doesNotMatch(employee,/tt-ot-review-actions/);
});
test('signed manual duration OT RPC verifies employee owner and administrator submitter',async()=>{
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'OWN_OT_ONLY',bootstrapApprover:false,manualOtManager:true,
  durationOtContract:'tt-duration-ot-1',durationOtApprover:true,rows:[]};
 const receipt={id:'50000000-0000-4000-8000-000000000001',workspaceId:workspace,
  ownerId:'cloud:'+worker,submittedBy:admin,submissionSource:'manual_admin',
  status:'Submitted',otPolicy:'manual-duration-v1',durationMinutes:120};
 let rpcArgs=null;
 const client=setup({role:'System Admin',snapshot,rpcHandlers:{
  timetracker_ot_submit_manual_duration:args=>(rpcArgs=args,receipt)
 }});
 const result=await client.submitManualOvertime(board,{
  employeeId:worker,date:'2025-11-02',durationMinutes:120,
  reason:'Emergency preparation overtime entered by an administrator'
 });
 assert.equal(result.id,receipt.id);
 assert.equal(rpcArgs.p_owner_id,worker);
 assert.equal(rpcArgs.p_date,'2025-11-02');
 assert.equal(rpcArgs.p_duration_minutes,120);
 assert.equal('p_start' in rpcArgs,false);
 assert.equal('p_end' in rpcArgs,false);
 await assert.rejects(()=>setup({role:'Employee',snapshot:{...snapshot,
  scope:'OWN_OT_ONLY',manualOtManager:false,durationOtApprover:false}}).submitManualOvertime(board,{
   employeeId:worker,date:'2025-11-02',durationMinutes:120,
   reason:'Emergency preparation overtime entered by an administrator'
  }),/manual duration OT submission is unavailable/);
});
test('System Admin may decide employee duration and manual duration OT without self-review',async()=>{
 const manual={...rows[0],id:'50000000-0000-4000-8000-000000000002',
  date:'2025-11-02',submissionSource:'manual_admin',otPolicy:'manual-duration-v1',
  canReviewOt:true};
 const duration={...rows[0],id:'50000000-0000-4000-8000-000000000003',
  date:'2025-11-02',submissionSource:'employee',otPolicy:'duration-v1',canReviewOt:true};
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:false,manualOtManager:true,
  durationOtContract:'tt-duration-ot-1',durationOtApprover:true,rows:[manual,duration]};
 const client=setup({role:'System Admin',snapshot,rpcHandlers:{
  timetracker_ot_decide_manual_duration:{id:manual.id,workspaceId:workspace,status:'Approved',
   decidedBy:admin,submissionSource:'manual_admin',otPolicy:'manual-duration-v1'},
  timetracker_ot_decide_duration:{id:duration.id,workspaceId:workspace,status:'Approved',
   decidedBy:admin,otPolicy:'duration-v1'}
 }});
 assert.equal((await client.decideOvertime(board,manual.id,'Approved')).status,'Approved');
 assert.equal((await client.decideOvertime(board,duration.id,'Approved')).status,'Approved');
 const own={...duration,id:'50000000-0000-4000-8000-000000000004',
  ownerId:'cloud:'+admin,canReviewOt:false};
 const ownClient=setup({role:'System Admin',snapshot:{...snapshot,rows:[own]}});
 await assert.rejects(()=>ownClient.decideOvertime(board,own.id,'Approved'),
  /target is unavailable or outside the signed review scope/);
});
test('SQL server contract is staged and enforces bootstrap decision gate and audit',()=>{
 const sql=readFileSync('sql/cp-tt-ot01-staged-bootstrap-approval.sql','utf8');
 assert.match(sql,/STAGED ONLY/);
 assert.match(sql,/public\.apsyntra_role_is_bootstrap\(\)/);
 assert.match(sql,/public\.timetracker_ot_require_scope/);
 assert.doesNotMatch(sql,/Self-approval is not permitted/);
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

test('bootstrap self review forward migration preserves System Admin scope and audit',()=>{
 const sql=readFileSync('supabase/migrations/20261123180000_cp_tt_bootstrap_ot_self_review_01.sql','utf8');
 assert.match(sql,/IF v_owner=v_actor AND NOT v_bootstrap THEN/);
 assert.match(sql,/v_bootstrap OR r\.submission_source='manual_admin'/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/status='Submitted'/);
 assert.match(sql,/timetracker_ot_audit/);
 assert.match(sql,/v_source='manual_admin'/);
 assert.match(sql,/decided_at=clock_timestamp\(\)/);
 assert.doesNotMatch(sql,/gradient descent|backpropagation|training loop/i);
});

test('Bootstrap receives self-review controls for every OT policy while System Admin self-review stays denied',()=>{
 const selfRows=[
  {...rows[0],id:'50000000-0000-4000-8000-000000000041',ownerId:'cloud:'+admin,
   otPolicy:'legacy-range',submissionSource:'employee',canReviewOt:true},
  {...rows[0],id:'50000000-0000-4000-8000-000000000042',ownerId:'cloud:'+admin,
   otPolicy:'duration-v1',submissionSource:'employee',canReviewOt:true,canReviewDuration:true},
  {...rows[0],id:'50000000-0000-4000-8000-000000000043',ownerId:'cloud:'+admin,
   otPolicy:'manual-duration-v1',submissionSource:'manual_admin',canReviewOt:true,canReviewDuration:true}
 ];
 const bootstrap=renderTimeTrackerOvertime({requests:selfRows,
  access:{userId:admin,bootstrapApprover:true,otContractActive:true},now});
 assert.equal((bootstrap.match(/data-action="tt-ot-approve"/g)||[]).length,3);
 assert.equal((bootstrap.match(/data-action="tt-ot-reject"/g)||[]).length,3);
 const manual={...selfRows[2],canReviewOt:false};
 const systemAdmin=renderTimeTrackerOvertime({requests:[manual],
  access:{userId:admin,moduleRole:'System Admin',manualOtManager:true,bootstrapApprover:false,otContractActive:true},now});
 assert.doesNotMatch(systemAdmin,/data-action="tt-ot-approve"/);
 assert.doesNotMatch(systemAdmin,/data-action="tt-ot-reject"/);
});

test('signed bootstrap client decides own legacy, duration and manual-duration OT',async()=>{
 const selfRows=[
  {...rows[0],id:'50000000-0000-4000-8000-000000000042',ownerId:'cloud:'+admin,
   otPolicy:'legacy-range',submissionSource:'employee',canReviewOt:true},
  {...rows[0],id:'50000000-0000-4000-8000-000000000043',ownerId:'cloud:'+admin,
   otPolicy:'duration-v1',submissionSource:'employee',canReviewOt:true,canReviewDuration:true},
  {...rows[0],id:'50000000-0000-4000-8000-000000000044',ownerId:'cloud:'+admin,
   otPolicy:'manual-duration-v1',submissionSource:'manual_admin',canReviewOt:true,canReviewDuration:true}
 ];
 const former={...rows[0],id:'50000000-0000-4000-8000-000000000045',
  ownerId:'cloud:50000000-0000-4000-8000-000000000099',canReviewOt:true};
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:true,manualOtManager:false,rows:[...selfRows,former]};
 const calls=[];
 const receipt=(name,args,extra={})=>{
  calls.push({name,args});
  return {id:args.p_request_id,workspaceId:workspace,status:args.p_decision,
   decidedBy:admin,...extra};
 };
 const client=setup({snapshot,rpcHandlers:{
  timetracker_ot_decide:args=>receipt('timetracker_ot_decide',args,{submissionSource:'employee'}),
  timetracker_ot_decide_duration:args=>receipt('timetracker_ot_decide_duration',args,
   {submissionSource:'employee',otPolicy:'duration-v1'}),
  timetracker_ot_decide_manual_duration:args=>receipt('timetracker_ot_decide_manual_duration',args,
   {submissionSource:'manual_admin',otPolicy:'manual-duration-v1'})
 }});
 const initial=await client.snapshot(board);
 assert.equal(initial.otRequests.length,4,'signed team OT must not depend on active employee directory');
 for(const request of selfRows){
  for(const decision of ['Approved','Rejected']){
   const result=await client.decideOvertime(board,request.id,decision);
   assert.equal(result.status,decision);
   assert.equal(calls.at(-1).args.p_request_id,request.id);
   const expected=request.otPolicy==='duration-v1'?'timetracker_ot_decide_duration':
    request.otPolicy==='manual-duration-v1'?'timetracker_ot_decide_manual_duration':'timetracker_ot_decide';
   assert.equal(calls.at(-1).name,expected);
  }
 }
});


test('employee OT filing collects date, requested hours and reason only',()=>{
 const html=renderTimeTrackerOvertime({
  requests:rows,access:{bootstrapApprover:false,otContractActive:true,durationOtContractActive:true},
  modalOpen:true,now
 });
 assert.match(html,/id="tt-ot-date"/);
 assert.match(html,/id="tt-ot-duration-hours"/);
 assert.match(html,/min="0\.5" max="6" step="0\.5"/);
 assert.match(html,/min="2026-11-02"/);
 assert.match(html,/max="2026-11-09"/);
 assert.doesNotMatch(html,/id="tt-ot-(start|end)"/);
 assert.match(html,/data-tt-ot-duration-progress/);
 assert.match(html,/authorized OT approval queue for System Admin, Admin, or HR review/);
 assert.match(html,/maxlength="500"/);
 assert.match(html,/Provide at least 10 characters/);
});
test('OT duration preview updates hours, progress, reason count and inline validity',()=>{
 const control=value=>({
  value,textContent:'',validationMessage:'',attributes:{},
  setAttribute(name,next){this.attributes[name]=next;},
  removeAttribute(name){delete this.attributes[name];},
  setCustomValidity(message){this.validationMessage=message;}
 });
 const nodes={
  '#tt-ot-duration-hours':control('2'),
  '#tt-ot-reason':control('Emergency maintenance work'),
  '[data-tt-ot-duration-value]':control(''),
  '[data-tt-ot-duration-progress]':control(''),
  '[data-tt-ot-duration-message]':control(''),
  '[data-tt-ot-reason-count]':control('')
 };
 const form={id:'tt-ot-form',querySelector:selector=>nodes[selector]||null};
 assert.equal(updateTimeTrackerOvertimePreview(form),true);
 assert.equal(nodes['[data-tt-ot-duration-value]'].textContent,'2 hr 00 min');
 assert.equal(nodes['[data-tt-ot-duration-progress]'].value,120);
 assert.equal(nodes['[data-tt-ot-duration-message]'].textContent,
  '4 hr 00 min remaining within the 6-hour maximum.');
 assert.equal(nodes['[data-tt-ot-reason-count]'].textContent,'26 / 500');
 assert.equal(nodes['#tt-ot-duration-hours'].validationMessage,'');
 assert.equal(nodes['#tt-ot-reason'].validationMessage,'');
 nodes['#tt-ot-duration-hours'].value='1.25';
 nodes['#tt-ot-reason'].value='Short';
 updateTimeTrackerOvertimePreview(form);
 assert.equal(nodes['[data-tt-ot-duration-value]'].textContent,'—');
 assert.equal(nodes['[data-tt-ot-duration-progress]'].value,0);
 assert.match(nodes['#tt-ot-duration-hours'].validationMessage,/0.5 to 6 hours/);
 assert.match(nodes['#tt-ot-reason'].validationMessage,/at least 10 characters/);
 assert.equal(nodes['[data-tt-ot-reason-count]'].textContent,'5 / 500');
});
test('OT duration labels remain readable and bounded by the existing six-hour rule',()=>{
 assert.equal(timeTrackerOtDurationLabel(30),'30 min');
 assert.equal(timeTrackerOtDurationLabel(120),'2 hr 00 min');
 assert.equal(timeTrackerOtDurationLabel(360),'6 hr 00 min');
 assert.equal(timeTrackerOtDurationLabel(361),'—');
 assert.equal(updateTimeTrackerOvertimePreview({id:'other-form'}),false);
});

test('employee OT modal wiring captures edits, preserves retry drafts and manages focus',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/const overtimeForm=event\.target\.closest\?\.\('#tt-ot-form'\)/);
 assert.match(app,/state\.ttOtDraft=\{\s*date:overtimeForm\.querySelector\('#tt-ot-date'\)/);
 assert.match(app,/updateTimeTrackerOvertimePreview\(overtimeForm\)/);
 assert.match(app,/state\.ttOtDraft=\{\.\.\.draft\};\s*state\.ttBusy=true;render\(\)/);
 assert.match(app,/\.catch\(notice\)\.finally\(\(\)=>\{\s*state\.ttBusy=false;render\(\)/);
 assert.match(app,/if\(state\.ttOtModalOpen\)root\.querySelector\('#tt-ot-date'\)/);
 assert.match(app,/data-tt-ot-backdrop/);
 assert.match(app,/const overtimeDialog=root\.querySelector\('\.tt-ot-modal'\)/);
});

test('duration OT validates current/future work date and half-hour duration increments',()=>{
 const valid={date:'2026-11-02',durationMinutes:180,reason:'Additional planned inspection work'};
 assert.equal(validateDurationOvertimeDraft(valid,now).durationMinutes,180);
 assert.equal(validateDurationOvertimeDraft({...valid,durationMinutes:30},now).valid,true);
 for(const change of [{date:'2026-11-01'},{date:'2026-11-10'},{durationMinutes:29},
  {durationMinutes:45},{durationMinutes:361},{durationMinutes:30.5},{durationMinutes:'180'}]){
  assert.equal(validateDurationOvertimeDraft({...valid,...change},now).valid,false);
 }
});
test('signed duration contract renders hours-only filing and HR/System Admin review controls',()=>{
 const durationRow={...rows[0],otPolicy:'duration-v1',canReviewOt:true,canReviewDuration:true};
 const access={moduleRole:'HR',userId:admin,durationOtContractActive:true,
  durationOtApprover:true,durationOtHrApprover:true,otContractActive:true};
 const html=renderTimeTrackerOvertime({requests:[durationRow],access,modalOpen:true,now});
 assert.match(html,/id="tt-ot-duration-hours"/);
 assert.match(html,/min="0\.5" max="6" step="0\.5"/);
 assert.match(html,/value="2"/);
 assert.doesNotMatch(html,/id="tt-ot-(start|end)"/);
 assert.match(html,/data-action="tt-ot-approve"/);
 const systemAdmin=renderTimeTrackerOvertime({requests:[durationRow],access:{
  ...access,moduleRole:'System Admin',durationOtApprover:true,durationOtHrApprover:false},now});
 assert.match(systemAdmin,/data-action="tt-ot-approve"/);
 const employee=renderTimeTrackerOvertime({requests:[{...durationRow,canReviewOt:false}],
  access:{...access,userId:worker,moduleRole:'Employee',durationOtApprover:false,durationOtHrApprover:false},now});
 assert.doesNotMatch(employee,/data-action="tt-ot-approve"/);
});
test('duration form converts hour selections to exact payroll minutes',()=>{
 const control=value=>({value,textContent:'',attributes:{},
  setAttribute(name,next){this.attributes[name]=next;},
  removeAttribute(name){delete this.attributes[name];},
  setCustomValidity(message){this.validationMessage=message;}});
 const nodes={
  '#tt-ot-duration-hours':control('3'),
  '#tt-ot-reason':control('Additional engineering work'),
  '[data-tt-ot-duration-value]':control(''),
  '[data-tt-ot-duration-progress]':control(''),
  '[data-tt-ot-duration-message]':control(''),
  '[data-tt-ot-reason-count]':control('')
 };
 const form={id:'tt-ot-form',querySelector:selector=>nodes[selector]||null};
 assert.equal(updateTimeTrackerOvertimePreview(form),true);
 assert.equal(nodes['[data-tt-ot-duration-value]'].textContent,'3 hr 00 min');
 assert.equal(nodes['[data-tt-ot-duration-progress]'].value,180);
 assert.equal(nodes['[data-tt-ot-duration-message]'].textContent,
  '3 hr 00 min remaining within the 6-hour maximum.');
 nodes['#tt-ot-duration-hours'].value='0.25';
 updateTimeTrackerOvertimePreview(form);
 assert.equal(nodes['[data-tt-ot-duration-value]'].textContent,'—');
 assert.equal(nodes['[data-tt-ot-duration-progress]'].value,0);
 assert.match(nodes['[data-tt-ot-duration-message]'].textContent,/0\.5 to 6 hours/);
});
test('duration OT uses signed employee identity and never transmits start/end',async()=>{
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'OWN_OT_ONLY',bootstrapApprover:false,durationOtContract:'tt-duration-ot-1',
  durationOtHrApprover:false,rows:[]};
 let args;
 const receipt={id:'50000000-0000-4000-8000-000000000001',workspaceId:workspace,
  ownerId:'cloud:'+admin,status:'Submitted',otPolicy:'duration-v1',durationMinutes:180};
 const client=setup({role:'Employee',snapshot,rpcHandlers:{
  timetracker_ot_submit_duration:payload=>(args=payload,receipt)}});
 await client.submitOvertime(board,{date:today,durationMinutes:180,reason:'Additional planned inspection work'});
 assert.deepEqual(args,{p_board_id:board,p_date:today,p_duration_minutes:180, p_reason:'Additional planned inspection work'});
});
test('HR and System Admin signed scopes see and review employee OT requests',async()=>{
 const durationRow={...rows[0],id:'50000000-0000-4000-8000-000000000003',
  otPolicy:'duration-v1',canReviewOt:true,canReviewDuration:true};
 const ownRow={...durationRow,id:'50000000-0000-4000-8000-000000000004',
  ownerId:'cloud:'+admin,canReviewOt:false,canReviewDuration:false};
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:false,durationOtContract:'tt-duration-ot-1',
  durationOtHrApprover:true,durationOtApprover:true,rows:[durationRow,ownRow]};
 const client=setup({role:'HR',snapshot,rpcHandlers:{
  timetracker_ot_decide_duration:{id:durationRow.id,workspaceId:workspace,status:'Approved',
   decidedBy:admin,otPolicy:'duration-v1'}
 }});
 const read=await client.snapshot(board);
 assert.equal(read.access.durationOtApprover,true);
 assert.equal(read.access.durationOtHrApprover,true);
 assert.equal(read.otRequests.length,2);
 assert.equal(read.otRequests.find(row=>row.id===durationRow.id).canReviewOt,true);
 assert.equal(read.otRequests.find(row=>row.id===ownRow.id).canReviewOt,false);
 assert.equal((await client.decideOvertime(board,durationRow.id,'Approved')).status,'Approved');
 const systemAdmin=await setup({role:'System Admin',snapshot:{
  ...snapshot,durationOtHrApprover:false}}).snapshot(board);
 assert.equal(systemAdmin.access.durationOtApprover,true);
 assert.equal(systemAdmin.otRequests.find(row=>row.id===durationRow.id).canReviewOt,true);
 await assert.rejects(()=>setup({role:'Employee',snapshot}).snapshot(board),
  /approver role does not match/);
});
test('OT table displays requested hours and never exposes legacy clock ranges',()=>{
 const pending={...rows[0],id:'duration-pending',otPolicy:'duration-v1',
  durationMinutes:180,start:'',end:'',status:'Submitted',canReviewOt:true};
 const approved={...rows[1],id:'duration-approved',otPolicy:'duration-v1',
  durationMinutes:180,start:'',end:'',attendanceRecordId:'record-1',
  attendanceCredit:{actualMinutes:150,payableMinutes:120}};
 const durationHtml=renderTimeTrackerOvertime({
  requests:[pending,approved],access:{otContractActive:true,durationOtContractActive:true},now
 });
 assert.match(durationHtml,/<span>Requested Hours<\/span>/);
 assert.match(durationHtml,/3h/);
 assert.doesNotMatch(durationHtml,/Requested OT|06:00 PM|08:00 PM|payable/);
 const legacyHtml=renderTimeTrackerOvertime({
  requests:rows,access:{otContractActive:true,durationOtContractActive:true},now
 });
 assert.match(legacyHtml,/2h/);
 assert.doesNotMatch(legacyHtml,/06:00 PM|08:00 PM|18:00|20:00/);
});
test('manual duration preview updates hours without clock-time controls',()=>{
 const control=value=>({value,textContent:'',setCustomValidity(message){this.validationMessage=message;}});
 const nodes={
  '#tt-ot-manual-duration-hours':control('1.5'),
  '[data-tt-ot-manual-duration]':control('')
 };
 const form={id:'tt-ot-manual-form',querySelector:selector=>nodes[selector]||null};
 assert.equal(updateTimeTrackerManualOtPreview(form),true);
 assert.equal(nodes['[data-tt-ot-manual-duration]'].textContent,'1h 30m');
 assert.equal(nodes['#tt-ot-manual-duration-hours'].validationMessage,'');
 assert.equal(updateTimeTrackerManualOtPreview({id:'other'}),false);
});

test('OT Edit is available only for signed finalized decisions, beside View',()=>{
 const decidedAt='2026-11-02T02:00:00.123456+00:00';
 const access={otContractActive:true};
 for(const status of ['Approved','Rejected']){
  const row={...rows[1],status,decidedAt,canEditDecision:true};
  const html=renderTimeTrackerOvertime({requests:[row],access,now});
  assert.match(html,/data-action="tt-ot-edit"/);
  assert.match(html,/<summary>View<\/summary>/);
  assert.doesNotMatch(html,/data-action="tt-ot-approve"/);
  assert.doesNotMatch(renderTimeTrackerOvertime({requests:[{...row,canEditDecision:false}],access,now}),/data-action="tt-ot-edit"/);
  assert.doesNotMatch(renderTimeTrackerOvertime({requests:[row],access:{otContractActive:false},now}),/data-action="tt-ot-edit"/);
 }
 assert.doesNotMatch(renderTimeTrackerOvertime({requests:[{...rows[0],decidedAt,canEditDecision:true}],access,now}),/data-action="tt-ot-edit"/);
});

test('signed OT correction passes exact previous decision and verifies response',async()=>{
 const decidedAt='2026-11-02T02:00:00.123456+00:00';
 const request={...rows[1],id:'50000000-0000-4000-8000-000000000061',
  decidedAt,canEditDecision:true,otPolicy:'duration-v1',submissionSource:'employee'};
 const calls=[];
 const snap={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:false,durationOtContract:'tt-duration-ot-1',
  durationOtApprover:true,durationOtHrApprover:true,rows:[request]};
 const handlers={timetracker_ot_edit_decision:args=>{
  calls.push(args);
  return {id:request.id,workspaceId:workspace,previousStatus:args.p_expected_status,
   status:args.p_decision,decidedBy:admin,otPolicy:'duration-v1',submissionSource:'employee'};
 }};
 const client=setup({role:'HR',snapshot:snap,rpcHandlers:handlers});
 assert.equal((await client.editOvertimeDecision(board,request.id,'Approved',decidedAt,'Rejected')).status,'Rejected');
 assert.deepEqual(calls,[{p_board_id:board,p_request_id:request.id,p_expected_status:'Approved',
  p_expected_decided_at:decidedAt,p_decision:'Rejected'}]);
 await assert.rejects(()=>client.editOvertimeDecision(board,request.id,'Approved','2026-11-02T01:00:00Z','Rejected'),/changed or is outside/);
 const denied=setup({role:'HR',snapshot:{...snap,rows:[{...request,canEditDecision:false}]},rpcHandlers:handlers});
 await assert.rejects(()=>denied.editOvertimeDecision(board,request.id,'Approved',decidedAt,'Rejected'),/changed or is outside/);
 const reverse=setup({role:'HR',snapshot:{...snap,rows:[{...request,status:'Rejected'}]},rpcHandlers:handlers});
 assert.equal((await reverse.editOvertimeDecision(board,request.id,'Rejected',decidedAt,'Approved')).status,'Approved');
 assert.equal(calls.length,2);
});
