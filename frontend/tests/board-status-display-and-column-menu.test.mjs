import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 configuredStatus,statusColorClass,visibleValue,editableCellButton,renderInlineCellEditor,
 inputForColumn,parseCellForm
} from '../board-inline-items.js';
import {boardTable} from '../board-presentation.js';

const boardId='11111111-1111-4111-8111-111111111111';
const itemId='22222222-2222-4222-8222-222222222222';
const columnId='33333333-3333-4333-8333-333333333333';
const ids=[
 'status_c76a5e84e4bdee527e27','status_c3ad6b4710797b607e5f',
 'status_2b122770316eec706934'
];
const labels=[
 {id:ids[0],name:'Active',color:'#7f8a9a',active:true},
 {id:ids[1],name:'Non-Active',color:'#4f7df3',active:true},
 {id:ids[2],name:'Decline',color:'#e64f70',active:true}
];
const status={id:columnId,board_id:boardId,column_key:'custom:status',
 data_type:'status',system_key:null,name:'Status I',visible:true,required:false,
 config:{labels}};
const item={id:itemId,title:'Contact',board_id:boardId};
const detail={columns:[status],values:[
 {item_id:itemId,column_id:columnId,value:ids[0]}]};

test('configured status IDs display names without altering stored values',()=>{
 assert.deepEqual(labels.map(x=>configuredStatus(x.id,status.config).label),
  ['Active','Non-Active','Decline']);
 assert.deepEqual(labels.map(x=>visibleValue(x.id,'status',status.config)),
  ['Active','Non-Active','Decline']);
 assert.equal(configuredStatus(ids[0],status.config).color,'#7f8a9a');
 assert.equal(configuredStatus('status_unknown',status.config).label,'status_unknown');
 assert.equal(detail.values[0].value,ids[0]);
});
test('inactive legacy status values remain readable, but editor options are enabled-only',()=>{
 const modified={...status,config:{labels:[labels[0],{...labels[2],active:false}]}};
 assert.equal(visibleValue(ids[2],'status',modified.config),'Decline');
 assert.doesNotMatch(inputForColumn(modified,ids[2]),/>Decline<\/option>/);
 assert.match(inputForColumn(modified,ids[0]),/>Active<\/option>/);
});
test('configured colors are accepted only as strict six-digit CSS hex, never CSS injection',()=>{
 assert.equal(configuredStatus(ids[1],status.config).color,'#4f7df3');
 const invalid={labels:[{id:'bad',name:'Safe',color:'red; background:url(javascript:alert(1))'}]};
 assert.deepEqual(configuredStatus('bad',invalid),{label:'Safe',color:null});
 const malicious={labels:[{id:'evil',name:'<img onerror=alert(1)>',color:'#cccccc'}]};
 assert.equal(visibleValue('evil','status',malicious),'<img onerror=alert(1)>');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/e\(status\.label\)/);
 assert.match(app,/statusColorClass\(status\.color\)/);
 assert.doesNotMatch(app,/style="--board-status-accent/);
 assert.equal(statusColorClass('#4f7df3'),'board-status-color-blue');
 assert.equal(statusColorClass('#e64f70'),'board-status-color-rose');
 assert.equal(statusColorClass('dangerous-css'),'board-status-color-neutral');
});
test('custom status editor presents named option while saving stable ID through CAS',()=>{
 const html=renderInlineCellEditor({item,key:'col:'+columnId,detail});
 assert.match(html,/data-inline-cell-form/);
 assert.match(html,new RegExp('value="'+ids[0]+'" selected'));
 assert.match(html,/>Active<\/option>/);
 const data=new FormData();data.set('value',ids[1]);
 assert.equal(parseCellForm(status,data),ids[1]);
 assert.throws(()=>{
  data.set('value','Non-Active');
  parseCellForm(status,data);
 },/supported option/);
});
test('full status button spans cell independently from record checkbox and preserves keyboard semantics',()=>{
 const btn=editableCellButton({
  key:'col:'+columnId,item,detail,writable:true,cellContent:'Active'
 });
 assert.match(btn,/board-full-status-trigger/);
 assert.match(btn,/data-action="inline-cell-start"/);
 assert.match(btn,/aria-label="Edit Status I for Contact"/);
 const html=boardTable({
  groupId:boardId,columns:[{key:'record',title:'Title'},{key:'col:'+columnId,title:'Status I'}],
  rows:[{itemId,search:'contact',statusKeys:['col:'+columnId],
   cells:{record:'Contact',['col:'+columnId]:btn}}],
  selection:{enabled:true,selected:new Set()}
 });
 assert.match(html,/td class="board-status-click-cell"/);
 assert.match(html,/data-board-select-item/);
 assert.match(html,/class="board-frozen-column"/);
 assert.match(html,/board-group-scroll/);
 assert.doesNotMatch(boardTable({columns:[{key:'record',title:'Title'}],
  rows:[{cells:{record:'Test'}}]}),/board-status-click-cell/);
});
test('header three-dot column options and resize handle are distinct buttons',()=>{
 const html=boardTable({columns:[{key:'record',title:'Title'},
  {key:'col:'+columnId,title:'Status I'}],rows:[]});
 assert.equal((html.match(/data-action="board-column-context"/g)||[]).length,2);
 assert.equal((html.match(/class="board-column-resize"/g)||[]).length,2);
 assert.match(html,/aria-haspopup="menu" aria-expanded="false"/);
 assert.match(html,/title="Column options">⋮/);
 assert.match(html,/title="Drag to resize">↔/);
 assert.match(html,/aria-label="Column options for Title"/);
 assert.match(html,/aria-label="Column options for Status I"/);
});
test('header menu actions are wired with manager-only edits and safe width configuration',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 for(const name of ['board-column-context','board-column-set-width','board-column-reset-width',
  'board-column-manage','board-column-delete-custom']){
  assert.match(app,new RegExp("case '"+name+"'"));
 }
 assert.match(app,/describeBoardColumns\(state\.board\).*c\.deletable/s);
 assert.match(app,/await openBoardStructure\(\)/);
 assert.match(app,/BOARD_COLUMN_MIN/);
 assert.match(app,/BOARD_COLUMN_MAX/);
 assert.match(app,/closeBoardColumnContext\(\{restoreFocus:true\}\)/);
 assert.match(app,/event\.key==='Escape'/);
 assert.match(app,/event\.key==='ArrowDown'/);
 assert.match(app,/if\(event\.target\.closest\('\.board-column-more,\.board-column-resize'\)\)/);
 assert.match(app,/boardColumnMenuNode\.contains\(document\.activeElement\)/);
 assert.doesNotMatch(app,/wm_delete_board_column\(/);
});
test('existing status writes keep signed preflight, revision CAS, and backend audit integration',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/await ensureSignedBulkReady\(state\.board\.board\)/);
 assert.match(app,/await verifyOrdinaryItemWrite\(boardId\)/);
 assert.match(app,/await db\.setBoardCellCas\(item\.id,col\.id,value,stateCell\.expected\)/);
 assert.match(app,/await boardBulkClient\.apply\(fresh\.board,'status',\[item\],\{status:value\}\)/);
 const css=readFileSync('frontend/styles.css','utf8');
 assert.match(css,/\.board-status-click-cell>\.board-full-status-trigger/);
 assert.match(css,/position:absolute;inset:0;width:100%;height:100%/);
 assert.match(css,/\.board-header-context-menu/);
 assert.match(css,/position-anchor:--board-col-menu/);
 assert.match(css,/\.board-status-color-blue\{border-left-color:#4f7df3\}/);
 assert.match(css,/\.board-column-more:focus-visible/);
});

test('status-cell click invokes the native picker during the user gesture with secure write checks',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf('async function startBoardInlineEdit(');
 const end=app.indexOf('async function saveBoardInlineCell(',start);
 assert.ok(start>=0&&end>start);
 const handler=app.slice(start,end);
 assert.match(handler,/if\(col\.virtual&&!await ensureSignedBulkReady/);
 assert.match(handler,/editor\.showPicker\?\.\(\)/);
 assert.match(handler,/editor\?\.focus\(\)/);
 assert.ok(handler.indexOf('editor.showPicker?.()')<
  handler.indexOf('if(col.data_type===\'status\'&&!col.virtual)'),
  'native picker must open before the physical-status read-only preflight await');
 assert.match(handler,/await verifyOrdinaryItemWrite\(boardId\)/);
 const save=app.slice(end,app.indexOf('async function saveGroupInline(',end));
 assert.match(save,/await verifyOrdinaryItemWrite\(boardId\)/);
 assert.match(save,/await db\.setBoardCellCas\(item\.id,col\.id,value,stateCell\.expected\)/);
});
