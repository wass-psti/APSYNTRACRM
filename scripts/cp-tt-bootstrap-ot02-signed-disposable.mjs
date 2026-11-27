/** Genuine isolated GoTrue + PostgREST OT acceptance; no production credentials. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [authPort,restPort,db] = process.argv.slice(2);
assert.match(authPort||'',/^\d{2,5}$/);
assert.match(restPort||'',/^\d{2,5}$/);
assert.match(db||'',/^cpttot02-\d+-pg$/);
const auth=`http://127.0.0.1:${authPort}`;
const rest=`http://127.0.0.1:${restPort}`;
const board='10000000-0000-4000-8000-000000000021';
const workspace='10000000-0000-4000-8000-000000000001';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const password='D1!'+randomBytes(24).toString('base64url');
const nonce=randomBytes(8).toString('hex');
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const shiftDay=(day,offset)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
let checks=0;
function sql(statement){
 return execFileSync('docker',['exec',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',statement],
  {encoding:'utf8',timeout:12000,maxBuffer:10240}).trim();
}
async function call(base,path,body,token){
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',
  headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'}),
   ...(token?{Authorization:`Bearer ${token}`}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
 const raw=await response.text();let data;
 try{data=JSON.parse(raw);}catch{data=raw;}
 return {status:response.status,data};
}
async function ready(){
 for(let i=0;i<45;i++){
  try{const a=await call(auth,'/health'),r=await call(rest,'/');if(a.status===200&&r.status<500)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 throw Error('Isolated Auth/Rest readiness failed');
}
function expect(res,status,label){
 assert.equal(res.status,status,`${label} returned HTTP ${res.status}: ${JSON.stringify(res.data).slice(0,250)}`);
 checks++;
 return res.data;
}
async function actor(label){
 const email=`cpttot02-${nonce}-${label}@example.invalid`;
 const signup=expect(await call(auth,'/signup',{email,password}),200,`${label} signup`);
 const id=signup?.user?.id||signup?.id;
 assert.match(id,uuid);
 const login=expect(await call(auth,'/token?grant_type=password',{email,password}),200,`${label} login`);
 const token=login.access_token;
 assert.match(token||'',/^[\w-]+\./);
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
 assert.equal(claims.sub,id);assert.match(claims.session_id,uuid);assert.equal(claims.role,'authenticated');
 const self=expect(await call(auth,'/user',undefined,token),200,`${label} signed user`);
 assert.equal(self.id,id);
 return {email,id,sessionId:claims.session_id,token};
}
function link(actor,label,bootstrap=false,systemAdmin=false,moduleRole=systemAdmin?'System Admin':'Employee'){
 assert.match(actor.id,uuid);
 const role=bootstrap?'admin_general_manager':'employee';
 sql(`INSERT INTO public.profiles(id,display_name,status,platform_role) VALUES ('${actor.id}','Synthetic ${label}','active','${role}');
 INSERT INTO public.workspace_members VALUES ('${workspace}','${actor.id}',true);
 INSERT INTO public.work_board_members VALUES ('${board}','${actor.id}','viewer');
 INSERT INTO public.module_role_assignments VALUES ('${actor.id}','time-tracker',true,'${moduleRole}');
 ${bootstrap?`INSERT INTO public.apsyntra_role_bootstrap_identities VALUES ('${actor.id}');`:''}`);
}
async function rpc(actor,method,args){
 return call(rest,`/rpc/${method}`,args,actor.token);
}
function receipt(res,label){const result=expect(res,200,label);assert.equal(typeof result,'object');return result;}
function submit(actor,start,end,label,workDate=date){
 // New duration policy deliberately revokes employee access to the retired
 // time-range submit RPC. Create legacy rows only as isolated fixtures so this
 // suite can continue protecting historical bootstrap decision/withdrawal rules.
 const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
 const minutes=(eh*60+em)-(sh*60+sm);
 assert.ok(minutes>=30&&minutes<=360);
 const reason=`Isolated ${label} overtime work performed for testing`;
 const id=sql(`INSERT INTO public.timetracker_ot_requests
  (workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason,submitted_by,submission_source)
  VALUES ('${workspace}','${actor.id}','${workDate}','${start}','${end}',${minutes},
   '${reason}','${actor.id}','employee') RETURNING id::text`);
 assert.match(id,uuid);
 sql(`INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
  VALUES ('${workspace}','${id}','${actor.id}','submitted',
   jsonb_build_object('submissionSource','employee','fixture','legacy-range'))`);
 return {status:200,data:{id,workspaceId:workspace,ownerId:`cloud:${actor.id}`,status:'Submitted'}};
}
async function decision(actor,id,status,label){
 const result=receipt(await rpc(actor,'timetracker_ot_decide',{p_board_id:board,p_request_id:id,p_decision:status}),label);
 assert.equal(result.id,id);assert.equal(result.status,status);assert.equal(result.decidedBy,actor.id);
 return result;
}
function assertDatabase(id,status,decider){
 assert.match(id,uuid);assert.match(decider,uuid);
 const row=sql(`SELECT status||'|'||decided_by::text||'|'||(decided_at IS NOT NULL)::text FROM public.timetracker_ot_requests WHERE id='${id}'`);
 assert.equal(row,`${status}|${decider}|true`);
 const owner=sql(`SELECT owner_id::text FROM public.timetracker_ot_requests WHERE id='${id}'`);
 const audit=sql(`SELECT event||'|'||actor_id::text FROM public.timetracker_ot_audit WHERE request_id='${id}' ORDER BY event_id`);
 assert.equal(audit,`submitted|${owner}\n${status.toLowerCase()}|${decider}`);
 checks++;
}
await ready();
const bootstrap=await actor('bootstrap');
const worker=await actor('worker');
const admin=await actor('system-admin');
const hr=await actor('hr');
const ojt=await actor('ojt');
assert.equal(new Set([bootstrap.id,worker.id,admin.id,hr.id,ojt.id]).size,5);
link(bootstrap,'Bootstrap',true);
link(worker,'Worker');
link(admin,'System Admin',false,true);
assert.equal(sql(`SELECT role FROM public.module_role_assignments WHERE user_id='${admin.id}' AND module_id='time-tracker'`),'System Admin','manual OT actor must hold the actual module role');
link(hr,'HR',false,false,'HR');
link(ojt,'OJT',false,false,'OJT');
// Execute rollback-only SQL assertions after GoTrue has issued real sessions.
// UUIDs come from verified JWT claims, not synthetic auth.sessions inserts.
const signedFixtures={emp:worker,hr,ojt};
const fixtureSettings=Object.entries(signedFixtures).map(([key,account])=>{
 assert.match(account.id,uuid);assert.match(account.sessionId,uuid);
 return `SELECT set_config('apsyntra.test_${key}','${account.id}',false),
  set_config('apsyntra.test_${key}_session','${account.sessionId}',false);`;
}).join('\n');
const durationSql=execFileSync('docker',['exec','-i',db,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{
 input:`SET apsyntra.test_disposable='on';\n${fixtureSettings}\n\\i /repo/supabase/tests/tt_duration_overtime_staged.integration.sql\n`,
 encoding:'utf8',timeout:30000,maxBuffer:1024*1024
});
console.log(durationSql.trim());
console.log('CP_TT_DURATION_OT_STAGED_SQL_PASS');
sql(`INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision)
 VALUES ('${workspace}','time-tracker','timetracker.attendance.v1','shared','*','{"records":[]}',1)
 ON CONFLICT(workspace_id,module_id,state_key,scope,owner_key)
 DO UPDATE SET value=EXCLUDED.value,revision=public.module_state_entries.revision+1`);
console.log('GOTRUE_FIVE_REAL_SIGNED_PROFILES_AND_CANONICAL_ATTENDANCE_STATE PASS');
const durationRequest=receipt(await rpc(worker,'timetracker_ot_submit_duration',{
 p_board_id:board,p_date:date,p_duration_minutes:180,
 p_reason:'Additional engineering work requested for the project'
}),'employee duration OT submission');
assert.equal(durationRequest.otPolicy,'duration-v1');
assert.equal(durationRequest.durationMinutes,180);
const hrOwnRequest=receipt(await rpc(hr,'timetracker_ot_submit_duration',{
 p_board_id:board,p_date:date,p_duration_minutes:60,
 p_reason:'Additional HR system reconciliation work'
}),'HR self-filed duration OT');
const hrPendingSnapshot=receipt(await rpc(hr,'timetracker_ot_snapshot',{p_board_id:board}),'HR duration snapshot');
assert.equal(hrPendingSnapshot.durationOtContract,'tt-duration-ot-1');
assert.equal(hrPendingSnapshot.durationOtHrApprover,true);
assert.equal(hrPendingSnapshot.durationOtApprover,true);
assert.equal(hrPendingSnapshot.scope,'AUTHORIZED_WORKSPACE_TEAM');
assert.equal(hrPendingSnapshot.rows.find(row=>row.id===durationRequest.id).canReviewOt,true);
assert.equal(hrPendingSnapshot.rows.find(row=>row.id===durationRequest.id).canReviewDuration,true);
assert.equal(hrPendingSnapshot.rows.find(row=>row.id===hrOwnRequest.id).canReviewOt,false);
const workerDurationSnapshot=receipt(await rpc(worker,'timetracker_ot_snapshot',{p_board_id:board}),'employee duration snapshot');
assert.equal(workerDurationSnapshot.rows.find(row=>row.id===durationRequest.id).canReviewOt,false);
assert.ok(workerDurationSnapshot.rows.every(row=>row.ownerId===`cloud:${worker.id}`));
const adminDirectory=receipt(await rpc(bootstrap,'list_module_directory',{p_module_id:'time-tracker'}),'platform Admin TimeTracker directory');
assert.ok(adminDirectory.some(row=>row.id===worker.id),'platform Admin directory includes active employees');
const adminSnapshot=receipt(await rpc(admin,'timetracker_ot_snapshot',{p_board_id:board}),'System Admin duration snapshot');
assert.equal(adminSnapshot.durationOtApprover,true);
assert.equal(adminSnapshot.scope,'AUTHORIZED_WORKSPACE_TEAM');
assert.equal(adminSnapshot.rows.find(row=>row.id===durationRequest.id).canReviewOt,true);

const adminDurationRequest=receipt(await rpc(worker,'timetracker_ot_submit_duration',{
 p_board_id:board,p_date:shiftDay(date,1),p_duration_minutes:120,
 p_reason:'Additional inspection work requested for System Admin approval'
}),'System Admin duration approval fixture');
const adminDurationApproval=receipt(await rpc(admin,'timetracker_ot_decide_duration',{
 p_board_id:board,p_request_id:adminDurationRequest.id,p_decision:'Approved'
}),'System Admin approves employee duration OT');
assert.equal(adminDurationApproval.status,'Approved');
assertDatabase(adminDurationRequest.id,'Approved',admin.id);

const platformAdminDurationRequest=receipt(await rpc(worker,'timetracker_ot_submit_duration',{
 p_board_id:board,p_date:shiftDay(date,2),p_duration_minutes:60,
 p_reason:'Additional inspection work requested for platform Admin approval'
}),'platform Admin duration approval fixture');
const platformAdminApproval=receipt(await rpc(bootstrap,'timetracker_ot_decide_duration',{
 p_board_id:board,p_request_id:platformAdminDurationRequest.id,p_decision:'Approved'
}),'platform Admin approves employee duration OT');
assert.equal(platformAdminApproval.status,'Approved');
assertDatabase(platformAdminDurationRequest.id,'Approved',bootstrap.id);

expect(await rpc(worker,'timetracker_ot_decide_duration',{
 p_board_id:board,p_request_id:durationRequest.id,p_decision:'Approved'
}),403,'employee self-approval denied');
expect(await rpc(hr,'timetracker_ot_decide_duration',{
 p_board_id:board,p_request_id:hrOwnRequest.id,p_decision:'Approved'
}),403,'HR self-approval denied');
const legacyBypass=await rpc(hr,'timetracker_ot_decide',{
 p_board_id:board,p_request_id:durationRequest.id,p_decision:'Approved'
});
assert.ok(legacyBypass.status>=400&&legacyBypass.status<500,
 'legacy decision RPC cannot bypass duration-specific approval');
checks++;
assert.equal(sql(`SELECT status FROM public.timetracker_ot_requests WHERE id='${durationRequest.id}'`),'Submitted');
const retiredSubmit=await rpc(worker,'timetracker_ot_submit',{
 p_board_id:board,p_date:date,p_start:'18:00',p_end:'19:00',
 p_reason:'Legacy time range submission must be disabled'
});
assert.ok(retiredSubmit.status>=400&&retiredSubmit.status<500,'legacy time-range filing remains disabled');checks++;
console.log('SIGNED_DURATION_SUBMISSION_HR_SCOPE_SELF_APPROVAL_DENIAL_AND_LEGACY_CUTOFF PASS');
const a=receipt(await submit(bootstrap,'18:00','19:00','bootstrap self approval'),'bootstrap submit A');
await decision(bootstrap,a.id,'Approved','bootstrap self approval');
assertDatabase(a.id,'Approved',bootstrap.id);
const b=receipt(await submit(bootstrap,'19:00','20:00','bootstrap self decline'),'bootstrap submit B');
await decision(bootstrap,b.id,'Rejected','bootstrap self decline');
assertDatabase(b.id,'Rejected',bootstrap.id);
const c=receipt(await submit(worker,'20:00','21:00','worker request'),'worker submit C');
await decision(bootstrap,c.id,'Approved','bootstrap approves worker');
assertDatabase(c.id,'Approved',bootstrap.id);
const d=receipt(await submit(worker,'21:00','22:00','worker decline'),'worker submit D');
await decision(bootstrap,d.id,'Rejected','bootstrap declines worker');
assertDatabase(d.id,'Rejected',bootstrap.id);
console.log('SIGNED_SELF_AND_OTHER_DECISIONS_PERSISTED_WITH_AUDIT PASS');
const snap=receipt(await rpc(bootstrap,'timetracker_ot_snapshot',{p_board_id:board}),'bootstrap snapshot');
assert.equal(snap.bootstrapApprover,true);
for(const x of [a,b,c,d])assert.ok(snap.rows.find(row=>row.id===x.id));
const workerSnap=receipt(await rpc(worker,'timetracker_ot_snapshot',{p_board_id:board}),'worker snapshot');
assert.equal(workerSnap.bootstrapApprover,false);
assert.ok(workerSnap.rows.every(row=>row.ownerId===`cloud:${worker.id}`));
const reLogin=expect(await call(auth,'/token?grant_type=password',{email:bootstrap.email,password}),200,'bootstrap reconnect login');
const fresh={...bootstrap,token:reLogin.access_token};
const freshSnap=receipt(await rpc(fresh,'timetracker_ot_snapshot',{p_board_id:board}),'reconnected bootstrap readback');
for(const x of [a,b,c,d])assert.ok(freshSnap.rows.find(row=>row.id===x.id));
expect(await rpc(worker,'timetracker_ot_decide',{p_board_id:board,p_request_id:a.id,p_decision:'Rejected'}),403,'worker denial');
const legacyHrPending=receipt(await submit(worker,'15:00','16:00',
 'legacy employee request visible to HR',shiftDay(date,3)),'legacy employee pending');
const legacyHrSnapshot=receipt(await rpc(hr,'timetracker_ot_snapshot',{p_board_id:board}),'HR legacy OT snapshot');
assert.equal(legacyHrSnapshot.rows.find(row=>row.id===legacyHrPending.id).canReviewOt,true);
await decision(hr,legacyHrPending.id,'Approved','HR approves legacy employee OT');
assertDatabase(legacyHrPending.id,'Approved',hr.id);

const legacyAdminPending=receipt(await submit(worker,'16:00','17:00',
 'legacy employee request visible to System Admin',shiftDay(date,4)),'legacy System Admin pending');
const legacyAdminSnapshot=receipt(await rpc(admin,'timetracker_ot_snapshot',{p_board_id:board}),'System Admin legacy OT snapshot');
assert.equal(legacyAdminSnapshot.rows.find(row=>row.id===legacyAdminPending.id).canReviewOt,true);
await decision(admin,legacyAdminPending.id,'Approved','System Admin approves legacy employee OT');
assertDatabase(legacyAdminPending.id,'Approved',admin.id);

const pending=receipt(await submit(worker,'16:00','17:00','remaining worker pending'),'worker pending');
expect(await rpc(worker,'timetracker_ot_decide',{p_board_id:board,p_request_id:pending.id,p_decision:'Approved'}),
 403,'employee self-approval denied');
const dup=await rpc(bootstrap,'timetracker_ot_decide',{p_board_id:board,p_request_id:a.id,p_decision:'Rejected'});
assert.ok(dup.status>=400&&dup.status<500,'repeated status must be rejected');checks++;
console.log('SIGNED_RECONNECT_VISIBILITY_AND_EXISTING_DENIALS PASS');
const withdraw=(actor,id)=>rpc(actor,'timetracker_ot_withdraw',{p_board_id:board,p_request_id:id});
const workerPendingSnapshot=receipt(await rpc(worker,'timetracker_ot_snapshot',{p_board_id:board}),'worker pending capability');
assert.equal(workerPendingSnapshot.rows.find(row=>row.id===pending.id).canWithdraw,true);
const adminPendingSnapshot=receipt(await rpc(bootstrap,'timetracker_ot_snapshot',{p_board_id:board}),'bootstrap pending capability');
assert.equal(adminPendingSnapshot.rows.find(row=>row.id===pending.id).canWithdraw,false);
expect(await withdraw(bootstrap,pending.id),403,'other actor withdrawal denied even for bootstrap');
expect(await withdraw(worker,c.id),403,'approved request withdrawal denied');
expect(await withdraw(worker,d.id),403,'rejected request withdrawal denied');
const removed=receipt(await withdraw(worker,pending.id),'creator withdraws pending request');
assert.equal(removed.status,'Withdrawn');assert.equal(removed.withdrawnBy,worker.id);
assertDatabase(pending.id,'Withdrawn',worker.id);
expect(await withdraw(worker,pending.id),403,'repeated withdrawal denied');
const afterWithdrawal=receipt(await rpc(worker,'timetracker_ot_snapshot',{p_board_id:board}),'read after withdrawal');
assert.ok(!afterWithdrawal.rows.some(row=>row.id===pending.id));
const manual=receipt(await rpc(admin,'timetracker_ot_submit_manual',{
 p_board_id:board,p_owner_id:worker.id,p_date:'2025-01-02',p_start:'18:00',p_end:'19:00',
 p_reason:'Manual historical work entered by the administrator'
}),'manual creator entry');
expect(await withdraw(worker,manual.id),403,'manual beneficiary cannot remove administrator-created request');
const manualRemoved=receipt(await withdraw(admin,manual.id),'manual creator withdrawal');
assert.equal(manualRemoved.withdrawnBy,admin.id);
assert.equal(sql(`SELECT event||'|'||actor_id::text FROM public.timetracker_ot_audit WHERE request_id='${manual.id}' ORDER BY event_id`),
 `submitted|${admin.id}\nwithdrawn|${admin.id}`);
const manualDate=shiftDay(date,-1);
const manualDuration=receipt(await rpc(admin,'timetracker_ot_submit_manual_duration',{
 p_board_id:board,p_owner_id:worker.id,p_date:manualDate,p_duration_minutes:150,
 p_reason:'Historical engineering work entered as a duration-only manual request'
}),'manual duration OT entry');
assert.equal(manualDuration.otPolicy,'manual-duration-v1');
assert.equal(manualDuration.durationMinutes,150);
const hrManualSnapshot=receipt(await rpc(hr,'timetracker_ot_snapshot',{p_board_id:board}),'HR manual duration snapshot');
assert.equal(hrManualSnapshot.rows.find(row=>row.id===manualDuration.id).canReviewOt,true);
const manualDurationApproval=receipt(await rpc(hr,'timetracker_ot_decide_manual_duration',{
 p_board_id:board,p_request_id:manualDuration.id,p_decision:'Approved'
}),'HR approves manual duration OT');
assert.equal(manualDurationApproval.status,'Approved');
const ojtManualSnapshot=receipt(await rpc(ojt,'timetracker_ot_snapshot',{p_board_id:board}),'non-approver manual OT privacy snapshot');
assert.ok(!ojtManualSnapshot.rows.some(row=>row.id===manualDuration.id),
 'non-approver employees do not see another employee manual OT history');
assert.equal(sql(`SELECT (start_time IS NULL)::text||'|'||(end_time IS NULL)::text||'|'||duration_minutes::text||'|'||ot_policy FROM public.timetracker_ot_requests WHERE id='${manualDuration.id}'`),
 'true|true|150|manual-duration-v1');
const platformManualDuration=receipt(await rpc(bootstrap,'timetracker_ot_submit_manual_duration',{
 p_board_id:board,p_owner_id:worker.id,p_date:shiftDay(date,-2),p_duration_minutes:90,
 p_reason:'Historical maintenance work entered by a platform Admin'
}),'platform Admin manual duration OT entry');
assert.equal(platformManualDuration.otPolicy,'manual-duration-v1');
const platformManualSnapshot=receipt(await rpc(hr,'timetracker_ot_snapshot',{p_board_id:board}),'HR sees platform Admin manual OT');
assert.equal(platformManualSnapshot.rows.find(row=>row.id===platformManualDuration.id).canReviewOt,true);
const platformManualApproval=receipt(await rpc(hr,'timetracker_ot_decide_manual_duration',{
 p_board_id:board,p_request_id:platformManualDuration.id,p_decision:'Approved'
}),'HR approves platform Admin manual duration OT');
assert.equal(platformManualApproval.status,'Approved');
const ojtPlatformManualSnapshot=receipt(await rpc(ojt,'timetracker_ot_snapshot',{p_board_id:board}),'OJT cannot see platform Admin manual OT');
assert.ok(!ojtPlatformManualSnapshot.rows.some(row=>row.id===platformManualDuration.id));
const racing=receipt(await submit(worker,'14:00','15:00','concurrent decision'),'race request');
const outcomes=await Promise.all([
 withdraw(worker,racing.id),
 rpc(bootstrap,'timetracker_ot_decide',{p_board_id:board,p_request_id:racing.id,p_decision:'Approved'})
]);
assert.equal(outcomes.filter(x=>x.status===200).length,1,'withdrawal and approval must not both commit');
assert.equal(outcomes.filter(x=>x.status>=400&&x.status<500).length,1);
const winner=outcomes.find(x=>x.status===200).data;
assertDatabase(racing.id,winner.status,winner.status==='Approved'?bootstrap.id:worker.id);
console.log('SIGNED_CREATOR_WITHDRAWAL_AUTHORIZATION_AUDIT_AND_RACE PASS');
console.log(`SIGNED_OT_HTTP_AND_SQL_CHECKS_PASS count=${checks}`);
if(process.env.CP_TT_OT03_BROWSER==='1'){
 const selfPending=receipt(await submit(bootstrap,'22:00','23:00','browser self approval'),'browser self submit');
 const workerPending=receipt(await submit(worker,'17:00','18:00','browser other decline'),'browser worker submit');
 const {runSignedOtBrowserAcceptance}=await import('./cp-tt-bootstrap-ot03-browser.mjs');
 await runSignedOtBrowserAcceptance({restUrl:rest,bootstrap,worker,hr,board,selfPending,workerPending,durationRequest,hrOwnRequest});
 const approved=receipt(await rpc(hr,'timetracker_ot_snapshot',{p_board_id:board}),'HR duration post-browser readback');
 assert.equal(approved.rows.find(row=>row.id===durationRequest.id).status,'Approved');
}else{
 const approved=receipt(await rpc(hr,'timetracker_ot_decide_duration',{
  p_board_id:board,p_request_id:durationRequest.id,p_decision:'Approved'
 }),'HR approves duration OT');
 assert.equal(approved.status,'Approved');
}

if(process.env.CP_CRM_PERF_01A_MODE){
 const {runSignedPerformanceBaseline}=await import('./cp-crm-perf-01a-signed.mjs');
 await runSignedPerformanceBaseline({authUrl:auth,restUrl:rest,db,worker,hr,board,workspace,
  integrityRead:()=>sql("SELECT json_build_array((SELECT md5(coalesce(string_agg(to_jsonb(r)::text, ',' ORDER BY id),'')) FROM public.timetracker_ot_requests r),(SELECT md5(coalesce(string_agg(to_jsonb(a)::text, ',' ORDER BY event_id),'')) FROM public.timetracker_ot_audit a))::text")});
}
