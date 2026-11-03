import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {
 BOARD_CARD_LIFECYCLE_ENABLED,isProtectedBoard,boardCardActionState,
 BoardCardLifecycleClient
} from '../board-card-lifecycle.js';

const actor='20000000-0000-4000-8000-000000000001';
const ws='10000000-0000-4000-8000-000000000001';
const id='30000000-0000-4000-8000-000000000001';
const timestamp='2026-11-03T03:39:17.493413+00:00';
const custom={id,name:'New Board',description:'',member_role:'owner',
 status:'active',updated_at:timestamp,item_count:0};
const managed={...custom,id:'30000000-0000-4000-8000-000000000003',
 name:'TimeTracker Attendance',
 description:'[APSYNTRA:MODULE:timetracker:v1] Attendance module'};
function apiFixture({allowed=true,context=null,reply=null}={}){
 const calls=[];
 const ctx=context||{user_id:actor,workspace_id:ws,profile:{status:'active'}};
 return {calls,api:{
  context:async()=>{calls.push(['context']);return ctx;},
  allowed:async(board,level)=>{calls.push(['allowed',board,level]);return allowed;},
  rpc:async(op,args)=>{
   calls.push([op,args]);return reply||{
    boardId:args.p_board_id,action:args.p_action,
    status:args.p_action==='trash'?'trashed':args.p_action==='restore'?
     'active':custom.status,updatedAt:'2026-11-03T03:41:20.000000+00:00'
   };
  }
 }};
}
test('board menu lifecycle is fail-closed until production RPC is activated',async()=>{
 assert.equal(BOARD_CARD_LIFECYCLE_ENABLED,false);
 const fixture=apiFixture();
 const client=new BoardCardLifecycleClient(fixture.api);
 await assert.rejects(()=>client.edit(custom,{name:'Renamed',description:'ok'}),ApiError);
 assert.equal(fixture.calls.length,0);
 assert.equal(boardCardActionState(custom),'DISABLED');
});
test('application module and APSYNTRA QA boards are protected even when owner',()=>{
 assert.equal(isProtectedBoard(managed),true);
 assert.equal(isProtectedBoard({...custom,name:'APSYNTRA QA'}),true);
 assert.equal(boardCardActionState(managed,{enabled:true}),'PROTECTED');
 assert.equal(boardCardActionState({...custom,member_role:'editor'},{enabled:true}),'DENIED');
 assert.equal(boardCardActionState(custom,{enabled:true}),'MANAGE');
 assert.equal(isProtectedBoard(custom),false);
});
test('authorized manager edit sends exact CAS timestamp and bounded fields',async()=>{
 const fixture=apiFixture();
 const client=new BoardCardLifecycleClient(fixture.api,{enabled:true});
 const receipt=await client.edit(custom,{name:'  Updated board  ',description:'A note'});
 assert.equal(receipt.action,'edit');
 assert.deepEqual(fixture.calls.map(x=>x[0]),['context','allowed','wm_board_card_mutate','context']);
 assert.equal(fixture.calls[1][2],'manage');
 assert.deepEqual(fixture.calls[2][1],{
  p_board_id:id,p_expected_updated_at:timestamp,p_action:'edit',
  p_name:'Updated board',p_description:'A note',p_confirm_name:null
 });
});
test('trash requires exact name, and restore retains same board identity',async()=>{
 const fixture=apiFixture();
 const client=new BoardCardLifecycleClient(fixture.api,{enabled:true});
 await assert.rejects(()=>client.trash(custom,'Wrong'),ApiError);
 assert.equal(fixture.calls.length,0);
 const trashed=await client.trash(custom,'New Board');
 assert.equal(trashed.status,'trashed');
 const archived={...custom,status:'trashed',updated_at:trashed.updatedAt};
 const restored=await client.restore(archived);
 assert.equal(restored.status,'active');
 assert.equal(fixture.calls.filter(x=>x[0]==='wm_board_card_mutate').length,2);
});
test('editor denial, foreign context and protected targets never call mutation RPC',async()=>{
 for(const options of [{allowed:false},{
  context:{user_id:actor,workspace_id:ws,profile:{status:'inactive'}}}
 ]){
  const fixture=apiFixture(options);
  const client=new BoardCardLifecycleClient(fixture.api,{enabled:true});
  await assert.rejects(()=>client.edit(custom,{name:'New name',description:''}),ApiError);
  assert.equal(fixture.calls.some(x=>x[0]==='wm_board_card_mutate'),false);
 }
 const fixture=apiFixture();
 const client=new BoardCardLifecycleClient(fixture.api,{enabled:true});
 await assert.rejects(()=>client.trash(managed,managed.name),ApiError);
 assert.equal(fixture.calls.length,0);
});
test('invalid names, descriptions and stale signed receipt fail safely',async()=>{
 const fixture=apiFixture({reply:{
  boardId:'30000000-0000-4000-8000-000000000005',
  action:'edit',status:'active',updatedAt:timestamp
 }});
 const client=new BoardCardLifecycleClient(fixture.api,{enabled:true});
 await assert.rejects(()=>client.edit(custom,{name:'',description:''}),ApiError);
 await assert.rejects(()=>client.edit(custom,{name:'x'.repeat(121),description:''}),ApiError);
 await assert.rejects(()=>client.edit(custom,{name:'OK',description:'x'.repeat(1201)}),ApiError);
 assert.equal(fixture.calls.length,0);
 await assert.rejects(()=>client.edit(custom,{name:'OK',description:''}),ApiError);
});
test('board card markup uses separate links and menu, safe confirmation and Trash restoration',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/styles.css','utf8');
 const menuStart=app.indexOf('function boardCard(board,index){');
 const menuEnd=app.indexOf('function empty(',menuStart);
 assert.ok(menuEnd>menuStart);
 const card=app.slice(menuStart,menuEnd);
 assert.match(card,/return '<article class="board-card"/);
 assert.match(card,/class="board-card-actions"/);
 assert.match(card,/class="board-card-main"/);
 assert.match(card,/class="board-card-symbol-link"/);
 assert.doesNotMatch(card,/return \`<a class="board-card"/);
 assert.match(app,/case 'board-card-edit'/);
 assert.match(app,/case 'board-card-trash'/);
 assert.match(app,/case 'board-card-restore'/);
 assert.match(app,/data-action="trashed-boards"/);
 assert.match(app,/await db.allowed\(id,'manage'\)/);
 assert.match(app,/state\.boardLifecycleBusy=true/);
 assert.match(app,/closeBoardCardMenus\(\);hideModal\(\)/);
 assert.match(app,/Permanent deletion is not offered/);
 assert.match(css,/\.board-card\.board-card-menu-open\{z-index:40\}/);
 assert.match(css,/\.board-card-actions>summary:focus-visible/);
 assert.match(css,/\.board-card-actions-list\{/);
});
