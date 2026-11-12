import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialImportMappings,buildImportPlan,availableImportColumns} from '../board-import-core.js';
import {importMappingReadiness} from '../board-import-readiness.js';
import {isProtectedBoard} from '../board-card-lifecycle.js';

// Synthetic data derived from read-only schema metadata on 2026-11-12.
// No operational items, personal data, URLs, keys, passwords, or credentials.
const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const groupId='33333333-3333-4333-8333-333333333333';
const makeColumn=(i,name,type,{columnKey=null,visible=true,systemKey=null,config={}}={})=>({
 id:'44444444-4444-4444-8444-'+String(i).padStart(12,'0'),name,
 data_type:type,column_key:columnKey||'custom:'+String(i),system_key:systemKey,
 visible,config});
const board=(name,columns,description='')=>({
 board:{id:boardId,workspace_id:workspaceId,name,description,status:'active',
  updated_at:'2026-11-12T09:00:00Z'},
 groups:[{id:groupId,title:'Main group'}],columns,items:[],values:[]});
const sheet=(headers,rows)=>({headers,rows,rowNumbers:rows.map((_,i)=>i+2),
 worksheet:'Synthetic sheet'});
const group={action:'existing',groupId};
const matches={behavior:'add-new',matchColumnId:'item'};

test('live ordinary Inventory Items metadata: numeric, date and text fields map without new columns',()=>{
 const detail=board('Inventory Items',[
  makeColumn(1,'SKU','text'),makeColumn(2,'Category','text'),
  makeColumn(3,'Current Stock','number'),makeColumn(4,'Reorder Point','number'),
  makeColumn(5,'Unit Cost','number'),makeColumn(6,'Last Restocked','date'),
  makeColumn(7,'Stock Status','text')]);
 const input=sheet(['Item','SKU','Current Stock','Reorder Point','Unit Cost',
  'Last Restocked','Stock Status'],[['Synthetic Bolt','SK-001','24','5','12.75',
  '2026-11-09','In Stock']]);
 const mappings=initialImportMappings(input,detail,{canCreate:true});
 assert.deepEqual(mappings.map(m=>m.action),[
  'item','existing','existing','existing','existing','existing','existing']);
 const plan=buildImportPlan({sheet:input,detail,mappings,group,matches});
 assert.equal(plan.payload.newColumns.length,0);
 assert.equal(plan.payload.rows[0].values['Current Stock'],24);
 assert.equal(plan.payload.rows[0].values['Unit Cost'],12.75);
 assert.equal(plan.payload.rows[0].values['Last Restocked'],'2026-11-09');
 assert.equal(plan.payload.rows[0].values['Stock Status'],'In Stock');
});

test('live ordinary Online Store metadata: URL, quantity and price mapping require no schema changes',()=>{
 const detail=board('Online Store',[
  makeColumn(1,'Material Description','text'),makeColumn(2,'Available Qty','number'),
  makeColumn(3,'Datasheets','url'),makeColumn(4,'Selling Price','number')]);
 const input=sheet(['Item','Material Description','Available Qty','Datasheets',
  'Selling Price'],[['Synthetic Component','Specification','3',
  'https://example.invalid/test.pdf','199.50']]);
 const mappings=initialImportMappings(input,detail);
 assert.deepEqual(mappings.map(m=>m.action),[
  'item','existing','existing','existing','existing']);
 const plan=buildImportPlan({sheet:input,detail,mappings,group,matches});
 assert.equal(plan.payload.rows[0].values.Datasheets,
  'https://example.invalid/test.pdf');
 assert.equal(plan.payload.rows[0].values['Available Qty'],3);
});

test('live ordinary Time Entries metadata: date and hours resolve to existing typed columns',()=>{
 const detail=board('Time Entries',[
  makeColumn(1,'Log Period','text'),makeColumn(2,'Entry Date','date'),
  makeColumn(3,'Hours','number'),makeColumn(4,'Project','text')]);
 const input=sheet(['Item','Log Period','Entry Date','Hours','Project'],[
  ['Synthetic Work Entry','Week 46','2026-11-12 08:00:00 UTC','8.5','Project QA']]);
 const mappings=initialImportMappings(input,detail);
 assert.deepEqual(mappings.map(x=>x.action),[
  'item','existing','existing','existing','existing']);
 const plan=buildImportPlan({sheet:input,detail,mappings,group,matches});
 assert.equal(plan.payload.rows[0].values['Entry Date'],'2026-11-12');
 assert.equal(plan.payload.rows[0].values.Hours,8.5);
});

