import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canApplyTimeTrackerBackgroundSnapshot} from '../time-tracker-native.js';
import {renderTimeTrackerOvertime,timeTrackerOtFilingAvailability} from '../time-tracker-overtime.js';

const now=new Date('2026-11-27T04:00:00Z');
const access={otContractActive:true,durationOtContractActive:true,
 manualOtManager:true,moduleRole:'System Admin',overviewDirectory:[]};
const clock={status:'VERIFIED_READ',clockOnly:true,active:{id:'session'}};
const full={status:'VERIFIED_READ',clockOnly:false,active:clock.active,access};
const guard=changes=>canApplyTimeTrackerBackgroundSnapshot({
 snapshotAtRead:clock,currentSnapshot:clock,viewAtRead:'clock',currentView:'clock',
 runAtRead:1,currentRun:1,fresh:clock,...changes
});
test('late Clock-only read cannot replace OT data after tab navigation',async()=>{
 let finish;
 const pending=new Promise(resolve=>{finish=resolve;});
 let current=clock,view='clock',run=1;
 const response=pending.then(fresh=>{
  if(guard({currentSnapshot:current,currentView:view,currentRun:run,fresh}))current=fresh;
 });
 view='ot';run++;current=full;
 finish(clock);
 await response;
 assert.equal(current,full);
 assert.equal(current.access.durationOtContractActive,true);
 assert.equal(current.active.id,'session');
});
test('background read generation, view and current snapshot must match',()=>{
 assert.equal(guard({}),true);
 assert.equal(guard({currentRun:2}),false);
 assert.equal(guard({currentSnapshot:full}),false);
 assert.equal(guard({currentView:'ot'}),false);
 assert.equal(guard({viewAtRead:'ot',currentView:'ot'}),false);
 assert.equal(guard({viewAtRead:'ot',currentView:'ot',fresh:full}),true);
});
test('both filing actions reflect the busy state and recover immediately',()=>{
 for(const busy of [true,false]){
  const html=renderTimeTrackerOvertime({access,busy,now});
  for(const action of ['tt-ot-open','tt-ot-manual-open']){
   const buttons=html.match(new RegExp('<button[^>]*data-action="'+action+'"[^>]*>','g'));
   assert.ok(buttons?.length,action);
   assert.ok(buttons.every(button=>/ disabled(?: |>|$)/.test(button)===busy),action);
  }
  assert.equal(timeTrackerOtFilingAvailability(access,busy).canOpen,!busy);
  assert.equal(timeTrackerOtFilingAvailability(access,busy,true).canSubmit,!busy);
  if(busy)assert.match(html,/TimeTracker is finishing another operation/);
 }
});
test('signed manual capability works without an extra module-role restriction',()=>{
 const platformAdmin={...access,moduleRole:'Employee',platformRole:'admin_general_manager'};
 assert.equal(timeTrackerOtFilingAvailability(platformAdmin,false,true).canSubmit,true);
 const html=renderTimeTrackerOvertime({access:platformAdmin,modalOpen:'manual',now});
 assert.match(html,/data-action="tt-ot-manual-open">/);
 assert.match(html,/id="tt-ot-manual-form"/);
 assert.doesNotMatch(html,/type="submit" disabled/);
 const employee={...platformAdmin,manualOtManager:false};
 assert.equal(timeTrackerOtFilingAvailability(employee,false,true).canOpen,false);
 assert.doesNotMatch(renderTimeTrackerOvertime({access:employee,now}),/data-action="tt-ot-manual-open"/);
});
test('inactive OT contract gives both forms recoverable feedback and preserves drafts',()=>{
 for(const modalOpen of [true,'manual']){
  const form={date:'2026-11-26',durationMinutes:150,reason:'Preserve this request'};
  const html=renderTimeTrackerOvertime({access:{...access,durationOtContractActive:false},modalOpen,form,now});
  assert.match(html,/type="submit" disabled/);
  assert.match(html,/Refresh overtime to check the workflow again/);
  assert.match(html,/Preserve this request/);
  assert.match(html,/value="2.5"/);
 }
});
test('application uses shared readiness and stale read guards',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/canApplyTimeTrackerBackgroundSnapshot\(\{\s*snapshotAtRead,currentSnapshot:state\.ttAttendance/);
 assert.match(app,/timeTrackerOtFilingAvailability\(state\.ttAttendance\.access,state\.ttBusy,manual\)/);
 assert.match(app,/timeTrackerOtFilingAvailability\(access,state\.ttBusy,true\)/);
 assert.match(app,/timeTrackerOtFilingAvailability\(state\.ttAttendance\?\.access,state\.ttBusy\)/);
});

