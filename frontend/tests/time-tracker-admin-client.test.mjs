import test from 'node:test';
import assert from 'node:assert/strict';
import {TimeTrackerNativeClient} from '../time-tracker-native.js';

const actor='00000000-0000-4000-8000-000000000003';
const employee='00000000-0000-4000-8000-000000000004';
const workspace='00000000-0000-4000-8000-000000000001';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const recordId='00000000-0000-4000-8000-000000000020';
const record={id:recordId,ownerId:`cloud:${employee}`,ownerName:'Test Employee',
 clockIn:{timestamp:'2026-11-16T00:15:00.000Z',location:'Office-Base Duty',
  department:'Information Technology',geo:{status:'captured',source:'browser-geolocation',
   latitude:10.3,longitude:123.9,accuracy:35}},clockOut:null};

function setup({role='System Admin',receiptOverride={}}={}){
 const calls=[];
 const auth={userId:actor,isSignedIn:true,async getVerifiedUser(){return {id:actor};}};
 const api={
  async context(){return {user_id:actor,workspace_id:workspace,
   profile:{status:'active',platform_role:'admin_general_manager'}};},
  async nativeApplicationBoardContext(moduleId){return {
   contract:'native-app-board-v1',moduleId,userId:actor,workspaceId:workspace,
   role,board:{id:board,workspace_id:workspace,name:'TimeTracker Attendance',
    status:'active',description:'[APSYNTRA:MODULE:timetracker:v1]',
    archived_at:null,trashed_at:null}
  };},
  async board(id){return {board:{id,workspace_id:workspace,name:'TimeTracker Attendance'}};},
  async allowed(){return true;},
  async rpc(name,args,options){
   calls.push({name,args,options});
   if(name==='has_module_access')return true;
   if(name==='list_module_directory')return [
    {id:actor,status:'active',display_name:'Test Admin',module_role:role},
    {id:employee,status:'active',display_name:'Test Employee',module_role:'Employee'}
   ];
   if(name==='timetracker_attendance_admin_snapshot')return {
    mode:'ACTIVE',contract:'tt-attendance-admin-1',actorId:actor,
    workspaceId:workspace,boardId:board,revision:4,records:[record],
    directory:[{id:actor,displayName:'Test Admin'},{id:employee,displayName:'Test Employee'}]
   };
   if(name==='timetracker_attendance_admin_mutate')return {
    mode:'COMMITTED',contract:'tt-attendance-admin-1',actorId:actor,
    workspaceId:workspace,boardId:board,action:args.p_action,
    recordIds:args.p_record_ids,changedCount:args.p_action.includes('delete')?0:args.p_record_ids.length,
    deletedCount:args.p_action.includes('delete')?args.p_record_ids.length:0,
    revision:args.p_expected_revision+1,committedAt:'2026-11-16T08:00:00.000Z',
    ...receiptOverride
   };
   throw new Error(`Unexpected RPC ${name}`);
  }
 };
 return {client:new TimeTrackerNativeClient({auth,api}),calls};
}

test('System Admin can read only selected attendance records and active employee directory',async()=>{
 const {client,calls}=setup();
 const result=await client.attendanceAdminRecords(board,[recordId]);
 assert.equal(result.revision,4);
 assert.equal(result.records.length,1);
 assert.equal(result.records[0].clockIn.geo.latitude,10.3);
 assert.deepEqual(result.directory.map(x=>x.id),[actor,employee]);
 assert.equal(calls.filter(x=>x.name==='timetracker_attendance_admin_snapshot').length,1);
});

test('non-System Admin users cannot invoke the administrative attendance snapshot',async()=>{
 const {client,calls}=setup({role:'Employee'});
 await assert.rejects(()=>client.attendanceAdminRecords(board,[recordId]),/administrator/);
 assert.equal(calls.some(x=>x.name==='timetracker_attendance_admin_snapshot'),false);
});

test('admin mutation uses compare-and-swap revision and does not retry ambiguous writes',async()=>{
 const {client,calls}=setup();
 const receipt=await client.mutateAttendanceRecords(board,{
  action:'edit',recordIds:[recordId],patch:{location:'Local Field Works'},
  reason:'Correction',expectedRevision:4
 });
 assert.equal(receipt.revision,5);
 const mutation=calls.find(x=>x.name==='timetracker_attendance_admin_mutate');
 assert.equal(mutation.args.p_expected_revision,4);
 assert.equal(mutation.args.p_action,'edit');
 assert.deepEqual(mutation.args.p_record_ids,[recordId]);
 assert.equal(mutation.options.retryUnauthorized,false);
});

test('bulk deletion receipt is accepted only for the exact selected record count',async()=>{
 const second='00000000-0000-4000-8000-000000000023';
 const {client}=setup();
 const receipt=await client.mutateAttendanceRecords(board,{
  action:'bulk-delete',recordIds:[recordId,second],patch:{},reason:'',expectedRevision:4
 });
 assert.equal(receipt.deletedCount,2);
 assert.equal(receipt.changedCount,0);
});

test('unverified actor or incomplete mutation receipt is rejected',async()=>{
 const {client}=setup({receiptOverride:{actorId:employee}});
 await assert.rejects(()=>client.mutateAttendanceRecords(board,{
  action:'edit',recordIds:[recordId],patch:{location:'Office-Base Duty'},expectedRevision:4
 }),/unverified/);
});

test('invalid record IDs and excessive selection sizes are rejected before RPC',async()=>{
 const {client,calls}=setup();
 await assert.rejects(()=>client.attendanceAdminRecords(board,['not-a-uuid']),/selection is invalid/);
 await assert.rejects(()=>client.attendanceAdminRecords(board,Array(101).fill(recordId)),/selection is invalid/);
 assert.equal(calls.some(x=>x.name==='timetracker_attendance_admin_snapshot'),false);
});

test('IT Administrator may correct one session’s timestamps but never delete, bulk edit, GPS or ownership',async()=>{
 const {client,calls}=setup({role:'IT Administrator'});
 assert.equal((await client.attendanceAdminRecords(board,[recordId])).records.length,1);
 const receipt=await client.mutateAttendanceRecords(board,{
  action:'edit',recordIds:[recordId],
  patch:{clockInAt:'2026-11-16T00:20:00.000Z'},
  reason:'Employee submitted verified discrepancy',expectedRevision:4
 });
 assert.equal(receipt.changedCount,1);
 const before=calls.filter(x=>x.name==='timetracker_attendance_admin_mutate').length;
 for(const attempt of [
  {action:'delete',recordIds:[recordId],patch:{}},
  {action:'bulk-edit',recordIds:[recordId],patch:{clockInAt:'2026-11-16T00:20:00.000Z'}},
  {action:'edit',recordIds:[recordId],patch:{employeeId:employee}},
  {action:'edit',recordIds:[recordId],patch:{clockInGeo:{latitude:10,longitude:123}}},
  {action:'edit',recordIds:[recordId],patch:{clockInAt:'2026-11-16T00:20:00.000Z'},reason:'short'}
 ]){
  await assert.rejects(()=>client.mutateAttendanceRecords(board,{
   ...attempt,reason:attempt.reason||'Verified employee correction',expectedRevision:4
  }),/IT Administrator/);
 }
 assert.equal(calls.filter(x=>x.name==='timetracker_attendance_admin_mutate').length,before);
});
