import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDelimited,splitWorksheetSections} from '../board-import-parse.js';
import {buildImportPlan,reviewImportSourceRows} from '../board-import-core.js';
import {importBatchSize,STANDARD_IMPORT_CELL_BUDGET} from '../board-import-batches.js';
const board='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const group='33333333-3333-4333-8333-333333333333';
const col=(id,name,data_type,config={})=>({id:'44444444-4444-4444-8444-'+String(id).padStart(12,'0'),
 name,data_type,config,system_key:null,column_key:'col_'+id,visible:true});
const detail={
 board:{id:board,name:'Import Test',workspace_id:ws,status:'active',updated_at:'2026-11-13T00:00:00Z'},
 groups:[{id:group,title:'Import'}],
 columns:[col(1,'Date','date'),col(2,'Email','email'),col(3,'Amount','number'),
 col(4,'Status','status',{labels:[{id:'active',label:'Active',active:true}]})],
 items:[],values:[]
};
const headers=['Name','Date','Email','Amount','Status'];
const maps=[{source:'Name',action:'item'},...detail.columns.map(c=>({
 source:c.name,action:'existing',columnId:c.id}))];
const destination={action:'existing',groupId:group};
const matches={behavior:'add-new',matchColumnId:'item'};
test('reported invalid typed rows are all identified, with valid source rows retained in order',()=>{
 const sheet={worksheet:'System Validated Time Logs',headers,rowNumbers:[4,17,170,3000,6325],
 rows:[
 ['Good 1','2026-07-09','valid@example.invalid','123','Active'],
 ['Bad date','Item ID (auto generated)','valid@example.invalid','123','Active'],
 ['Bad email','2026-07-09','name@example.invalid - alias@example.invalid','123','Active'],
 ['Bad amount','2026-07-09','valid@example.invalid','1, 0, 60','Active'],
 ['Good last','2026-07-09','valid@example.invalid','16','Active']
 ]};
 const result=reviewImportSourceRows({sheet,detail,mappings:maps,matches});
 assert.equal(result.sourceRows,5);
 assert.equal(result.acceptedRows,2);
 assert.deepEqual(result.sheet.rowNumbers,[4,6325]);
 assert.deepEqual(result.rejected.map(x=>x.row),[17,170,3000]);
 assert.deepEqual(result.rejected.map(x=>x.column),['Date','Email','Amount']);
 assert.ok(result.rejected.every(x=>!x.reason.includes('@')&&!x.reason.includes('1, 0, 60')));
 const approved=buildImportPlan({sheet:result.sheet,detail,mappings:maps,group:destination,matches});
 assert.equal(approved.preview.newItems,2);
 assert.equal(approved.preview.rowCount,2);
 assert.deepEqual(approved.payload.rows.map(x=>x.title),['Good 1','Good last']);
});
test('status incompatibility and duplicate keys fail closed per row without changing roles or status schema',()=>{
 const sheet={headers,rowNumbers:[2,4,8],rows:[
 ['A','2026-07-09','a@example.invalid','1','Active'],
 ['B','2026-07-09','b@example.invalid','2','Please select'],
 ['A','2026-07-09','c@example.invalid','3','Active']]};
 const reviewed=reviewImportSourceRows({sheet,detail,mappings:maps,
  matches:{behavior:'skip',matchColumnId:'item'}});
 assert.equal(reviewed.acceptedRows,1);
 assert.deepEqual(reviewed.rejected.map(x=>x.row),[4,8]);
 assert.match(reviewed.rejected[0].reason,/configured option/);
 assert.match(reviewed.rejected[1].reason,/Duplicate-match key/);
 assert.deepEqual(reviewed.sheet.rows,[sheet.rows[0]]);
});
test('large CSV worksheets preserve 6,324 and 7,607 source rows, including late errors',()=>{
 for(const count of [6324,7607]){
  const source='Name,Date,Email,Amount,Status\n'+Array.from({length:count},(_,i)=>{
   const n=i+1;
   return 'Item '+n+','+(n===count?'Item ID (auto generated)':'2026-07-09')+
    ',valid@example.invalid,'+n+',Active';
  }).join('\n');
  const parsed=parseDelimited(source);
  assert.equal(parsed.rows.length,count);
  const reviewed=reviewImportSourceRows({sheet:parsed,detail,mappings:maps,matches});
  assert.equal(reviewed.sourceRows,count);
  assert.equal(reviewed.acceptedRows,count-1);
  assert.equal(reviewed.rejected.length,1);
  assert.equal(reviewed.rejected[0].row,count+1);
  assert.equal(reviewed.sheet.rows.at(-1)[0],'Item '+(count-1));
 }
});
test('nested table cells beyond active headers become traceable, explicitly acknowledged omissions',()=>{
 const sheet=splitWorksheetSections([
  {number:1,values:['Name','Date']},
  {number:2,values:['Sample','2026-07-09']},
  {number:3,values:['Subitems','2026-08-10','Nested details']},
  {number:4,values:['Valid','2026-07-10']}],'Minutes of Meeting');
 assert.equal(sheet.length,1);
 assert.equal(sheet[0].rows.length,2);
 assert.deepEqual(sheet[0].rowNumbers,[2,4]);
 assert.deepEqual(sheet[0].omittedRows,[3]);
 assert.match(sheet[0].structuralWarnings[0].reason,/nested\/subitem/);
 assert.throws(()=>buildImportPlan({sheet:sheet[0],detail,mappings:[
   {source:'Name',action:'item'},{source:'Date',action:'existing',columnId:detail.columns[0].id}],
   group:destination,matches}),/Confirm whether to exclude/);
});
test('wide ordinary imports budget by heaviest mapped row and UTF-8 transport payload',()=>{
 const plan={payload:{rows:Array.from({length:7607},(_,i)=>({
  title:'Row '+i,values:Object.fromEntries(Array.from({length:26},(_,j)=>['Field '+j,'V-'+i+'-'+j]))
 }))}};
 const size=importBatchSize(plan,{extendedReferences:false});
 assert.ok(size<200);
 assert.ok(size*26<=STANDARD_IMPORT_CELL_BUDGET);
 assert.ok(Math.ceil(7607/size)>1);
 const narrow={payload:{rows:[{title:'One',values:{Reference:'R1'}}]}};
 assert.equal(importBatchSize(narrow,{extendedReferences:false}),200);
});
test('UI requires explicit rejection acknowledgement and preserves durable source reconciliation',()=>{
 const ui=readFileSync('frontend/board-import-ui.js','utf8');
 const durable=readFileSync('frontend/board-import-durable.js','utf8');
 assert.match(ui,/data-imp="rejections-confirm"/);
 assert.match(ui,/data-imp="rejections-download"/);
 assert.match(ui,/state\.rejectedAckKey!==rejectionKey\(report\)/);
 assert.match(ui,/originalSource:sheet\(\)/);
 assert.match(ui,/rejectedSourceRows,/);
 assert.match(durable,/rejectedSourceRows:\[\.\.\.rejectedSourceRows\]/);
 assert.match(durable,/importDigest\(originalSource\|\|fullSheet,crypt\)/);
});

test('a worksheet containing only invalid rows remains an explicit zero-write review',()=>{
 const sheet={headers,rowNumbers:[5],rows:[['Bad','Item ID (auto generated)',
  'invalid email','not a number','Invalid status']]};
 const report=reviewImportSourceRows({sheet,detail,mappings:maps,matches});
 assert.equal(report.acceptedRows,0);
 assert.equal(report.rejected.length,1);
 assert.equal(report.sheet.rows.length,0);
 assert.match(readFileSync('frontend/board-import-ui.js','utf8'),/if\(rowReview\(\)\.acceptedRows\)\s*computePlan/);
});