test('live mismatched Qty. checkbox vs numeric source is an explained, explicit mapping decision',()=>{
 const detail=board('Cost Computation',[
  makeColumn(1,'Qty.','checkbox'),makeColumn(2,'Item Landed Cost','number')]);
 const input=sheet(['Item','Qty.','Item Landed Cost'],[
  ['Synthetic Line','12','45.5'],['Synthetic Line Two','2','70']]);
 const mappings=initialImportMappings(input,detail,{canCreate:true});
 assert.equal(mappings[1].action,'skip');
 assert.deepEqual(mappings[1].conflict,{
  destinationTypes:['checkbox'],reason:'incompatible',row:2});
 assert.equal(importMappingReadiness(mappings,true).ready,false);
 assert.throws(()=>buildImportPlan({sheet:input,detail,mappings,group,matches,
  allowColumns:true}),/explicitly confirm exclusion/);
 const ui=readFileSync(new URL('../board-import-ui.js',import.meta.url),'utf8');
 assert.match(ui,/same-name board column exists/);
 assert.match(ui,/worksheet row/);
 assert.match(ui,/Value omitted for incompatible source/);
 assert.match(ui,/m\.action==='skip'&&m\.conflict\?'Value omitted/);
 assert.doesNotMatch(JSON.stringify(mappings),/Synthetic Line/);
});

test('old legacy col_* and hidden supported fields remain available without broadening module-board access',()=>{
 const columns=[
  makeColumn(1,'Legacy Status','status',{columnKey:'col_legacy_status',visible:false,
   config:{labels:[{id:'active',name:'Active',active:true}]}}),
  makeColumn(2,'Legacy Note','long_text',{columnKey:'col_legacy_notes',visible:false}),
  makeColumn(3,'Assigned User','people',{columnKey:'col_assignee',systemKey:'assignee'})];
 const ordinary=board('Ordinary QA',columns);
 assert.deepEqual(availableImportColumns(ordinary).map(x=>x.name),
  ['Legacy Status','Legacy Note']);
 assert.equal(isProtectedBoard(ordinary.board),false);
 assert.equal(isProtectedBoard({...ordinary.board,name:'TimeTracker Attendance',
  description:'[APSYNTRA:MODULE:timetracker:v1]'}),true);
});

test('extended URL reference not activated: incompatible source is surfaced without partial write',()=>{
 const detail=board('Online Store',[makeColumn(1,'Datasheets','url')]);
 const input=sheet(['Item','Datasheets'],[['Synthetic File',
  'https://example.invalid/'+ 'x'.repeat(2100)]]);
 const mappings=initialImportMappings(input,detail,{canCreate:false,
  extendedReferences:false});
 assert.equal(mappings[1].action,'skip');
 assert.equal(mappings[1].conflict.row,2);
 assert.throws(()=>buildImportPlan({sheet:input,detail,mappings,group,matches}),
  /explicitly confirm exclusion/);
 const extended=initialImportMappings(input,detail,{canCreate:false,
  extendedReferences:true});
 assert.equal(extended[1].action,'existing');
 const plan=buildImportPlan({sheet:input,detail,mappings:extended,group,matches,
  extendedReferences:true});
 assert.equal(plan.payload.contract,'m143-v2');
 assert.equal(plan.payload.rows[0].values.Datasheets.__aps_extended_ref_v1,
  input.rows[0][1]);
});


test('CP-BIMP-17C the board import lazy module is versioned without changing the global app entrypoint',()=>{
 const index=readFileSync('index.html','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(index,/<script type="module" src="\.\/frontend\/app\.js"><\/script>/);
 assert.match(app,/board-import-ui\.js\?v=cp-bimp-17c-20261112/);
});
