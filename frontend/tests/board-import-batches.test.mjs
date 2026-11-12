import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImportPlan,initialImportMappings} from '../board-import-core.js';
import {executeBoardImportBatched,IMPORT_BATCH_SIZE,importBatchSize,EXTENDED_IMPORT_CELL_BUDGET,EXTENDED_IMPORT_PAYLOAD_BUDGET} from '../board-import-batches.js';
import {parseDelimited} from '../board-import-parse.js';
const boardId='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const groupId='44444444-4444-4444-8444-444444444444';
const columnId='55555555-5555-4555-8555-555555555555';
const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
function fixture({count=1011,failBatch=0,failStatus=503}={}){
 const columns=[{id:columnId,name:'Reference',data_type:'text',
  system_key:null,column_key:'col_ref',config:{}}];
 const detail={board:{id:boardId,name:'Imported QA',workspace_id:workspace,
  status:'active',updated_at:'2026-11-12T00:00:00.000Z'},
  groups:[{id:groupId,title:'Imported'}],columns,items:[],values:[]};
 let current=structuredClone(detail),calls=0,reads=0;
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>true,
  board:async()=>{reads++;return structuredClone(current);},
  rpc:async(name,args)=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   assert.equal(name,'wm_import_board_wizard_atomic');
   calls++;
   if(calls===failBatch){const err=new Error('Simulated rejection');err.status=failStatus;throw err;}
   assert.equal(args.p_expected_updated_at,current.board.updated_at);
   assert.ok(args.p_payload.rows.length<=1000);
   const first=current.items.length;
   for(const [i,row] of args.p_payload.rows.entries()){
    const id=String(first+i+1).padStart(12,'0');
    const itemId='66666666-6666-4666-8666-'+id;
    current.items.push({id:itemId,board_id:boardId,group_id:groupId,
     title:row.title,status:null,archived_at:null,updated_at:current.board.updated_at});
    current.values.push({item_id:itemId,column_id:columnId,value:row.values.Reference});
   }
   current.board.updated_at=new Date(Date.parse(current.board.updated_at)+1000).toISOString();
   return {created:args.p_payload.rows.length,updated:0,skipped:0,
    columnsCreated:0,groupsCreated:0};
  }
 };
 const sheet={headers:['Name','Reference'],rows:Array.from({length:count},(_,i)=>[
  'Batch item '+String(i+1),'REF-'+String(i+1)])};
 const mappings=initialImportMappings(sheet,detail,{canCreate:false});
 const group={action:'existing',groupId},matches={behavior:'add-new',matchColumnId:'item'};
 const approvedPlan=buildImportPlan({sheet,detail,mappings,group,matches});
 return {api,sheet,detail,mappings,group,matches,approvedPlan,
  get calls(){return calls;},get reads(){return reads;},get current(){return structuredClone(current);},
  mutateUnsafeForTest(fn){fn(current);}};
}
test('CP-BIMP-13 1,011 rows are committed through three atomic RPCs with verified persistence',async()=>{
 const f=fixture(),progress=[];
 const result=await executeBoardImportBatched({...f,auth,batchSize:500,
  onProgress:value=>progress.push(value)});
 assert.equal(f.calls,3);
 assert.equal(result.created,1011);
 assert.equal(result.batches,3);
 assert.equal(result.rowsProcessed,1011);
 assert.deepEqual(progress.map(x=>x.completed),[500,1000,1011]);
 assert.equal(f.current.items.length,1011);
 assert.equal(f.current.values.length,1011);
 assert.equal(f.current.values.at(-1).value,'REF-1011');
 const refreshed=await f.api.board(boardId);
 assert.equal(refreshed.items.length,1011);
});
test('CP-BIMP-13 uncertain second batch halts; never automatically retries or claims full success',async()=>{
 const f=fixture({failBatch:2});
 await assert.rejects(()=>executeBoardImportBatched({...f,auth,batchSize:500}),error=>{
  assert.equal(error.importOutcomeUncertain,true);
  assert.deepEqual(error.importBatchProgress.receipt,{created:500,updated:0,
   skipped:0,columnsCreated:0,groupsCreated:0});
  assert.equal(error.importBatchProgress.completed,500);
  assert.equal(error.importBatchProgress.outcomeUncertain,true);
  return true;
 });
 assert.equal(f.calls,2);
 assert.equal(f.current.items.length,500);
});
test('CP-BIMP-13 full-file prevalidation rejects invalid last row before the first write',async()=>{
 const f=fixture({count:1001});
 f.sheet.rows[1000][0]='';
 await assert.rejects(()=>executeBoardImportBatched({...f,auth,batchSize:500}),
  /Item title must have 1–240 characters/);
 assert.equal(f.calls,0);
});
test('CP-BIMP-13 40-source-column import sends only the explicitly mapped destination',()=>{
 const f=fixture({count:2});
 const extras=Array.from({length:38},(_,i)=>'Export '+(i+1));
 const sheet={headers:['Name','Reference',...extras],rows:[
  ['A','R1',...extras.map(x=>x)],['B','R2',...extras.map(x=>x)]]};
 const mappings=[...f.mappings,...extras.map(source=>({source,action:'skip',requiresDecision:false}))];
 const approved=buildImportPlan({sheet,detail:f.detail,mappings,group:f.group,matches:f.matches});
 assert.deepEqual(approved.payload.mappings.map(x=>x.source),['Name','Reference']);
 assert.equal(approved.payload.rows[0].values.Reference,'R1');
 assert.equal(approved.preview.rowCount,2);
});
test('CP-BIMP-13 CSV parse preserves 5,001 data rows without truncation',()=>{
 const csv='Name,Reference\n'+Array.from({length:5001},(_,i)=>`Item-${i+1},R-${i+1}`).join('\n');
 const parsed=parseDelimited(csv);
 assert.equal(parsed.rows.length,5001);
 assert.deepEqual(parsed.rows.at(-1),['Item-5001','R-5001']);
});

