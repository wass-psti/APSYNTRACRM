import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDelimited,parseImportFile} from '../board-import-parse.js';
import {inferImportType,initialImportMappings,buildImportPlan,
 executeBoardImport,availableImportColumns} from '../board-import-core.js';
import {importMappingReadiness,reassignImportItemMapping} from '../board-import-readiness.js';
const boardId='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const groupId='44444444-4444-4444-8444-444444444444';
const colId='55555555-5555-4555-8555-555555555555';
const now='2026-11-05T03:00:00.123Z';
const detail={board:{id:boardId,workspace_id:ws,updated_at:now,status:'active',name:'Contacts'},
 groups:[{id:groupId,title:'Current'}],columns:[{id:colId,name:'Amount',data_type:'number',
 column_key:'custom:amount',system_key:null,config:{}}],items:[],values:[]};
const sheet={headers:['Name','Amount','Checked'],rows:[
 ['Alice','25','yes'],['Bob','31','no']]};
const existingMaps=[
 {source:'Name',action:'item'},
 {source:'Amount',action:'existing',columnId:colId},
 {source:'Checked',action:'skip'}
];
const group={action:'existing',groupId};
test('CSV handles BOM, multiline quoted cells, escaped quotes, and delimiter detection',()=>{
 const parsed=parseDelimited('\uFEFFName;Notes\r\n"Alice";"Line 1\nLine ""2"""\r\nBob;Hello\r\n');
 assert.deepEqual(parsed.headers,['Name','Notes']);
 assert.deepEqual(parsed.rows,[['Alice','Line 1\nLine "2"'],['Bob','Hello']]);
 assert.throws(()=>parseDelimited('Name,Name\nA,B'),/unique/);
 assert.throws(()=>parseDelimited('Name\n"unfinished'),/unterminated/);
});
test('file checks reject bad extensions and invalid XLSX structures',async()=>{
 await assert.rejects(()=>parseImportFile(new File(['abc'],'import.xls')),/CSV and XLSX/);
 await assert.rejects(()=>parseImportFile(new File(['abc'],'import.xlsx')),/XLSX ZIP/);
});
test('source type detection and exact existing-column reuse are stable',()=>{
 assert.equal(inferImportType('Date Updated',['2026-11-05']),'date');
 assert.equal(inferImportType('Checked',['yes','no']),'checkbox');
 assert.equal(inferImportType('Status',['Open']),'status');
 assert.equal(inferImportType('Amount',['1','-2.5']),'number');
 const mappings=initialImportMappings(sheet,detail);
 assert.equal(mappings[0].action,'item');
 assert.deepEqual([mappings[1].action,mappings[1].columnId],['existing',colId]);
 assert.equal(mappings[2].action,'skip');
 assert.equal(availableImportColumns(detail).length,1);
});
test('number and date conversion accepts common export formats without guessing ambiguous dates',()=>{
 assert.equal(inferImportType('Deal Value',['$1,234.50','₱2,500.00']),'number');
 assert.equal(inferImportType('Date Updated',['02/13/2026','13/02/2026']),'date');
 assert.equal(inferImportType('Date Updated',['01/02/2026']),'date');
 const numeric={...sheet,headers:['Name','Amount'],rows:[['Alpha','$1,234.50'],['Beta','₱2,500.00']]};
 const numericMaps=[{source:'Name',action:'item'},
  {source:'Amount',action:'create',columnType:'number',name:'Imported Amount'}];
 const numericPlan=buildImportPlan({sheet:numeric,detail,mappings:numericMaps,group,allowColumns:true});
 assert.equal(numericPlan.payload.rows[0].values.Amount,1234.5);
 assert.equal(numericPlan.payload.rows[1].values.Amount,2500);
 const dates={...sheet,headers:['Name','Date Updated'],rows:[['Alpha','02/13/2026'],['Beta','13/02/2026']]};
 const dateMaps=[{source:'Name',action:'item'},
  {source:'Date Updated',action:'create',columnType:'date',name:'Date Updated'}];
 const datePlan=buildImportPlan({sheet:dates,detail,mappings:dateMaps,group,allowColumns:true});
 assert.equal(datePlan.payload.rows[0].values['Date Updated'],'2026-02-13');
 assert.equal(datePlan.payload.rows[1].values['Date Updated'],'2026-02-13');
 const ambiguous={...dates,rows:[['Alpha','01/02/2026']]};
 assert.throws(()=>buildImportPlan({sheet:ambiguous,detail,mappings:dateMaps,group,allowColumns:true}),
  /unambiguous day\/month or month\/day date/);
});
test('board import core and parser pin the shared date normalizer to a versioned module URL',()=>{
 const coreSource=readFileSync(new URL('../board-import-core.js',import.meta.url),'utf8');
 const parserSource=readFileSync(new URL('../board-import-parse.js',import.meta.url),'utf8');
 assert.ok(coreSource.includes('excel-date-normalization.js?v=cp-bimp-06-utc-20261111'));
 assert.ok(parserSource.includes('excel-date-normalization.js?v=cp-bimp-06-utc-20261111'));
});
test('Monday.com UTC Date encoded timestamps map to their source calendar date',()=>{
 const timestamps={headers:['Name','Date encoded'],rows:[
  ['Alpha','2026-01-27 03:36:15 UTC'],
  ['Beta','2025-12-31T23:59:59Z']
 ]};
 assert.equal(inferImportType('Date encoded',timestamps.rows.map(r=>r[1])),'date');
 const mappings=[
  {source:'Name',action:'item',type:'text'},
  {source:'Date encoded',action:'create',columnType:'date',name:'Date encoded',type:'date'}
 ];
 const plan=buildImportPlan({sheet:timestamps,detail,mappings,group,allowColumns:true});
 assert.equal(plan.payload.rows[0].values['Date encoded'],'2026-01-27');
 assert.equal(plan.payload.rows[1].values['Date encoded'],'2025-12-31');
});
test('long description columns infer long_text across all rows and preserve complete values',()=>{
 const longDescription=('Work description '.repeat(100)).trimEnd();
 const rows=Array.from({length:101},(_,i)=>['Record '+i,'Short description']);
 rows[100][1]=longDescription;
 const longSheet={headers:['Name','Work description'],rows};
 assert.equal(inferImportType('Work description',rows.map(row=>row[1])),'long_text');
 const mappings=initialImportMappings(longSheet,detail,{canCreate:true});
 assert.equal(mappings[1].action,'create');
 assert.equal(mappings[1].columnType,'long_text');
 const plan=buildImportPlan({sheet:longSheet,detail,mappings,group,allowColumns:true});
 assert.equal(plan.payload.newColumns[0].type,'long_text');
 assert.equal(plan.payload.rows[100].values['Work description'],longDescription);
 const maxLength='x'.repeat(5000);
 const maxSheet={headers:['Name','Work description'],rows:[['Maximum',maxLength]]};
 const maxMappings=initialImportMappings(maxSheet,detail,{canCreate:true});
 const maxPlan=buildImportPlan({sheet:maxSheet,detail,mappings:maxMappings,group,allowColumns:true});
 assert.equal(maxPlan.payload.rows[0].values['Work description'],maxLength);
});
test('manager receives missing-column proposal; editor sees no auto-creation',()=>{
 const editor=initialImportMappings(sheet,detail);
 assert.equal(editor[2].action,'skip');
 const manager=initialImportMappings(sheet,detail,{canCreate:true});
 assert.equal(manager[0].action,'item');
 assert.equal(manager[1].action,'existing');
 assert.equal(manager[2].action,'create');
 assert.equal(manager[2].columnType,'checkbox');
 assert.throws(()=>buildImportPlan({sheet,detail,mappings:manager,group}),/explicit Allow/);
 const granted=buildImportPlan({sheet,detail,mappings:manager,group,allowColumns:true});
 assert.equal(granted.payload.newColumns.length,1);
});
test('no new columns unless the approved plan explicitly includes them',()=>{
 const proposed=existingMaps.map(m=>({...m}));
 proposed[2]={source:'Checked',action:'create',name:'Checked',columnType:'checkbox'};
 assert.throws(()=>buildImportPlan({sheet,detail,mappings:proposed,group}),/explicit Allow/);
 const plan=buildImportPlan({sheet,detail,mappings:proposed,group,allowColumns:true});
 assert.equal(plan.payload.contract,'m143-v1');
 assert.deepEqual(plan.payload.newColumns,[{source:'Checked',name:'Checked',type:'checkbox',config:{}}]);
 assert.equal(plan.payload.rows[0].values.Amount,25);
 assert.equal(plan.payload.rows[0].values.Checked,true);
 assert.equal(plan.preview.newItems,2);
 assert.equal(plan.boardRevision,now);
});
test('unmapped source columns require an explicit mapping or exclusion decision',()=>{
 const editorMappings=initialImportMappings(sheet,detail);
 assert.equal(editorMappings[2].action,'skip');
 assert.equal(editorMappings[2].requiresDecision,true);
 const gate=importMappingReadiness(editorMappings);
 assert.deepEqual(gate.pendingSkips,[{index:2,source:'Checked',type:'checkbox'}]);
 assert.equal(gate.ready,false);
 assert.throws(()=>buildImportPlan({sheet,detail,mappings:editorMappings,group}),
  /explicitly confirm exclusion/);
 const explicitlyExcluded=editorMappings.map((m,i)=>i===2?{...m,requiresDecision:false}:m);
 assert.deepEqual(importMappingReadiness(explicitlyExcluded).pendingSkips,[]);
 const plan=buildImportPlan({sheet,detail,mappings:explicitlyExcluded,group});
 assert.deepEqual(plan.payload.rows[0].values,{Amount:25});
 const mapped=editorMappings.map((m,i)=>i===2?
  {...m,action:'existing',columnId:colId,requiresDecision:false}:m);
 assert.deepEqual(importMappingReadiness(mapped).pendingSkips,[]);
});
test('reassigning the Item title column keeps the previous title source unresolved',()=>{
 const original=[
  {source:'Name',action:'item',type:'text'},
  {source:'Alternate title',action:'skip',type:'text',requiresDecision:true},
  {source:'Amount',action:'existing',columnId:colId,type:'number'}
 ];
 const remapped=reassignImportItemMapping(original,1);
 assert.deepEqual(remapped[0],{source:'Name',action:'skip',type:'text',requiresDecision:true});
 assert.deepEqual(remapped[1],{source:'Alternate title',action:'item',type:'text',requiresDecision:false});
 assert.deepEqual(importMappingReadiness(remapped).pendingSkips,
  [{index:0,source:'Name',type:'text'}]);
 const remapSheet={headers:['Name','Alternate title','Amount'],
  rows:[['Old title','New title','25']]};
 assert.throws(()=>buildImportPlan({sheet:remapSheet,detail,mappings:remapped,group}),
  /explicitly confirm exclusion/);
 const acknowledged=remapped.map((mapping,index)=>index===0?
  {...mapping,requiresDecision:false}:mapping);
 const plan=buildImportPlan({sheet:remapSheet,detail,mappings:acknowledged,group});
 assert.equal(plan.payload.rows[0].title,'New title');
 assert.deepEqual(plan.payload.rows[0].values,{Amount:25});
});
test('omitted worksheet rows and uncached formula blanks require explicit acknowledgement',()=>{
 const mappings=existingMaps.map(m=>({...m}));
 const report={...sheet,omittedRows:[623],formulaWarnings:[
  {row:622,cell:'I622',column:'Deal Value (VAT-EX)'}
 ]};
 assert.throws(()=>buildImportPlan({sheet:report,detail,mappings,group}),
  /Confirm whether to exclude the worksheet summary rows/);
 assert.throws(()=>buildImportPlan({sheet:{...report,omittedRowsConfirmed:true},
  detail,mappings,group}),/Confirm that uncached formula cells will be imported as blank/);
 const plan=buildImportPlan({sheet:{...report,omittedRowsConfirmed:true,
  formulaWarningsConfirmed:true},detail,mappings,group});
 assert.equal(plan.preview.rowCount,2);
});
test('declined mapping changes never create a board column',()=>{
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group,allowColumns:false});
 assert.deepEqual(plan.payload.newColumns,[]);
 assert.deepEqual(plan.payload.rows[0].values,{Amount:25});
});
test('duplicate Skip and Update review keys within the selected Group',()=>{
 const existing={id:'66666666-6666-4666-8666-666666666666',group_id:groupId,
  title:'Alice',updated_at:'2026-11-05T02:00:00Z'};
 const populated={...detail,items:[existing]};
 const skip=buildImportPlan({sheet,detail:populated,mappings:existingMaps,group,
  matches:{behavior:'skip',matchColumnId:'item'}});
 assert.deepEqual(skip.preview,{newItems:1,updatedItems:0,skippedItems:1,newColumns:0,rowCount:2});
 const update=buildImportPlan({sheet,detail:populated,mappings:existingMaps,group,
  matches:{behavior:'update',matchColumnId:'item'}});
 assert.equal(update.preview.updatedItems,1);
 assert.equal(update.preview.skippedItems,1);
 assert.equal(update.payload.rows[0].expected_item_updated_at,existing.updated_at);
 assert.equal(update.payload.rows[1].expected_item_updated_at,undefined);
});
test('duplicate headers, duplicate match keys and ambiguous destination keys reject',()=>{
 const duplicateRows={...sheet,rows:[['Alice','25','yes'],['Alice','28','yes']]};
 assert.throws(()=>buildImportPlan({sheet:duplicateRows,detail,mappings:existingMaps,group,
  matches:{behavior:'skip',matchColumnId:'item'}}),/Duplicate-match key appears twice/);
 const multiple={...detail,items:[
  {id:'66666666-6666-4666-8666-666666666666',group_id:groupId,title:'Alice'},
  {id:'77777777-7777-4777-8777-777777777777',group_id:groupId,title:'alice'}]};
 assert.throws(()=>buildImportPlan({sheet,detail:multiple,mappings:existingMaps,group,
  matches:{behavior:'skip',matchColumnId:'item'}}),/ambiguous/);
});
test('formula-like cells and invalid typed values reject before persistence',()=>{
 const formula={...sheet,rows:[['=cmd','25','no']]};
 assert.throws(()=>buildImportPlan({sheet:formula,detail,mappings:existingMaps,group}),/formula-like/);
 const bad={...sheet,rows:[['Alice','not-a-number','no']]};
 assert.throws(()=>buildImportPlan({sheet:bad,detail,mappings:existingMaps,group}),/invalid value/);
});
test('mapped date rejection identifies real Excel worksheet, row, header and original value',()=>{
 const report={
  name:'live identification status — Running Monday Apps',
  worksheet:'live identification status',
  headers:['Name','Date Updated'],
  rowNumbers:[4,20],
  rows:[['Sample App','2026-07-09'],['Invalid date','2026-07-09 to 2026-08-18']]
 };
 const mappings=[
  {source:'Name',action:'item'},
  {source:'Date Updated',action:'create',columnType:'date',name:'Date Updated'}
 ];
 assert.throws(()=>buildImportPlan({sheet:report,detail,mappings,group,allowColumns:true}),
  error=>/Worksheet "live identification status"/.test(error.message)&&
   /row 20/.test(error.message)&&/column "Date Updated"/.test(error.message)&&
   /2026-07-09 to 2026-08-18/.test(error.message)&&
   /valid ISO, YYYY\/MM\/DD/.test(error.message));
});
test('protected application boards cannot be mutated through the generic importer',()=>{
 const restricted={...detail,board:{...detail.board,name:'TimeTracker Attendance'}};
 assert.throws(()=>buildImportPlan({sheet,detail:restricted,mappings:existingMaps,group}),/domain-specific/);
});
test('authorized import checks server-side active session before one atomic write RPC',async()=>{
 const calls=[];
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group});
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const persisted={...detail,
  items:[
   {id:'66666666-6666-4666-8666-666666666661',board_id:boardId,group_id:groupId,
    title:'Alice',status:'not_started',archived_at:null},
   {id:'66666666-6666-4666-8666-666666666662',board_id:boardId,group_id:groupId,
    title:'Bob',status:'not_started',archived_at:null}
  ],
  values:[
   {item_id:'66666666-6666-4666-8666-666666666661',column_id:colId,value:25},
   {item_id:'66666666-6666-4666-8666-666666666662',column_id:colId,value:31}
  ]};
 let boardReads=0;
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>++boardReads===1?detail:persisted,allowed:async()=>true,
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='wm_board_ui_read')return {board_id:boardId,revision:0};
   return {created:2,updated:0,skipped:0,columnsCreated:0,groupsCreated:0};
  }};
 const reply=await executeBoardImport({api,auth,plan});
 assert.equal(reply.created,2);
 assert.equal(calls.length,2);
 assert.equal(calls[0].name,'wm_board_ui_read');
 assert.deepEqual(calls[0].args,{p_board_id:boardId});
 assert.equal(calls[1].name,'wm_import_board_wizard_atomic');
 assert.equal(calls[1].args.p_expected_updated_at,now);
 assert.equal(calls[1].args.p_payload.contract,'m143-v1');
 assert.equal(Object.hasOwn(calls[1].args.p_payload,'readback'),false,
  'client-only verification metadata never changes the RPC contract');
 assert.equal(boardReads,2,'a fresh authoritative board read follows the atomic write');
});

