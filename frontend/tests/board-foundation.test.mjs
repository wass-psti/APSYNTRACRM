import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD_MODULES,boardColumns,boardDescription,validateModuleBlueprint} from '../board-manifest.js';
import {inspectFoundation,provisionMissingBoards,summarizeFoundation} from '../board-foundation.js';
const U='11111111-1111-4111-8111-111111111111';
const W='22222222-2222-4222-8222-222222222222';
const context={user_id:U,workspace_id:W,profile:{status:'active',platform_role:'admin_general_manager'}};
test('12 dedicated module blueprints have unique names and typed columns',()=>{
 assert.equal(validateModuleBlueprint(),true);assert.equal(BOARD_MODULES.length,12);
 const tracker=BOARD_MODULES.find(x=>x.key==='timetracker');
 assert.ok(tracker.restricted.some(x=>x.includes('GPS')));
 assert.ok(!boardColumns(tracker).some(x=>/GPS|Employee name|Clock-in/.test(x.name)));
 assert.ok(BOARD_MODULES.some(x=>x.name==='Material Request Hub'));
});
test('live readiness refuses to invent nonexistent boards',async()=>{
 const api={auth:{userId:U},boards:async()=>[]};
 const rows=await inspectFoundation(api,{context});
 assert.deepEqual(summarizeFoundation(rows),{ready:0,total:12,missing:12,blocked:0});
});
test('provisioning uses actual configured board RPC then validates persisted scope',async()=>{
 let items=[],sequence=0;
 const api={auth:{userId:U},
 context:async()=>context,boards:async()=>items.map(x=>({id:x.id,name:x.name})),
 createConfiguredBoard:async(name,desc,cols)=>{
  assert.ok(desc.startsWith('[APSYNTRA:MODULE:'));assert.ok(cols.length>5);
  const id=('00000000-0000-4000-8000-'+(++sequence).toString().padStart(12,'0'));
  items.push({name,id,description:desc,columns:cols});return id;
 },
 board:async id=>{const x=items.find(x=>x.id===id);return{board:{id,workspace_id:W,status:'active',description:x.description},columns:x.columns.map(c=>({name:c.name,data_type:c.data_type})),items:[]}},
 allowed:async()=>true
 };
 const p=await provisionMissingBoards(api,{context,confirm:true});
 assert.equal(p.filter(x=>x.action==='created').length,12);
 const repeat=await provisionMissingBoards(api,{context,confirm:true});
 assert.equal(repeat.filter(x=>x.action==='existing').length,12);
 const rows=await inspectFoundation(api,{context});
 assert.equal(summarizeFoundation(rows).ready,12);
});
test('non-admin session is denied before any board modification',async()=>{
 let created=false;
 const api={auth:{userId:U},createConfiguredBoard:async()=>{created=true}};
 await assert.rejects(()=>provisionMissingBoards(api,{context:{...context,profile:{...context.profile,platform_role:'employee'}},confirm:true}));
 assert.equal(created,false);
});
test('existing misconfigured board is never reported as ready',async()=>{
 const mod=BOARD_MODULES[0],id='33333333-3333-4333-8333-333333333333';
 const api={auth:{userId:U},board:async()=>({board:{id,workspace_id:W,status:'active',description:boardDescription(mod)},columns:[],items:[]}),allowed:async()=>true};
 const rows=await inspectFoundation(api,{context,boards:[{id,name:mod.name}]});
 assert.equal(rows[0].status,'mismatch');
});
