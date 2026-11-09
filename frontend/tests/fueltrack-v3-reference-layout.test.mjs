import test from 'node:test';
import assert from 'node:assert/strict';
import {boardGridColumns,prepareBoardGrid,boardGrid,fuelTrackGroupDisplay} from '../board-grid.js';
import {BOARD_MODULES,boardColumns,boardDescription} from '../board-manifest.js';

const ID='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const W='00000000-0000-4000-8000-000000000001';
const MODULE=BOARD_MODULES.find(m=>m.key==='fueltrack');
const COLUMN_ID='676c1fb7-9096-4194-a008-037cadcbfb9e';
function fixture(){
 const columns=boardColumns(MODULE).map((c,i)=>({
  id:i===4?COLUMN_ID:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  name:c.name,data_type:c.data_type,visible:true,system_key:null,
  column_key:'col_'+String(i+1)
 }));
 return {board:{id:ID,workspace_id:W,name:MODULE.name,
  description:boardDescription(MODULE),status:'active'},
  columns,items:[],values:[]};
}
test('FuelTrack+ v3 source blueprint remains unchanged and preserves protected fields',()=>{
 assert.equal(MODULE.fields.length,8);
 assert.deepEqual(MODULE.fields.map(f=>f.name),[
  'Source Record ID','Source Revision','Sync State','Fuel Event Ref',
  'Event Date','Quantity Liters','Reconcile Status','Pump Ref']);
 assert.ok(MODULE.restricted.includes('Attendant identity'));
});
test('the canonical protected FuelTrack board displays Item, Status and linked Event Date',()=>{
 const detail=fixture();
 const columns=boardGridColumns(detail);
 assert.deepEqual(columns,[
  {key:'record',title:'Item'},{key:'status',title:'Status'},
  {key:'col:'+COLUMN_ID,title:'Date'}]);
 assert.equal(detail.columns.length,8,'no source column was removed');
});
test('new layout uses the stored Event Date value and never synthesizes a domain item',()=>{
 const detail=fixture();
 const group='180e7ed3-08e8-451a-bc46-fd5b9e54e366';
 const item='11111111-1111-4111-8111-111111111111';
 detail.items=[{id:item,group_id:group,title:'Fuel Event A',status:'done'}];
 detail.values=[{item_id:item,column_id:COLUMN_ID,value:'2026-11-09'}];
 const html=boardGrid(detail,{groupId:group,prepared:prepareBoardGrid(detail)});
 assert.match(html,/Fuel Event A/);
 assert.match(html,/2026-11-09/);
 assert.match(html,/\bDate\b/);
 assert.doesNotMatch(html,/Source Revision|Quantity Liters|Pump Ref/);
 assert.equal(detail.items.length,1);
});
test('other boards or unexpected module markers retain their complete existing columns',()=>{
 const other=fixture();
 other.board.id='11111111-1111-4111-8111-111111111111';
 assert.equal(boardGridColumns(other).length,10);
 const changed=fixture();
 changed.board.description='Other integration';
 assert.equal(boardGridColumns(changed).length,10);
});
test('missing or mistyped Event Date fails closed to the existing domain grid',()=>{
 const detail=fixture();
 detail.columns.find(c=>c.name==='Event Date').data_type='text';
 assert.equal(boardGridColumns(detail).length,10);
});

test('default group adopts reference heading without changing persisted group data',()=>{
 const detail=fixture(),group={id:'180e7ed3-08e8-451a-bc46-fd5b9e54e366',title:'Main group'};
 const displayed=fuelTrackGroupDisplay(detail.board,group);
 assert.equal(displayed.title,'Group Title');
 assert.equal(displayed.id,group.id);
 assert.equal(group.title,'Main group','the authoritative group name is untouched');
 const renamed={...group,title:'January deliveries'};
 assert.equal(fuelTrackGroupDisplay(detail.board,renamed),renamed);
 const foreign={...detail.board,id:'11111111-1111-4111-8111-111111111111'};
 assert.equal(fuelTrackGroupDisplay(foreign,group),group);
});
