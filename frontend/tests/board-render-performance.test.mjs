import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardTable} from '../board-presentation.js';
import {createBoardRenderIndex,cellColumn,expectedCellValue,groupColumnSummaries} from '../board-inline-items.js';
import {registerBoardWindow,resetBoardWindows,updateBoardWindowRow,visibleBoardWindowIds} from '../board-window.js';

const itemId='11111111-1111-4111-8111-111111111111';
const columnId='22222222-2222-4222-8222-222222222222';
const groupId='33333333-3333-4333-8333-333333333333';
const item={id:itemId,title:'Original title',group_id:groupId,status:'working',
 assignee_id:null,due_date:null,archived_at:null};
const column={id:columnId,name:'Amount',data_type:'number',system_key:null,
 visible:true,required:false,position:1,config:{}};
const detail={board:{id:'44444444-4444-4444-8444-444444444444'},items:[item],
 columns:[column],values:[{item_id:itemId,column_id:columnId,value:12.5}]};

test('render-local board indexes preserve existing cell and column lookup semantics',()=>{
 const index=createBoardRenderIndex(detail);
 assert.equal(expectedCellValue(detail,item,'col:'+columnId),12.5);
 assert.equal(expectedCellValue(detail,item,'col:'+columnId,index),12.5);
 assert.equal(cellColumn(detail,'col:'+columnId,index),column);
 assert.equal(index.valuesByItem.get(itemId).get(columnId),12.5);
});

test('indexed group summaries produce the same values without rebuilding a value map per group',()=>{
 const columns=[{key:'record',title:'Item'},{key:'status',title:'Status'},
  {key:'col:'+columnId,title:'Amount'}];
 const index=createBoardRenderIndex(detail);
 const summary=groupColumnSummaries({items:[item],columns,detail,
  valueIndex:index.valuesByItem,columnIndex:index.columnsById});
 assert.deepEqual(summary,{record:'1 item',status:'1 working',owner:'0 assigned',
  due:'—',['col:'+columnId]:'Σ 12.5'});
});

test('board table exposes stable item/column patch targets and summary keys',()=>{
 const html=boardTable({groupId,columns:[{key:'record',title:'Item'},
  {key:'col:'+columnId,title:'Amount'}],rows:[{itemId,search:'original title',
  cells:{record:'Original title', ['col:'+columnId]:'12.5'}}],
  summaries:{record:'1 item',['col:'+columnId]:'Σ 12.5'}});
 assert.match(html,/data-board-cell-item-id="11111111-1111-4111-8111-111111111111"/);
 assert.match(html,/data-board-cell-key="col:22222222-2222-4222-8222-222222222222"/);
 assert.match(html,/data-board-summary-key="col:22222222-2222-4222-8222-222222222222"/);
});

test('virtualized row updates refresh future windows and title-filter indexes',()=>{
 resetBoardWindows();
 const rows=Array.from({length:140},(_,i)=>({itemId:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  search:'record '+i,cells:{record:'Record '+i,status:'Ready'}}));
 registerBoardWindow(groupId,rows,batch=>batch.map(row=>'<tr>'+row.cells.record+'</tr>').join(''),2);
 assert.equal(visibleBoardWindowIds(groupId).length,140);
 const target=rows[0].itemId;
 assert.equal(updateBoardWindowRow(groupId,target,row=>{
  row.search='renamed record';row.cells.record='Renamed record';
 }),true);
 assert.equal(rows[0].cells.record,'Renamed record');
 resetBoardWindows();
});

