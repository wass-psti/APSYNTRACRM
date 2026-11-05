import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {
 resolveInlineColumn,columnStoredValueCount,prepareInlineColumnUpdate,
 confirmInlineColumnDelete
} from '../board-inline-context.js';

const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const customId='33333333-3333-4333-8333-333333333333';
const restrictedId='44444444-4444-4444-8444-444444444444';
const itemId='55555555-5555-4555-8555-555555555555';
const board={id:boardId,workspace_id:workspaceId,name:'Contacts',
 status:'active',updated_at:'2026-11-05T10:00:00Z'};
const column={id:customId,name:'Status I',data_type:'status',
 column_key:'custom:status_one',system_key:null,visible:true,
 config:{labels:[{id:'active',name:'Active',active:true}]}};
const detail={board,columns:[column,
 {id:restrictedId,name:'Attendance source',data_type:'text',
 column_key:'domain_original',system_key:null}],
 values:[],items:[{id:itemId,title:'Contact'}]};
const form=(data)=>{const f=new FormData();for(const [key,value] of Object.entries(data))
 if(value!==false)f.set(key,value===true?'on':value);return f;};
test('contextual column guard allows signed ordinary custom fields and required Item rename only',()=>{
 assert.equal(resolveInlineColumn(detail,'record',{canManage:true}).kind,'primary');
 assert.equal(resolveInlineColumn(detail,'col:'+customId,{canManage:true}).id,customId);
 for(const key of ['col:'+restrictedId,'col:invalid','owner','status','actions']){
  assert.throws(()=>resolveInlineColumn(detail,key,{canManage:true}),
   error=>error instanceof ApiError&&error.status===403);
 }
 assert.throws(()=>resolveInlineColumn(detail,'col:'+customId,{canManage:false}),/manager/);
});
test('application-owned and protected boards cannot use generic contextual configuration',()=>{
 for(const name of ['TimeTracker Attendance','Material Request Hub']){
  assert.throws(()=>resolveInlineColumn({...detail,board:{...board,name}},
   'col:'+customId,{canManage:true}),/ordinary-board/);
 }
 assert.throws(()=>resolveInlineColumn({...detail,board:{...board,status:'archived'}},
  'col:'+customId,{canManage:true}),/ordinary-board/);
});
test('inline custom-column rename and visibility preserve immutable type and field ID',()=>{
 const update=prepareInlineColumnUpdate(detail,
  resolveInlineColumn(detail,'col:'+customId,{canManage:true}),
  form({name:'New Status',type:'status',visible:true}));
 assert.deepEqual(update,{name:'New Status',type:'status',visible:true});
 assert.deepEqual(prepareInlineColumnUpdate(detail,
  resolveInlineColumn(detail,'col:'+customId,{canManage:true}),
  form({name:'New Status',type:'status'})),
  {...update,visible:false});
 assert.equal(resolveInlineColumn(detail,'col:'+customId,{canManage:true}).name,
  'Status I');
});
test('populated column conversion rejects without running server mutation or dropping values',()=>{
 const populated={...detail,values:[{item_id:itemId,column_id:customId,value:'active'}]};
 assert.equal(columnStoredValueCount(populated,customId),1);
 assert.throws(()=>prepareInlineColumnUpdate(populated,column,
  form({name:'Status I',type:'text',visible:true})),
  error=>error instanceof ApiError&&error.status===409&&/persisted data/.test(error.message));
 assert.deepEqual(prepareInlineColumnUpdate(populated,column,
  form({name:'Renamed',type:'status',visible:true})),
  {name:'Renamed',type:'status',visible:true});
 assert.deepEqual(populated.values,detail.values.concat({item_id:itemId,column_id:customId,value:'active'}));
 const empty={...detail,values:[{column_id:customId,value:null}]};
 assert.equal(columnStoredValueCount(empty,customId),0);
 assert.equal(prepareInlineColumnUpdate(empty,column,
  form({name:'Converted',type:'text'})).type,'text');
});
test('deletion requires exact named confirmation and excludes Item or domain columns',()=>{
 assert.equal(confirmInlineColumnDelete(
  resolveInlineColumn(detail,'col:'+customId,{canManage:true}),'DELETE Status I'),
  'DELETE Status I');
 for(const wrong of ['DELETE status i','DELETE Status','Status I','DELETE  Status I']){
  assert.throws(()=>confirmInlineColumnDelete(column,wrong),/exactly/);
 }
 assert.throws(()=>confirmInlineColumnDelete({id:customId,deletable:false,name:'Item'},
  'DELETE Item'),/Only ordinary/);
});
test('column menus stay contextual, are keyboard reachable and never call Manage Columns',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf("case 'board-column-manage':");
 const end=app.indexOf("case 'board-column-move':",start);
 assert.ok(start>=0&&end>start);
 const handler=app.slice(start,end);
 assert.match(handler,/contextualColumnEditor\(key\)/);
 assert.match(handler,/contextualColumnDelete\(key\)/);
 assert.match(handler,/case 'board-column-hide'/);
 assert.doesNotMatch(handler,/openBoardStructure\(/);
 assert.doesNotMatch(app,/data-action="board-structure">Manage columns/);
 assert.match(app,/data-action="board-add-column">＋ Add column/);
 assert.match(app,/function contextualColumnCreate\(/);
 assert.match(app,/function contextualColumnDelete\(/);
 assert.match(app,/function contextualColumnEditor\(/);
 assert.match(app,/await verifyInlineColumnBoard\(snapshot\)/);
 assert.match(app,/await db\.rpc\('wm_board_ui_read'/);
 assert.match(app,/await boardStructureClient\.mutate\(fresh/);
 assert.match(app,/boardStructureClient\.save\(fresh/);
 assert.match(app,/confirmInlineColumnDelete/);
 assert.match(app,/closeBoardColumnContext\(\{restoreFocus:true\}\)/);
 assert.match(app,/event\.key==='Escape'/);
});
