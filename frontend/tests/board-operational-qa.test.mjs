import test from 'node:test';
import assert from 'node:assert/strict';
import {runTwelveBoardQa} from '../board-operational-qa.js';
import {BOARD_MODULES,boardDescription,boardColumns} from '../board-manifest.js';
const U='11111111-1111-4111-8111-111111111111',W='22222222-2222-4222-8222-222222222222';
const ctx={user_id:U,workspace_id:W,profile:{status:'active',platform_role:'admin_general_manager'}};
test('controlled isolated acceptance verifies 12 authenticated board CRUD cycles',async()=>{
 const source=new Map(),called=[];
 for(let i=0;i<BOARD_MODULES.length;i++){
  const module=BOARD_MODULES[i],id='33333333-3333-4333-8333-'+String(i+1).padStart(12,'0');
  source.set(id,{id,module,group:'44444444-4444-4444-8444-'+String(i+1).padStart(12,'0'),
   col:'55555555-5555-4555-8555-'+String(i+1).padStart(12,'0'),items:[],values:[],events:[]});
 }
 let last=0;
 const api={auth:{userId:U},context:async()=>ctx,boards:async()=>[...source.values()].map(r=>({id:r.id,name:r.module.name})),
 allowed:async()=>true,
 board:async id=>{
  const r=source.get(id);return {board:{id,workspace_id:W,status:'active',description:boardDescription(r.module)},
   groups:[{id:r.group}],columns:boardColumns(r.module).map(c=>({...c,id:c.name==='Source Record ID'?r.col:crypto.randomUUID()})),
   items:structuredClone(r.items),values:structuredClone(r.values)};
 },
 addItem:async(id,group,title)=>{const r=source.get(id),item='66666666-6666-4666-8666-'+String(++last).padStart(12,'0');
  r.items.push({id:item,title});r.events.push({entity_id:item,event_type:'item.created',actor_id:U});return item;},
 setBoardCellCas:async(item,column,value,expected)=>{
  const r=[...source.values()].find(x=>x.items.some(i=>i.id===item));
  const v=r.values.find(v=>v.item_id===item&&v.column_id===column);
  if((v?.value??null)!==expected)throw Object.assign(new Error('stale'),{code:'40001'});
  if(v)v.value=value;else r.values.push({item_id:item,column_id:column,value});
  r.events.push({entity_id:item,event_type:'item.cell_updated',actor_id:U});
 },
 deleteBoardItem:async item=>{const r=[...source.values()].find(x=>x.items.some(i=>i.id===item));
  r.items=r.items.filter(x=>x.id!==item);r.values=r.values.filter(v=>v.item_id!==item);
  r.events.push({entity_id:item,event_type:'item.deleted',actor_id:U});},
 boardEvents:async id=>source.get(id).events
 };
 const r=await runTwelveBoardQa(api,{context:ctx});
 assert.equal(r.status,'pass');assert.equal(r.passed,12);
 assert.ok(r.results.every(x=>x.steps.length===5&&x.cleaned));
 assert.ok([...source.values()].every(x=>x.items.length===0&&x.values.length===0));
});
test('non-admin cannot run any operational writes',async()=>{
 const api={auth:{userId:U},context:async()=>{throw Error('should not call')}};
 await assert.rejects(()=>runTwelveBoardQa(api,{context:{...ctx,profile:{status:'active',platform_role:'employee'}}}));
});
test('readiness gate prevents use of unknown boards',async()=>{
 const api={auth:{userId:U},context:async()=>ctx,boards:async()=>[]};
 await assert.rejects(()=>runTwelveBoardQa(api,{context:ctx}),/All twelve/);
});