test('CP-BIMP-13 extended file-reference source remains intact and is never truncated',()=>{
 const oversized='https://example.invalid/files/'+ 'x'.repeat(8800);
 const parsed=parseDelimited('Name,Files\nAlpha,"'+oversized+'"\n');
 assert.equal(parsed.rows[0][1],oversized);
 const f=fixture({count:1});
 const sheet={headers:['Name','Files'],rows:[['Alpha',oversized]]};
 const maps=[{source:'Name',action:'item'},{source:'Files',action:'skip',requiresDecision:true}];
 assert.throws(()=>buildImportPlan({sheet,detail:f.detail,mappings:maps,group:f.group}),
  /explicitly confirm exclusion/);
});

test('CP-BIMP-13 31 active source mappings are rejected before mutation',()=>{
 const f=fixture({count:1});
 const headers=['Name',...Array.from({length:30},(_,i)=>'Column '+i)];
 const mappings=headers.map((source,i)=>i===0?{source,action:'item'}:
  {source,action:'existing',columnId:columnId});
 const sheet={headers,rows:[['A',...Array.from({length:30},()=> 'X')]]};
 assert.throws(()=>buildImportPlan({sheet,detail:f.detail,mappings,group:f.group}),
  /Two sources cannot map to one existing column/);
});

