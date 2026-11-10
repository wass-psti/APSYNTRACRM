import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,MATERIAL_SOURCING_PRIMARY_LABEL,
 MATERIAL_SOURCING_COLUMN_LIMIT,MATERIAL_SOURCING_EXISTING,
 MATERIAL_SOURCING_ADDITIONS,planMaterialSourcingSchema
} from '../material-sourcing-schema-plan.js';

const UUID='00000000-0000-4000-8000-000000000001';
function snapshot({id=MATERIAL_SOURCING_BOARD_ID,groupName='Main group',
 groupId=MATERIAL_SOURCING_GROUP.id,columns=null}={}){
 return {board:{id,name:'Material Request Hub',status:'active'},
  groups:[{id:groupId,title:groupName,position:0}],
  columns:columns??MATERIAL_SOURCING_EXISTING.map((c,n)=>({
   id:UUID.slice(0,-1)+String(n),name:c.name,data_type:c.type,position:n
  }))};
}
test('reference manifest fits backend limit and preserves the original eight columns',()=>{
 assert.equal(MATERIAL_SOURCING_EXISTING.length,8);
 assert.equal(MATERIAL_SOURCING_ADDITIONS.length,22);
 assert.equal(MATERIAL_SOURCING_EXISTING.length+MATERIAL_SOURCING_ADDITIONS.length,MATERIAL_SOURCING_COLUMN_LIMIT);
 assert.equal(MATERIAL_SOURCING_PRIMARY_LABEL,'Part number');
 assert.equal(MATERIAL_SOURCING_GROUP.title,'Main group');
 assert.equal(MATERIAL_SOURCING_EXISTING.some(x=>x.name==='Quantity'),true);
 assert.equal(MATERIAL_SOURCING_ADDITIONS.some(x=>x.name==='Quantity'),false);
 assert.equal(new Set([...MATERIAL_SOURCING_EXISTING,...MATERIAL_SOURCING_ADDITIONS]
  .map(x=>x.name.toLowerCase())).size,30);
});
test('read-only dry-run does not rename group or overwrite domain columns',()=>{
 const s=snapshot(),before=structuredClone(s),result=planMaterialSourcingSchema(s);
 assert.equal(result.status,'BLOCKED_FIELD_AUTHORIZATION');
 assert.equal(result.noWrites,true);
 assert.equal(result.groupName,'Main group');
 assert.equal(result.groupId,MATERIAL_SOURCING_GROUP.id);
 assert.equal(result.existingCount,8);
 assert.equal(result.projectedCount,30);
 assert.equal(result.additions.length+result.restricted.length,22);
 assert.ok(result.restricted.some(x=>x.name==='Selling Price (VAT-EX)'));
 assert.ok(result.restricted.some(x=>x.name==='Requestor'));
 assert.ok(result.restricted.some(x=>x.name==='Vendor Details'));
 assert.ok(result.additions.some(x=>x.name==='Brand'));
 assert.deepEqual(s,before);
});
test('unexpected board or changed original group identity fails closed',()=>{
 for(const s of [snapshot({id:UUID}),snapshot({groupName:'Engineering Services'}),
  snapshot({groupId:UUID})]){
  const result=planMaterialSourcingSchema(s);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.noWrites,true);
  assert.equal(result.additions.length,0);
 }
});
test('existing column type drift is reported, not silently corrected',()=>{
 const s=snapshot();
 s.columns.find(x=>x.name==='Quantity').data_type='text';
 const result=planMaterialSourcingSchema(s);
 assert.equal(result.status,'BLOCKED_CONFLICT');
 assert.deepEqual(result.conflicts.map(x=>x.name),['Quantity']);
});
test('case-insensitive existing reference columns are never recreated',()=>{
 const s=snapshot();s.columns.push({id:UUID,name:'brand',data_type:'text'});
 const result=planMaterialSourcingSchema(s);
 assert.equal(result.additions.some(x=>x.name==='Brand'),false);
 assert.equal(result.projectedCount,30);
});
test('excess fields hit backend ceiling without any mutation plan',()=>{
 const s=snapshot();s.columns.push({id:UUID,name:'Unrelated',data_type:'text'});
 const result=planMaterialSourcingSchema(s);
 assert.equal(result.status,'BLOCKED');
 assert.match(result.reason,/limit/);
 assert.equal(result.additions.length,0);
});
test('no remote mutations, hidden domain data or calculation logic included',()=>{
 const source=readFileSync(new URL('../material-sourcing-schema-plan.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|\.rpc\s*\(|execute_sql|INSERT INTO|UPDATE\s+public|DELETE FROM|service_role|localStorage|sessionStorage/);
 assert.equal(MATERIAL_SOURCING_ADDITIONS.filter(x=>x.derived).length,5);
 assert.equal(MATERIAL_SOURCING_ADDITIONS.find(x=>x.name==='Source Type').options.join(','),'Local,Import');
 assert.equal(MATERIAL_SOURCING_ADDITIONS.find(x=>x.name==='Currency').options.join(','),'PHP,USD,EUR');
});

test('even preexisting restricted fields do not constitute field-level authorization',()=>{
 const base=snapshot();
 for(const field of MATERIAL_SOURCING_ADDITIONS)base.columns.push({
  id:UUID,name:field.name,data_type:field.type
 });
 const plan=planMaterialSourcingSchema(base);
 assert.equal(plan.projectedCount,30);
 assert.equal(plan.additions.length,0);
 assert.equal(plan.restricted.length,0);
 assert.equal(plan.status,'BLOCKED_FIELD_AUTHORIZATION');
});