test('atomic CSV/XLSX-style plan verifies newly created group, typed column and persisted cells',async()=>{
 const importSheet={headers:['Name','Amount','Flag','Date'],rows:[
  ['CSV marker','125.5','yes','2026-11-12'],
  ['XLSX marker','0','no','2026-11-13']
 ]};
 const mappings=[{source:'Name',action:'item'},
  {source:'Amount',action:'create',name:'Import Amount',columnType:'number'},
  {source:'Flag',action:'create',name:'Import Flag',columnType:'checkbox'},
  {source:'Date',action:'create',name:'Import Date',columnType:'date'}];
 const plan=buildImportPlan({sheet:importSheet,detail,mappings,
  group:{action:'create',name:'CP-BIMP-10 Verification'},allowColumns:true});
 const groupId2='77777777-7777-4777-8777-777777777771';
 const amountId='77777777-7777-4777-8777-777777777772';
 const flagId='77777777-7777-4777-8777-777777777773';
 const dateId='77777777-7777-4777-8777-777777777774';
 const item1='77777777-7777-4777-8777-777777777775';
 const item2='77777777-7777-4777-8777-777777777776';
 const persisted={...detail,
  groups:[...detail.groups,{id:groupId2,title:'CP-BIMP-10 Verification'}],
  columns:[...detail.columns,
   {id:amountId,name:'Import Amount',data_type:'number',column_key:'custom:import-amount',system_key:null,config:{}},
   {id:flagId,name:'Import Flag',data_type:'checkbox',column_key:'custom:import-flag',system_key:null,config:{}},
   {id:dateId,name:'Import Date',data_type:'date',column_key:'custom:import-date',system_key:null,config:{}}
  ],
  items:[
   {id:item1,board_id:boardId,group_id:groupId2,title:'CSV marker',status:'not_started',archived_at:null},
   {id:item2,board_id:boardId,group_id:groupId2,title:'XLSX marker',status:'not_started',archived_at:null}
  ],
  values:[
   {item_id:item1,column_id:amountId,value:125.5},
   {item_id:item1,column_id:flagId,value:true},
   {item_id:item1,column_id:dateId,value:'2026-11-12'},
   {item_id:item2,column_id:amountId,value:0},
   {item_id:item2,column_id:flagId,value:false},
   {item_id:item2,column_id:dateId,value:'2026-11-13'}
  ]
 };
 let reads=0,writes=0;
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>++reads===1?detail:persisted,allowed:async()=>true,
  rpc:async name=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   writes++;return {created:2,updated:0,skipped:0,columnsCreated:3,groupsCreated:1};
  }};
 const receipt=await executeBoardImport({api,auth,plan});
 assert.deepEqual(receipt,{created:2,updated:0,skipped:0,columnsCreated:3,groupsCreated:1});
 assert.equal(reads,2);
 assert.equal(writes,1);
});

