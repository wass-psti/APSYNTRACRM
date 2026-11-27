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