// Execute the actual app.js click-dispatch cases with controlled dependencies.
// Renderer-only browser fixtures do not exercise this authorization gate.
const decisionApp=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const decisionCases=decisionApp.slice(decisionApp.indexOf(" case 'tt-ot-approve':"),
 decisionApp.indexOf(" case 'tt-report-preset':"));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const dispatchDecision=new AsyncFunction('name','button','state','TT_OT_WRITES_ACCEPTED',
 'confirm','render','timeTracker','loadTimeTracker','toast',
 'switch(name){'+decisionCases+'}');
const requestId='50000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const otherOwner='cloud:20000000-0000-4000-8000-000000000002';
async function exerciseDecision({role='HR',platformRole,bootstrapApprover=false,
 manualOtManager=false,canReviewOt=true,ownerId=otherOwner,otPolicy='duration-v1',
 status='Submitted',otContractActive=true,confirmResult=true,action='tt-ot-approve',
 busy=false,writeAccepted=true,failure=false}={}){
 const calls=[];
 const state={view:'board',tab:'attendance',ttView:'ot',ttBusy:busy,boardId:'board',
  ttAttendance:{status:'VERIFIED_READ',
   access:{userId,moduleRole:role,platformRole,bootstrapApprover,manualOtManager,otContractActive},
   otRequests:[{id:requestId,ownerId,otPolicy,status,canReviewOt}]}};
 const run=()=>dispatchDecision(action,{dataset:{id:requestId}},state,writeAccepted,
  message=>{calls.push(['confirm',message]);return confirmResult;},
  ()=>calls.push(['render',state.ttBusy]),
  {decideOvertime:async(...args)=>{calls.push(['decide',...args]);if(failure)throw Error('RPC rejected');}},
  async()=>calls.push(['reload']),(...args)=>calls.push(['toast',...args]));
 return {calls,state,run};
}
test('production OT click dispatch sends approve and reject for each signed authorized reviewer',async()=>{
 for(const reviewer of [{role:'HR'},{role:'System Admin',manualOtManager:true},
  {role:'Employee',platformRole:'admin_general_manager'}]){
  for(const [action,decision] of [['tt-ot-approve','Approved'],['tt-ot-reject','Rejected']]){
   const {calls,state,run}=await exerciseDecision({...reviewer,action});
   await run();
   assert.deepEqual(calls.filter(c=>c[0]==='decide'),[['decide','board',requestId,decision]]);
   assert.equal(calls[0][0],'confirm');
   assert.deepEqual(calls.filter(c=>c[0]==='render'),[['render',true],['render',false]]);
   assert.ok(calls.some(c=>c[0]==='reload'));
   assert.equal(state.ttBusy,false);
  }
 }
});
test('production OT click dispatch fails closed for unsigned, self or stale requests',async()=>{
 for(const fixture of [
  {role:'Employee',canReviewOt:false},
  {role:'HR',ownerId:'cloud:'+userId,canReviewOt:false},
  {role:'System Admin',bootstrapApprover:true,ownerId:'cloud:'+userId,canReviewOt:false},
  {role:'HR',status:'Approved'},{otContractActive:false}
 ]){
  for(const action of ['tt-ot-approve','tt-ot-reject']){
   const {calls,run}=await exerciseDecision({...fixture,action});
   await run();
   assert.deepEqual(calls.map(c=>c[0]),['toast']);
   assert.equal(calls[0][2],true);
  }
 }
});
test('production OT click dispatch preserves signed legacy self-review, cancellation and busy cleanup',async()=>{
 const legacy=await exerciseDecision({role:'System Admin',bootstrapApprover:true,
  ownerId:'cloud:'+userId,otPolicy:'legacy-range'});
 await legacy.run();
 assert.ok(legacy.calls.some(c=>c[0]==='decide'));
 for(const fixture of [{confirmResult:false},{busy:true},{writeAccepted:false}]){
  const {calls,run}=await exerciseDecision(fixture);
  await run();
  assert.ok(!calls.some(c=>c[0]==='decide'));
 }
 const failed=await exerciseDecision({failure:true});
 await assert.rejects(failed.run,/RPC rejected/);
 assert.equal(failed.state.ttBusy,false);
 assert.ok(!failed.calls.some(c=>c[0]==='reload'));
});

const filingApp=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const filingOpenStart=filingApp.indexOf(" case 'tt-ot-prev':");
const filingOpenEnd=filingApp.indexOf(" case 'tt-ot-reason':",filingOpenStart);
const filingSubmitStart=filingApp.indexOf("if(event.target.id==='tt-ot-manual-form'){");
const filingSubmitEnd=filingApp.indexOf("if(event.target.id==='login-form'){",filingSubmitStart);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const dispatchFilingAction=new AsyncFunction('name','button','state','render','toast','root',
 'timeTrackerOtFilingAvailability','switch(name){'+filingApp.slice(filingOpenStart,filingOpenEnd)+'}');
