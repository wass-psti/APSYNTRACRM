import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {ROW01_FIXTURE_MARKER,ROW01_FIXTURE_NAME,isRow01Fixture,readRow01Pending,
 prepareRow01Acceptance,finalizeRow01Acceptance,sanitizeRow01Report}
 from '../board-row01-signed-acceptance.js';

const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const groupId='33333333-3333-4333-8333-333333333333';
const actorId='44444444-4444-4444-8444-444444444444';
const itemId='55555555-5555-4555-8555-555555555555';
const runId='66666666-6666-4666-8666-666666666666';
function harness({name=ROW01_FIXTURE_NAME,description=ROW01_FIXTURE_MARKER,
 initial=[],edit=true,identity=actorId}={}){
 const storageData=new Map(),events=[];
 const storage={getItem:k=>storageData.get(k)||null,
  setItem:(k,v)=>storageData.set(k,v),removeItem:k=>storageData.delete(k)};
 let items=initial.map(x=>({...x})),addCalls=0,deleteCalls=0,casCalls=0;
 const auth={userId:identity,getVerifiedUser:async()=>({id:identity})};
 const ctx={user_id:identity,workspace_id:workspaceId,profile:{status:'active'}};
 const api={
  context:async()=>({...ctx}),
  allowed:async(_,scope)=>scope==='edit'&&edit,
  board:async()=>({board:{id:boardId,workspace_id:workspaceId,name,description,status:'active'},
   groups:[{id:groupId}],items:items.map(x=>({...x}))}),
  addItem:async(_,group,title)=>{
   addCalls++;
   items.push({id:itemId,board_id:boardId,group_id:group,title,created_by:identity});
   events.push({entity_id:itemId,actor_id:identity,event_type:'item.created'});
   return itemId;
  },
  setBoardCellCas:async(id,col,value,expected)=>{
   casCalls++;assert.equal(id,itemId);assert.equal(col,null);
   const found=items.find(i=>i.id===id);
   if(found?.title!==expected)throw new ApiError('Stale write',409,'PT409');
   found.title=value;
   events.push({entity_id:itemId,actor_id:identity,event_type:'item.cell_updated'});
  },
  deleteBoardItem:async id=>{
   deleteCalls++;items=items.filter(i=>i.id!==id);
   events.push({entity_id:id,actor_id:identity,event_type:'item.deleted'});
  },
  boardEvents:async()=>events.map(x=>({...x}))
 };
 return {storage,auth,api,ctx,counts:()=>({addCalls,casCalls,deleteCalls,items,events})};
}
function args(h,bootId='first-boot'){
 return {auth:h.auth,api:h.api,boardId,storage:h.storage,bootId,makeId:()=>runId};
}