test('update and skip modes verify exact persisted values without changing skipped rows',async()=>{
 const existingId='88888888-8888-4888-8888-888888888881';
 const baseline={...detail,
  items:[{id:existingId,board_id:boardId,group_id:groupId,title:'Alice',
   status:'not_started',updated_at:now,archived_at:null}],
  values:[{item_id:existingId,column_id:colId,value:10}]
 };
 const importSheet={headers:['Name','Amount'],rows:[['Alice','25'],['Bob','31']]};
 const mappings=[{source:'Name',action:'item'},
  {source:'Amount',action:'existing',columnId:colId}];
 for(const behavior of ['update','skip']){
  const plan=buildImportPlan({sheet:importSheet,detail:baseline,mappings,group,
   matches:{behavior,matchColumnId:'item'}});
  const bobId='88888888-8888-4888-8888-888888888882';
  const expectedUpdate=behavior==='update';
  const persisted={...baseline,
   items:expectedUpdate?baseline.items:[...baseline.items,
    {id:bobId,board_id:boardId,group_id:groupId,title:'Bob',status:'not_started',archived_at:null}],
   values:expectedUpdate?[
    {item_id:existingId,column_id:colId,value:25}
   ]:[...baseline.values,{item_id:bobId,column_id:colId,value:31}]
  };
  let reads=0,writes=0;
  const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
  const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
   board:async()=>++reads===1?baseline:persisted,allowed:async()=>true,
   rpc:async name=>{
    if(name==='wm_board_ui_read')return {board_id:boardId};
    writes++;return expectedUpdate?
     {created:0,updated:1,skipped:1,columnsCreated:0,groupsCreated:0}:
     {created:1,updated:0,skipped:1,columnsCreated:0,groupsCreated:0};
   }};
  const receipt=await executeBoardImport({api,auth,plan});
  assert.equal(receipt.updated,expectedUpdate?1:0);
  assert.equal(receipt.created,expectedUpdate?0:1);
  assert.equal(receipt.skipped,1);
  assert.equal(reads,2);
  assert.equal(writes,1);
 }
});