const dispatchFilingSubmit=new AsyncFunction('event','state','timeTrackerOtFilingAvailability',
 'timeTracker','root','render','toast','notice','loadTimeTracker','timeTrackerOtWeekOffsetForDate',
 filingApp.slice(filingSubmitStart,filingSubmitEnd));
function filingState(accessOverride=access){
 return {view:'board',tab:'attendance',ttView:'ot',ttBusy:false,boardId:'board',
  ttAttendance:{status:'VERIFIED_READ',access:accessOverride,active:{id:'active-session'}},
  ttOtDraft:{reason:'stale'},ttOtModalOpen:false,
  ttOtFilters:{weekOffset:0,status:'All',search:''}};
}
const filingButton={dataset:{}};
test('actual app click dispatcher opens and closes both filing dialogs for 100 consecutive cycles',async()=>{
 const state=filingState({...access,moduleRole:'Employee',platformRole:'admin_general_manager'});
 const calls={renders:0,focus:[],toasts:[]};
 const root={querySelector(selector){return {focus(){calls.focus.push(selector)}}}};
 for(let i=0;i<100;i++){
  await dispatchFilingAction('tt-ot-open',filingButton,state,()=>calls.renders++,
   (...args)=>calls.toasts.push(args),root,timeTrackerOtFilingAvailability);
  assert.equal(state.ttOtModalOpen,true);
  assert.deepEqual(state.ttOtDraft,{});
  await dispatchFilingAction('tt-ot-close',filingButton,state,()=>calls.renders++,
   (...args)=>calls.toasts.push(args),root,timeTrackerOtFilingAvailability);
  assert.equal(state.ttOtModalOpen,false);
  await dispatchFilingAction('tt-ot-manual-open',filingButton,state,()=>calls.renders++,
   (...args)=>calls.toasts.push(args),root,timeTrackerOtFilingAvailability);
  assert.equal(state.ttOtModalOpen,'manual');
  await dispatchFilingAction('tt-ot-close',filingButton,state,()=>calls.renders++,
   (...args)=>calls.toasts.push(args),root,timeTrackerOtFilingAvailability);
  assert.equal(state.ttOtModalOpen,false);
 }
 assert.equal(calls.renders,400);
 assert.equal(calls.focus.filter(x=>x==='#tt-ot-date').length,100);
 assert.equal(calls.focus.filter(x=>x==='#tt-ot-manual-employee').length,100);
 assert.deepEqual(calls.toasts,[]);
});
test('actual click dispatcher explains busy, unverified and unavailable manual states',async()=>{
 for(const fixture of [
  {busy:true,status:'VERIFIED_READ',access},
  {busy:false,status:'LOADING',access},
  {busy:false,status:'VERIFIED_READ',access:{...access,manualOtManager:false}}
 ]){
  const state=filingState(fixture.access);state.ttBusy=fixture.busy;
  state.ttAttendance.status=fixture.status;
  const messages=[];
  await dispatchFilingAction('tt-ot-manual-open',filingButton,state,()=>{},
   (...args)=>messages.push(args),{querySelector:()=>({focus(){}})},timeTrackerOtFilingAvailability);
  assert.equal(state.ttOtModalOpen,false);
  assert.equal(messages.length,1);
  assert.equal(messages[0][1],true);
 }
 const employee=filingState({...access,manualOtManager:false,moduleRole:'Employee'});
 await dispatchFilingAction('tt-ot-open',filingButton,employee,()=>{},
  ()=>{}, {querySelector:()=>({focus(){}})},timeTrackerOtFilingAvailability);
 assert.equal(employee.ttOtModalOpen,true);
});
function filingSubmitHarness(formId,{fail=false,accessOverride=access,busy=false,submitDelay}={}){
 const calls=[];
 const values={
  '#tt-ot-date':'2026-11-27','#tt-ot-duration-hours':'2.5',
  '#tt-ot-reason':'Emergency maintenance',
  '#tt-ot-manual-employee':'worker-1','#tt-ot-manual-date':'2026-11-27',
  '#tt-ot-manual-duration-hours':'2.5','#tt-ot-manual-reason':'Historical maintenance'
 };
 const state=filingState(accessOverride);
 state.ttBusy=busy;state.ttOtModalOpen=formId==='tt-ot-form'?true:'manual';
 state.ttOtFilters={weekOffset:0,status:'Submitted',search:'old'};
 const root={querySelector(selector){return {value:values[selector]??'',focus(){calls.push(['focus',selector])}}}};
 const submit=async(kind,...args)=>{
  calls.push([kind,...args]);
  if(submitDelay)await submitDelay;
  if(fail)throw Error('network timeout');
  return {id:kind==='employee'?'employee-ot':'manual-ot'};
 };
 const timeTracker={submitOvertime:(...args)=>submit('employee',...args),
  submitManualOvertime:(...args)=>submit('manual',...args)};
 const event={target:{id:formId},preventDefault(){calls.push(['preventDefault'])}};
 const render=()=>calls.push(['render',state.ttBusy]);
 const toast=(...args)=>calls.push(['toast',...args]);
 const notice=error=>calls.push(['notice',error.message]);
 const loadTimeTracker=async()=>calls.push(['reload']);
 return {calls,state,event,root,timeTracker,render,toast,notice,loadTimeTracker};
}
async function dispatchAndFlush(h){
 await dispatchFilingSubmit(h.event,h.state,timeTrackerOtFilingAvailability,
  h.timeTracker,h.root,h.render,h.toast,h.notice,h.loadTimeTracker,()=>0);
 for(let i=0;i<12;i++)await Promise.resolve();
}
test('actual employee and manual form-submit handlers send duration payloads and verify completion',async()=>{
 for(const [formId,kind] of [['tt-ot-form','employee'],['tt-ot-manual-form','manual']]){
  const h=filingSubmitHarness(formId);
  await dispatchAndFlush(h);
  const sent=h.calls.find(call=>call[0]===kind);
  assert.ok(sent,kind+' RPC');
  assert.equal(sent[2].date,'2026-11-27');
  assert.equal(sent[2].durationMinutes,150);
  assert.ok(sent[2].reason.length>0);
  assert.equal(Object.hasOwn(sent[2],'start'),false);
  assert.equal(Object.hasOwn(sent[2],'end'),false);
  assert.equal(h.state.ttBusy,false);
  assert.equal(h.state.ttOtModalOpen,false);
  assert.equal(h.calls.filter(call=>call[0]==='reload').length,1);
  assert.ok(h.calls.some(call=>call[0]==='toast'));
 }
});
test('both submit handlers preserve their form and clear busy state after backend failure',async()=>{
 for(const [formId,kind] of [['tt-ot-form','employee'],['tt-ot-manual-form','manual']]){
  const h=filingSubmitHarness(formId,{fail:true});
  await dispatchAndFlush(h);
  assert.ok(h.calls.some(call=>call[0]===kind));
  assert.ok(h.calls.some(call=>call[0]==='notice'&&call[1]==='network timeout'));
  assert.equal(h.state.ttBusy,false);
  assert.equal(h.state.ttOtModalOpen,formId==='tt-ot-form'?true:'manual');
  assert.ok(h.state.ttOtDraft.reason);
  assert.equal(h.calls.filter(call=>call[0]==='reload').length,0);
 }
});
test('duplicate submit during an in-flight request sends only one overtime RPC',async()=>{
 let release;
 const submitDelay=new Promise(resolve=>{release=resolve;});
 const h=filingSubmitHarness('tt-ot-form',{submitDelay});
 await dispatchFilingSubmit(h.event,h.state,timeTrackerOtFilingAvailability,
  h.timeTracker,h.root,h.render,h.toast,h.notice,h.loadTimeTracker,()=>0);
 assert.equal(h.state.ttBusy,true);
 await dispatchFilingSubmit(h.event,h.state,timeTrackerOtFilingAvailability,
  h.timeTracker,h.root,h.render,h.toast,h.notice,h.loadTimeTracker,()=>0);
 assert.equal(h.calls.filter(call=>call[0]==='employee').length,1);
 assert.ok(h.calls.some(call=>call[0]==='toast'&&String(call[1]).includes('finishing another operation')));
 release();
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(h.state.ttBusy,false);
});
test('100 delayed Clock-only snapshots are discarded after OT navigation',async()=>{
 for(let i=0;i<100;i++){
  const clockSnapshot={status:'VERIFIED_READ',clockOnly:true,generation:i};
  const otSnapshot={status:'VERIFIED_READ',clockOnly:false,generation:i+1,
   access:{otContractActive:true,durationOtContractActive:true}};
  let resolveRead;
  const pending=new Promise(resolve=>{resolveRead=resolve;});
  const result=pending.then(fresh=>canApplyTimeTrackerBackgroundSnapshot({
   snapshotAtRead:clockSnapshot,currentSnapshot:otSnapshot,
   viewAtRead:'clock',currentView:'ot',runAtRead:i,currentRun:i+1,fresh
  }));
  resolveRead(clockSnapshot);
  assert.equal(await result,false,'late Clock response '+i);
  assert.equal(otSnapshot.access.durationOtContractActive,true);
 }
});