test('ordinary board editor lifecycle patches one cell without invoking a full board render or weakening signed checks',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=app.slice(app.indexOf('async function startBoardInlineEdit('),app.indexOf('async function saveBoardInlineCell('));
 const save=app.slice(app.indexOf('async function saveBoardInlineCell('),app.indexOf('async function saveGroupInline('));
 assert.match(start,/mountInlineCellEditor\(/);
 assert.match(start,/verifyOrdinaryItemWrite\(boardId\)/);
 assert.match(start,/ensureSignedBulkReady\(state\.board\.board\)/);
 assert.ok(start.indexOf('mountInlineCellEditor(')<start.indexOf('verifyOrdinaryItemWrite(boardId)'));
 assert.doesNotMatch(start,/preserveInlineScroll\(|render\(\)/);
 assert.match(save,/await verifyOrdinaryItemWrite\(boardId\)/);
 assert.match(save,/await db\.setBoardCellCas\(item\.id,col\.id,value,stateCell\.expected\)/);
 assert.match(save,/patchBoardCellDom\(/);
 assert.match(save,/updateBoardWindowRow\(/);
 assert.doesNotMatch(save,/await loadBoard\(boardId,'items'\)/);
 assert.match(app,/case 'inline-cell-cancel':[\s\S]*closeInlineCellEditor\(/);
});

test('ordinary groups retain virtualization only for complete authoritative item sets and share one render index',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const group=app.slice(app.indexOf('function groupRows('),app.indexOf('function findBoardCellNode('));
 const page=app.slice(app.indexOf('function boardPage('),app.indexOf('function settingsPage('));
 assert.match(group,/virtualize:boardItemsComplete\(detail\)/);
 assert.match(page,/const renderIndex=state\.tab==='items'&&!moduleKey\?createBoardRenderIndex\(state\.board\):null/);
 assert.match(page,/groupRows\(groupedItems\.get\(g\.id\)\|\|\[\],state\.edit,layout,g\.id,primaryTitle,state\.board,columnLabels,columns,renderIndex\)/);
});

test('confirmed cell edits update the existing value model, row window and visible group summaries',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const update=app.slice(app.indexOf('function applyBoardCellValue('),app.indexOf('function updateBoardGroupSummary('));
 const save=app.slice(app.indexOf('async function saveBoardInlineCell('),app.indexOf('async function saveGroupInline('));
 assert.match(update,/state\.board\.values\.push/);
 assert.match(save,/updateBoardWindowRow\(groupId,current\.id/);
 assert.match(save,/patchBoardCellDom\(current,stateCell\.key,currentIndex\)/);
 assert.match(save,/updateBoardGroupSummary\(groupId,currentIndex\)/);
 assert.match(save,/state\.inlineCellBusy=false/);
});

test('inline editor stays inside its cell and the hidden trigger cannot affect layout',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(css,/\.board-inline-cell-trigger\[hidden\]\{display:none\}/);
 assert.match(css,/\.board-inline-cell-form\{[^}]*min-width:0;width:100%;max-width:100%/);
});

test('fallback summary lookup remains compatible for callers without a render index',()=>{
 const columns=[{key:'record',title:'Item'},{key:'col:'+columnId,title:'Amount'}];
 assert.deepEqual(groupColumnSummaries({items:[item],columns,detail}),
  {record:'1 item',status:'1 working',owner:'0 assigned',due:'—',
   ['col:'+columnId]:'Σ 12.5'});
});

test('title edits reconcile both virtual and ordinary board search rows without stale matches',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const patch=app.slice(app.indexOf('function patchBoardCellDom('),app.indexOf('function applyBoardCellValue('));
 const save=app.slice(app.indexOf('async function saveBoardInlineCell('),app.indexOf('async function saveGroupInline('));
 assert.match(patch,/row\.dataset\.searchable=String\(item\.title/);
 assert.match(patch,/row\.hidden=!row\.dataset\.searchable\.includes\(needle\)/);
 assert.ok(save.indexOf('patchBoardCellDom(current,stateCell.key,currentIndex)')<
  save.indexOf('updateBoardWindowRow(groupId,current.id'),
  'patch the focused cell before reconciling a title-filtered virtual window');
 assert.match(save,/visibleIds&&!visibleIds\.includes\(current\.id\)/);
 assert.match(save,/search-board-items.*focus\(\{preventScroll:true\}\)/);
});
