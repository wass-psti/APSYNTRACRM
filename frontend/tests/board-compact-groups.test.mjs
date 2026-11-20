import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardGroupRollupCells,renderBoardCollapsedRollup} from '../board/presentation/group-rollups.js';
import {BoardGroupStateClient} from '../board/preferences/group-state-client.js';
const board='11111111-1111-4111-8111-111111111111';
const group='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const num='44444444-4444-4444-8444-444444444444';
const rating='55555555-5555-4555-8555-555555555555';
const timeline='66666666-6666-4666-8666-666666666666';
const textCol='77777777-7777-4777-8777-777777777777';
const ids=['88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999'];
const items=ids.map((id,i)=>({id,group_id:group,title:'Task '+i,
 status:i?'done':'blocked',assignee_id:actor}));
const columns=[{key:'record',title:'Task'},{key:'status',title:'Status'},
 {key:'owner',title:'Person'},{key:'col:'+num,title:'Amount'},
 {key:'col:'+rating,title:'Rating'},{key:'col:'+timeline,title:'Timeline'},
 {key:'col:'+textCol,title:'Description'}];
const detail={board:{id:board},members:[{user_id:actor,display_name:'Mira Cruz'}],
 columns:[{id:num,data_type:'number'},{id:rating,data_type:'rating',config:{max:5}},
  {id:timeline,data_type:'timeline'},{id:textCol,data_type:'text'}],
 values:[
  {item_id:ids[0],column_id:num,value:45},{item_id:ids[1],column_id:num,value:75},
  {item_id:ids[0],column_id:rating,value:3},{item_id:ids[1],column_id:rating,value:4},
  {item_id:ids[0],column_id:timeline,value:{start:'2026-11-01',end:'2026-11-06'}},
  {item_id:ids[1],column_id:timeline,value:{start:'2026-11-09',end:'2026-11-14'}},
  {item_id:ids[0],column_id:textCol,value:'Private text'}
 ]};
test('complete signed group renders aligned type-specific rollups without exposing text',()=>{
 const result=boardGroupRollupCells({detail,items,columns,complete:true});
 assert.match(result.summary.status,/board-rollup-status/);
 assert.match(result.summary.status,/blocked: 1, done: 1/);
 assert.match(result.summary.owner,/Mira Cruz/);
 assert.match(result.summary['col:'+num],/>120<\/strong>/);
 assert.match(result.summary['col:'+rating],/3\.5 \/ 5/);
 assert.match(result.summary['col:'+timeline],/2026-11-01 – 2026-11-14/);
 assert.equal(result.summary['col:'+textCol],'');
 assert.equal(result.summary.record,'');
 const html=renderBoardCollapsedRollup({detail,items,columns,complete:true,
  groupId:group,groupTitle:'Working on it',itemCount:2});
 assert.match(html,/data-action="board-group-toggle"/);
 assert.match(html,/2 Tasks/);
 assert.doesNotMatch(html,/Private text/);
});
test('incomplete signed board never fabricates aggregate figures',()=>{
 const result=boardGroupRollupCells({detail,items:items.slice(0,1),columns,complete:false});
 assert.equal(result.summary.status,'');
 assert.equal(result.summary['col:'+num],'');
 const html=renderBoardCollapsedRollup({detail,items:items.slice(0,1),columns,
  complete:false,groupId:group,groupTitle:'Partially loaded',itemCount:80});
 assert.match(html,/Load remaining items for a complete summary/);
 assert.doesNotMatch(html,/120|3\.5 \/ 5/);
});
test('user group preference client validates scopes, revisions and authoritative receipts',async()=>{
 const rpcCalls=[];
 const api={async rpc(name,args){
  rpcCalls.push({name,args});
  if(name==='wm_board_group_view_read')return {board_id:board,
   groups:[{group_id:group,collapsed:true,revision:2}]};
  if(name==='wm_board_group_view_set')return {board_id:board,
   group_id:group,collapsed:false,revision:3};
  return {board_id:board,groups:[{group_id:group,collapsed:false,revision:4}]};
 }};
 const client=new BoardGroupStateClient(api);
 assert.equal((await client.read(board))[0].collapsed,true);
 assert.equal((await client.set(board,group,false,2)).revision,3);
 assert.equal((await client.setAll(board,false))[0].revision,4);
 assert.equal(rpcCalls.length,3);
 await assert.rejects(()=>client.set('invalid',group,false,2),/Invalid Board preference change/);
});
test('compact board source is CSP-safe and column picker remains header-only',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const presentation=readFileSync('frontend/board/presentation/presentation.js','utf8');
 const css=readFileSync('frontend/monday-inspired-ui.css','utf8');
 const migration=readFileSync('supabase/migrations/20261120194000_cp_board_group_view_01_user_prefs.sql','utf8');
 assert.match(app,/case 'board-groups-collapse-all'/);
 assert.match(app,/renderBoardCollapsedRollup/);
 assert.match(app,/boardGroupCollapsed\(g\.id/);
 assert.match(app,/boardGroupRevisions/);
 assert.match(app,/board-column-resize-guide/);
 assert.doesNotMatch(app,/boardResize\.guide\.style/);
 assert.match(presentation,/summary aria-label="Hide or show columns">◉ Hide/);
 assert.doesNotMatch(presentation,/>Columns<\/summary>/);
 assert.match(presentation,/data-action="board-add-column"/);
 assert.match(css,/BOARD-COMPACT-36/);
 assert.match(css,/--bc-row:36px/);
 assert.match(migration,/private\.wm_board_config_session_active\(\)/);
 assert.match(migration,/public\.work_board_access\(p_board_id,'view'\)/);
 assert.match(migration,/ON DELETE CASCADE/);
});