test('CP-BIMP-13 newly created group and column are reused on subsequent batches',async()=>{
 const detail={board:{id:boardId,name:'New QA board',workspace_id:workspace,
  status:'active',updated_at:'2026-11-12T00:00:00.000Z'},
  groups:[],columns:[],items:[],values:[]};
 const sheet={headers:['Name','New Ref'],rows:Array.from({length:1003},(_,i)=>[
  `New item ${i}`,`ID-${i}`])};
 const mappings=[{source:'Name',action:'item',type:'text'},
  {source:'New Ref',action:'create',type:'text',columnType:'text',name:'New Ref'}];
 const group={action:'create',name:'QA Imported'},matches={behavior:'add-new',matchColumnId:'item'};
 const approvedPlan=buildImportPlan({sheet,detail,mappings,group,matches,allowColumns:true});
 let current=structuredClone(detail),writes=0;
 const api={context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>true,board:async()=>structuredClone(current),
  rpc:async(name,args)=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   assert.equal(name,'wm_import_board_wizard_atomic');
   writes++;
   const payload=args.p_payload;
   if(writes===1){
    assert.equal(payload.group.action,'create');
    assert.equal(payload.newColumns.length,1);
    current.groups.push({id:groupId,title:'QA Imported'});
    current.columns.push({id:columnId,name:'New Ref',data_type:'text',
     column_key:'custom:new-ref',system_key:null,config:{}});
   }else{
    assert.deepEqual(payload.group,{action:'existing',groupId});
    assert.equal(payload.newColumns.length,0);
    assert.ok(payload.mappings.some(m=>m.action==='existing'&&m.columnId===columnId));
   }
   const previous=current.items.length;
   for(const [i,row] of payload.rows.entries()){
    const itemId='77777777-7777-4777-8777-'+String(previous+i+1).padStart(12,'0');
    current.items.push({id:itemId,board_id:boardId,group_id:groupId,title:row.title,
     status:null,archived_at:null,updated_at:current.board.updated_at});
    current.values.push({item_id:itemId,column_id:columnId,value:row.values['New Ref']});
   }
   current.board.updated_at=new Date(Date.parse(current.board.updated_at)+1000).toISOString();
   return {created:payload.rows.length,updated:0,skipped:0,
    columnsCreated:writes===1?1:0,groupsCreated:writes===1?1:0};
  }};
 const receipt=await executeBoardImportBatched({api,auth,detail,sheet,mappings,group,
  matches,allowColumns:true,approvedPlan,batchSize:500});
 assert.equal(writes,3);
 assert.equal(receipt.created,1003);
 assert.equal(receipt.columnsCreated,1);
 assert.equal(receipt.groupsCreated,1);
 assert.equal(current.columns.length,1);
 assert.equal(current.groups.length,1);
 assert.equal(current.values.at(-1).value,'ID-1002');
});

test('CP-BIMP-13 the progress callback cannot invalidate a committed transaction',async()=>{
 const f=fixture({count:502});
 const outcome=await executeBoardImportBatched({...f,auth,batchSize:500,
  onProgress:()=>{throw Error('visualization unavailable');}});
 assert.equal(outcome.created,502);
 assert.equal(f.calls,2);
});

test('CP-BIMP-13 oversized file references are reported before write rather than truncated',async()=>{
 const f=fixture({count:1});
 const original='https://example.invalid/document/'+ 'q'.repeat(6000);
 const board={...f.detail,columns:[{id:columnId,name:'Files',data_type:'long_text',
  column_key:'col_files',system_key:null,config:{}}]};
 const sheet={headers:['Name','Files'],rows:[['Alpha',original]],worksheet:'Documents',rowNumbers:[47]};
 const mappings=[{source:'Name',action:'item'},{source:'Files',action:'existing',columnId}];
 assert.throws(()=>buildImportPlan({sheet,detail:board,mappings,group:f.group}),error=>{
  assert.match(error.message,/Worksheet "Documents" · row 47/);
  assert.match(error.message,/long_text cell exceeds 5000 characters/);
  return true;
 });
 assert.equal(f.calls,0);
});

test('CP-BIMP-13 5,001 records cross the real atomic row ceiling in six verified writes',async()=>{
 const f=fixture({count:5001});
 const result=await executeBoardImportBatched({...f,auth,batchSize:1000});
 assert.equal(f.calls,6);
 assert.equal(result.created,5001);
 assert.equal(result.rowsProcessed,5001);
 assert.equal(result.batches,6);
 const after=await f.api.board(boardId);
 assert.equal(after.items.length,5001);
 assert.equal(after.values.length,5001);
 assert.equal(after.values.at(-1).value,'REF-5001');
});


test('CP-BIMP-14 resumes after a definite 409 without repeating 500 persisted items',async()=>{
 const f=fixture({count:1011,failBatch:2,failStatus:409});
 let checkpoint;
 await assert.rejects(()=>executeBoardImportBatched({...f,auth,batchSize:500}),error=>{
  assert.equal(error.importBatchProgress.completed,500);
  assert.equal(error.importBatchProgress.outcomeUncertain,false);
  assert.ok(error.importBatchResume);
  checkpoint=error.importBatchResume;
  return true;
 });
 assert.equal(f.current.items.length,500);
 const result=await executeBoardImportBatched({...f,auth,batchSize:500,
  resumeFrom:checkpoint});
 assert.equal(result.created,1011);
 assert.equal(result.rowsProcessed,1011);
 assert.equal(f.current.items.length,1011);
 assert.equal(f.current.items[0].title,'Batch item 1');
 assert.equal(f.current.items.at(-1).title,'Batch item 1011');
 assert.equal(f.calls,4); // 500 success, 409, then two continuation batches
});