test('blank mapped cells in update mode preserve existing persisted values',async()=>{
 const existingId='99999999-9999-4999-8999-999999999991';
 const baseline={...detail,
  items:[{id:existingId,board_id:boardId,group_id:groupId,title:'Keep Amount',
   status:'not_started',updated_at:now,archived_at:null}],
  values:[{item_id:existingId,column_id:colId,value:88}]
 };
 const blankSheet={headers:['Name','Amount'],rows:[['Keep Amount','']]};
 const plan=buildImportPlan({sheet:blankSheet,detail:baseline,
  mappings:[{source:'Name',action:'item'},
   {source:'Amount',action:'existing',columnId:colId}],group,
  matches:{behavior:'update',matchColumnId:'item'}});
 const persisted={...baseline,
  items:[{...baseline.items[0],updated_at:'2026-11-11T10:00:00Z'}]
 };
 let reads=0;
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>++reads===1?baseline:persisted,allowed:async()=>true,
  rpc:async name=>name==='wm_board_ui_read'?{board_id:boardId}:
   {created:0,updated:1,skipped:0,columnsCreated:0,groupsCreated:0}};
 const receipt=await executeBoardImport({api,auth,plan});
 assert.equal(receipt.updated,1);
 assert.equal(persisted.values[0].value,88);
 assert.equal(reads,2);
});

