import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialImportMappings,buildImportPlan} from '../board-import-core.js';
import {importMappingReadiness,skipPendingImportChoice,
 matchConfiguredImportChoice} from '../board-import-readiness.js';

const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const groupId='33333333-3333-4333-8333-333333333333';
const statusId='44444444-4444-4444-8444-444444444444';
const sheet={
 name:'live identification status — Running Monday Apps',
 worksheet:'live identification status',
 headers:['Name','Status','Date Updated','Location','Checkbox'],
 rowNumbers:[4,5],
 rows:[['Material Sourcing','Active','2026-07-30','','v'],
  ['TimeTracker','Pending','2026-08-18','Cebu','']]
};
const detail={board:{id:boardId,workspace_id:workspaceId,name:'Contacts',
 status:'active',updated_at:'2026-11-05T09:00:00Z'},
 columns:[],groups:[{id:groupId,title:'Current'}],items:[],values:[]};
const group={action:'existing',groupId};
test('screenshot regression: three ordinary approvals do not silently approve missing Status',()=>{
 const mappings=initialImportMappings(sheet,detail,{canCreate:true});
 assert.deepEqual(mappings.map(m=>m.action),
  ['item','configure','create','create','create']);
 const gate=importMappingReadiness(mappings,true);
 assert.equal(gate.proposedCount,3);
 assert.deepEqual(gate.pendingChoices,[{index:1,source:'Status',type:'status'}]);
 assert.equal(gate.awaitingColumnApproval,false);
 assert.equal(gate.ready,false);
 assert.throws(()=>buildImportPlan({sheet,detail,mappings,group,allowColumns:true}),
  /Invalid or repeated column mapping/);
});
test('deliberate Skip Status preserves the three ordinary approvals and excludes Status data',()=>{
 const proposed=initialImportMappings(sheet,detail,{canCreate:true});
 const skipped=skipPendingImportChoice(proposed,1);
 assert.deepEqual(importMappingReadiness(skipped,true),{
  pendingChoices:[],proposedCount:3,awaitingColumnApproval:false,
  skipped:['Status'],ready:true
 });
 assert.equal(skipped[1].action,'skip');
 assert.deepEqual(proposed[1].action,'configure','original mapping is not mutated');
 const plan=buildImportPlan({sheet,detail,mappings:skipped,group,allowColumns:true});
 assert.equal(plan.preview.newColumns,3);
 assert.equal(plan.preview.rowCount,2);
 assert.equal(plan.payload.rows[0].values['Date Updated'],'2026-07-30');
 assert.equal(plan.payload.rows[0].values.Checkbox,true);
 assert.equal(plan.payload.rows[1].values.Checkbox,false);
 assert.equal('Status' in plan.payload.rows[0].values,false);
 assert.deepEqual(plan.payload.newColumns.map(c=>c.name),
  ['Date Updated','Location','Checkbox']);
 assert.throws(()=>skipPendingImportChoice(skipped,1),/No pending choice/);
});
test('configured Status is mapped by verified column ID; second-stage ordinary consent remains mandatory',()=>{
 const proposed=initialImportMappings(sheet,detail,{canCreate:true});
 const mapped=matchConfiguredImportChoice(proposed,1,statusId);
 assert.equal(mapped[1].action,'existing');
 assert.equal(mapped[1].columnId,statusId);
 assert.equal(mapped[1].type,'status');
 assert.deepEqual(proposed[1].action,'configure','proposal remains immutable');
 const persisted={...detail,board:{...detail.board,
  updated_at:'2026-11-05T09:00:03Z'},
  columns:[{id:statusId,name:'Status',data_type:'status',system_key:null,
   column_key:'custom:'+statusId,config:{labels:[
    {id:'status-active',name:'Active',active:true},
    {id:'status-pending',name:'Pending',active:true}]}}]};
 assert.deepEqual(importMappingReadiness(mapped,false),{
  pendingChoices:[],proposedCount:3,awaitingColumnApproval:true,
  skipped:[],ready:false
 });
 assert.throws(()=>buildImportPlan({sheet,detail:persisted,mappings:mapped,
  group,allowColumns:false}),/explicit Allow/);
 const plan=buildImportPlan({sheet,detail:persisted,mappings:mapped,
  group,allowColumns:true});
 assert.equal(plan.boardRevision,'2026-11-05T09:00:03Z');
 assert.equal(plan.payload.newColumns.length,3);
 assert.equal(plan.payload.rows[0].values.Status,'status-active');
 assert.equal(plan.payload.rows[1].values.Status,'status-pending');
 assert.throws(()=>matchConfiguredImportChoice(mapped,1,statusId),/verified configured/);
});
test('the mapping UI exposes resolve and skip controls instead of a dead-end Next button',()=>{
 const ui=readFileSync('frontend/board-import-ui.js','utf8');
 const css=readFileSync('frontend/board-import.css','utf8');
 assert.match(ui,/data-imp-review-choice/);
 assert.match(ui,/data-imp-skip-choice/);
 assert.match(ui,/Skip .* values \(do not import\)/);
 assert.match(ui,/importMappingReadiness/);
 assert.match(ui,/skipPendingImportChoice/);
 assert.match(ui,/matchConfiguredImportChoice/);
 assert.match(ui,/readiness\(\)\.pendingChoices\.length/);
 assert.match(ui,/target\?\.scrollIntoView/);
 assert.match(ui,/proposalSignature\(state\.mappings\)!==before/);
 assert.match(ui,/data-imp="review-choice"/);
 assert.match(css,/\.aps-import-resolve/);
 assert.match(css,/\.aps-import-notice/);
});
