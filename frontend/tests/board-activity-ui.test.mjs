import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeBoardActivity,filterBoardActivity,pageBoardActivity,
 renderBoardActivityResults,renderBoardActivityActorAvatar,boardItemSummary,BOARD_ACTIVITY_PAGE_SIZE} from '../board-activity-ui.js';
import {boardGrid} from '../board-grid.js';
const events=[
 {id:9,event_type:'item.updated',message:'Status to Done',actor_name:'Alex',actor_id:'a',
  created_at:'2026-11-01T09:00:00Z',entity_type:'item',entity_id:'i-1'},
 {id:7,event_type:'item.created',message:'Created',actor_name:'Blair',actor_id:'b',
  created_at:'2026-10-31T09:00:00Z',entity_type:'item',entity_id:'i-2'},
 {id:8,event_type:'member.updated',message:'Membership changed',actor_name:'Alex',actor_id:'a',
  created_at:'2026-11-01T08:00:00Z',entity_type:'member',entity_id:'i-3'}
];
test('signed activity rows are normalized, deduplicated and newest first',()=>{
 const normalized=normalizeBoardActivity([...events,events[0],null,{id:'bad',event_type:'invalid'}]);
 assert.deepEqual(normalized.map(x=>x.id),[9,8,7]);
 assert.equal(normalized[0].eventType,'item.updated');
 assert.equal(normalized[0].actorName,'Alex');
});
test('activity filtering enforces action, actor and text without mutating source',()=>{
 const rows=normalizeBoardActivity(events);
 assert.deepEqual(filterBoardActivity(rows,{type:'item.created'}).map(x=>x.id),[7]);
 assert.deepEqual(filterBoardActivity(rows,{actor:'a'}).map(x=>x.id),[9,8]);
 assert.deepEqual(filterBoardActivity(rows,{search:'status'}).map(x=>x.id),[9]);
 assert.deepEqual(filterBoardActivity(rows,{search:'i-2'}).map(x=>x.id),[7]);
 assert.equal(rows.length,3);
});
test('activity pagination caps page count and never exceeds the authorized in-memory window',()=>{
 const rows=normalizeBoardActivity(Array.from({length:75},(_,i)=>({
  id:i+1,event_type:'event',actor_id:'a',created_at:'2026-10-01T00:00:00Z'
 })));
 const first=pageBoardActivity(rows,0,25),last=pageBoardActivity(rows,100,25);
 assert.equal(BOARD_ACTIVITY_PAGE_SIZE,25);
 assert.deepEqual(first.rows.map(x=>x.id).slice(0,2),[75,74]);
 assert.equal(last.page,2);assert.equal(last.rows.length,25);
 assert.equal(pageBoardActivity(rows,-5,30).page,0);
 assert.equal(pageBoardActivity(rows,1,500).rows.length,25);
});
test('activity rendering escapes backend-controlled text and exposes functional filter/navigation controls',()=>{
 const rows=normalizeBoardActivity([{id:1,event_type:'<img src=x onerror=alert(1)>',
  message:'<script>alert("x")</script>',actor_name:'<b>Admin</b>',actor_id:'user',
  created_at:'2026-11-02T10:00:00Z'}]);
 const ui=renderBoardActivityResults(rows,{limit:100});
 assert.match(ui.html,/board-activity-search/);
 assert.match(ui.html,/board-activity-type/);
 assert.match(ui.html,/board-activity-actor/);
 assert.match(ui.html,/data-board-history-action="refresh"/);
 assert.match(ui.html,/data-board-history-action="previous"/);
 assert.match(ui.html,/data-board-history-action="next"/);
 assert.doesNotMatch(ui.html,/<script>|<img src=/);
 assert.match(ui.html,/&lt;script&gt;/);
 assert.equal(ui.total,1);
});
test('activity avatars are signed-actor scoped and safely fall back to initials',()=>{
 const actor='33333333-3333-4333-8333-333333333333';
 const asset=actor+'/44444444-4444-4444-8444-444444444444.webp';
 const rows=normalizeBoardActivity([{id:50,actor_id:actor,actor_name:'Jamie Cruz',
  event_type:'item.updated',message:'Updated',created_at:'2026-11-11T00:10:00Z'}]);
 const html=renderBoardActivityResults(rows,{
  avatarPaths:new Map([[actor,asset]])
 }).html;
 assert.match(html,/board-activity-actor-avatar/);
 assert.match(html,/data-avatar-path=/);
 assert.match(html,/data-avatar-user-id=/);
 assert.match(html,/JC<\/span>/);
 const other='55555555-5555-4555-8555-555555555555';
 const mismatched=renderBoardActivityResults(rows,{
  avatarPaths:new Map([[actor,other+'/44444444-4444-4444-8444-444444444444.webp']])
 }).html;
 assert.doesNotMatch(mismatched,/data-avatar-path=/);
 assert.match(mismatched,/JC<\/span>/);
 assert.doesNotMatch(renderBoardActivityActorAvatar('invalid','<svg onload=alert(1)>'),/<svg|onload="/);
});
test('signed activity photo enrichment adds no broad profile requests',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/normalizeBoardPeople\(state\.board/);
 assert.match(app,/avatarPaths:actorAvatars/);
 assert.match(app,/mountAvatarImages\(host,profileAvatarClient,null,null\)/);
 const manifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
 assert.match(manifest,/frontend\/board-activity-avatars\.css/);
 assert.match(manifest,/frontend\/board-column-hover\.css/);
});
test('item drawer hides restricted fields and escapes notes',()=>{
 const row={title:'<svg onload=alert(1)>',status:'working',notes:'<script>attack</script>',
  assignee_id:'private user',due_date:'2026-11-03'};
 const restricted=boardItemSummary(row,{groupTitle:'Group',restricted:true});
 assert.doesNotMatch(restricted,/private user|2026-11-03|attack/);
 const ordinary=boardItemSummary(row,{groupTitle:'Group',restricted:false});
 assert.match(ordinary,/&lt;script&gt;attack&lt;\/script&gt;/);
 assert.match(ordinary,/private user/);
 assert.doesNotMatch(ordinary,/<script>/);
});
test('typed grid exposes authorized item-detail action with safe encoded title',()=>{
 const board={board:{name:'Unregistered board'},columns:[],
  items:[{id:'11111111-1111-4111-8111-111111111111',title:'<Click>',group_id:'g'}],values:[]};
 const html=boardGrid(board);
 assert.match(html,/data-action="board-item-detail"/);
 assert.match(html,/&lt;Click&gt;/);
 assert.doesNotMatch(html,/<Click>/);
});
test('application preserves identity checks, signed RPCs and disallows client-only collaboration',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/db\.boardEvents\(snapshot\.boardId,100\)/);
 assert.match(app,/db\.boardEvents\(current\.boardId,limit\)/);
 assert.match(app,/function boardHistoryAuthorized/);
 assert.match(app,/auth\.userId===snapshot\.userId/);
 assert.match(app,/activeBoardLayout\(\)!==null/);
 assert.match(app,/db\.board\(snapshot\.boardId\)/);
 assert.match(app,/case 'board-item-detail'/);
 assert.match(app,/case 'board-members'/);
 assert.match(app,/boardItemSummary\(item,/);
 assert.match(app,/await db\.allowed\(snapshot\.boardId,'view'\)/);
 assert.match(app,/renderBoardPeople\(people\)/);
 assert.match(app,/normalizeBoardPeople\(detail/);
 assert.doesNotMatch(app,/Build with Vibe|monday\.com/);
});
