import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CMP02_NATIVE_TYPES,CMP02_SCHEMA_ACTIVATED,cmp02CreationConfig,
 cmp02DefaultConfig,cmp02Validate,cmp02VisibleValue
} from '../board-typed-cmp02.js';
import {BOARD_STANDARD_COLUMN_CATALOG,CMP02_STAGED_CATALOG,
 renderColumnCenterCards} from '../board-column-catalog.js';
import {genericBoardColumns,inputForColumn,parseCellForm,visibleValue
} from '../board-inline-items.js';
import {buildImportPlan,initialImportMappings,inferImportType,
 CREATABLE_IMPORT_TYPES} from '../board-import-core.js';

const b='11111111-1111-4111-8111-111111111111';
const w='22222222-2222-4222-8222-222222222222';
const g='33333333-3333-4333-8333-333333333333';
const p='44444444-4444-4444-8444-444444444444';
const r='55555555-5555-4555-8555-555555555555';
const n='66666666-6666-4666-8666-666666666666';
const now='2026-11-05T07:00:00Z';
const custom=(id,name,data_type,config={})=>({id,name,data_type,config,system_key:null,
 column_key:'custom:'+id,visible:true,position:0});
const detail={board:{id:b,workspace_id:w,name:'Contacts',status:'active',updated_at:now},
 columns:[custom(p,'Phone','phone'),custom(r,'Rating','rating',{max:7}),
  custom(n,'Percentage','percentage',{decimals:2})],
 groups:[{id:g,title:'Imported'}],items:[],values:[]};
const sheet={headers:['Name','Phone','Rating','Percentage'],
 rows:[['Alice','+15125550123','7','12.25%'],
  ['Bob','','','0'],['Carla','+639171234567','3','99.5']]};

