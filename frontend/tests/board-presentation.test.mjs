import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preferenceKey,columnWidth,reorderVisible,normalizeLayout,loadBoardLayout,
 saveBoardLayout,resetBoardLayout,boardTable,boardColumnMenu} from '../board-presentation.js';
import {boardGrid,boardGridColumns} from '../board-grid.js';
const a='11111111-1111-4111-8111-111111111111',
 b='22222222-2222-4222-8222-222222222222',
 c='33333333-3333-4333-8333-333333333333',
 d='44444444-4444-4444-8444-444444444444';
const ctx={user_id:a,workspace_id:b};
const tabs=['items','issues','attendance'];
const cols=['record','status','owner','due','actions'];
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,
 setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),keys:()=>[...m.keys()]};}
test('board layout prefs isolate user/workspace/board and omit application data',()=>{
 const s=storage(),base=normalizeLayout({},tabs,cols);
 assert.equal(preferenceKey({},c),null);
 assert.equal(preferenceKey(ctx,c).split(':').at(-1),c);
 assert.equal(saveBoardLayout(ctx,c,{...base,tabs:['attendance','items','issues']},s),true);
 assert.deepEqual(loadBoardLayout(ctx,c,tabs,cols,s).tabs,['attendance','items','issues']);
 assert.deepEqual(loadBoardLayout({...ctx,user_id:d},c,tabs,cols,s).tabs,tabs);
 assert.deepEqual(loadBoardLayout({...ctx,workspace_id:d},c,tabs,cols,s).tabs,tabs);
 assert.deepEqual(loadBoardLayout(ctx,d,tabs,cols,s).tabs,tabs);
 assert.equal(s.keys().length,1);
 assert.equal(resetBoardLayout(ctx,c,s),true);
 assert.deepEqual(loadBoardLayout(ctx,c,tabs,cols,s).tabs,tabs);
});
test('malformed storage, unknown columns, duplicates and required columns cannot hide',()=>{
 const s=storage(),key=preferenceKey(ctx,c);
 s.setItem(key,'{not-valid');
 assert.deepEqual(loadBoardLayout(ctx,c,tabs,cols,s).columns,cols);
 s.setItem(key,JSON.stringify({tabs:['issues','issues','fake','items'],
  columns:['due','owner','status','record','actions','fake','owner'],
  hidden:['owner','owner','record','status','fake'],widths:{owner:8000,due:-200,record:0}}));
 const normalized=loadBoardLayout(ctx,c,tabs,cols,s);
 assert.deepEqual(normalized.tabs,['issues','items','attendance']);
 assert.deepEqual(normalized.columns,['record','status','due','owner','actions']);
 assert.deepEqual(normalized.hidden,['owner']);
 assert.equal(normalized.widths.owner,520);
 assert.equal(normalized.widths.due,110);
 assert.equal(normalized.widths.record,110);
 assert.equal(columnWidth('NaN'),185);
 s.setItem(key,'x'.repeat(8001));
 assert.deepEqual(loadBoardLayout(ctx,c,tabs,cols,s).columns,cols);
});
test('tab/column reorder preserves authorized set and cannot duplicate unknown identifiers',()=>{
 assert.deepEqual(reorderVisible(tabs,'attendance','items'),['attendance','items','issues']);
 assert.deepEqual(reorderVisible(tabs,'unknown','items'),tabs);
 assert.deepEqual(reorderVisible(tabs,'issues','issues'),tabs);
 assert.deepEqual(normalizeLayout({tabs:['finance'],columns:['secret']},tabs,cols).tabs,tabs);
});
test('rendered board table preserves frozen record column and independent group scroll',()=>{
 const markup=boardTable({groupId:c,columns:[{key:'record',title:'Record'},
  {key:'status',title:'Status'},{key:'owner',title:'Owner'}],
  rows:[{search:'<unsafe>',cells:{record:'Safe',status:'Done',owner:'Escaped'}}],
  layout:{columns:['owner','record','status'],hidden:[],widths:{owner:210}}});
 assert.match(markup,/class="table-scroll board-group-scroll"/);
 assert.match(markup,/class="board-frozen-column"/);
 assert.match(markup,/data-group-id="33333333/);
 assert.match(markup,/data-column-key="owner"/);
 assert.match(markup,/width="210"/);
 assert.doesNotMatch(markup,/<unsafe>/);
 const menu=boardColumnMenu([{key:'record',title:'Record'},
  {key:'status',title:'Status'},{key:'owner',title:'Owner'}],{hidden:['owner']});
 assert.match(menu,/data-board-column-toggle="owner"/);
 assert.match(menu,/data-action="board-layout-reset"/);
 assert.match(menu,/data-action="board-column-move"/);
});
test('typed board schema is still restricted to declared, visible, approved fields',()=>{
 const detail={board:{name:'No domain module'},columns:[{id:'a',name:'Public',system_key:null,visible:true},
  {id:'b',name:'Hidden',system_key:null,visible:false},
  {id:'c',name:'Secret',system_key:'restricted'}],
  items:[{id:'it1',group_id:'grp1',title:'Item'}],
  values:[{item_id:'it1',column_id:'a',value:'Visible'},
   {item_id:'it1',column_id:'b',value:'INTERNAL-SECRET'},
   {item_id:'it1',column_id:'c',value:'INTERNAL-SECRET'}]};
 const c=boardGridColumns(detail);
 assert.deepEqual(c.map(x=>x.key),['record','status','col:a']);
 const html=boardGrid(detail,{groupId:'grp1'});
 assert.match(html,/Visible/);
 assert.doesNotMatch(html,/INTERNAL-SECRET|Hidden|Secret/);
});
test('UI only persists presentation layout and uses existing signed audit API',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const data=readFileSync('frontend/data.js','utf8');
 const css=readFileSync('frontend/styles.css','utf8');
 assert.match(app,/function activeBoardLayout\(\)/);
 assert.match(app,/auth\.userId!==state\.context\?\.user_id/);
 assert.match(app,/state\.board\?\.board\?\.workspace_id/);
 assert.match(app,/case 'board-tab-move'/);
 assert.match(app,/case 'board-column-move'/);
 assert.match(app,/case 'board-activity'/);
 assert.match(app,/db\.boardEvents\(snapshot\.boardId,100\)/);
 assert.match(app,/case 'board-layout-reset'/);
 assert.match(app,/root\.addEventListener\('dragstart'/);
 assert.match(app,/window\.addEventListener\('pointermove'/);
 assert.match(data,/wm_list_board_events/);
 assert.match(css,/\.board-group-scroll/);
 assert.match(css,/\.board-frozen-column/);
 assert.doesNotMatch(app,/Build with Vibe|monday\.com/);
});
