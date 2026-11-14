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
function apiFixture({allowed=true,context=null,reply=null,boardReply=null}={}){
 const calls=[];
 const ctx=context||{user_id:actor,workspace_id:ws,profile:{status:'active'}};
 return {calls,api:{
  context:async()=>{calls.push(['context']);return ctx;},
  allowed:async(board,level)=>{calls.push(['allowed',board,level]);return allowed;},
  board:async(boardId,options)=>{
   calls.push(['board',boardId,options]);
   const value=typeof boardReply==='function'?await boardReply(boardId,options):
    boardReply||{...custom,workspace_id:ws};
   return {board:{...value,id:boardId}};
  },
  rpc:async(op,args)=>{
   calls.push([op,args]);return reply||{
    boardId:args.p_board_id,action:args.p_action,
    status:args.p_action==='trash'?'trashed':args.p_action==='restore'?
     'active':custom.status,updatedAt:'2026-11-03T03:41:20.000000+00:00'
   };
  }
 }};
}
test('activated board menu remains fail-closed when its explicit override is disabled',async()=>{
 assert.equal(BOARD_CARD_LIFECYCLE_ENABLED,true);
 const fixture=apiFixture();
 const client=new BoardCardLifecycleClient(fixture.api,{enabled:false});
 await assert.rejects(()=>client.edit(custom,{name:'Renamed',description:'ok'}),ApiError);
 assert.equal(fixture.calls.length,0);
 assert.equal(boardCardActionState(custom),'MANAGE');
 assert.equal(boardCardActionState(custom,{enabled:false}),'DISABLED');
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
 assert.deepEqual(fixture.calls.map(x=>x[0]),['context','allowed','board','wm_board_card_mutate','context']);
 assert.equal(fixture.calls[1][2],'manage');
 assert.deepEqual(fixture.calls[2][2],{complete:false,includeItems:false});
 assert.deepEqual(fixture.calls[3][1],{
  p_board_id:id,p_expected_updated_at:timestamp,p_action:'edit',
  p_name:'Updated board',p_description:'A note',p_confirm_name:null
 });
});
test('trash requires exact name, and restore retains same board identity',async()=>{
 let boardReads=0;
 const fixture=apiFixture({boardReply:async()=>({
  ...custom,workspace_id:ws,
  status:boardReads++===0?'active':'trashed',
  updated_at:boardReads===1?timestamp:'2026-11-03T03:41:20.000000+00:00'
 })});
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
test('board card markup uses one stretched link and independent menu, preserving safe lifecycle actions',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/styles.css','utf8');
 const menuStart=app.indexOf('function boardCard(board,index){');
 const menuEnd=app.indexOf('function empty(',menuStart);
 assert.ok(menuEnd>menuStart);
 const card=app.slice(menuStart,menuEnd);
 assert.match(card,/return '<article class="board-card"/);
 assert.match(card,/class="board-card-actions"/);
 assert.match(card,/class="board-card-main"/);
 assert.match(card,/Move to Trash<\/button>/);
 assert.match(card,/class="board-symbol '/);
 assert.doesNotMatch(card,/class="board-card-symbol-link"/);
 assert.match(card,/aria-label="Open '/);
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

test('reversible board deletion is a two-click confirmation without retyping',()=>{
 assert.equal(BOARD_CARD_LIFECYCLE_ENABLED,true);
 const app=readFileSync('frontend/app.js','utf8');
 const trash=app.slice(app.indexOf("case 'board-card-trash':"),app.indexOf("case 'board-card-restore':"));
 assert.match(trash,/openModal\('Move board to Trash'/);
 assert.match(trash,/Move '\+e\(board\.name\)\+' to Trash/);
 assert.match(trash,/await boardCardLifecycle\.trash\(board,board\.name\)/);
 assert.match(trash,/submitLabel:'Move to Trash',destructive:true/);
 assert.match(trash,/successMessage:'Board moved to Trash/);
 assert.match(trash,/Restore the board from Trash|restore the board from Trash/);
 assert.doesNotMatch(trash,/name=\"confirm\"|fd\.get\('confirm'\)|Type .*to confirm/);
 assert.match(app,/await db\.allowed\(id,'manage'\)/);
 assert.match(app,/closeBoardCardMenus\(\);hideModal\(\)/);
 assert.doesNotMatch(app,/wm_delete_board_permanently/);
});

test('shared modal gives destructive actions safe initial focus and specific completion text',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const modal=app.slice(app.indexOf('function openModal('),app.indexOf('const input=('));
 assert.match(modal,/destructive=false/);
 assert.match(modal,/destructive\?view\.querySelector\('\.modal-actions \[data-dismiss\]'\)/);
 assert.match(modal,/if\(successMessage\)toast\(successMessage\)/);
 assert.match(modal,/button\.disabled=true/);
 assert.match(modal,/if\(event\.key==='Escape'\)/);
 assert.match(modal,/closeAndRestore\(\)/);
 assert.match(app,/submitLabel:'Create board',successMessage:'Board created\.'/);
});

test('concurrent same-board lifecycle writes submit a single mutation RPC',async()=>{
 let resolveWrite;
 const calls=[];
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  allowed:async()=>true,
  board:async(boardId)=>({board:{...custom,id:boardId,workspace_id:ws}}),
  rpc:async(op,args)=>{
   calls.push([op,args]);
   if(calls.length===1)return new Promise(resolve=>{resolveWrite=resolve;});
   return {boardId:args.p_board_id,action:args.p_action,status:'active',
    updatedAt:'2026-11-03T03:41:20.000000+00:00'};
  }
 };
 const client=new BoardCardLifecycleClient(api);
 const first=client.edit(custom,{name:'A',description:'first'});
 for(let i=0;i<10&&!resolveWrite;i++)await Promise.resolve();
 assert.equal(typeof resolveWrite,'function');
 await assert.rejects(
  client.edit(custom,{name:'B',description:'second'}),
  error=>error instanceof ApiError&&error.status===409
 );
 assert.equal(calls.length,1);
 resolveWrite({boardId:id,action:'edit',status:'active',
  updatedAt:'2026-11-03T03:41:20.000000+00:00'});
 await first;
 await client.edit(custom,{name:'C',description:'third'});
 assert.equal(calls.length,2);
});

test('fresh metadata read uses the latest timestamp when only board content changed',async()=>{
 const freshAt='2026-11-14T01:10:00.000000+00:00';
 const fixture=apiFixture({boardReply:{...custom,workspace_id:ws,updated_at:freshAt}});
 const client=new BoardCardLifecycleClient(fixture.api);
 await client.edit(custom,{name:'Renamed',description:'Updated'});
 const mutation=fixture.calls.find(x=>x[0]==='wm_board_card_mutate');
 assert.equal(mutation[1].p_expected_updated_at,freshAt);
 assert.equal(fixture.calls.filter(x=>x[0]==='board').length,1);
});

test('changed board metadata is rejected locally before lifecycle mutation',async()=>{
 const fixture=apiFixture({boardReply:{...custom,workspace_id:ws,name:'Renamed elsewhere'}});
 const client=new BoardCardLifecycleClient(fixture.api);
 await assert.rejects(client.edit(custom,{name:'Overwrite',description:''}),
  error=>error instanceof ApiError&&error.status===409&&error.code==='BOARD_METADATA_CHANGED');
 assert.equal(fixture.calls.some(x=>x[0]==='wm_board_card_mutate'),false);
});

test('one stale timestamp conflict refreshes metadata and retries exactly once',async()=>{
 const times=[
  '2026-11-14T01:10:00.000000+00:00',
  '2026-11-14T01:10:01.000000+00:00'
 ];
 let reads=0;
 const writes=[];
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  allowed:async()=>true,
  board:async(boardId,options)=>({board:{...custom,id:boardId,workspace_id:ws,
   updated_at:times[Math.min(reads++,1)]}}),
  rpc:async(op,args)=>{
   writes.push({...args});
   if(writes.length===1)throw new ApiError('Board changed; refresh before editing',409,'40001');
   return {boardId:args.p_board_id,action:args.p_action,status:'active',
    updatedAt:'2026-11-14T01:10:02.000000+00:00'};
  }
 };
 const client=new BoardCardLifecycleClient(api);
 const receipt=await client.edit(custom,{name:'Renamed',description:''});
 assert.equal(receipt.action,'edit');
 assert.equal(writes.length,2);
 assert.equal(writes[0].p_expected_updated_at,times[0]);
 assert.equal(writes[1].p_expected_updated_at,times[1]);
});

test('metadata change after a stale response blocks the retry',async()=>{
 let reads=0,writes=0;
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  allowed:async()=>true,
  board:async(boardId)=>({board:{...custom,id:boardId,workspace_id:ws,
   name:reads++===0?custom.name:'Concurrent rename'}}),
  rpc:async()=>{writes++;throw new ApiError('Board changed; refresh before editing',409,'40001');}
 };
 const client=new BoardCardLifecycleClient(api);
 await assert.rejects(client.edit(custom,{name:'Overwrite',description:''}),
  error=>error.code==='BOARD_METADATA_CHANGED');
 assert.equal(writes,1);
});

test('second stale response is surfaced without an unbounded retry loop',async()=>{
 let attempts=0,reads=0;
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  allowed:async()=>true,
  board:async(boardId)=>({board:{...custom,id:boardId,workspace_id:ws,
   updated_at:'2026-11-14T01:10:0'+Math.min(reads++,1)+'.000000+00:00'}}),
  rpc:async()=>{attempts++;throw new ApiError('Board changed; refresh before editing',409,'40001');}
 };
 const client=new BoardCardLifecycleClient(api);
 await assert.rejects(client.edit(custom,{name:'Retry',description:''}),
  error=>error.code==='40001');
 assert.equal(attempts,2);
});


test('stale board lifecycle conflicts disable modal resubmission until the board is reopened',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const modal=app.slice(app.indexOf('function openModal('),app.indexOf('const input=('));
 assert.match(modal,/disableOnConflict=false/);
 assert.match(modal,/const conflict=disableOnConflict&&/);
 assert.match(modal,/err\?\.status===409/);
 assert.match(modal,/err\?\.code==='40001'/);
 assert.match(modal,/err\?\.code==='BOARD_METADATA_CHANGED'/);
 assert.match(modal,/button\.textContent='Close and verify board'/);
 assert.match(modal,/button\.textContent='Close and refresh board'/);
 const edit=app.slice(app.indexOf("case 'board-card-edit':"),app.indexOf("case 'board-card-trash':"));
 const trash=app.slice(app.indexOf("case 'board-card-trash':"),app.indexOf("case 'board-card-restore':"));
 assert.match(edit,/disableOnConflict:true/);
 assert.match(trash,/disableOnConflict:true/);
});
