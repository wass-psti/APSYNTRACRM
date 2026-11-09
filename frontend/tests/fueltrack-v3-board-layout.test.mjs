import test from 'node:test';
import assert from 'node:assert/strict';
import {
 FUELTRACK_V3_BOARD_ID,FUELTRACK_V3_WORKSPACE_ID,
 isFuelTrackV3Board,fuelTrackV3GridColumns
} from '../fueltrack-v3-board-layout.js';
import {boardGridColumns,prepareBoardGrid} from '../board-grid.js';

const DATE_ID='676c1fb7-9096-4194-a008-037cadcbfb9e';
const STATUS_ID='40fdffef-8b9c-42cb-ae69-42d1f7b2e8a2';
const TITLE_ID='b58ed359-8a5a-4f70-98ba-180dfaf8ca35';
function detail(){
 return {
  board:{
   id:FUELTRACK_V3_BOARD_ID,workspace_id:FUELTRACK_V3_WORKSPACE_ID,
   name:'FuelTrack+ v3',status:'active',
   description:'[APSYNTRA:MODULE:fueltrack:v1] Fuel operations and reconciliation records.'
  },
  columns:[
   {id:TITLE_ID,name:'Source Record ID',data_type:'text',visible:true,system_key:null},
   {id:DATE_ID,name:'Event Date',data_type:'date',visible:true,system_key:null},
   {id:STATUS_ID,name:'Reconcile Status',data_type:'status',visible:true,system_key:null}
  ],
  items:[],values:[]
 };
}

test('FuelTrack v3 matches only the verified production module identity and workspace',()=>{
 const source=detail();
 assert.equal(isFuelTrackV3Board(source.board),true);
 for(const field of ['id','workspace_id','description','name','status']){
  const changed=detail().board;
  changed[field]=field==='status'?'archived':'foreign';
  assert.equal(isFuelTrackV3Board(changed),false,field);
 }
});

test('Item Status Date use real title, built-in item status and existing typed Event Date',()=>{
 const source=detail();
 const expected=[
  {key:'record',title:'Item'},
  {key:'status',title:'Status'},
  {key:'col:'+DATE_ID,title:'Date'}
 ];
 assert.deepEqual(fuelTrackV3GridColumns(source),expected);
 assert.deepEqual(boardGridColumns(source,{primaryTitle:'Record',allowCustom:true}),expected);
 const prepared=prepareBoardGrid(source);
 assert.deepEqual(prepared.columns,expected);
 assert.deepEqual(prepared.visibleColumns.map(c=>c.id),[DATE_ID]);
 assert.equal(source.columns.length,3,'presentation must not mutate backend column inventory');
 assert.ok(source.columns.some(c=>c.id===STATUS_ID&&c.name==='Reconcile Status'));
});

test('absent, hidden, duplicate or retyped date fails closed to the existing board renderer',()=>{
 for(const mutate of [
  d=>{d.columns=d.columns.filter(c=>c.id!==DATE_ID);},
  d=>{d.columns.find(c=>c.id===DATE_ID).visible=false;},
  d=>{d.columns.push({...d.columns[1],id:'11111111-1111-4111-8111-111111111111'});},
  d=>{d.columns.find(c=>c.id===DATE_ID).data_type='text';}
 ]){
  const source=detail();mutate(source);
  assert.equal(fuelTrackV3GridColumns(source),null);
  assert.equal(boardGridColumns(source)[0].title,'Record',
   'a malformed domain schema must never be represented as ready');
 }
});

test('other boards retain their existing table schema',()=>{
 const source=detail();
 source.board.id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 source.board.name='TradeLink';
 source.board.description='[APSYNTRA:MODULE:tradelink:v1]';
 assert.equal(fuelTrackV3GridColumns(source),null);
 assert.equal(boardGridColumns(source)[0].title,'Item');
});
