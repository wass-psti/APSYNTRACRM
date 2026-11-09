import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardItemSelection,matchBoardSearch,exportVisibleBoardItems} from '../board-bulk-selection.js';
import {boardTable} from '../board-presentation.js';
import {boardGrid} from '../board-grid.js';
import {DomainApi} from '../data.js';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const d='44444444-4444-4444-8444-444444444444';
const all=[a,b,c,d];
test('search normalizes case, filters title and description without changing backend',()=>{
 assert.equal(matchBoardSearch({name:'TimeTracker Attendance'},' timeTRACKER '),true);
 assert.equal(matchBoardSearch({name:'Board',description:'tool traceability'},'TRACEABILITY'),true);
 assert.equal(matchBoardSearch({name:'Material Request Hub'},'missing'),false);
 assert.equal(matchBoardSearch({},''),true);
});
test('row selection, multi-select, Shift-range and deselect are bounded to the current view',()=>{
 const s=new BoardItemSelection();s.bind('actor:workspace:board',all);
 s.toggle(a,true,{ordered:all});s.toggle(d,true,{shift:true,ordered:all});
 assert.equal(s.size,4);assert.deepEqual(s.selected(all),all);
 s.toggle(c,false,{ordered:all});assert.deepEqual(s.selected(all),[a,b,d]);
 s.selectVisible([b,d],{checked:false});assert.deepEqual(s.selected(all),[a]);
 s.toggle('not-a-uuid',true,{ordered:all});assert.equal(s.size,1);
 s.clear();assert.equal(s.size,0);
});
test('filtered select-all touches only visible items and keeps offscreen selections',()=>{
 const s=new BoardItemSelection();s.bind('owner:ws:board',all);
 s.toggle(a,true,{ordered:all});
 s.selectVisible([b,d]);assert.deepEqual(s.selected(all),[a,b,d]);
 s.selectVisible([b],{checked:false});assert.deepEqual(s.selected(all),[a,d]);
});
test('selection reconciles deletions and prevents cross-board, workspace or account leakage',()=>{
 const s=new BoardItemSelection();s.bind('actor1:workspace1:board1',all);
 s.selectVisible(all);s.reconcile([a,b]);assert.deepEqual(s.selected(all),[a,b]);
 s.bind('actor1:workspace1:board2',[a,b]);assert.equal(s.size,0);
 s.selectVisible([a]);s.bind('actor2:workspace1:board2',[a,b]);assert.equal(s.size,0);
 s.selectVisible([b]);s.bind('actor2:workspace2:board2',[a,b]);assert.equal(s.size,0);
});
test('bulk CSV export rejects stale/foreign rows and neutralizes formulas and HTML',()=>{
 const rows=[{id:a,board_id:d,title:'=SUM(1,1)',status:'working',group_id:b,updated_at:'2026-11-03'},
 {id:c,board_id:d,title:'Hello "<world>"',status:'done',group_id:b,updated_at:'2026-11-03'},
 {id:b,board_id:a,title:'Foreign',status:'done',group_id:a,updated_at:null}];
 const csv=exportVisibleBoardItems(rows,[a,c],{boardId:d});
 assert.match(csv,/"'=SUM\(1,1\)"/);
 assert.match(csv,/"Hello ""<world>"""/);
 assert.doesNotMatch(csv,/Foreign/);
 assert.throws(()=>exportVisibleBoardItems(rows,[a,b],{boardId:d}),/stale|inaccessible/);
 assert.throws(()=>exportVisibleBoardItems(rows,[a],{boardId:'invalid'}),/verified board/);
});
test('primary column remains first with individual and per-group selection checkbox',()=>{
 const markup=boardTable({groupId:a,columns:[{key:'record',title:'Record'},
 {key:'status',title:'Status'}],rows:[{itemId:b,search:'sample',cells:{record:'Sample',status:'working'}}],
 selection:{enabled:true,selected:new Set([b])}});
 assert.match(markup,/data-board-select-all="11111111/);
 assert.match(markup,/data-board-select-item="22222222/);
 assert.match(markup,/data-bulk-row="22222222/);
 assert.match(markup,/class="board-frozen-column"/);
 assert.match(markup,/checked/);
 assert.equal((markup.match(/<th scope="col"/g)||[]).length,2);
 const unselected=boardTable({columns:[{key:'record',title:'Record'}],
  rows:[{itemId:b,cells:{record:'Sample'}}]});
 assert.doesNotMatch(unselected,/data-board-select-item/);
});
test('typed domain board rows provide selection without revealing restricted field values',()=>{
 const detail={board:{name:'TimeTracker Attendance'},
  columns:[{id:a,name:'Attendance Date',system_key:null,visible:true},
   {id:b,name:'Internal GPS Secret',system_key:'restricted',visible:true}],
  items:[{id:c,group_id:d,title:'Authorized row',board_id:d}],
  values:[{item_id:c,column_id:b,value:'PRIVATE-COORDINATES'}]};
 const markup=boardGrid(detail,{groupId:d,selection:{enabled:true,selected:new Set()}});
 assert.match(markup,/data-board-select-item="33333333/);
 assert.doesNotMatch(markup,/PRIVATE-COORDINATES/);
});
test('group inline rename uses audited existing RPC, validates and does not invoke group delete',async()=>{
 const calls=[];
 const db=new DomainApi({authorized:async(url,options)=>{calls.push([url,options.body]);return null;}});
 await db.updateGroup(b,'  Revised Group  ');
 assert.equal(calls[0][0],'/rest/v1/rpc/wm_update_board_group');
 assert.deepEqual(calls[0][1],{p_group_id:b,p_title:'Revised Group'});
 await assert.rejects(()=>db.updateGroup(b,''),/Group name/);
 await assert.rejects(()=>db.updateGroup(b,'x'.repeat(121)),/Group name/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'group-inline-edit'/);
 assert.match(app,/data-group-inline-form/);
 assert.match(app,/async function saveGroupInline/);
 assert.match(app,/await auth\.getVerifiedUser/);
 assert.match(app,/original\.updated_at!==group\.updated_at/);
 assert.match(app,/await db\.updateGroupCas\(boardId,original,title\)/);
 assert.doesNotMatch(app,/db\.deleteGroup|wm_delete_board_group/);
});
test('search and bulk event handlers are connected and hidden elements remain hidden',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/styles.css','utf8');
 assert.match(app,/state\.boardSearch=event\.target\.value/);
 assert.match(app,/matchBoardSearch\(b,state\.boardSearch\)/);
 assert.match(app,/id="board-search-result"/);
 assert.match(app,/id="board-search-no-results"/);
 assert.match(app,/case 'bulk-export'/);
 assert.match(app,/case 'bulk-clear'/);
 assert.match(app,/data-board-select-all/);
 assert.match(app,/itemSelection\.toggle/);
 assert.match(app,/syncBoardSelectionUi/);
 assert.match(css,/\.board-card\[hidden\],\.board-table tr\[hidden\]/);
 assert.match(css,/\.board-bulk-toolbar\[hidden\]/);
 assert.match(css,/\.board-group-actions-list/);
 assert.doesNotMatch(app,/wm_import_board_items_atomic|wm_delete_board_group/);
});
