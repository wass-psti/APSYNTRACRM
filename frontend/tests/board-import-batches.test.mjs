import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImportPlan,initialImportMappings} from '../board-import-core.js';
import {executeBoardImportBatched} from '../board-import-batches.js';
import {parseDelimited} from '../board-import-parse.js';
const boardId='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const groupId='44444444-4444-4444-8444-444444444444';
const columnId='55555555-5555-4555-8555-555555555555';
const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
function fixture({count=1011,failBatch=0}={}){
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
   if(calls===failBatch){const err=new Error('Transient network error');err.status=503;throw err;}
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
  get calls(){return calls;},get reads(){return reads;},get current(){return structuredClone(current);}};
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
