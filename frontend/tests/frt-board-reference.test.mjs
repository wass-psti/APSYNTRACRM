import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardGrid,boardGridColumns,prepareBoardGrid} from '../board-grid.js';
import {FRT_BOARD_ID,FRT_REFERENCE_STATUS_LABELS,FRT_UNMAPPED_FIELDS,
 frtReferenceColumns,isFRTBoardReference,frtReferenceStatusLabel} from '../frt-board-reference.js';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const base=()=>({
 board:{id:FRT_BOARD_ID,name:'Fund Released Tracker',status:'active',
  description:'[APSYNTRA:MODULE:frt:v1] Funding request and release lifecycle'},
 columns:[
  {id:ids[0],name:'Approval Status',data_type:'status',visible:true,system_key:null},
  {id:ids[1],name:'Request Date',data_type:'date',visible:true,system_key:null},
  {id:'33333333-3333-4333-8333-333333333333',name:'Source Record ID',data_type:'text',visible:true,system_key:null}
 ],
 items:[{id:'44444444-4444-4444-8444-444444444444',group_id:'qa',title:'FRT QA request',status:'ready'}],
 values:[
  {item_id:'44444444-4444-4444-8444-444444444444',column_id:ids[0],value:'Done'},
  {item_id:'44444444-4444-4444-8444-444444444444',column_id:ids[1],value:'2026-05-19'},
  {item_id:'44444444-4444-4444-8444-444444444444',column_id:'33333333-3333-4333-8333-333333333333',value:'SOURCE-ID-PRIVATE'}
 ]
});
test('verified FRT board projects exactly six reference headings and two existing persisted fields',()=>{
 const detail=base();assert.equal(isFRTBoardReference(detail.board),true);
 const cols=frtReferenceColumns(detail,{primaryTitle:'Item'});
 assert.deepEqual(cols.map(c=>c.title),['Item','Person','Status','Date','Attachments','Account QR Code']);
 assert.deepEqual(cols.filter(c=>c.key.startsWith('col:')).map(c=>c.key),ids.map(x=>'col:'+x));
 assert.deepEqual(boardGridColumns(detail).map(c=>c.title),cols.map(c=>c.title));
 assert.deepEqual(FRT_REFERENCE_STATUS_LABELS,['Working on it','Stuck','Done','Pending Approval']);
 assert.deepEqual(FRT_UNMAPPED_FIELDS,['Person','Attachments','Account QR Code']);
});
test('FRT projection never fabricates person, attachment or QR values and hides technical lineage',()=>{
 const detail=base();const html=boardGrid(detail,{groupId:'qa',prepared:prepareBoardGrid(detail)});
 assert.match(html,/FRT QA request/);assert.match(html,/2026-05-19/);
 assert.match(html,/>Done</);assert.match(html,/Not configured/);
 assert.doesNotMatch(html,/SOURCE-ID-PRIVATE|Source Record ID/);
 assert.match(html,/Person field is not mapped/);
 assert.match(html,/FRT attachments are not yet mapped/);
 assert.match(html,/Account QR Code is not yet mapped/);
});
test('FRT status option IDs resolve against authoritative persisted label configuration',()=>{
 const detail=base();
 detail.columns[0].config={labels:[
  {id:'status_in_progress',name:'In progress',color:'#4f7df3',active:true},
  {id:'status_done',name:'Done',color:'#23b784',active:true}
 ]};
 detail.values[0].value='status_done';
 const html=boardGrid(detail,{groupId:'qa'});
 assert.match(html,/>Done<\/td>/);
 assert.doesNotMatch(html,/status_done/);
 assert.doesNotMatch(html,/In progress/);
});
test('schema drift, wrong board and missing mapped fields fall back to original domain grid',()=>{
 for(const detail of [
  {...base(),board:{...base().board,id:'55555555-5555-4555-8555-555555555555'}},
  {...base(),board:{...base().board,description:'Not verified'}},
  {...base(),columns:base().columns.filter(c=>c.name!=='Request Date')},
  {...base(),columns:[...base().columns,{...base().columns[1],id:'66666666-6666-4666-8666-666666666666'}]}
 ]){
  assert.equal(frtReferenceColumns(detail),null);
  assert.notDeepEqual(boardGridColumns(detail).map(c=>c.title),['Item','Person','Status','Date','Attachments','Account QR Code']);
 }
});
test('existing status values are rendered defensively rather than supplying synthetic options',()=>{
 for(const name of FRT_REFERENCE_STATUS_LABELS)assert.equal(frtReferenceStatusLabel(name.toLowerCase()),name);
 assert.equal(frtReferenceStatusLabel({label:'Done'}),'Done');
 assert.equal(frtReferenceStatusLabel(null),'—');
 assert.equal(frtReferenceStatusLabel({unexpected:'x'}),'—');
 assert.equal(frtReferenceStatusLabel('<script>'),'<script>'); // board renderer escapes this
 const detail=base();detail.values[0].value='<script>alert(1)</script>';
 const html=boardGrid(detail,{groupId:'qa'});
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('board UI distinguishes source-mapped versus unavailable fields with no FRT mutation calls',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/isFRTBoardReference\(b\)/);
 assert.match(app,/FRT_REFERENCE_STATUS_LABELS\.join/);
 assert.match(app,/separate board mirror does not store FRT person assignments or private attachments\/QR files/);
 const grid=readFileSync(new URL('../board-grid.js',import.meta.url),'utf8');
 assert.doesNotMatch(grid,/frt_request_action|frt_admin_users/);
});
