import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DomainApi} from '../data.js';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const boardId='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const board={board:{id:boardId,workspace_id:workspace},groups:[],members:[],columns:[],items:[],values:[]};
const scope={userId:user,workspaceId:workspace};
function fixture({reply=()=>board}={}){
 const calls=[];
 const auth={userId:user,accessToken:'session-a',authorized:async(path,options)=>{
  calls.push({path,body:options?.body});
  if(path.endsWith('/wm_get_board_shell')){
   const value=await reply('/rest/v1/rpc/wm_get_board_shell',options);
   return value?.board?{board:value.board,groups:value.groups||[],
    members:value.members||[],columns:value.columns||[]}:value;
  }
  if(path.endsWith('/wm_get_board_items_page'))
   return {items:[],values:[],has_more:false,next_cursor:null};
  return reply(path,options);
 }};
 const api=new DomainApi(auth);
 // This fixture represents the pre-m143-v2 backend, which does not expose
 // the new optional extended-reference read RPC.
 api.extendedRefsSupported=false;
 return {api,auth,calls};
}
test('cache coalesces simultaneous scoped board loads and independently returns data',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const {api,calls}=fixture({reply:async()=>{await gate;return board;}});
 const a=api.boardCached(boardId,scope);
 const b=api.boardCached(boardId,scope);
 release();
 const [left,right]=await Promise.all([a,b]);
 assert.equal(calls.length,2);
 assert.deepEqual(left,board);
 assert.deepEqual(right,board);
 assert.notEqual(left,right);
 left.board.workspace_id=foreign;
 assert.equal((await api.boardCached(boardId,scope)).board.workspace_id,workspace);
 assert.equal(calls.length,2);
});
test('new user, workspace and access token cannot reuse an earlier board response',async()=>{
 const {api,auth,calls}=fixture();
 await api.boardCached(boardId,scope);
 await assert.rejects(()=>api.boardCached(boardId,{...scope,userId:other}),/scope/);
 await api.boardCached(boardId,{...scope,workspaceId:foreign}).then(
  ()=>assert.fail('foreign data accepted'),error=>assert.match(error.message,/workspace mismatch/));
 await api.boardCached(boardId,scope);
 auth.accessToken='session-b';
 await api.boardCached(boardId,scope);
 assert.equal(calls.length,8);
});
test('mutating RPC invalidates snapshots, but Board UI and pagination reads do not',async()=>{
 const {api,calls}=fixture();
 await api.boardCached(boardId,scope);
 await api.rpc('wm_board_ui_read',{p_board_id:boardId});
 await api.rpc('wm_get_board_shell',{p_board_id:boardId});
 await api.rpc('wm_get_board_items_page',{
  p_board_id:boardId,p_after_position:null,p_after_id:null,p_limit:200
 });
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board_shell')).length,2);
 await api.rpc('wm_update_board_group',{p_group_id:user,p_title:'Renamed'});
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board_shell')).length,3);
 api.invalidateBoardCache();
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board_shell')).length,4);
});
test('inflight invalidation re-fetches before returning; stale version never renders',async()=>{
 let finish;let calls=0;
 const updated={...board,board:{...board.board,updated_at:'2026-11-09T11:00:00Z'}};
 const {api}=fixture({reply:async()=>{
  calls++;if(calls===1)return new Promise(resolve=>{finish=()=>resolve(board);});
  return updated;
 }});
 const request=api.boardCached(boardId,scope);
 api.invalidateBoardCache();
 finish();
 const result=await request;
 assert.equal(result.board.updated_at,updated.board.updated_at);
 assert.deepEqual(await api.boardCached(boardId,scope),updated);
 assert.equal(calls,2);
});
test('failed or foreign board responses cannot poison cache',async()=>{
 let attempt=0;
 const {api}=fixture({reply:async()=>{
  attempt++;if(attempt===1)throw Error('offline');
  if(attempt===2)return {board:{...board.board,workspace_id:foreign}};
  return board;
 }});
 await assert.rejects(()=>api.boardCached(boardId,scope),/offline/);
 await assert.rejects(()=>api.boardCached(boardId,scope),/workspace mismatch/);
 assert.deepEqual(await api.boardCached(boardId,scope),board);
 assert.equal(attempt,3);
});
test('integration requires a signed view check and invalidates across lifecycle boundaries',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/db\.boardCached\(boardId,/);
 assert.match(source,/db\.allowed\(boardId,'view'\)/);
 assert.match(source,/onInvalidate:async event=>\{/);
 assert.match(source,/for\(const id of event.boardIds\)db\.invalidateBoardCache\(id\)/);
 assert.match(source,/auth\.onExpired=\(\)=>\{boardCacheChannel\.stop\(\);db\.invalidateBoardCache\(\)/);
});

test('cache retains at most eight active board snapshots and no persistent storage',async()=>{
 const {api}=fixture({reply:(_path,options)=>({board:{id:options.body.p_board_id,workspace_id:workspace}})});
 const idFor=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 for(let i=1;i<=10;i++)await api.boardCached(idFor(i),scope);
 assert.equal(api.boardReadCache.size,8);
 assert.equal(api.boardReadCache.has(idFor(1)),false);
 const source=readFileSync(new URL('../data.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|caches\.open/);
});

test('read-only event and document queries preserve cached board snapshots',async()=>{
 const {api,calls}=fixture();
 await api.boardCached(boardId,scope);
 await api.rpc('wm_list_board_events',{p_board_id:boardId});
 await api.rpc('wm_list_board_events_page',{p_board_id:boardId});
 await api.rpc('tl03_documents_page',{p_board_id:boardId});
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board_shell')).length,1);
});
test('successful scoped mutation invalidates only its board, preserving other boards',async()=>{
 const second='00000000-0000-4000-8000-000000000009';
 const {api,calls}=fixture({reply:(path,options)=>path.endsWith('/wm_get_board_shell')?
  {board:{id:options.body.p_board_id,workspace_id:workspace}}:true});
 await api.boardCached(boardId,scope);
 await api.boardCached(second,scope);
 await api.rpc('wm_board_group_cas',{p_board_id:boardId});
 await api.boardCached(second,scope);
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board_shell')).length,3);
});
test('denied known mutations do not evict authorized board cache',async()=>{
 const {api,calls}=fixture({reply:(path)=>{
  if(path.endsWith('/wm_board_group_cas'))throw Error('permission denied');
  return board;
 }});
 await api.boardCached(boardId,scope);
 await assert.rejects(()=>api.rpc('wm_board_group_cas',{p_board_id:boardId}),/denied/);
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board_shell')).length,1);
});
test('concurrent bootstrap identity verification does not invalidate startup board-list reads',async()=>{
 let releaseBoardList,markBoardListStarted;
 const boardListStarted=new Promise(resolve=>{markBoardListStarted=resolve;});
 const boardListGate=new Promise(resolve=>{releaseBoardList=resolve;});
 const {api,calls}=fixture({reply:async(path)=>{
  if(path.endsWith('/wm_list_boards')){markBoardListStarted();await boardListGate;return [];}
  if(path.endsWith('/apsyntra_role_is_bootstrap'))return true;
  return board;
 }});
 const boardsPending=api.boards('active');
 await boardListStarted;
 const bootstrapVerified=await api.rpc('apsyntra_role_is_bootstrap');
 releaseBoardList();
 assert.equal(bootstrapVerified,true);
 assert.deepEqual(await boardsPending,[]);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_list_boards')).length,1);
});

test('unknown RPC remains conservative and invalidates cached snapshots',async()=>{
 const {api,calls}=fixture();
 await api.boardCached(boardId,scope);
 await api.rpc('future_unknown_rpc',{p_board_id:boardId});
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board_shell')).length,2);
});