test('preview baseline drift is rejected before the atomic write even if board revision is unchanged',async()=>{
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group});
 const changed={...detail,items:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  board_id:boardId,group_id:groupId,title:'Concurrent row',archived_at:null}]};
 let writes=0;
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>changed,allowed:async()=>true,
  rpc:async()=>{writes++;return {created:2,updated:0,skipped:0,columnsCreated:0,groupsCreated:0};}};
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),/Board data changed after import preview/);
 assert.equal(writes,0);
});

test('committed import with missing persisted item is uncertain and never retried',async()=>{
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group});
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 let writes=0,reads=0;
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>++reads===1?detail:{...detail,items:[],values:[]},allowed:async()=>true,
  rpc:async name=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   writes++;return {created:2,updated:0,skipped:0,columnsCreated:0,groupsCreated:0};
  }};
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),error=>
  error.importOutcomeUncertain===true&&error.code==='IMPORT_READBACK_MISMATCH'&&
  /Do not retry/.test(error.message));
 assert.equal(writes,1);
 assert.equal(reads,2);
});
test('expired, revoked, and mismatched signed-session preflights reject without import writes',async()=>{
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group});
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const writes=[];
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>detail,allowed:async()=>true,
  rpc:async(name)=>{
   if(name==='wm_import_board_wizard_atomic')writes.push(name);
   throw new Error('Board view access denied: inactive session');
  }};
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),/inactive session/);
 assert.deepEqual(writes,[]);
 api.rpc=async(name)=>{
  if(name==='wm_board_ui_read')return {board_id:'99999999-9999-4999-8999-999999999999'};
  writes.push(name);
 };
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),/could not be verified/);
 assert.deepEqual(writes,[]);
});
test('ambiguous network, server, receipt, and post-commit failures forbid blind import retry',async()=>{
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group});
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 for(const mode of ['network','server','receipt','postcommit']){
  let writes=0,contexts=0;
  const api={
   context:async()=>{
    contexts++;
    if(mode==='postcommit'&&contexts>1)throw new Error('Session check interrupted');
    return {user_id:actor,workspace_id:ws,profile:{status:'active'}};
   },
   board:async()=>detail,allowed:async()=>true,
   rpc:async(name)=>{
    if(name==='wm_board_ui_read')return {board_id:boardId};
    writes++;
    if(mode==='network')throw new TypeError('Failed to fetch');
    if(mode==='server'){const e=new Error('Backend unavailable');e.status=503;throw e;}
    if(mode==='receipt')return {created:1,updated:0,skipped:0,columnsCreated:0,groupsCreated:0};
    return {created:2,updated:0,skipped:0,columnsCreated:0,groupsCreated:0};
   }
  };
  await assert.rejects(()=>executeBoardImport({api,auth,plan}),
   error=>error.importOutcomeUncertain===true&&/Do not retry/.test(error.message));
  assert.equal(writes,1,mode+' attempted exactly one atomic write');
 }
});
test('authoritative 4xx validation denial remains a safe, clear failure',async()=>{
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group});
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>detail,allowed:async()=>true,rpc:async(name)=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   const e=new Error('Board changed after preview');e.status=409;throw e;
  }};
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),
  error=>error.status===409&&error.importOutcomeUncertain!==true);
});
test('signed workspace, permissions and stale revisions fail without any write',async()=>{
 const plan=buildImportPlan({sheet,detail,mappings:existingMaps,group});
 const calls=[];const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  board:async()=>({...detail,board:{...detail.board,updated_at:'2026-11-05T03:00:01Z'}}),
  allowed:async()=>true,rpc:async()=>{calls.push(1);}};
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),/Board changed/);
 assert.equal(calls.length,0);
 api.board=async()=>detail;
 api.context=async()=>({user_id:actor,workspace_id:'88888888-8888-4888-8888-888888888888',profile:{status:'active'}});
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),/workspace has changed/);
 assert.equal(calls.length,0);
});
test('UI and entrypoint are wired without bypassing the domain restriction',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const ui=readFileSync('frontend/board-import-ui.js','utf8');
 const data=readFileSync('frontend/data.js','utf8');
 const html=readFileSync('index.html','utf8');
 assert.match(app,/data-action="board-import"/);
 assert.match(app,/openBoardImportWizard/);
 assert.match(app,/onComplete:async receipt=>\{\s*if\(state\.boardId===selected\)\{await loadBoard\(selected,'items'\);/,
  'successful imports reload the selected board through the authoritative board loader');
 assert.ok(data.includes('wm_(?:add_|create_|delete_|set_|update_|import_'),
  'the atomic import RPC invalidates the in-memory board snapshot');
 assert.match(ui,/will be created together with the imported records/);
 assert.match(ui,/Confirm exclude/);
 assert.match(ui,/reassignImportItemMapping\(state\.mappings,index\)/);
 assert.doesNotMatch(ui,/aps-import-choice-consent/);
 assert.match(ui,/Import Now/);
 assert.match(ui,/state\.uncertain/);
 assert.match(ui,/Close and verify the board/);
 assert.match(ui,/Handle matches/);
 assert.match(html,/board-import\.css/);
});

test('legacy col_ and hidden physical columns remain available import targets',()=>{
 const ui=readFileSync(new URL('../board-import-ui.js',import.meta.url),'utf8');
 assert.match(ui,/c\.visible===false\?' · hidden'/);
 const legacyId='66666666-6666-4666-8666-666666666666';
 const hiddenId='77777777-7777-4777-8777-777777777777';
 const excludedId='88888888-8888-4888-8888-888888888888';
 const board={...detail,columns:[
  {id:legacyId,name:'Attendance Ref',data_type:'text',column_key:'col_attendance_ref',
   system_key:null,visible:true,config:{}},
  {id:hiddenId,name:'Hidden Notes',data_type:'long_text',column_key:'custom:hidden-notes',
   system_key:null,visible:false,config:{}},
  {id:excludedId,name:'Owner',data_type:'people',column_key:'col_owner',
   system_key:'assignee',visible:true,config:{}},
  {id:colId,name:'Title',data_type:'text',column_key:'title',
   system_key:'title',visible:true,config:{}}
 ]};
 const available=availableImportColumns(board);
 assert.deepEqual(available.map(c=>c.id),[legacyId,hiddenId]);
 assert.equal(available.find(c=>c.id===hiddenId).visible,false);
 const source={headers:['Name','Attendance Ref','Hidden Notes'],rows:[
  ['Alpha','REF-1','private note']
 ]};
 const mappings=initialImportMappings(source,board);
 assert.deepEqual(mappings.map(m=>m.action),['item','existing','existing']);
 assert.equal(mappings[1].columnId,legacyId);
 assert.equal(mappings[2].columnId,hiddenId);
 assert.equal(mappings[2].hidden,true);
 const plan=buildImportPlan({sheet:source,detail:board,mappings,group,allowColumns:false});
 assert.equal(plan.payload.newColumns.length,0);
 assert.equal(plan.payload.rows[0].values['Attendance Ref'],'REF-1');
 assert.equal(plan.payload.rows[0].values['Hidden Notes'],'private note');
});

test('same-name existing text column is reused when Status source values are plain labels',()=>{
 const textStatusId='99999999-9999-4999-8999-999999999999';
 const board={...detail,columns:[{id:textStatusId,name:'Status',data_type:'text',
  column_key:'col_status',system_key:null,visible:true,config:{}}]};
 const source={headers:['Name','Status'],rows:[['Alpha','Active'],['Beta','Pending']]};
 const mappings=initialImportMappings(source,board);
 assert.equal(mappings[1].action,'existing');
 assert.equal(mappings[1].columnId,textStatusId);
 assert.equal(mappings[1].type,'status');
 assert.equal(mappings[1].targetType,'text');
 const plan=buildImportPlan({sheet:source,detail:board,mappings,group});
 assert.deepEqual(plan.payload.rows.map(row=>row.values.Status),['Active','Pending']);
});
