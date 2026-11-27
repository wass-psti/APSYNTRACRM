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
