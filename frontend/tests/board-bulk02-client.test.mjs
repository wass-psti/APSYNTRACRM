import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_BULK02_ENABLED,canBulkEditBoard,BoardBulkClient} from '../board-bulk02-client.js';

const boardId='30000000-0000-4000-8000-000000000001';
const foreignBoard='30000000-0000-4000-8000-000000000002';
const workspace='10000000-0000-4000-8000-000000000001';
const user='20000000-0000-4000-8000-000000000001';
const timestamp='2026-11-03T04:12:10.001+00:00';
const board={id:boardId,workspace_id:workspace,name:'Custom user board',
 description:'',status:'active'};
const itemA={id:'40000000-0000-4000-8000-000000000001',
 board_id:boardId,updated_at:timestamp};
const itemB={id:'40000000-0000-4000-8000-000000000003',
 board_id:boardId,updated_at:timestamp};
const group={id:'60000000-0000-4000-8000-000000000001',
 board_id:boardId,updated_at:timestamp};
function fake({authorized=true,cross=false,override=null}={}){
 const events=[];
 const ctx={user_id:user,workspace_id:cross?foreignBoard:workspace,profile:{status:'active'}};
 const api={
  context:async()=>{events.push(['context']);return ctx;},
  allowed:async(id,level)=>{events.push(['allowed',id,level]);return authorized;},
  rpc:async(name,args)=>{
   events.push([name,args]);
   if(override!==null)return override;
   if(name==='wm_board_bulk_mutate')return{
    boardId:args.p_board_id,action:args.p_action,applied:args.p_rows.length,
    items:args.p_rows.map(r=>({id:r.id,updatedAt:timestamp,archived:false}))
   };
   if(name==='wm_board_group_cas')return{
    boardId:args.p_board_id,groupId:args.p_group_id,action:args.p_action,
    updatedAt:args.p_action==='delete_empty'?null:timestamp
   };
   throw Error('Unexpected RPC');
  }
 };
 return {api,events};
}
test('default-disabled mutation client never submits production RPCs',async()=>{
 assert.equal(BOARD_BULK02_ENABLED,false);
 const x=fake(),client=new BoardBulkClient(x.api);
 await assert.rejects(()=>client.apply(board,'status',[itemA],{status:'done'}),/awaiting production activation/);
 await assert.rejects(()=>client.group(board,group,'delete_empty'),/awaiting production activation/);
 assert.equal(x.events.length,0);
});
test('atomic status batch sends one RPC with per-record CAS and authenticated scope',async()=>{
 const x=fake(),client=new BoardBulkClient(x.api,{enabled:true});
 const r=await client.apply(board,'status',[itemA,itemB],{status:'done'});
 assert.equal(r.applied,2);
 assert.deepEqual(x.events.map(e=>e[0]),['context','allowed','wm_board_bulk_mutate','context']);
 assert.equal(x.events[1][2],'edit');
 assert.equal(x.events[2][1].p_rows[0].expected_updated_at,timestamp);
 assert.equal(x.events[2][1].p_rows[1].status,'done');
});
test('atomic archive and restore use one RPC per operation with expected revisions',async()=>{
 const x=fake(),client=new BoardBulkClient(x.api,{enabled:true});
 assert.equal((await client.apply(board,'archive',[itemA])).action,'archive');
 assert.equal((await client.apply(board,'restore',[itemA])).action,'restore');
 assert.equal(x.events.filter(e=>e[0]==='wm_board_bulk_mutate').length,2);
});
test('protected application boards and stale/foreign/duplicate IDs denied before mutation',async()=>{
 const module={...board,name:'TimeTracker Attendance',
 description:'[APSYNTRA:MODULE:timetracker:v1]'};
 assert.equal(canBulkEditBoard(module),false);
 assert.equal(canBulkEditBoard({...board,name:'APSYNTRA QA'}),false);
 const x=fake(),client=new BoardBulkClient(x.api,{enabled:true});
 await assert.rejects(()=>client.apply(module,'archive',[itemA]),/Protected/);
 await assert.rejects(()=>client.apply(board,'status',[itemA,itemA],{status:'done'}),/duplicated/);
 await assert.rejects(()=>client.apply(board,'status',[{...itemA,board_id:foreignBoard}],{status:'done'}),/outside/);
 await assert.rejects(()=>client.apply(board,'status',[{...itemA,updated_at:'invalid'}],{status:'done'}),/stale/);
 assert.equal(x.events.length,0);
});
test('workspace mismatch and role ceiling deny edit and delete even with enabled flag',async()=>{
 const cross=fake({cross:true}),unauthorized=fake({authorized:false});
 await assert.rejects(()=>new BoardBulkClient(cross.api,{enabled:true})
  .apply(board,'status',[itemA],{status:'done'}),/workspace/);
 await assert.rejects(()=>new BoardBulkClient(unauthorized.api,{enabled:true})
  .group(board,group,'delete_empty'),/role/);
 assert.equal(cross.events.some(e=>e[0]==='wm_board_bulk_mutate'),false);
 assert.equal(unauthorized.events.some(e=>e[0]==='wm_board_group_cas'),false);
});
test('group rename and delete require exact group CAS and different permission levels',async()=>{
 const x=fake(),client=new BoardBulkClient(x.api,{enabled:true});
 await client.group(board,group,'rename',{title:' New Name '});
 assert.equal(x.events.find(e=>e[0]==='wm_board_group_cas')[1].p_title,'New Name');
 assert.equal(x.events.find(e=>e[0]==='wm_board_group_cas')[1].p_expected_updated_at,timestamp);
 await client.group(board,group,'delete_empty');
 assert.deepEqual(x.events.filter(e=>e[0]==='allowed').map(e=>e[2]),['edit','manage']);
});
test('malformed RPC receipts and unsupported actions fail without success claims',async()=>{
 const x=fake({override:{boardId:boardId,action:'status',applied:1,items:[]}});
 const client=new BoardBulkClient(x.api,{enabled:true});
 await assert.rejects(()=>client.apply(board,'status',[itemA],{status:'done'}),/receipt/);
 await assert.rejects(()=>client.apply(board,'delete',[itemA]),/requires 1/);
 await assert.rejects(()=>client.group(board,group,'delete'),/Unsupported/);
});
test('staged candidate maintains no direct production write paths and closed defaults',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const client=readFileSync('frontend/board-bulk02-client.js','utf8');
 assert.match(client,/BOARD_BULK02_ENABLED=false/);
 assert.doesNotMatch(client,/wm_delete_board_group|wm_delete_board_item/);
 assert.match(client,/wm_board_bulk_mutate/);
 assert.match(client,/wm_board_group_cas/);
 assert.match(app,/case 'bulk-export'/);
});
