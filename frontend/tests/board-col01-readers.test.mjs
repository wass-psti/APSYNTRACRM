import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_COL01_DIRECTORY_ENABLED,BOARD_COL01_AUDIT_CURSOR_ENABLED,
 BOARD_COL01_AUDIT_MAX_PAGES,loadBoardInvitableDirectory,renderBoardInvitableDirectory,
 loadBoardAuditCursorPage,renderBoardAuditCursorPage} from '../board-col01-readers.js';

const board='33333333-3333-4333-8333-333333333333';
const person='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
function api({manage=true,users=[],events=[]}={}){
 const calls=[];
 return {calls,allowed:async(id,scope)=>{
  calls.push(['allowed',id,scope]);return manage;
 },rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='wm_board_invitable_users')return users;
  if(name==='wm_list_board_events_page')return events;
  throw Error('Unexpected RPC: '+name);
 }};
}
const event=id=>({id,event_type:'item.updated',message:'Changed',actor_id:actor,
 actor_name:'Authorized user',entity_type:'item',entity_id:'item-1',
 created_at:'2026-11-03T00:00:00Z'});

test('default-disabled readers emit zero new network calls',async()=>{
 assert.equal(BOARD_COL01_DIRECTORY_ENABLED,false);
 assert.equal(BOARD_COL01_AUDIT_CURSOR_ENABLED,false);
 const client=api();
 assert.deepEqual(await loadBoardInvitableDirectory(client,board),
  {status:'LOCKED',users:[],query:''});
 assert.deepEqual(await loadBoardAuditCursorPage(client,board),
  {status:'LOCKED',rows:[],nextCursor:null,hasMore:false});
 assert.deepEqual(client.calls,[]);
 assert.doesNotMatch(renderBoardInvitableDirectory({status:'LOCKED'}),/data-col01-directory-search/);
});
test('directory checks signed manage access before requesting member emails',async()=>{
 const client=api({manage:false,users:[{user_id:person,email:'secret@example.test'}]});
 const result=await loadBoardInvitableDirectory(client,board,{enabled:true});
 assert.equal(result.status,'DENIED');
 assert.deepEqual(result.users,[]);
 assert.deepEqual(client.calls,[['allowed',board,'manage']]);
 assert.doesNotMatch(renderBoardInvitableDirectory(result),/secret@example.test|data-col01-directory-search/);
});
test('directory runs manager-only bounded search, escapes all rendered fields',async()=>{
 const client=api({users:[{user_id:person,display_name:'<img src=x onerror=1>',
  email:'<script>@example.test',board_role:null}]});
 const result=await loadBoardInvitableDirectory(client,board,{
  enabled:true,query:'   <manager>  '});
 assert.equal(result.status,'VERIFIED_READ');
 assert.deepEqual(client.calls,[
  ['allowed',board,'manage'],
  ['wm_board_invitable_users',{p_board_id:board,p_query:'<manager>'}]
 ]);
 const html=renderBoardInvitableDirectory(result);
 assert.match(html,/&lt;img src=x onerror=1&gt;/);
 assert.match(html,/&lt;script&gt;@example.test/);
 assert.match(html,/value="&lt;manager&gt;"/);
 assert.doesNotMatch(html,/<script>|<img|data-action="invite"|wm_add_board_member/);
});
test('directory rejects malformed, duplicate, oversized or elevated roles',async()=>{
 for(const users of [
  [{user_id:'not-a-uuid',email:'a@example.test'}],
  [{user_id:person,email:'a@example.test',board_role:'admin'}],
  [{user_id:person,email:'a@example.test'},{user_id:person,email:'b@example.test'}],
  Array.from({length:41},()=>({user_id:person,email:'x@example.test'})),
  {users:[]}
 ])await assert.rejects(()=>loadBoardInvitableDirectory(api({users}),board,{enabled:true}));
 await assert.rejects(()=>loadBoardInvitableDirectory(api(),board,{enabled:true,query:'x'.repeat(121)}));
 await assert.rejects(()=>loadBoardInvitableDirectory(api(),'invalid',{enabled:true}));
});
test('audit query preserves exact BIGINT cursor and requests bounded one-row lookahead',async()=>{
 const client=api({events:[event('9007199254740993'),event('9007199254740992'),
  event('9007199254740991')]});
 const page=await loadBoardAuditCursorPage(client,board,{
  enabled:true,beforeId:'9007199254740994',limit:2});
 assert.deepEqual(client.calls,[['wm_list_board_events_page',{
  p_board_id:board,p_before_id:'9007199254740994',p_limit:3}]]);
 assert.equal(page.status,'VERIFIED_READ');
 assert.deepEqual(page.rows.map(e=>e.id),['9007199254740993','9007199254740992']);
 assert.equal(page.nextCursor,'9007199254740992');
 assert.equal(page.hasMore,true);
 assert.match(renderBoardAuditCursorPage(page,{pageIndex:1}),/Server page 2/);
});
test('audit rejects unsafe numeric cursors, invalid actors and non-descending pages',async()=>{
 for(const events of [
  [event(8),event(8)],
  [event(9),event(10)],
  [event(12)],
  [{...event(8),actor_id:'invalid'}],
  [{...event(8),created_at:'invalid'}],
  [event(Number.MAX_SAFE_INTEGER+1)],
  Array.from({length:27},(_,i)=>event(100-i))
 ]){
  const before=events[0]?.id===12?'12':null;
  await assert.rejects(()=>loadBoardAuditCursorPage(api({events}),board,{
   enabled:true,beforeId:before,limit:25}));
 }
 await assert.rejects(()=>loadBoardAuditCursorPage(api(),board,{enabled:true,beforeId:'0'}));
 await assert.rejects(()=>loadBoardAuditCursorPage(api(),board,{enabled:true,beforeId:1.2}));
 await assert.rejects(()=>loadBoardAuditCursorPage(api(),board,{enabled:true,limit:100}));
});
test('audit escapes all untrusted fields and disables out-of-bounds paging',()=>{
 const page={status:'VERIFIED_READ',rows:[{
  id:'4',eventType:'<img src=x>',message:'<script>alert(1)</script>',
  actorName:'<b>Name</b>',entityType:'item',entityId:'<secret>',
  createdAt:'2026-11-03T00:00:00Z'
 }],hasMore:true,nextCursor:'4'};
 const html=renderBoardAuditCursorPage(page,{pageIndex:0});
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>|<img src|<b>Name<\/b>|data-action="delete"/);
 assert.match(html,/data-board-history-action="cursor-previous" disabled/);
 assert.match(html,/data-board-history-action="cursor-next"/);
 assert.equal(BOARD_COL01_AUDIT_MAX_PAGES,20);
 assert.match(renderBoardAuditCursorPage(page,{pageIndex:19}),/cursor-next" disabled/);
});
test('signed RPC access denial cannot fall back to broad table queries',async()=>{
 const calls=[];
 const deny={allowed:async()=>true,rpc:async name=>{calls.push(name);throw Error('42501 denied');}};
 await assert.rejects(()=>loadBoardInvitableDirectory(deny,board,{enabled:true}),/42501/);
 await assert.rejects(()=>loadBoardAuditCursorPage(deny,board,{enabled:true}),/42501/);
 assert.deepEqual(calls,['wm_board_invitable_users','wm_list_board_events_page']);
});
test('app connects both default-disabled readers and keeps current activity route',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/loadBoardInvitableDirectory\(db,snapshot\.boardId\)/);
 assert.match(app,/loadBoardAuditCursorPage\(db,snapshot\.boardId/);
 assert.match(app,/renderBoardInvitableDirectory\(directory\)/);
 assert.match(app,/renderBoardAuditCursorPage\(/);
 assert.match(app,/BOARD_COL01_AUDIT_CURSOR_ENABLED/);
 assert.match(app,/db\.boardEvents\(snapshot\.boardId,100\)/);
 assert.match(app,/db\.boardEvents\(current\.boardId,limit\)/);
 assert.doesNotMatch(app,/wm_add_board_member\(/);
});
