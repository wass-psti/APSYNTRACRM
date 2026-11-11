import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMaterialSourcingTracker} from '../material-sourcing-tracker.js';
import {renderMaterialSourcingAddMaterial,materialAddPublicColumns,parseMaterialAddForm} from '../material-sourcing-add-material.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from '../material-sourcing-schema-plan.js';

const board={id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',status:'active'};
const detail={board,groups:[MATERIAL_SOURCING_GROUP],columns:[
 {id:'qty-col',name:'Quantity',data_type:'number',system_key:null,visible:true}],items:[],values:[]};
const draft=values=>({get:key=>Object.prototype.hasOwnProperty.call(values,key)?values[key]:null});
test('reference Add Material uses a real form with three sections, no bulk import',()=>{
 const html=renderMaterialSourcingTracker(detail,{},new Date(),{canCreate:true,view:'add'});
 for(const title of ['Material Sourcing','New Material','Identification','Pricing &amp; Cost',
  'Supplier &amp; Schedule','Item name','Source type','Material description',
  'Buying price','Currency','Shipping cost','Leadtime (weeks)',
  'Vendor details','Date required','RFQ Ref No','Add Material','Main group'])
  assert.ok(html.includes(title),title);
 assert.match(html,/id="mrh-add-material-form"/);
 assert.match(html,/data-action="mrh-show-items"/);
 assert.doesNotMatch(html,/Bulk Import|Engineering Services|USD ₱64\.89/);
 assert.match(html,/Column not activated/);
});
test('required signing and Main group are unchanged and non-edit users have no inputs',()=>{
 assert.match(renderMaterialSourcingAddMaterial(detail,{canCreate:true}),/Original group is preserved/);
 const html=renderMaterialSourcingTracker(detail,{},new Date(),{canCreate:false,view:'add'});
 assert.doesNotMatch(html,/data-mrh-add-submit|id="mrh-add-partNumber"/);
 assert.match(html,/creation is not enabled for its current board permissions/);
 assert.match(html,/data-action="mrh-show-items"/);
});
test('pre-validation creates only intended field writes and never guesses missing columns',()=>{
 assert.deepEqual({...materialAddPublicColumns(detail)},{quantity:'qty-col'});
 const plan=parseMaterialAddForm(detail,draft({partNumber:'  TEST-PART ',quantity:'12',
  buying:'10.25',currency:'PHP',shippingCurrency:'PHP'}));
 assert.equal(plan.partNumber,'TEST-PART');
 assert.deepEqual(plan.ordinary,[{name:'Quantity',columnId:'qty-col',value:12}]);
 assert.deepEqual(plan.protectedValues,[{name:'Buying Price',value:10.25},
  {name:'Currency',value:'PHP'},{name:'Shipping Cost Currency',value:'PHP'}]);
 assert.throws(()=>parseMaterialAddForm(detail,draft({partNumber:'X',sourceType:'Import'})),/not activated/);
 assert.throws(()=>parseMaterialAddForm(detail,draft({partNumber:'X',buying:'-4'})),/nonnegative/);
 assert.throws(()=>parseMaterialAddForm(detail,draft({partNumber:''})),/required/);
});
test('submit uses one idempotent atomic RPC instead of partial multi-step writes',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=app.indexOf("if(event.target.id==='mrh-add-material-form')");
 const section=app.slice(start,start+2900);
 assert.ok(start>0);
 assert.match(section,/plan=parseMaterialAddForm\(state\.board,new FormData\(form\)\)/);
 assert.ok(section.indexOf('plan=parseMaterialAddForm')<
   section.indexOf('createMaterialSourcingAtomic'));
 assert.match(section,/requestId=form\.dataset\.mrhRequestId/);
 assert.match(section,/form\.dataset\.mrhRequestId=requestId/);
 assert.match(section,/createMaterialSourcingAtomic\(/);
 assert.doesNotMatch(section,/db\.setBoardCellCas|writeProtectedSourcingField/);
 assert.match(section,/button\.disabled=true/);
 assert.match(app,/case 'mrh-activate-public'/);
 assert.match(app,/case 'mrh-add-view'/);
 assert.match(app,/case 'mrh-show-items'/);
 assert.match(app,/activateApprovedPublicSourcingColumns/);
});
test('form view does not replace protected details or task contract',()=>{
 const html=renderMaterialSourcingTracker(detail,{},new Date(),{canCreate:true,view:'list'});
 assert.match(html,/All items/);
 assert.match(html,/data-action="mrh-add-view"/);
 assert.doesNotMatch(html,/Bulk Import/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'board-item-detail'/);
 assert.match(app,/readMaterialBoardItemTasks\(input\)/);
});

test('all six approved public fields become enabled from signed custom columns',()=>{
 const fields=[
  ['Source Type','dropdown'],['Brand','text'],['Material description','long_text'],
  ['RFQ Ref No','text'],['Date required','date'],['Leadtime in Weeks','number']
 ];
 const activated={...detail,columns:[...detail.columns,
  ...fields.map(([name,data_type],i)=>({
   id:'column-'+i,name,data_type,column_key:'custom:approved-'+i,
   system_key:null,visible:true
  }))]};
 const html=renderMaterialSourcingAddMaterial(activated,{canCreate:true});
 assert.doesNotMatch(html,/Column not activated|Enable missing fields/);
 assert.match(html,/name="sourceType"[^>]*required/);
 assert.match(html,/name="description"[^>]*required/);
 const plan=parseMaterialAddForm(activated,draft({
  partNumber:'PART-101',sourceType:'Local',brand:'Acme',
  description:'Material specification',rfq:'RFQ-1',
  due:'2026-11-21',lead:'4',quantity:'3'
 }));
 assert.equal(plan.ordinary.length,7);
 assert.deepEqual(plan.ordinary.find(f=>f.name==='Source Type').value,'Local');
 assert.deepEqual(plan.ordinary.find(f=>f.name==='Quantity').value,3);
});
