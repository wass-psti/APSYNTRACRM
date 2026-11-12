import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardTable} from '../board-presentation.js';
import {boardGridColumns,boardGrid} from '../board-grid.js';
import {genericBoardColumns} from '../board-inline-items.js';
import {BoardStructureClient} from '../board-structure-admin.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../material-sourcing-schema-plan.js';
const board=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const record={key:'record',title:'Asset Registry'};
test('inline primary header control is keyboard-accessible, escaped, and manager-specific',()=>{
 const html=boardTable({columns:[record],groupId:'qa',rows:[],primaryEditable:true});
 assert.match(html,/data-action="board-primary-label-edit"/);
 assert.match(html,/aria-label="Rename primary column Asset Registry"/);
 assert.match(html,/>Asset Registry<\/button>/);
 assert.doesNotMatch(boardTable({columns:[record],rows:[],primaryEditable:false}),/board-primary-label-edit/);
 const escaping=boardTable({columns:[{key:'record',title:'<svg onload=alert(1)>'}],rows:[],primaryEditable:true});
 assert.match(escaping,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(escaping,/<svg/);
});
test('primary record key is immutable and all board projections honor the saved display name',()=>{
 const detail={board:{id:'11111111-1111-4111-8111-111111111111',name:'Ordinary',status:'active'},columns:[],items:[],values:[]};
 const material={...detail,board:{...detail.board,id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub'}};
 const tradelink={...detail,board:{id:TRADELINK_BOARD_ID,name:'TradeLink',status:'active',workspace_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',description:'[APSYNTRA:MODULE:tradelink:v1]'} };
 const fueltrack={...detail,board:{id:'7af78b3f-67bf-4600-9aa1-9006d19d486e',name:'FuelTrack+ v3',status:'active',description:'[APSYNTRA:MODULE:fueltrack:v1]'}};
 for(const item of [detail,material,tradelink,fueltrack]){
  const primary=boardGridColumns(item,{primaryTitle:'Asset Registry'})[0];
  assert.deepEqual(primary,{key:'record',title:'Asset Registry'});
  assert.match(boardGrid(item,{primaryTitle:'Asset Registry',primaryEditable:true}),/data-action="board-primary-label-edit"/);
 }
 assert.equal(genericBoardColumns(detail,{primaryTitle:'Asset Registry'})[0].title,'Asset Registry');
 assert.equal(boardGridColumns(detail)[0].title,'Record');
 assert.equal(boardGridColumns(tradelink)[0].title,'Item');
});
test('the existing signed revision-CAS contract persists the label and does not create a schema mutation',()=>{
 const fn=board.slice(board.indexOf('async function savePrimaryHeaderLabel('),board.indexOf('function contextualColumnEditor('));
 assert.match(fn,/auth\.getVerifiedUser\(\)/);
 assert.match(fn,/db\.allowed\(origin\.boardId,'manage'\)/);
 assert.match(fn,/settings\.revision!==origin\.revision/);
 assert.match(fn,/context\.workspace_id!==origin\.workspaceId/);
 assert.match(fn,/boardStructureClient\.save\(fresh,\{\.\.\.settings,primaryLabel:text\}\)/);
 assert.match(fn,/await boardStructureClient\.read\(origin\.boardId\)/);
 assert.match(fn,/verified\.primaryLabel!==text/);
 assert.match(fn,/deferVisibleBoardContent\(\)/);
 assert.match(fn,/origin\.displayedLabel===text/);
 assert.doesNotMatch(fn,/wm_board_schema_mutate|delete.*column|db\.updateItem/);
});
test('header supports Enter save, Escape cancel and blur save without page loading',()=>{
 const fn=board.slice(board.indexOf('function beginPrimaryHeaderEdit('),board.indexOf('function contextualColumnEditor('));
 assert.match(fn,/event\.key==='Enter'/);
 assert.match(fn,/event\.key==='Escape'/);
 assert.match(fn,/input\.addEventListener\('blur'/);
 assert.match(fn,/await savePrimaryHeaderLabel\(next,origin\)/);
 assert.match(fn,/flushVisibleBoardContent\(\{afterLocalSave:true\}\)/);
 assert.match(board,/case 'board-primary-label-edit'/);
 assert.match(board,/const primaryEditable=state\.boardManage===true&&state\.boardUi\?\.status==='VERIFIED_READ'/);
 assert.doesNotMatch(fn,/await loadBoard\(/);
});

test('signed primary label round-trip persists across an independent fresh settings read',async()=>{
 const boardId='77777777-7777-4777-8777-777777777777';
 let current={board_id:boardId,revision:0,primary_label:'Item',
  tabs:[{key:'items',label:'Board items',visible:true}],column_labels:{}};
 const calls=[];
 const api={allowed:async(id,permission)=>{assert.equal(id,boardId);assert.equal(permission,'manage');return true;},
  rpc:async(op,args)=>{
   calls.push(op);
   if(op==='wm_board_ui_read')return structuredClone(current);
   if(op==='wm_board_ui_save'){
    assert.equal(args.p_expected_revision,current.revision);
    assert.equal(args.p_primary_label,'Asset Registry');
    current={...current,revision:current.revision+1,primary_label:args.p_primary_label};
    return structuredClone(current);
   }
   throw Error('Unexpected schema mutation');
  }};
 const structure=new BoardStructureClient(api);
 const detail={board:{id:boardId,status:'active',updated_at:'2026-11-12T05:00:00Z'},columns:[]};
 const initial=await structure.read(boardId);
 assert.equal(initial.primaryLabel,'Item');
 const saved=await structure.save(detail,{...initial,primaryLabel:'Asset Registry'});
 assert.equal(saved.revision,1);
 const afterReload=await new BoardStructureClient(api).read(boardId);
 assert.equal(afterReload.primaryLabel,'Asset Registry');
 assert.equal(boardGridColumns(detail,{primaryTitle:afterReload.primaryLabel})[0].title,'Asset Registry');
 assert.deepEqual(calls,['wm_board_ui_read','wm_board_ui_save','wm_board_ui_read']);
});

test('TimeTracker main group supports label-only customization without changing private attendance fields',async()=>{
 const {renderTimeTrackerMainGroup,TIMETRACKER_MAIN_GROUP_HEADINGS} = await import('../time-tracker-main-group.js');
 const html=renderTimeTrackerMainGroup({primaryTitle:'Staff Member',primaryEditable:true});
 assert.match(html,/data-action="board-primary-label-edit"/);
 assert.match(html,/>Staff Member<\/button>/);
 assert.equal((html.match(/<th scope="col"/g)||[]).length,7);
 assert.deepEqual(TIMETRACKER_MAIN_GROUP_HEADINGS,['Employee','Clock-In Time','Clock-In GPS',
  'Clock-Out Time','Clock-Out GPS','Attendance Status','Working Duration']);
 assert.doesNotMatch(renderTimeTrackerMainGroup(),/board-primary-label-edit/);
});
