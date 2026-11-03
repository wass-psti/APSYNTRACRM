import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardTable} from '../board-presentation.js';
import {
 canManuallyEditBoard,genericBoardColumns,cellColumn,expectedCellValue,
 visibleValue,editableCellButton,renderInlineCellEditor,renderGroupAddRow,
 groupColumnSummaries,parseCellForm,inputForColumn
} from '../board-inline-items.js';

const b='11111111-1111-4111-8111-111111111111',
 group='22222222-2222-4222-8222-222222222222',
 itemId='33333333-3333-4333-8333-333333333333',
 customId='44444444-4444-4444-8444-444444444444',
 statusId='55555555-5555-4555-8555-555555555555';
const ordinary={id:b,name:'Contacts',workspace_id:group,status:'active',description:''};
const module={...ordinary,name:'TimeTracker Attendance',
 description:'[APSYNTRA:MODULE:timetracker:v1] Domain projected'};
const item={id:itemId,board_id:b,group_id:group,title:'Customer A',
 status:'not_started',due_date:null,assignee_id:null,updated_at:'2026-11-03T12:00:00Z'};
const custom={id:customId,board_id:b,name:'Cost',column_key:'custom:cost',position:5,
 data_type:'number',system_key:null,visible:true,required:false,config:{}};
const status={id:statusId,name:'Status',system_key:'status',data_type:'status',
 visible:true,config:{labels:[{id:'not_started',name:'Not started'},{id:'done',name:'Done'}]}};
const detail={board:ordinary,items:[item],groups:[{id:group,title:'Main group'}],
 columns:[custom,status],values:[{item_id:itemId,column_id:customId,value:42}],
 members:[]};
const form=value=>{const d=new FormData();d.set('value',value);return d;};

