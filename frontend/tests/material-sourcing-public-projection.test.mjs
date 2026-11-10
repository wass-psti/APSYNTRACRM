import test from 'node:test';
import assert from 'node:assert/strict';
import {boardGridColumns,prepareBoardGrid,boardGrid} from '../board-grid.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,
 MATERIAL_SOURCING_EXISTING,MATERIAL_SOURCING_ADDITIONS,
 isApprovedPublicMaterialSourcingColumn} from '../material-sourcing-schema-plan.js';

const uuid=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
const original=MATERIAL_SOURCING_EXISTING.map((f,i)=>({
 id:uuid(i+1),name:f.name,data_type:f.type,column_key:'domain_'+i,
 position:i,visible:true,system_key:null
}));
const ordinary=MATERIAL_SOURCING_ADDITIONS.filter(x=>x.exposure==='ordinary').map((f,i)=>({
 id:uuid(i+101),name:f.name,data_type:f.type,column_key:'custom:'+uuid(i+201),
 position:8+i,visible:true,system_key:null
}));
const restricted=MATERIAL_SOURCING_ADDITIONS.filter(x=>x.exposure==='restricted').map((f,i)=>({
 id:uuid(i+301),name:f.name,data_type:f.type,column_key:'custom:'+uuid(i+401),
 position:14+i,visible:true,system_key:null
}));
const board={id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',status:'active'};
const detail={board,groups:[MATERIAL_SOURCING_GROUP],
 columns:[...original,...ordinary,...restricted],
 items:[{id:uuid(700),title:'SAFE-PART',group_id:MATERIAL_SOURCING_GROUP.id,status:'not_started'}],
 values:[...ordinary.map((c,i)=>({item_id:uuid(700),column_id:c.id,value:i===0?'Local':'Ordinary value'})),
 {item_id:uuid(700),column_id:restricted[0].id,value:'SECRET_VALUE_NOT_FOR_GENERIC_GRID'}]};
test('six ordinary sourcing columns render without optional board customization',()=>{
 const titles=boardGridColumns(detail,{allowCustom:false}).map(c=>c.title);
 for(const field of MATERIAL_SOURCING_ADDITIONS.filter(x=>x.exposure==='ordinary'))
  assert.ok(titles.includes(field.name),field.name);
 for(const field of MATERIAL_SOURCING_ADDITIONS.filter(x=>x.exposure==='restricted'))
  assert.ok(!titles.includes(field.name),field.name);
 assert.equal(titles.length,2+8+6);
});
test('restricted fields cannot enter generic table even with customization enabled',()=>{
 const prepared=prepareBoardGrid(detail,{allowCustom:true});
 const html=boardGrid(detail,{prepared,groupId:MATERIAL_SOURCING_GROUP.id});
 assert.match(html,/SAFE-PART/);
 assert.match(html,/Source Type|Material description|Brand/);
 assert.doesNotMatch(html,/SECRET_VALUE_NOT_FOR_GENERIC_GRID/);
 for(const field of restricted)assert.ok(!prepared.visibleColumns.some(c=>c.id===field.id));
});
test('schema drift, foreign board, hidden field and system-key mismatch fail closed',()=>{
 const field=ordinary[0];
 assert.equal(isApprovedPublicMaterialSourcingColumn(board,field),true);
 for(const mutated of [
 {...field,data_type:'number'}, {...field,column_key:'domain:fake'},
 {...field,visible:false},{...field,system_key:'status'},
 {...field,name:'Buying Price'}
 ])assert.equal(isApprovedPublicMaterialSourcingColumn(board,mutated),false);
 assert.equal(isApprovedPublicMaterialSourcingColumn({...board,id:uuid(900)},field),false);
 assert.equal(isApprovedPublicMaterialSourcingColumn({...board,status:'archived'},field),false);
 assert.equal(isApprovedPublicMaterialSourcingColumn({...board,name:'Different board'},field),false);
});
test('ordinary reference columns require exact name/type and are never synthesized',()=>{
 const none={...detail,columns:original};
 const names=boardGridColumns(none).map(c=>c.title);
 for(const f of MATERIAL_SOURCING_ADDITIONS.filter(x=>x.exposure==='ordinary'))
  assert.equal(names.includes(f.name),false);
 assert.equal(names.length,2+original.length);
});