test('CP-BIMP-14 rejects resume when authoritative board state drifted after checkpoint',async()=>{
 const f=fixture({failBatch:2,failStatus:409});
 let checkpoint;
 await assert.rejects(()=>executeBoardImportBatched({...f,auth,batchSize:500}),error=>{
  checkpoint=error.importBatchResume;return !!checkpoint;
 });
 // A contemporaneous authorized editor changes an existing cell, with or
 // without a board revision bump. The importer must not overwrite it.
 f.mutateUnsafeForTest(current=>{current.values[0].value='CHANGED';});
 await assert.rejects(()=>executeBoardImportBatched({...f,auth,batchSize:500,
  resumeFrom:checkpoint}),/board changed/i);
 assert.equal(f.calls,2);
});

test('CP-BIMP-14 never offers a safe resume checkpoint for an uncertain network batch',async()=>{
 const f=fixture({failBatch:2,failStatus:503});
 await assert.rejects(()=>executeBoardImportBatched({...f,auth,batchSize:500}),error=>{
  assert.equal(error.importOutcomeUncertain,true);
  assert.equal(error.importBatchResume,undefined);
  return true;
 });
});

test('CP-BIMP-14 m143-v2 stores a 7,200-character reference without truncation and verifies refreshed readback',async()=>{
 const refId='88888888-8888-4888-8888-888888888888';
 const large='https://example.invalid/docs/'+ 'Q'.repeat(7200);
 const detail={board:{id:boardId,name:'Extended QA',workspace_id:workspace,
  status:'active',updated_at:'2026-11-12T00:00:00.000Z'},
  groups:[{id:groupId,title:'QA'}],columns:[{id:refId,name:'File Links',
   data_type:'long_text',column_key:'col_file_links',system_key:null,config:{}}],
  items:[],values:[]};
 const sheet={headers:['Name','File Links'],rows:[['Extended file reference',large]]};
 const mappings=initialImportMappings(sheet,detail,{extendedReferences:true});
 assert.equal(mappings[1].action,'existing');
 const group={action:'existing',groupId},matches={behavior:'add-new',matchColumnId:'item'};
 const approvedPlan=buildImportPlan({sheet,detail,mappings,group,matches,
  extendedReferences:true});
 assert.equal(approvedPlan.payload.contract,'m143-v2');
 assert.equal(approvedPlan.payload.rows[0].values['File Links'].__aps_extended_ref_v1,large);
 assert.equal(approvedPlan.readback.rows[0].values['File Links'],large);
 let current=structuredClone(detail),writes=0;
 const api={context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>true,board:async()=>structuredClone(current),
  rpc:async(name,args)=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   assert.equal(name,'wm_import_board_wizard_extended_atomic');
   writes++;
   const itemId='99999999-9999-4999-8999-999999999999';
   current.items.push({id:itemId,board_id:boardId,group_id:groupId,
    title:'Extended file reference',archived_at:null});
   current.values.push({item_id:itemId,column_id:refId,value:large});
   current.board.updated_at='2026-11-12T00:00:01.000Z';
   return {created:1,updated:0,skipped:0,columnsCreated:0,groupsCreated:0};
  }};
 const receipt=await executeBoardImportBatched({api,auth,detail,sheet,mappings,group,
  matches,extendedReferences:true,approvedPlan});
 assert.equal(writes,1);
 assert.equal(receipt.created,1);
 assert.equal((await api.board(boardId)).values[0].value,large);
 // An old backend cannot be forced to persist the value using m143-v1.
 assert.throws(()=>buildImportPlan({sheet,detail,mappings,group,matches}),
  /long_text cell exceeds 5000 characters/);
});