test('manual writes are restricted to ordinary, active, authorized boards',()=>{
 assert.equal(canManuallyEditBoard(ordinary,true),true);
 assert.equal(canManuallyEditBoard(ordinary,false),false);
 assert.equal(canManuallyEditBoard(module,true),false);
 assert.equal(canManuallyEditBoard({...ordinary,name:'APSYNTRA QA'},true),false);
 assert.equal(canManuallyEditBoard({...ordinary,status:'archived'},true),false);
});
test('generic columns retain the primary field and expose only actual typed visible columns',()=>{
 const columns=genericBoardColumns(detail,{primaryTitle:'Item',columnLabels:{[customId]:'Approved Cost'}});
 assert.deepEqual(columns.map(x=>x.key),['record','status','owner','due','col:'+customId,'actions']);
 assert.equal(columns[0].title,'Item');
 assert.equal(columns[4].title,'Approved Cost');
 assert.equal(cellColumn({columns:[]},'status').virtual,true);
 assert.equal(cellColumn(detail,'status').id,statusId);
 assert.equal(cellColumn(detail,'col:'+customId).id,customId);
 assert.equal(cellColumn(detail,'record').id,null);
});
test('generic footer provides required title and stays in a single table tfoot',()=>{
 const footer=renderGroupAddRow({groupId:group,enabled:true});
 assert.match(footer,/data-inline-add-row="22222222/);
 assert.match(footer,/maxlength="240"/);
 assert.match(footer,/required/);
 const html=boardTable({columns:[{key:'record',title:'Item'},{key:'status',title:'Status'}],
  rows:[{cells:{record:'One',status:'Working'}}],footer,summaries:{record:'1 item',status:'1 working'}});
 assert.equal((html.match(/<tfoot/g)||[]).length,1);
 assert.match(html,/class="board-add-item-row"/);
 assert.match(html,/class="board-column-summaries"/);
 assert.match(html,/1 working/);
 assert.match(html,/<\/tfoot><\/table>/);
});
test('domain-managed board never exposes an executable add-row form',()=>{
 const footer=renderGroupAddRow({groupId:group,enabled:false,domain:true});
 assert.match(footer,/authorized module workflow/);
 assert.doesNotMatch(footer,/<form/);
});
test('record and custom inline editors escape untrusted text and preserve CAS inputs',()=>{
 const malicious={...item,title:'<img src=x onerror=alert(1)>'};
 const record=renderInlineCellEditor({item:malicious,key:'record',detail:{...detail,items:[malicious]}});
 assert.match(record,/data-inline-cell-form/);
 assert.match(record,/name="value"/);
 assert.doesNotMatch(record,/<img/);
 const customInput=renderInlineCellEditor({item,key:'col:'+customId,detail});
 assert.match(customInput,/type="number"/);
 assert.match(customInput,/value="42"/);
 const button=editableCellButton({key:'record',item:malicious,detail,writable:true,cellContent:'Safe'});
 assert.match(button,/data-action="inline-cell-start"/);
 assert.doesNotMatch(button,/<img/);
 assert.equal(expectedCellValue(detail,item,'col:'+customId),42);
});
test('typed inputs respect dates, enums, members, checkboxes, and timelines',()=>{
 const date={name:'Due date',data_type:'date',config:{}};
 assert.match(inputForColumn(date,'2026-11-03'),/type="date"/);
 const enumHtml=inputForColumn(status,'done');
 assert.match(enumHtml,/value="done" selected/);
 assert.match(inputForColumn({name:'Check',data_type:'checkbox',config:{}},true),/checked/);
 const timeline={name:'Period',data_type:'timeline',config:{},required:false};
 assert.match(inputForColumn(timeline,{start:'2026-11-03',end:'2026-11-05'}),/name="start"/);
 assert.deepEqual(parseCellForm(timeline,(()=>{
  const x=new FormData();x.set('start','2026-11-03');x.set('end','2026-11-05');return x;
 })()),{start:'2026-11-03',end:'2026-11-05'});
 assert.throws(()=>parseCellForm(timeline,(()=>{
  const x=new FormData();x.set('start','2026-11-05');x.set('end','2026-11-03');return x;
 })()),/timeline/);
});
test('typed editor validates numbers and rejects invalid empty, invalid status and nonfinite values',()=>{
 assert.equal(parseCellForm(custom,form('3.5')),3.5);
 assert.equal(parseCellForm(custom,form('')),null);
 assert.throws(()=>parseCellForm(custom,form('Infinity')),/finite number/);
 assert.equal(parseCellForm(status,form('done')),'done');
 assert.throws(()=>parseCellForm(status,form('unapproved')),/supported option/);
 assert.throws(()=>parseCellForm(cellColumn(detail,'record'),form('')),/required/);
 assert.throws(()=>parseCellForm(cellColumn(detail,'record'),form('A'.repeat(241))),/length/);
});
test('typed date and timeline inputs enforce real calendar days including leap years',()=>{
 const due={name:'Due date',data_type:'date',config:{},required:true};
 assert.equal(parseCellForm(due,form('2024-02-29')),'2024-02-29');
 assert.throws(()=>parseCellForm(due,form('2026-02-29')),/valid date/);
 assert.throws(()=>parseCellForm(due,form('2026-04-31')),/valid date/);
 assert.throws(()=>parseCellForm(due,form('0000-01-01')),/valid date/);
 const timeline={name:'Period',data_type:'timeline',config:{},required:true};
 const range=(start,end)=>{
  const data=new FormData();data.set('start',start);data.set('end',end);
  return data;
 };
 assert.deepEqual(parseCellForm(timeline,range('2024-02-29','2024-03-01')),
  {start:'2024-02-29',end:'2024-03-01'});
 assert.throws(()=>parseCellForm(timeline,range('2026-02-29','2026-03-01')),/valid timeline/);
 assert.throws(()=>parseCellForm(timeline,range('2026-04-30','2026-04-31')),/valid timeline/);
});
test('column summaries calculate nonsecret counts and numeric sums from visible rows',()=>{
 const sums=groupColumnSummaries({items:[item],detail,
  columns:genericBoardColumns(detail)});
 assert.equal(sums.record,'1 item');
 assert.equal(sums.status,'1 not_started');
 assert.equal(sums['col:'+customId],'Σ 42');
 assert.equal(visibleValue({start:'2026-11-03',end:'2026-11-05'},'timeline'),
  '2026-11-03 → 2026-11-05');
});
test('existing UI directly submits forms using authorized RPC and CAS, without modal creation or non-CAS item editing',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/data-inline-add-row/);
 assert.match(app,/data-inline-cell-form/);
 assert.match(app,/await db\.addItem\(boardId,groupId,title\)/);
 assert.match(app,/await db\.setBoardCellCas\(item\.id,col\.id,value,stateCell\.expected\)/);
 assert.match(app,/await boardBulkClient\.apply\(fresh\.board,'status',\[item\],\{status:value\}\)/);
 assert.match(app,/!bulkReadyFor\(fresh\.board\)/);
 assert.match(app,/await verifyOrdinaryItemWrite\(boardId/);
 assert.match(app,/case 'inline-cell-start'/);
 assert.match(app,/case 'inline-cell-cancel'/);
 assert.match(app,/case 'new-item'/);
 assert.doesNotMatch(app,/openModal\('Edit board item'/);
 assert.doesNotMatch(app,/openModal\('Add a board item'/);
 assert.doesNotMatch(app,/await db\.updateItem\(/);
});
test('the primary column, selection, independent group scrolling, and accessibility controls remain intact',()=>{
 const html=boardTable({groupId:group,
  columns:[{key:'record',title:'Record'},{key:'status',title:'Status'}],
  rows:[{itemId,search:'customer',cells:{record:'Customer',status:'Pending'}}],
  selection:{enabled:true,selected:new Set()}});
 assert.match(html,/board-frozen-column/);
 assert.match(html,/board-group-scroll/);
 assert.match(html,/data-board-select-item/);
 assert.match(html,/aria-label="Horizontally scrollable board group"/);
});
