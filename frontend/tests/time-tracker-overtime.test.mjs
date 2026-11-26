import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeTrackerOtWeek,timeTrackerOtWeekOffsetForDate,overtimeDurationMinutes,
 validateOvertimeDraft,validateDurationOvertimeDraft,validateManualOvertimeDraft,timeTrackerOtMetrics,
 renderTimeTrackerOvertime,timeTrackerOtDurationLabel,updateTimeTrackerOvertimePreview,
 TT_OT_WRITES_ACCEPTED}
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
 assert.equal(m.visible.length,2);
 assert.equal(timeTrackerOtMetrics(rows,{status:'Approved'},now).visible.length,1);
 assert.equal(timeTrackerOtMetrics(rows,{search:'not in OT'},now).visible.length,0);
});
test('staged modal is visible but submission and ordinary approvals fail closed',()=>{
 const employee=renderTimeTrackerOvertime({
  requests:rows,access:{bootstrapApprover:false},modalOpen:true,now});
 for(const text of ['Overtime','Approved overtime this week','Awaiting approval','Pending',
  'Approved','Rejected','File Overtime','Total overtime'])
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
 const html=renderTimeTrackerOvertime({requests:[manualRow,regularRow],access,now,modalOpen:'manual'});
 assert.match(html,/File Overtime/);
 assert.match(html,/tt-ot-manual-employee/);
 assert.match(html,/ADMINISTRATIVE ENTRY/);
 assert.match(html,/Manual Entry/);
 assert.match(html,/Entered by Administrator/);
 assert.equal((html.match(/data-action="tt-ot-approve"/g)||[]).length,1);
 const employee=renderTimeTrackerOvertime({requests:[manualRow],
  access:{userId:worker,moduleRole:'Employee',manualOtManager:false,otContractActive:true},now});
 assert.match(employee,/File Overtime/);
 assert.doesNotMatch(employee,/tt-ot-manual-open/);
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

test('Bootstrap owns pending OT review actions while System Admin retains self-review denial',()=>{
 const selfRow={...rows[0],id:'50000000-0000-4000-8000-000000000041',ownerId:'cloud:'+admin};
 const bootstrap=renderTimeTrackerOvertime({requests:[selfRow],
  access:{userId:admin,bootstrapApprover:true,otContractActive:true},now});
 assert.match(bootstrap,/data-action="tt-ot-approve"/);
 assert.match(bootstrap,/data-action="tt-ot-reject"/);
 const manual={...selfRow,submissionSource:'manual_admin'};
 const systemAdmin=renderTimeTrackerOvertime({requests:[manual],
  access:{userId:admin,moduleRole:'System Admin',manualOtManager:true,bootstrapApprover:false,otContractActive:true},now});
 assert.doesNotMatch(systemAdmin,/data-action="tt-ot-approve"/);
 assert.doesNotMatch(systemAdmin,/data-action="tt-ot-reject"/);
});

test('signed bootstrap client decides self-submitted OT and reads former members',async()=>{
 const self={...rows[0],id:'50000000-0000-4000-8000-000000000042',ownerId:'cloud:'+admin};
 const former={...rows[0],id:'50000000-0000-4000-8000-000000000043',
  ownerId:'cloud:50000000-0000-4000-8000-000000000099'};
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:true,manualOtManager:false,rows:[self,former]};
 let decideArgs;
 const client=setup({snapshot,rpcHandlers:{
  timetracker_ot_decide:args=>(decideArgs=args,{
   id:args.p_request_id,workspaceId:workspace,status:args.p_decision,
   decidedBy:admin,submissionSource:'employee'})
 }});
 const initial=await client.snapshot(board);
 assert.equal(initial.otRequests.length,2,'signed team OT must not depend on active employee directory');
 for(const decision of ['Approved','Rejected']){
  const result=await client.decideOvertime(board,self.id,decision);
  assert.equal(result.status,decision);
  assert.equal(decideArgs.p_request_id,self.id);
 }
});


test('employee OT request markup uses native time controls and clear user guidance',()=>{
 const html=renderTimeTrackerOvertime({
  requests:rows,access:{bootstrapApprover:false,otContractActive:true},modalOpen:true,now
 });
 assert.match(html,/id="tt-ot-start" name="start" type="time"/);
 assert.match(html,/id="tt-ot-end" name="end" type="time"/);
 assert.match(html,/value="18:00"/);
 assert.match(html,/value="20:00"/);
 assert.match(html,/min="2026-10-03"/);
 assert.match(html,/max="2026-11-09"/);
 assert.match(html,/data-tt-ot-duration-progress/);
 assert.match(html,/Your request will be sent for approval/);
 assert.match(html,/You can check its status in OT requests/);
 assert.doesNotMatch(html,/signed OT RPC|audit workflow/i);
 assert.match(html,/maxlength="500"/);
 assert.match(html,/past 30 days or next 7 days/);
 assert.match(html,/Provide at least 10 characters/);
});
test('OT duration preview updates the duration, progress, reason count and inline validity',()=>{
 const control=value=>({
  value,textContent:'',validationMessage:'',attributes:{},
  setAttribute(name,next){this.attributes[name]=next;},
  removeAttribute(name){delete this.attributes[name];},
  setCustomValidity(message){this.validationMessage=message;}
 });
 const nodes={
  '#tt-ot-start':control('18:00'),
  '#tt-ot-end':control('20:00'),
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
  '240 minutes remaining within the 6-hour maximum.');
 assert.equal(nodes['[data-tt-ot-reason-count]'].textContent,'26 / 500');
 assert.equal(nodes['#tt-ot-end'].validationMessage,'');
 assert.equal(nodes['#tt-ot-reason'].validationMessage,'');
 nodes['#tt-ot-start'].value='20:00';
 nodes['#tt-ot-end'].value='19:00';
 nodes['#tt-ot-reason'].value='     ';
 updateTimeTrackerOvertimePreview(form);
 assert.match(nodes['#tt-ot-reason'].validationMessage,/at least 10 characters/);
 nodes['#tt-ot-reason'].value='Short';
 updateTimeTrackerOvertimePreview(form);
 assert.equal(nodes['[data-tt-ot-duration-value]'].textContent,'—');
 assert.equal(nodes['[data-tt-ot-duration-progress]'].value,0);
 assert.match(nodes['#tt-ot-end'].validationMessage,/30 minutes and 6 hours/);
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

test('duration OT validates future/current work date and exact minute amount',()=>{
 const valid={date:'2026-11-02',durationMinutes:180,reason:'Additional planned inspection work'};
 assert.equal(validateDurationOvertimeDraft(valid,now).durationMinutes,180);
 for(const change of [{date:'2026-11-01'},{date:'2026-11-10'},{durationMinutes:29},
  {durationMinutes:361},{durationMinutes:30.5},{durationMinutes:'180'}]){
  assert.equal(validateDurationOvertimeDraft({...valid,...change},now).valid,false);
 }
});
test('signed duration contract renders an hours input, with HR review controls',()=>{
 const durationRow={...rows[0],otPolicy:'duration-v1',canReviewDuration:true};
 const access={moduleRole:'HR',userId:admin,durationOtContractActive:true,durationOtHrApprover:true,otContractActive:true};
 const html=renderTimeTrackerOvertime({requests:[durationRow],access,modalOpen:true,now});
 assert.match(html,/id="tt-ot-duration-hours"/);
 assert.match(html,/min="0\.5" max="6" step="0\.5"/);
 assert.match(html,/value="2"/);
 assert.doesNotMatch(html,/id="tt-ot-(start|end)"/);
 assert.match(html,/data-action="tt-ot-approve"/);
 assert.doesNotMatch(renderTimeTrackerOvertime({requests:[durationRow],
  access:{...access,userId:worker,durationOtHrApprover:false},now}),/data-action="tt-ot-approve"/);
 assert.doesNotMatch(renderTimeTrackerOvertime({requests:[durationRow],
  access:{...access,durationOtHrApprover:false,bootstrapApprover:true},now}),/data-action="tt-ot-approve"/);
});
test('duration form converts hour selections to exact payroll minutes',()=>{
 const control=value=>({value,textContent:'',attributes:{},
  setAttribute(name,next){this.attributes[name]=next;},
  removeAttribute(name){delete this.attributes[name];}});
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
test('HR signed scope reviews duration only and rejects non-HR claims',async()=>{
 const durationRow={...rows[0],id:'50000000-0000-4000-8000-000000000003',
  otPolicy:'duration-v1',canReviewDuration:true};
 const snapshot={mode:'ACTIVE',actorId:admin,workspaceId:workspace,
  scope:'AUTHORIZED_WORKSPACE_TEAM',bootstrapApprover:false,durationOtContract:'tt-duration-ot-1',
  durationOtHrApprover:true,rows:[durationRow,rows[1]]};
 const client=setup({role:'HR',snapshot,rpcHandlers:{
  timetracker_ot_decide_duration:{id:durationRow.id,workspaceId:workspace,status:'Approved',
   decidedBy:admin,otPolicy:'duration-v1'}}});
 const read=await client.snapshot(board);
 assert.equal(read.access.durationOtHrApprover,true);
 assert.equal(read.otRequests.length,1);
 assert.equal((await client.decideOvertime(board,durationRow.id,'Approved')).status,'Approved');
 await assert.rejects(()=>setup({role:'Employee',snapshot}).snapshot(board),/review role/);
});
