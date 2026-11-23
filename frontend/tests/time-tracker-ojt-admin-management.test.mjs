import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeTrackerLogRowsForSnapshot,retainTimeTrackerLogDetailIds,renderTimeTrackerLog,filterTimeTrackerLogRows,timeTrackerLogCsv} from '../time-tracker-log.js';
import {projectOjtAdminAttendance,TimeTrackerOjtClient} from '../apps/TimeTracker/time-tracker-ojt.js';
import {renderTimeTrackerOjtAdminEditor,buildTimeTrackerOjtAdminPatch} from '../apps/TimeTracker/time-tracker-ojt-admin-editor.js';

const scope={userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 workspaceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3'};
const recordId='00000000-0000-4000-8000-000000000011';
const internId='00000000-0000-4000-8000-000000000022';
const input={id:recordId,internId,name:'Intern Alpha',
 clockIn:'2026-11-23T02:20:00.000Z',clockOut:null,
 location:'Office-Base Duty',workNote:'',revision:2};
const signed=(rows=[input])=>({
 contract:'tt-ojt-admin-attendance-1',actorId:scope.userId,
 workspaceId:scope.workspaceId,boardId:scope.boardId,records:rows
});
const log=(rows=[input],moduleRole='System Admin')=>({
 status:'VERIFIED_READ',access:{moduleRole},
 log:{rows:[]},ojtAdminAttendance:{records:rows}
});
const form=values=>{
 const f=new FormData();
 for(const [key,value] of Object.entries(values))f.set(key,value);
 return f;
};

test('OJT arrival is assessed from Philippine 8 AM policy (10:20 AM is Late)',()=>{
 const rows=timeTrackerLogRowsForSnapshot(log());
 assert.equal(rows.length,1);
 assert.equal(rows[0].classification,'Late');
 assert.equal(rows[0].revision,2);
 assert.equal(rows[0].name,'Intern Alpha');
 assert.equal(rows[0].ownerId,'ojt:'+internId);
 assert.equal(filterTimeTrackerLogRows(rows,{status:'Late'}).length,1);
 assert.match(timeTrackerLogCsv(rows),/Late/);
 const onTime=timeTrackerLogRowsForSnapshot(log([{
  ...input,clockIn:'2026-11-23T00:00:00.000Z'
 }]))[0];
 assert.equal(onTime.classification,'On time');
 assert.equal(timeTrackerLogRowsForSnapshot(log([input],'Employee')).length,0);
});

test('OJT completed working hours apply same PHT unpaid-break policy',()=>{
 const row=timeTrackerLogRowsForSnapshot(log([{
  ...input,clockIn:'2026-11-23T01:00:00.000Z',
  clockOut:'2026-11-23T10:00:00.000Z'
 }]))[0];
 assert.equal(row.status,'Completed');
 assert.equal(row.creditedMs,8*60*60*1000);
 assert.equal(row.classification,'Late');
});

test('signed admin OJT rows preserve revision and work note, reject inconsistent times',()=>{
 const projection=projectOjtAdminAttendance(signed(),scope);
 assert.equal(projection.records[0].revision,2);
 assert.equal(projection.records[0].internId,internId);
 assert.throws(()=>projectOjtAdminAttendance(signed([{
  ...input,clockOut:'2026-11-22T02:20:00.000Z'
 }]),scope),/Invalid OJT admin attendance row/);
 assert.throws(()=>projectOjtAdminAttendance(signed(),{...scope,userId:internId}),
  /Signed intern report unavailable/);
});

test('IT OJT time correction editor excludes location and cannot invent clock-out',()=>{
 const editor={ojt:true,record:input,timeOnly:true};
 const html=renderTimeTrackerOjtAdminEditor({editor});
 assert.match(html,/Save time correction/);
 assert.match(html,/name="clockInAt"/);
 assert.doesNotMatch(html,/name="location"/);
 assert.doesNotMatch(html,/name="clockOutAt"/);
 const f=form({clockInAt:'2026-11-23 10:00 AM',reason:'Arrival was corrected'});
 const plan=buildTimeTrackerOjtAdminPatch(f,{record:input,timeOnly:true});
 assert.deepEqual(plan.patch,{clockInAt:'2026-11-23T02:00:00.000Z'});
 assert.equal(plan.reason,'Arrival was corrected');
});

test('System Admin may edit location and work note without changing OJT identity',()=>{
 const editor={ojt:true,record:input,timeOnly:false};
 const html=renderTimeTrackerOjtAdminEditor({editor});
 assert.match(html,/name="location"/);
 assert.match(html,/name="workNote"/);
 assert.doesNotMatch(html,/name="employeeId"/);
 assert.doesNotMatch(html,/name="department"/);
 assert.doesNotMatch(html,/name="clockInGeolatitude"/);
 const f=form({clockInAt:'2026-11-23 10:20 AM',clockOutAt:'',
  location:'Offsite (Home)',workNote:'Review sensors',reason:'Correct assignment'});
 const plan=buildTimeTrackerOjtAdminPatch(f,{record:input,timeOnly:false});
 assert.deepEqual(plan.patch,{location:'Offsite (Home)',workNote:'Review sensors'});
 assert.throws(()=>buildTimeTrackerOjtAdminPatch(form({
  clockInAt:'2026-11-23 10:20 AM',clockOutAt:'',
  location:'Offsite (Home)',workNote:''
 }),{record:input}),/work note is required/);
});

test('OJT records in Log use same correct/edit/delete actions, no generic GPS or bulk selection',()=>{
 const html=renderTimeTrackerLog({records:timeTrackerLogRowsForSnapshot(log()),
  expandedRecordIds:['ojt:'+recordId],adminEligible:true,adminFullAccess:true});
 for(const action of ['tt-log-admin-correct-time','tt-log-admin-edit','tt-log-admin-delete'])
  assert.match(html,new RegExp('data-action="'+action+'"'));
 assert.doesNotMatch(html,/data-action="tt-log-detail-toggle-select"/);
 assert.doesNotMatch(html,/data-action="tt-log-gps-load"/);
});

test('OJT Log detail selection persists across render and respects signed role scope',()=>{
 const id='ojt:'+recordId,snapshot=log();
 const expanded=retainTimeTrackerLogDetailIds(snapshot,[id]);
 assert.deepEqual(expanded,[id]);
 const html=renderTimeTrackerLog({records:timeTrackerLogRowsForSnapshot(snapshot),
  expandedRecordIds:expanded,adminEligible:true,adminFullAccess:true});
 assert.match(html,/data-tt-log-detail-dialog/);
 assert.match(html,new RegExp('data-tt-log-detail-dialog data-record-id="'+id+'"'));
 for(const action of ['tt-log-admin-correct-time','tt-log-admin-edit','tt-log-admin-delete'])
  assert.match(html,new RegExp('data-action="'+action+'"'));
 const standard={id:'standard-1',name:'Regular Employee',ownerId:'cloud:employee-1',
  clockIn:input.clockIn,clockOut:null,status:'Active',location:'Office-Base Duty'};
 const combined={...snapshot,log:{rows:[standard]}};
 assert.deepEqual(retainTimeTrackerLogDetailIds(combined,[standard.id]),[standard.id]);
 assert.deepEqual(retainTimeTrackerLogDetailIds(combined,[standard.id,id]),[id]);
 assert.deepEqual(retainTimeTrackerLogDetailIds(combined,[id,'deleted']),[id]);
 assert.deepEqual(retainTimeTrackerLogDetailIds(log([input],'Employee'),[id]),[]);
 assert.deepEqual(retainTimeTrackerLogDetailIds({...snapshot,status:'UNVERIFIED'},[id]),[]);
 const app=readFileSync('frontend/app.js','utf8');
  assert.ok(app.includes('state.ttLogExpandedIds=retainTimeTrackerLogDetailIds(state.ttAttendance,state.ttLogExpandedIds)'));
});

test('OJT signed mutator validates actor/board/revision and never uses ordinary record RPC',async()=>{
 const requests=[];
 const auth={isSignedIn:true,async getVerifiedUser(){return {id:scope.userId};}};
 const api={async context(){return {user_id:scope.userId,workspace_id:scope.workspaceId,
  profile:{status:'active'}};},
  async rpc(method,args,opts){
   requests.push({method,args,opts});
   return {contract:'tt-ojt-admin-mutate-1',mode:'COMMITTED',
    actorId:scope.userId,workspaceId:scope.workspaceId,boardId:scope.boardId,
    action:args.p_action,recordId:args.p_record_id,
    revision:args.p_expected_revision+1,committedAt:'2026-11-23T04:00:00Z'};
  }};
 const client=new TimeTrackerOjtClient({auth,api});
 const receipt=await client.mutateAdminRecord(scope,{
  recordId,action:'correct-time',patch:{clockInAt:'2026-11-23T02:00:00Z'},
  expectedRevision:2});
 assert.equal(receipt.revision,3);
 assert.equal(requests.length,1);
 assert.equal(requests[0].method,'timetracker_ojt_admin_mutate');
 assert.equal(requests[0].opts.retryUnauthorized,false);
 assert.equal(requests[0].args.p_record_id,recordId);
 await assert.rejects(()=>client.mutateAdminRecord(scope,{
  recordId,action:'edit',expectedRevision:null}),/current signed intern attendance record/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/timeTrackerOjt\.mutateAdminRecord\(scope,/);
 assert.match(app,/timeTrackerOjt\.adminAttendance\(scope\)/);
 assert.match(app,/timeTrackerOjtLogAdminScope/);
});