test('successful signed fixture flow requires real reload, verifies CAS stale denial and removes only its owned item',async()=>{
 const h=harness();
 const prepared=await prepareRow01Acceptance(args(h));
 assert.equal(prepared.status,'AWAITING_RELOAD');
 assert.equal(prepared.checks.length,4);
 assert.equal(h.counts().addCalls,1);
 assert.equal(h.counts().casCalls,2);
 assert.equal(readRow01Pending(h.storage)?.phase,'READY');
 const noReload=await finalizeRow01Acceptance(args(h));
 assert.equal(noReload.status,'BLOCKED');
 assert.equal(h.counts().deleteCalls,0);
 const completed=await finalizeRow01Acceptance(args(h,'second-boot'));
 assert.equal(completed.status,'PASS');
 assert.equal(completed.checks.length,4);
 assert.deepEqual(h.counts().items,[]);
 assert.equal(h.counts().deleteCalls,1);
 assert.equal(readRow01Pending(h.storage),null);
 const report=sanitizeRow01Report(completed);
 assert.doesNotMatch(report,new RegExp(actorId+'|'+boardId+'|'+itemId+'|Bearer|JWT','i'));
 assert.match(report,/"status": "PASS"/);
});
test('operational board and a board with existing records fail closed with zero mutations',async()=>{
 const operational=harness({name:'Contacts',description:'Operational records'});
 const result=await prepareRow01Acceptance(args(operational));
 assert.equal(result.status,'FAIL');
 assert.equal(operational.counts().addCalls,0);
 const occupied=harness({initial:[{id:'77777777-7777-4777-8777-777777777777',
   board_id:boardId,group_id:groupId,title:'Existing contact',created_by:actorId}]});
 assert.equal((await prepareRow01Acceptance(args(occupied))).status,'FAIL');
 assert.equal(occupied.counts().addCalls,0);
 assert.equal(isRow01Fixture({id:boardId,workspace_id:workspaceId,name:'APSYNTRA QA',
  description:ROW01_FIXTURE_MARKER,status:'active'}),false);
});
test('denied signed edit blocks all writes and a stale journal cannot start another run',async()=>{
 const denied=harness({edit:false});
 assert.equal((await prepareRow01Acceptance(args(denied))).status,'FAIL');
 assert.equal(denied.counts().addCalls,0);
 const h=harness();
 assert.equal((await prepareRow01Acceptance(args(h))).status,'AWAITING_RELOAD');
 assert.equal((await prepareRow01Acceptance(args(h,'second-boot'))).status,'BLOCKED');
 assert.equal(h.counts().addCalls,1);
});
test('unexpected record owner prevents cleanup, signed refresh does not delete someone else data',async()=>{
 const h=harness();
 assert.equal((await prepareRow01Acceptance(args(h))).status,'AWAITING_RELOAD');
 const original=h.api.board;
 h.api.board=async()=>{
  const d=await original();
  d.items[0].created_by='88888888-8888-4888-8888-888888888888';
  return d;
 };
 const out=await finalizeRow01Acceptance(args(h,'after-refresh'));
 assert.equal(out.status,'BLOCKED');
 assert.equal(h.counts().deleteCalls,0);
 assert.ok(readRow01Pending(h.storage));
});
test('concurrent unrelated fixture item is preserved but prevents full acceptance',async()=>{
 const h=harness();
 assert.equal((await prepareRow01Acceptance(args(h))).status,'AWAITING_RELOAD');
 const orig=h.api.board;
 h.api.board=async()=>{
  const current=await orig();
  current.items.push({id:'99999999-9999-4999-8999-999999999999',
   board_id:boardId,group_id:groupId,title:'Unrelated QA record',created_by:actorId});
  return current;
 };
 const result=await finalizeRow01Acceptance(args(h,'reloaded'));
 assert.equal(result.status,'FAIL');
 assert.equal(result.checks.find(c=>c.id==='fixture-isolation-after-reload').status,'FAIL');
 assert.equal(h.counts().deleteCalls,1);
});
test('in-progress orphan recovery does not attest full PASS',async()=>{
 const h=harness();
 assert.equal((await prepareRow01Acceptance(args(h))).status,'AWAITING_RELOAD');
 const record=readRow01Pending(h.storage);
 record.phase='CREATED';
 h.storage.setItem('apsyntra.crm.row01-acceptance.v1',JSON.stringify(record));
 const result=await finalizeRow01Acceptance(args(h,'reloaded'));
 assert.equal(result.status,'FAIL');
 assert.equal(h.counts().deleteCalls,1);
 assert.equal(readRow01Pending(h.storage),null);
});
test('app exposes only explicit fixture acceptance actions and leaves production boards ineligible',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/row01-prepare/);
 assert.match(app,/row01-finalize/);
 assert.match(app,/isRow01Fixture\(board\)/);
 assert.match(app,/prepareRow01Acceptance\(/);
 assert.match(app,/finalizeRow01Acceptance\(/);
 assert.doesNotMatch(app,/automaticallyRunRow01/);
});
