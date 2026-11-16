import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardTrashPermanentDeleteClient,eligibleTrashBoard} from '../board-trash-permanent-delete.js';

const user='10000000-0000-4000-8000-000000000001';
const workspace='20000000-0000-4000-8000-000000000001';
const id='30000000-0000-4000-8000-000000000001';
const second='30000000-0000-4000-8000-000000000002';
const timestamp='2026-11-16T00:00:00.000Z';
const board={id,name:'Ordinary board',status:'trashed',workspace_id:workspace,updated_at:timestamp,member_role:'owner'};
function fixture({current=board,ctx={user_id:user,workspace_id:workspace,profile:{status:'active'}},allowed=true,rpc}={}){
 const calls=[];
 const api={
  context:async()=>{calls.push('context');return ctx;},
  allowed:async()=>{calls.push('allowed');return allowed;},
  board:async()=>{calls.push('board');return {board:current};},
  rpc:async(name,args)=>{calls.push(name);if(rpc)return rpc(name,args);return null;}
 };
 return {calls,api};
}
test('only ordinary trashed boards are eligible, never active or protected module boards',()=>{
 assert.equal(eligibleTrashBoard(board),true);
 assert.equal(eligibleTrashBoard({...board,status:'active'}),false);
 assert.equal(eligibleTrashBoard({...board,status:'archived'}),false);
 assert.equal(eligibleTrashBoard({...board,name:'APSYNTRA QA'}),false);
 assert.equal(eligibleTrashBoard({...board,description:'[APSYNTRA:MODULE:timetracker:v1]'}),false);
});
test('single deletion confirms signed context, server manage access, and current board before one RPC',async()=>{
 const f=fixture();
 const receipt=await new BoardTrashPermanentDeleteClient(f.api).delete(board);
 assert.equal(receipt.boardId,id);
 assert.deepEqual(f.calls,['context','allowed','board','context','wm_delete_board_permanently']);
});
test('inactive, foreign workspace, denied manager, changed metadata, and restored board never mutate',async()=>{
 const cases=[
  {ctx:{user_id:user,workspace_id:workspace,profile:{status:'inactive'}}},
  {allowed:false},
  {current:{...board,workspace_id:'90000000-0000-4000-8000-000000000001'}},
  {current:{...board,status:'active'}},
  {current:{...board,name:'Changed title'}},
  {current:{...board,updated_at:'2026-11-16T00:01:00.000Z'}}
 ];
 for(const options of cases){
  const f=fixture(options);
  await assert.rejects(new BoardTrashPermanentDeleteClient(f.api).delete(board));
  assert.equal(f.calls.includes('wm_delete_board_permanently'),false);
 }
});
test('duplicate deletion cannot issue concurrent RPCs',async()=>{
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const f=fixture({rpc:async()=>pending});
 const client=new BoardTrashPermanentDeleteClient(f.api);
 const first=client.delete(board);
 await assert.rejects(client.delete(board),/already in progress/);
 release();await first;
 assert.equal(f.calls.filter(x=>x==='wm_delete_board_permanently').length,1);
});
test('bulk deletion is capped at 50 and stops on first failure without retries',async()=>{
 const b2={...board,id:second,name:'Another board'};
 const f=fixture({rpc:async(name,args)=>{if(args.p_board_id===second)throw new Error('denied');}});
 f.api.board=async(boardId)=>({board:boardId===id?board:b2});
 const client=new BoardTrashPermanentDeleteClient(f.api);
 let error;
 try{await client.deleteMany([board,b2]);}catch(e){error=e;}
 assert.deepEqual(error.deletedIds,[id]);
 assert.equal(f.calls.filter(x=>x==='wm_delete_board_permanently').length,2);
 await assert.rejects(client.deleteMany([board,board]),/distinct/);
 await assert.rejects(client.deleteMany(Array.from({length:51},(_,i)=>({...board,id:'30000000-0000-4000-8000-'+String(i).padStart(12,'0')}))),/between 1 and 50/);
});
test('UI provides single and selected permanent-delete actions with explicit typed confirmation',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/board-catalog-experience.css','utf8');
 assert.match(app,/data-action="board-card-permanent-delete"/);
 assert.match(app,/data-action="trash-board-bulk-permanent-delete"/);
 assert.match(app,/data-trash-board-select/);
 assert.match(app,/case 'board-card-permanent-delete'/);
 assert.match(app,/case 'trash-board-bulk-permanent-delete'/);
 assert.match(app,/fd\.get\('confirmDelete'\)/);
 assert.match(app,/snapshot\.map\(board=>'<li>'\+e\(board\.name\)/);
 assert.match(app,/DELETE '\+snapshot\.length\+' BOARDS/);
 assert.match(app,/await trashPermanentDelete\.delete\(board\)/);
 assert.match(app,/await trashPermanentDelete\.deleteMany\(snapshot/);
 assert.match(css,/\.boards-trash-bulk/);
 assert.match(css,/\.board-trash-select/);
});
test('SQL requires trashed state and existing signed manage access; preserves storage and workspace records',()=>{
 const sql=readFileSync('supabase/migrations/20261116005252_cp_board_trash_permanent_delete_01.sql','utf8');
 assert.match(sql,/public\.work_board_access\(p_board_id, 'manage'\)/);
 assert.match(sql,/b\.status <> 'trashed'/);
 assert.match(sql,/private\.wm_board_is_protected\(b\.id\)/);
 assert.match(sql,/work_board_item_files/);
 assert.match(sql,/storage\.objects/);
 assert.match(sql,/public\.timetracker_attendance_mutation_audit/);
 assert.match(sql,/public\.tradelink_document_events/);
 assert.match(sql,/private\.mrh_material_create_requests/);
 assert.match(sql,/DELETE FROM public\.work_boards WHERE id = b\.id/);
 assert.doesNotMatch(sql,/DELETE FROM (?:auth\.users|public\.profiles|public\.workspaces|storage\.objects)/i);
});
