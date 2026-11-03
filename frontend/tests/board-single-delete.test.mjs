import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError} from '../session.js';
import {readFileSync} from 'node:fs';
import {deleteOneAuthorizedItem,selectedDeleteCandidates} from '../board-single-delete.js';
const boardId='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const itemId='44444444-4444-4444-8444-444444444444';
const board={id:boardId,workspace_id:ws,name:'Contacts',status:'active'};
const item={id:itemId,board_id:boardId,group_id:'55555555-5555-4555-8555-555555555555',
 title:'Record Alpha',updated_at:'2026-11-03T07:00:00.000Z',archived_at:null};
function make({permission=true,current=item,workspace=ws,audit=true}={}){
 const calls=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>permission,
  board:async()=>({board,items:current?[current]:[]}),
  deleteBoardItem:async id=>{calls.push(id);current=null;},
  boardEvents:async()=>audit?[{entity_id:itemId,event_type:'item.deleted',actor_id:actor}]:[]
 };
 return {auth,api,calls};
}
test('current signed user may permanently delete exactly one owned-scope board item with independent audit',async()=>{
 const h=make();
 const result=await deleteOneAuthorizedItem({...h,board,item,confirmTitle:item.title});
 assert.equal(result.status,'DELETED');
 assert.equal(result.audit,'VERIFIED');
 assert.deepEqual(h.calls,[itemId]);
});
test('mismatched confirmation, stale title or stale timestamp deny deletion without writing',async()=>{
 const h=make();
 await assert.rejects(()=>deleteOneAuthorizedItem({...h,board,item,confirmTitle:'other'}),/confirmation/);
 assert.equal(h.calls.length,0);
 const stale=make({current:{...item,updated_at:'2026-11-03T07:01:00.000Z'}});
 await assert.rejects(()=>deleteOneAuthorizedItem({...stale,board,item,
  confirmTitle:item.title}),e=>e instanceof ApiError&&e.status===409);
 assert.equal(stale.calls.length,0);
});
test('editor denial, foreign workspace and protected module boards fail closed',async()=>{
 const denied=make({permission:false});
 await assert.rejects(()=>deleteOneAuthorizedItem({...denied,board,item,
  confirmTitle:item.title}),/role cannot delete/);
 const foreign=make({workspace:'99999999-9999-4999-8999-999999999999'});
 await assert.rejects(()=>deleteOneAuthorizedItem({...foreign,board,item,
  confirmTitle:item.title}),/workspace changed/);
 const protectedBoard={...board,name:'TimeTracker Attendance'};
 await assert.rejects(()=>deleteOneAuthorizedItem({...make(),board:protectedBoard,item,
  confirmTitle:item.title}),/ordinary boards/);
});
test('a missing audit event is reported unverified after confirmed removal, never fabricated',async()=>{
 const h=make({audit:false});
 const result=await deleteOneAuthorizedItem({...h,board,item,confirmTitle:item.title});
 assert.equal(result.status,'DELETED');
 assert.equal(result.audit,'UNVERIFIED');
 assert.equal(h.calls.length,1);
});
test('the selected-record toolbar exposes explicitly confirmed single-item deletion',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/data-action="delete-selected-item"/);
 assert.match(app,/case 'delete-selected-item'/);
 assert.match(app,/itemSelection.size===0/);
 assert.match(app,/selectedDeleteCandidates\(board,state\.board\.items,originalIds\)/);
 assert.match(app,/select\('Choose one record to delete','deleteItemId'/);
 assert.match(app,/Delete one of '\+itemSelection\.size/);
 assert.match(app,/itemSelection\.size>0&&state\.edit/);
 assert.doesNotMatch(app,/itemSelection\.clear\(\);await loadBoard\(board\.id,'items'\)/);
 assert.match(app,/deleteOneAuthorizedItem\(/);
});

test('three selected records resolve to three individually addressable, nonmutating delete choices',()=>{
 const second={...item,id:'66666666-6666-4666-8666-666666666666',title:'Second record'};
 const third={...item,id:'77777777-7777-4777-8777-777777777777',title:'Third record'};
 const result=selectedDeleteCandidates(board,[item,second,third],
  new Set([third.id,item.id,second.id]));
 assert.deepEqual(result.map(x=>x.id),[third.id,item.id,second.id]);
 assert.equal(result.length,3);
});
test('selected records with missing, archived, invalid revision or wrong-board IDs fail closed',()=>{
 const other={...item,id:'66666666-6666-4666-8666-666666666666'};
 assert.throws(()=>selectedDeleteCandidates(board,[item],new Set([other.id])),/changed/);
 assert.throws(()=>selectedDeleteCandidates(board,[{...item,archived_at:'2026-11-03T07:00:00Z'}],
   new Set([item.id])),/changed/);
 assert.throws(()=>selectedDeleteCandidates(board,[{...item,updated_at:'bad'}],
   new Set([item.id])),/changed/);
 assert.throws(()=>selectedDeleteCandidates(board,[{...item,board_id:ws}],
   new Set([item.id])),/changed/);
 assert.throws(()=>selectedDeleteCandidates(board,[item],new Set()),/Select an active/);
});
test('protected and inactive boards cannot offer destructive item choices',()=>{
 assert.throws(()=>selectedDeleteCandidates({...board,name:'TimeTracker Attendance'},
  [item],new Set([item.id])),/ordinary-board/);
 assert.throws(()=>selectedDeleteCandidates({...board,status:'archived'},
  [item],new Set([item.id])),/ordinary-board/);
});
test('one-choice deletion checks exact name and keeps the existing signed RPC audit',async()=>{
 const a=make();
 const selected=selectedDeleteCandidates(board,[item],new Set([item.id]));
 await assert.rejects(()=>deleteOneAuthorizedItem({...a,board,item:selected[0],
  confirmTitle:'Not the selected title'}),/confirmation/);
 assert.equal(a.calls.length,0);
 const result=await deleteOneAuthorizedItem({...a,board,item:selected[0],confirmTitle:item.title});
 assert.equal(result.audit,'VERIFIED');
 assert.deepEqual(a.calls,[itemId]);
});
test('delete modal guards against a changed selection, discloses single-item action and preserves remaining choices',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf("case 'delete-selected-item':{");
 const end=app.indexOf("case 'bulk-archive':{",start);
 assert.ok(start>0&&end>start);
 const code=app.slice(start,end);
 assert.match(code,/new Set\(itemSelection\.ids\)/);
 assert.match(code,/itemSelection\.size!==originalIds\.size/);
 assert.match(code,/\[\.\.\.originalIds\]\.some\(id=>!itemSelection\.has\(id\)\)/);
 assert.match(code,/ONE chosen record, not the entire selection/);
 assert.match(code,/const item=selected\.find\(row=>row\.id===id\)/);
 assert.match(code,/confirmTitle:String\(fd\.get\('confirmTitle'\)\|\|''\)/);
 assert.match(code,/targetSelector\?\.addEventListener\('change'/);
 assert.match(code,/input\.value='';input\.focus\(\)/);
 assert.match(code,/await loadBoard\(board\.id,'items'\)/);
 assert.doesNotMatch(code,/for\s*\([^)]*\)\s*await\s+deleteOneAuthorizedItem/);
 assert.doesNotMatch(code,/itemSelection\.clear\(\)/);
});