const fd=(value)=>{const f=new FormData();f.set('value',value);return f;};
test('staged native types do not advertise an unactivated production feature',()=>{
 assert.equal(CMP02_SCHEMA_ACTIVATED,false);
 assert.deepEqual([...CMP02_NATIVE_TYPES],['phone','rating','percentage']);
 assert.deepEqual(CMP02_STAGED_CATALOG.map(x=>x.type),[...CMP02_NATIVE_TYPES]);
 assert.equal(BOARD_STANDARD_COLUMN_CATALOG.length,11);
 const html=renderColumnCenterCards();
 for(const name of CMP02_NATIVE_TYPES)
  assert.doesNotMatch(html,new RegExp('data-column-type="'+name+'"'));
 for(const name of CMP02_NATIVE_TYPES)
  assert.equal(CREATABLE_IMPORT_TYPES.includes(name),false);
});
test('phone validates E.164 without silently guessing local or formatted numbers',()=>{
 assert.equal(cmp02Validate('phone','+15125550123'),'+15125550123');
 assert.equal(cmp02Validate('phone','+639171234567'),'+639171234567');
 for(const value of ['09171234567','+1 (512) 555-0123','+0','+1','+1234567890123456',
  '=HYPERLINK("x")','+1;DROP','+ 123456789'])
  assert.throws(()=>cmp02Validate('phone',value),/E.164/);
 assert.equal(cmp02Validate('phone',''),null);
 assert.equal(cmp02DefaultConfig('phone').constructor,Object);
});
test('rating is a bounded integer with user-configurable maximum',()=>{
 assert.deepEqual(cmp02CreationConfig('rating',{max:7}),{max:7});
 assert.deepEqual(cmp02CreationConfig('rating',{}),{max:5});
 assert.equal(cmp02Validate('rating','7',{max:7}),7);
 assert.equal(cmp02Validate('rating','1',{max:7}),1);
 for(const value of ['0','8','2.5','NaN','-1','+1','999999999999999999999'])
  assert.throws(()=>cmp02Validate('rating',value,{max:7}),/Rating/);
 for(const max of [2,11,7.5,'unbounded'])
  assert.throws(()=>cmp02CreationConfig('rating',{max}),/Rating maximum/);
});
test('percentage preserves percentage points and rejects silent fraction coercion',()=>{
 assert.deepEqual(cmp02CreationConfig('percentage',{decimals:4}),{decimals:4});
 assert.equal(cmp02Validate('percentage','12.25',{decimals:2}),12.25);
 assert.equal(cmp02Validate('percentage','12.25%',{decimals:2},{allowPercentSymbol:true}),12.25);
 assert.equal(cmp02Validate('percentage','0.15',{decimals:2}),0.15);
 assert.equal(cmp02Validate('percentage','100',{decimals:2}),100);
 assert.equal(cmp02Validate('percentage','0',{decimals:2}),0);
 assert.equal(cmp02Validate('percentage','12.000',{decimals:2}),12);
 for(const input of ['101','-1','12.255','0.005','1,000','10abc','12%'])
  assert.throws(()=>cmp02Validate('percentage',input,{decimals:2}),/Percentage/);
 for(const decimals of [-1,5,2.1,'invalid'])
  assert.throws(()=>cmp02CreationConfig('percentage',{decimals}),/Percentage precision/);
});
test('typed inline controls and human-readable renderers share the same validation contract',()=>{
 assert.match(inputForColumn(detail.columns[0],'+15125550123'),/type="tel"/);
 assert.match(inputForColumn(detail.columns[0],'+15125550123'),/maxlength="16"/);
 assert.match(inputForColumn(detail.columns[1],7),/value="7" selected/);
 assert.match(inputForColumn(detail.columns[2],12.25),/step="0.01"/);
 assert.equal(parseCellForm(detail.columns[0],fd('+15125550123')),'+15125550123');
 assert.equal(parseCellForm(detail.columns[1],fd('7')),7);
 assert.equal(parseCellForm(detail.columns[2],fd('12.25')),12.25);
 assert.equal(parseCellForm(detail.columns[0],fd('')),null);
 assert.throws(()=>parseCellForm(detail.columns[0],fd('12345')),/E.164/);
 assert.throws(()=>parseCellForm(detail.columns[1],fd('10')),/Rating/);
 assert.throws(()=>parseCellForm(detail.columns[2],fd('101')),/Percentage/);
 assert.equal(visibleValue(7,'rating',{max:7}),'7 / 7');
 assert.equal(visibleValue(12.25,'percentage',{decimals:2}),'12.25%');
 assert.equal(cmp02VisibleValue(null,'phone'),'—');
 const cols=genericBoardColumns(detail,{minimal:true,primaryTitle:'Item'});
 assert.deepEqual(cols.map(x=>x.key),['record','col:'+p,'col:'+r,'col:'+n]);
});
test('staged import reuses existing typed columns, never creates new native columns',()=>{
 const mappings=initialImportMappings(sheet,detail,{canCreate:true});
 assert.deepEqual(mappings.map(x=>x.action),['item','existing','existing','existing']);
 const plan=buildImportPlan({sheet,detail,mappings,
  group:{action:'existing',groupId:g},allowColumns:false});
 assert.equal(plan.preview.newColumns,0);
 assert.deepEqual(plan.payload.rows[0].values,
  {Phone:'+15125550123',Rating:7,Percentage:12.25});
 assert.deepEqual(plan.payload.rows[1].values,{Percentage:0});
 assert.deepEqual(plan.payload.rows[2].values,
  {Phone:'+639171234567',Rating:3,Percentage:99.5});
 const empty={...detail,columns:[]};
 const skipped=initialImportMappings(sheet,empty,{canCreate:true});
 assert.deepEqual(skipped.map(x=>x.action),['item','skip','skip','skip']);
});
test('invalid imported values identify source row and original typed value',()=>{
 assert.equal(inferImportType('Phone',['+15125550123']),'phone');
 assert.equal(inferImportType('Rating',['5']),'rating');
 assert.equal(inferImportType('Percentage',['22.5%']),'percentage');
 const mappings=initialImportMappings(sheet,detail,{canCreate:true});
 const bad={...sheet,worksheet:'monday export',rowNumbers:[8,9,10],
  rows:[['Alice','+15125550123','7','12.251%']]};
 assert.throws(()=>buildImportPlan({sheet:bad,detail,mappings,
  group:{action:'existing',groupId:g}}),
  error=>/row 8/.test(error.message)&&/Percentage/.test(error.message)&&
   /12.251%/.test(error.message));
});
