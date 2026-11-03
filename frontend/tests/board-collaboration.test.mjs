import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_COL01_ITEM_READS_ENABLED,loadBoardCollaboration,
 renderBoardCollaboration} from '../board-collaboration.js';
const item='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444';
const file='55555555-5555-4555-8555-555555555555';
function client({updates=[],files=[],call=()=>{}}={}){
 return {rpc:async(name,args)=>{call(name,args);
  if(name==='wm_list_board_item_updates')return updates;
  if(name==='wm_list_board_item_files')return files;
  throw Error('Unexpected RPC');
 }};
}
test('COL01 production gate is disabled and emits zero requests',async()=>{
 let count=0;
 assert.equal(BOARD_COL01_ITEM_READS_ENABLED,false);
 const result=await loadBoardCollaboration(client({call:()=>count++}),item);
 assert.deepEqual(result,{status:'LOCKED',updates:[],files:[]});
 assert.equal(count,0);
 assert.match(renderBoardCollaboration(result),/await signed collaboration security approval/);
});
test('enabled mock contract uses signed bounded RPCs and never renders storage keys or HTML',async()=>{
 const calls=[];
 const result=await loadBoardCollaboration(client({
  updates:[{id:12,item_id:item,body:'<img src=x onerror=1> & update',
   created_at:'2026-11-03T00:00:00Z'}],
  files:[{id:file,item_id:item,file_name:'<script>file</script>.pdf',
   storage_path:'private/secret',size_bytes:2048,mime_type:'application/pdf'}],
  call:(name,args)=>calls.push([name,args])
 }),item,{enabled:true});
 assert.equal(result.status,'VERIFIED_READ');
 assert.deepEqual(calls.map(c=>c[0]),[
  'wm_list_board_item_updates','wm_list_board_item_files'
 ]);
 assert.ok(calls.every(c=>c[1].p_item_id===item&&c[1].p_limit===50));
 assert.doesNotMatch(JSON.stringify(result),/private\/secret/);
 const html=renderBoardCollaboration(result);
 assert.match(html,/&lt;img src=x onerror=1&gt; &amp; update/);
 assert.match(html,/&lt;script&gt;file&lt;\/script&gt;\.pdf/);
 assert.doesNotMatch(html,/<script>|<img|private\/secret|href=|download=|data-action=/);
});
test('malformed and cross-item server results deny all content',async()=>{
 for(const input of [
  {updates:[{id:1,item_id:other,body:'foreign'}]},
  {updates:[{id:0,item_id:item,body:'bad id'}]},
  {updates:[{id:1,item_id:item,body:{html:'unsafe'}}]},
  {files:[{id:file,item_id:other,file_name:'wrong',size_bytes:1}]},
  {files:[{id:file,item_id:item,file_name:'bad',size_bytes:-1}]},
  {updates:Array(51).fill({id:1,item_id:item,body:'many'})},
  {files:'bad'}
 ])await assert.rejects(()=>loadBoardCollaboration(client(input),item,{enabled:true}));
 await assert.rejects(()=>loadBoardCollaboration(client(),'not-a-uuid',{enabled:true}));
});
test('backend 42501 denial has no direct-table fallback',async()=>{
 const seen=[];
 await assert.rejects(()=>loadBoardCollaboration({rpc:async name=>{
  seen.push(name);throw Error('42501');
 }},item,{enabled:true}),/42501/);
 assert.deepEqual(seen,['wm_list_board_item_updates','wm_list_board_item_files']);
});
test('signed board drawer uses the integration, not a write RPC',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/loadBoardCollaboration\(db,itemId\)/);
 assert.match(app,/renderBoardCollaboration\(collaboration\)/);
 assert.match(app,/boardHistoryAuthorized\(snapshot\)/);
 assert.doesNotMatch(app,/wm_board_invitable_users\(|wm_add_board_member\(/);
});