// Regression for a user-reported 617-row import whose single 1,000-row
// transaction left the entire outcome uncertain after authoritative readback.
// Keep the reviewed workbook intact while committing and verifying small batches.
test('CP-BIMP-19: 617 rows use bounded verified transactions instead of one 617-row write',async()=>{
 const f=fixture({count:617}),progress=[];
 assert.equal(IMPORT_BATCH_SIZE,200);
 const receipt=await executeBoardImportBatched({...f,auth,
  onProgress:value=>progress.push(value)});
 assert.equal(f.calls,4);
 assert.deepEqual(progress.map(x=>x.completed),[200,400,600,617]);
 assert.equal(receipt.created,617);
 assert.equal(receipt.rowsProcessed,617);
 assert.equal(f.current.items.length,617);
 assert.equal(f.current.values.length,617);
});

test('CP-BIMP-19: uncertain 617-row second batch never replays either write',async()=>{
 const f=fixture({count:617,failBatch:2,failStatus:503});
 await assert.rejects(()=>executeBoardImportBatched({...f,auth}),error=>{
  assert.equal(error.importOutcomeUncertain,true);
  assert.equal(error.importBatchProgress.completed,200);
  assert.equal(error.importBatchProgress.totalRows,617);
  assert.equal(error.importBatchProgress.outcomeUncertain,true);
  return true;
 });
 assert.equal(f.calls,2);
 assert.equal(f.current.items.length,200);
});

test('CP-BIMP-19: transient authoritative readback failure retries only the read, not 617-row writes',async()=>{
 const f=fixture({count:617});
 const originalRead=f.api.board;
 let reads=0;
 f.api.board=async (...args)=>{
  reads++;
  if(reads===2){const error=new Error('Temporary readback timeout');error.status=0;throw error;}
  return originalRead(...args);
 };
 const receipt=await executeBoardImportBatched({...f,auth});
 assert.equal(receipt.created,617);
 assert.equal(f.calls,4,'a read retry must never resubmit the write');
 assert.equal(f.current.items.length,617);
});

test('CP-BIMP-19: persistent readback failure stays uncertain and never replays the write',async()=>{
 const f=fixture({count:617});
 const originalRead=f.api.board;
 let reads=0;
 f.api.board=async (...args)=>{
  reads++;
  if(reads===2||reads===3){const error=new Error('Readback unavailable');error.status=0;throw error;}
  return originalRead(...args);
 };
 await assert.rejects(()=>executeBoardImportBatched({...f,auth}),error=>{
  assert.equal(error.importOutcomeUncertain,true);
  assert.equal(error.importBatchProgress.completed,0);
  return true;
 });
 assert.equal(f.calls,1);
 assert.equal(f.current.items.length,200);
});

