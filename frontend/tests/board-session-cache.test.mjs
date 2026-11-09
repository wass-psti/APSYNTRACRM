import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DomainApi} from '../data.js';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const boardId='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const board={board:{id:boardId,workspace_id:workspace},groups:[],items:[]};
const scope={userId:user,workspaceId:workspace};
function fixture({reply=()=>board}={}){
 const calls=[];
 const auth={userId:user,accessToken:'session-a',authorized:async(path,options)=>{
  calls.push({path,body:options?.body});
  return reply(path,options);
 }};
 return {api:new DomainApi(auth),auth,calls};
}
test('cache coalesces simultaneous scoped board loads and independently returns data',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const {api,calls}=fixture({reply:async()=>{await gate;return board;}});
 const a=api.boardCached(boardId,scope);
 const b=api.boardCached(boardId,scope);
 release();
 const [left,right]=await Promise.all([a,b]);
 assert.equal(calls.length,1);
 assert.deepEqual(left,board);
 assert.deepEqual(right,board);
 assert.notEqual(left,right);
 left.board.workspace_id=foreign;
 assert.equal((await api.boardCached(boardId,scope)).board.workspace_id,workspace);
 assert.equal(calls.length,1);
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
 assert.equal(calls.length,4);
});
test('mutating RPC invalidates snapshots, but read-only Board UI RPC does not',async()=>{
 const {api,calls}=fixture();
 await api.boardCached(boardId,scope);
 await api.rpc('wm_board_ui_read',{p_board_id:boardId});
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board')).length,1);
 await api.rpc('wm_update_board_group',{p_group_id:user,p_title:'Renamed'});
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board')).length,2);
 api.invalidateBoardCache();
 await api.boardCached(boardId,scope);
 assert.equal(calls.filter(c=>c.path.endsWith('/wm_get_board')).length,3);
});
test('inflight invalidation never reinstates stale cached data',async()=>{
 let finish;let calls=0;
 const {api}=fixture({reply:async()=>{
  calls++;if(calls===1)return new Promise(resolve=>{finish=()=>resolve(board);});
  return board;
 }});
 const request=api.boardCached(boardId,scope);
 api.invalidateBoardCache();
 finish();await request;
 await api.boardCached(boardId,scope);
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
 assert.match(source,/onInvalidate:async event=>\{\s*db\.invalidateBoardCache\(\)/);
 assert.match(source,/auth\.onExpired=\(\)=>\{db\.invalidateBoardCache\(\)/);
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
