import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardBulkClient,canBulkEditBoard} from '../board-bulk02-client.js';
const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const recordId='33333333-3333-4333-8333-333333333333';
const actorId='44444444-4444-4444-8444-444444444444';
const board={id:boardId,workspace_id:workspaceId,
 name:'Contacts',description:'',status:'active'};
const row={id:recordId,board_id:boardId,updated_at:'2026-11-05T10:12:00Z'};
function client(mode){
 const called=[];
 const api={
  context:async()=>({user_id:actorId,workspace_id:workspaceId,profile:{status:'active'}}),
  allowed:async()=>true,
  rpc:async(name,args)=>{
   called.push({name,args});
   if(mode==='transport')throw new TypeError('Failed to fetch');
   if(mode==='server'){
    const error=new Error('Server unavailable');error.status=503;throw error;
   }
   if(mode==='cas'){
    const error=new Error('Stale item revision');error.status=409;throw error;
   }
   return {boardId,action:'status',applied:mode==='receipt'?0:1,
    items:[{id:recordId,updatedAt:'2026-11-05T10:12:01Z'}]};
  }
 };
 return {client:new BoardBulkClient(api,{enabled:true}),called};
}
test('generic atomic bulk actions never target protected TimeTracker or named domain boards',async()=>{
 for(const name of ['TimeTracker Attendance','Material Request Hub',
  'FuelTrans Standalone','Tool Traceability']){
  const protectedBoard={...board,name};
  assert.equal(canBulkEditBoard(protectedBoard),false);
  const {client:writer,called}=client('success');
  await assert.rejects(()=>writer.apply(protectedBoard,'status',[row],{status:'done'}),
   /Protected and application-owned/);
  assert.deepEqual(called,[]);
 }
 assert.equal(canBulkEditBoard(board),true);
});
test('ambiguous transport, server, and receipt errors never claim confirmed success',async()=>{
 for(const mode of ['transport','server','receipt']){
  const {client:writer,called}=client(mode);
  await assert.rejects(()=>writer.apply(board,'status',[row],{status:'done'}),
   error=>error.bulkOutcomeUncertain===true&&/Do not retry blindly/.test(error.message));
  assert.equal(called.length,1);
 }
});
test('definitive stale CAS is not mislabeled as an uncertain committed write',async()=>{
 const {client:writer,called}=client('cas');
 await assert.rejects(()=>writer.apply(board,'status',[row],{status:'done'}),
  error=>error.status===409&&error.bulkOutcomeUncertain!==true);
 assert.equal(called.length,1);
});
test('contextual toolbar offers only supported server action choices with explicit confirmation',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/data-action="bulk-actions"/);
 assert.match(app,/case 'bulk-actions'/);
 assert.match(app,/\[\['archive','Archive selected items'\]/);
 assert.match(app,/\['status','Set status on selected items'\]/);
 assert.match(app,/one revision-checked atomic server transaction/);
 assert.match(app,/Protected application records: selection and export only/);
 assert.match(app,/if\(error\?\.bulkOutcomeUncertain===true\)/);
 assert.match(app,/clearBulkActivation\(\)/);
 assert.doesNotMatch(app,/data-action="bulk-field-edit"/);
 assert.doesNotMatch(app,/data-action="bulk-delete-all"/);
});