// CP-BIMP-20: fully isolated m143-v2 API simulation, no production writes.
// A 617-row wide workbook includes an actual long reference on every row.
function extended617Fixture({failWrite=0}={}){
 const cols=Array.from({length:6},(_,i)=>({
  id:'88888888-8888-4888-8888-'+String(i+1).padStart(12,'0'),
  name:i===0?'Document URL':'Field '+i,
  data_type:i===0?'long_text':'text',
  column_key:'col_'+i,system_key:null,config:{}}));
 const detail={board:{id:boardId,name:'Isolated extended import QA',
  workspace_id:workspace,status:'active',updated_at:'2026-11-12T00:00:00.000Z'},
  groups:[{id:groupId,title:'QA'}],columns:cols,items:[],values:[]};
 const headers=['Name',...cols.map(c=>c.name)];
 const long='https://example.invalid/docs/'+'R'.repeat(7200);
 const rows=Array.from({length:617},(_,i)=>[
  'Row '+(i+1),long+'-'+i,...Array.from({length:5},(_,j)=>'Value '+i+'-'+j)]);
 const sheet={headers,rows};
 const mappings=initialImportMappings(sheet,detail,{extendedReferences:true});
 const group={action:'existing',groupId};
 const matches={behavior:'add-new',matchColumnId:'item'};
 const approvedPlan=buildImportPlan({sheet,detail,mappings,group,matches,extendedReferences:true});
 let current=structuredClone(detail),calls=0,maxPayload=0,maxCells=0;
 const api={
  context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>true,
  board:async()=>structuredClone(current),
  rpc:async(name,args)=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   assert.equal(name,'wm_import_board_wizard_extended_atomic');
   calls++;
   if(calls===failWrite){const error=new Error('Simulated server failure');error.status=503;throw error;}
   const payload=args.p_payload;
   assert.equal(payload.contract,'m143-v2');
   assert.equal(args.p_expected_updated_at,current.board.updated_at);
   maxPayload=Math.max(maxPayload,JSON.stringify(payload.rows).length);
   maxCells=Math.max(maxCells,payload.rows.length*cols.length);
   for(const row of payload.rows){
    const index=current.items.length+1;
    const id='99999999-9999-4999-8999-'+String(index).padStart(12,'0');
    current.items.push({id,board_id:boardId,group_id:groupId,
     title:row.title,archived_at:null});
    for(const c of cols){
     const value=row.values[c.name];
     current.values.push({item_id:id,column_id:c.id,
      value:value?.__aps_extended_ref_v1??value});
    }
   }
   current.board.updated_at=new Date(Date.parse(current.board.updated_at)+1000).toISOString();
   return {created:payload.rows.length,updated:0,skipped:0,
    columnsCreated:0,groupsCreated:0};
  }
 };
 return {api,auth,detail,sheet,mappings,group,matches,approvedPlan,extendedReferences:true,
  get calls(){return calls;},get current(){return structuredClone(current);},
  get maxPayload(){return maxPayload;},get maxCells(){return maxCells;}};
}

test('CP-BIMP-20 isolated m143-v2 617-row six-column long-reference round-trip is complete',async()=>{
 const f=extended617Fixture(),progress=[];
 const size=importBatchSize(f.approvedPlan,{extendedReferences:true});
 assert.ok(size<IMPORT_BATCH_SIZE);
 assert.ok(size*6<=EXTENDED_IMPORT_CELL_BUDGET);
 const result=await executeBoardImportBatched({...f,onProgress:x=>progress.push(x)});
 assert.equal(result.created,617);
 assert.equal(result.rowsProcessed,617);
 assert.equal(result.batches,Math.ceil(617/size));
 assert.equal(f.calls,result.batches);
 assert.equal(f.current.items.length,617);
 assert.equal(f.current.values.length,617*6);
 assert.ok(f.maxCells<=EXTENDED_IMPORT_CELL_BUDGET);
 assert.ok(f.maxPayload<=EXTENDED_IMPORT_PAYLOAD_BUDGET+150);
 assert.equal(f.current.values[0].value,f.sheet.rows[0][1]);
 assert.equal(f.current.values.at(-6).value,f.sheet.rows.at(-1)[1]);
 assert.equal(progress.at(-1).completed,617);
 assert.deepEqual(progress.map(x=>x.completed),
  Array.from({length:result.batches},(_,i)=>Math.min(617,(i+1)*size)));
});

test('CP-BIMP-20 an uncertain extended-import batch is never automatically resubmitted',async()=>{
 const f=extended617Fixture({failWrite:2});
 const size=importBatchSize(f.approvedPlan,{extendedReferences:true});
 await assert.rejects(()=>executeBoardImportBatched(f),error=>{
  assert.equal(error.importOutcomeUncertain,true);
  assert.equal(error.importBatchProgress.completed,size);
  assert.equal(error.importBatchProgress.totalRows,617);
  assert.equal(error.importBatchResume,undefined);
  return true;
 });
 assert.equal(f.calls,2);
 assert.equal(f.current.items.length,size);
});

test('CP-BIMP-20 an ordinary m143-v1 import keeps the 200-row budget',()=>{
 const f=extended617Fixture();
 assert.equal(importBatchSize(f.approvedPlan,{extendedReferences:false}),IMPORT_BATCH_SIZE);
});

test('CP-BIMP-20 extended payload budget counts UTF-8 bytes, not string code units',()=>{
 const plan={payload:{rows:[{title:'Unicode',values:{Notes:'🎯'.repeat(110000)}}]}};
 assert.equal(importBatchSize(plan,{extendedReferences:true}),1);
});
