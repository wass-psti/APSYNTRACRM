import test from 'node:test';
import assert from 'node:assert/strict';
import {MATERIAL_SOURCING_BOARD_ID as boardId,MATERIAL_SOURCING_GROUP as main,
 MATERIAL_SOURCING_EXISTING,MATERIAL_SOURCING_ADDITIONS} from '../../../frontend/material-sourcing-schema-plan.js';
import {reconcileBoard,reconcileTask,existingTaskStatus,checkFieldCatalog,COMMERCIAL_FIELDS} from './reconcile.mjs';
const id=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
const workspaceId=id(900),otherGroup={id:id(901),title:'Other group'},itemId=id(902);
const fields=[...MATERIAL_SOURCING_EXISTING,...MATERIAL_SOURCING_ADDITIONS];
function fixture(){
 const columns=fields.map((f,i)=>({id:id(i+1),name:f.name,data_type:f.type,visible:true,system_key:null,
 column_key:i<8?'col_'+i:'custom:'+id(i+100)}));
 const row=(name,value)=>({item_id:itemId,column_id:columns.find(c=>c.name===name).id,value});
 return {board:{id:boardId,name:'Material Request Hub',status:'active',workspace_id:workspaceId},
 groups:[main,otherGroup],columns,items:[{id:itemId,board_id:boardId,group_id:main.id,title:'SYNTHETIC-PART',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-02T00:00:00.123456Z'}],
 values:[row('Quantity',0),row('Source Type','Import'),row('Leadtime in Weeks',-2),row('Date required','2026-02-30'),row('Brand','Synthetic'),row('Buying Price',999)]};
}
const scope={workspaceId};
const receipt=(cells)=>({boardId,workspaceId,itemId,cells});
const map=(cells)=>new Map([[itemId,receipt(cells)]]);
test('field catalog follows existing public/private/derived classifications',()=>assert.deepEqual(checkFieldCatalog(),{public:true,commercial:true,derived:true}));
test('actual UUIDs, Main group and exact timestamps retained; inputs unchanged',()=>{
 const d=fixture(),before=JSON.stringify(d),r=reconcileBoard(d,scope);
 assert.equal(r.records[0].id,itemId);assert.equal(r.records[0].groupId,main.id);assert.equal(r.records[0].group,'Main group');
 assert.equal(r.records[0].dbRevision,'2026-01-02T00:00:00.123456Z');
 assert.equal(r.originalColumns.length,8);assert.ok(r.originalColumns.every(c=>c.compatible&&c.id));
 assert.equal(JSON.stringify(d),before);
});
test('zero, historical negative lead, invalid date and missing values are distinct',()=>{
 const r=reconcileBoard(fixture(),scope).records[0].publicValues;
 assert.equal(r.quantity.value,0);assert.equal(r.leadWeeks.value,-2);
 assert.equal(r.requiredDate.state,'unsupported');assert.equal(r.description.state,'absent');
});
test('missing column and missing value are not equivalent; no synthesized defaults',()=>{
 const d=fixture();d.columns=d.columns.filter(c=>c.name!=='Source Type');
 const r=reconcileBoard(d,scope);assert.ok(r.missingPublicFields.includes('Source Type'));
 assert.equal(r.records[0].publicValues.source.state,'unavailable');
 assert.equal(r.records[0].savedCosts,null);assert.equal(r.records[0].fxSnapshotId,null);
 assert.equal(r.records[0].tasks,null);assert.equal(r.records[0].starred,null);
});
test('commercial data never originates from public board cells',()=>{
 const r=reconcileBoard(fixture(),scope).records[0];
 assert.ok(Object.values(r.commercial).every(f=>f.state==='unavailable'));
 assert.ok(!JSON.stringify(r).includes('999'));
});
test('signed commercial receipt preserves per-field revision and legacy selling independently',()=>{
 const r=reconcileBoard(fixture(),{...scope,commercialByItem:map({'Buying Price':{value:10.075,revision:3},
 'Selling Price (VAT-EX)':{value:42,revision:2},'Currency':{value:'USD',revision:1}})}).records[0];
 assert.equal(r.commercial.buyingPrice.value,10.075);assert.equal(r.commercial.buyingPrice.revision,3);
 assert.equal(r.commercial.buyingPrice.precision,'legacy-json-number');assert.equal(r.commercial.legacySelling.value,42);
 assert.equal(r.commercial.shipping.state,'absent');assert.equal(r.savedCosts,null);
 assert.equal(Object.keys(r.commercial).length,Object.keys(COMMERCIAL_FIELDS).length);
});
test('mismatched workspace, receipt scope and invalid private revision are rejected',()=>{
 assert.throws(()=>reconcileBoard(fixture(),{workspaceId:id(999)}),/scope mismatch/);
 const wrong=receipt({});wrong.itemId=id(999);
 assert.throws(()=>reconcileBoard(fixture(),{...scope,commercialByItem:new Map([[itemId,wrong]])}),/receipt scope mismatch/);
 assert.throws(()=>reconcileBoard(fixture(),{...scope,commercialByItem:map({'Buying Price':{value:1,revision:0}})}),/revision/);
});
test('original group cannot be renamed or substituted, other/archived identities reported',()=>{
 const d=fixture();d.items.push({...d.items[0],id:id(903),group_id:otherGroup.id},{...d.items[0],id:id(904),archived_at:'2026-01-03T00:00:00Z'});
 const r=reconcileBoard(d,scope);assert.equal(r.records.length,1);assert.deepEqual(r.deferred.map(x=>x.reason),['outside-current-sourcing-group','archived']);
 d.groups[0]={...main,title:'Engineering Services'};assert.throws(()=>reconcileBoard(d,scope),/Main group changed/);
});
test('duplicate columns, duplicate public cells and foreign board items cannot be silently merged',()=>{
 let d=fixture();d.columns.push({...d.columns[0],id:id(999)});assert.throws(()=>reconcileBoard(d,scope),/column name/);
 d=fixture();d.values.push({...d.values[0]});assert.throws(()=>reconcileBoard(d,scope),/Duplicate public cell/);
 d=fixture();d.items[0].board_id=id(999);assert.throws(()=>reconcileBoard(d,scope),/Item scope mismatch/);
});
test('task revisions preserved; incompatible states not conflated',()=>{
 const base={id:id(920),title:'Synthetic task',revision:7};
 assert.deepEqual(reconcileTask({...base,status:'not_started'}),{...base,crmStatus:'not_started',status:null});
 assert.equal(reconcileTask({...base,status:'working_on_it'}).status,'Working on it');
 assert.equal(reconcileTask({...base,status:'done'}).revision,7);
 assert.equal(existingTaskStatus('Done'),'done');assert.throws(()=>existingTaskStatus('Stuck'),/compatible CRM contract/);
});
