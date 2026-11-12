import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {initialImportMappings,buildImportPlan} from '../board-import-core.js';
import {executeBoardImportBatched} from '../board-import-batches.js';
import {readImportRecovery,sealImportRecovery,verifyImportRecovery,
 clearImportRecovery,importDigest,durableRecoveryKey} from '../board-import-durable.js';
const userId='11111111-1111-4111-8111-111111111111';
const boardId='22222222-2222-4222-8222-222222222222';
const workspaceId='33333333-3333-4333-8333-333333333333';
const groupId='44444444-4444-4444-8444-444444444444';
const columnId='55555555-5555-4555-8555-555555555555';
const storage=()=>{
 const inner=new Map();return {getItem:k=>inner.get(k)??null,
  setItem:(k,v)=>inner.set(k,v),removeItem:k=>inner.delete(k),
  get entries(){return [...inner.entries()];}};
};
const auth={userId,getVerifiedUser:async()=>({id:userId})};
function setup(count=1001){
 let current={board:{id:boardId,workspace_id:workspaceId,name:'Import QA',
  status:'active',updated_at:'2026-11-12T00:00:00.000Z'},
  groups:[{id:groupId,title:'QA'}],columns:[{id:columnId,name:'Reference',
   data_type:'text',system_key:null,column_key:'col_ref',config:{}}],items:[],values:[]};
 const sheet={headers:['Name','Reference'],worksheet:'QA',
  rows:Array.from({length:count},(_,i)=>['Item '+i,'REF '+i]),
  rowNumbers:Array.from({length:count},(_,i)=>i+2)};
 const mappings=initialImportMappings(sheet,current);
 const group={action:'existing',groupId},matches={behavior:'add-new',matchColumnId:'item'};
 let calls=0,failed=false;
 const api={context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
  allowed:async()=>true,board:async()=>structuredClone(current),
  rpc:async(name,args)=>{
   if(name==='wm_board_ui_read')return {board_id:boardId};
   assert.equal(name,'wm_import_board_wizard_atomic');
   calls++;
   if(calls===2&&!failed){failed=true;const e=new Error('Definite rejection');e.status=409;throw e;}
   assert.equal(args.p_expected_updated_at,current.board.updated_at);
   for(const row of args.p_payload.rows){
    const index=current.items.length+1;
    const id='66666666-6666-4666-8666-'+String(index).padStart(12,'0');
    current.items.push({id,title:row.title,board_id:boardId,group_id:groupId,
     archived_at:null,updated_at:current.board.updated_at});
    current.values.push({item_id:id,column_id:columnId,value:row.values.Reference});
   }
   current.board.updated_at=new Date(Date.parse(current.board.updated_at)+1000).toISOString();
   return {created:args.p_payload.rows.length,updated:0,skipped:0,
    columnsCreated:0,groupsCreated:0};
  }};
 return {sheet,mappings,group,matches,api,auth,
  detail:()=>structuredClone(current),
  mutateBoard:fn=>fn(current),get calls(){return calls;}};
}
async function checkpointFixture(){
 const f=setup(),store=storage(),original=f.detail();
 const reviewed=buildImportPlan({sheet:f.sheet,detail:original,
  mappings:f.mappings,group:f.group,matches:f.matches});
 let saved;
 await assert.rejects(()=>executeBoardImportBatched({api:f.api,auth,
  detail:original,sheet:f.sheet,mappings:f.mappings,group:f.group,
  matches:f.matches,approvedPlan:reviewed,batchSize:500,
  onCheckpoint:async checkpoint=>{
   saved=await sealImportRecovery({checkpoint,fullSheet:f.sheet,
    worksheetIndex:0,userId,matches:f.matches,storage:store,crypt:webcrypto});
  }}),e=>e.status===409);
 assert.equal(saved.completed,500);
 assert.equal(f.detail().items.length,500);
 return {f,store,reviewed,saved};
}
test('CP-BIMP-15A durable marker persists no source rows, text cells, or credentials',async()=>{
 const {store,saved}=await checkpointFixture();
 const encoded=store.getItem(durableRecoveryKey(userId,boardId));
 assert.ok(encoded);
 assert.equal(encoded.includes('REF 0'),false);
 assert.equal(encoded.includes('Item 0'),false);
 assert.equal(encoded.includes('headers'),false);
 assert.equal(encoded.includes('values'),false);
 assert.equal(saved.completed,500);
 assert.equal(saved.receipt.created,500);
 const restored=readImportRecovery({storage:store,userId,boardId});
 assert.deepEqual(restored,saved);
});
test('CP-BIMP-15A restart with identical re-upload verifies and imports only the remaining 501 rows',async()=>{
 const {f,store}=await checkpointFixture();
 const marker=readImportRecovery({storage:store,userId,boardId});
 const current=f.detail();
 const restMappings=initialImportMappings(f.sheet,current);
 const verified=await verifyImportRecovery({marker,fullSheet:f.sheet,
  worksheetIndex:0,detail:current,mappings:restMappings,
  group:f.group,matches:f.matches,userId,workspaceId,crypt:webcrypto});
 assert.equal(verified.remainder.rows.length,501);
 const receipt=await executeBoardImportBatched({api:f.api,auth,
  detail:current,sheet:verified.remainder,mappings:restMappings,
  group:f.group,matches:f.matches,approvedPlan:verified.plan,batchSize:500});
 assert.equal(receipt.created,501);
 assert.equal(f.calls,4);
 assert.equal((await f.api.board(boardId)).items.length,1001);
 assert.equal(f.detail().values.at(-1).value,'REF 1000');
 clearImportRecovery({storage:store,userId,boardId});
 assert.equal(readImportRecovery({storage:store,userId,boardId}),null);
});
test('CP-BIMP-15A changed or tampered workbook rejects recovery without server mutation',async()=>{
 const {f,store}=await checkpointFixture();
 const marker=readImportRecovery({storage:store,userId,boardId});
 const changed=structuredClone(f.sheet);changed.rows[900][1]='replaced';
 await assert.rejects(()=>verifyImportRecovery({marker,fullSheet:changed,
  worksheetIndex:0,detail:f.detail(),mappings:f.mappings,
  group:f.group,matches:f.matches,userId,workspaceId,crypt:webcrypto}),
  /source worksheet differs/);
 assert.equal(f.calls,2);
});
test('CP-BIMP-15A independently edited board rejects stale recovery',async()=>{
 const {f,store}=await checkpointFixture();
 const marker=readImportRecovery({storage:store,userId,boardId});
 f.mutateBoard(board=>{board.values[0].value='modified';});
 await assert.rejects(()=>verifyImportRecovery({marker,fullSheet:f.sheet,
  worksheetIndex:0,detail:f.detail(),mappings:f.mappings,
  group:f.group,matches:f.matches,userId,workspaceId,crypt:webcrypto}),
  /destination board has changed/);
 assert.equal(f.calls,2);
});
test('CP-BIMP-15A wrong user/workspace/worksheet and altered mapping fail closed',async()=>{
 const {f,store}=await checkpointFixture();
 const marker=readImportRecovery({storage:store,userId,boardId});
 const options={marker,fullSheet:f.sheet,worksheetIndex:0,
  detail:f.detail(),mappings:f.mappings,group:f.group,matches:f.matches,
  userId,workspaceId,crypt:webcrypto};
 await assert.rejects(()=>verifyImportRecovery({...options,
  userId:'77777777-7777-4777-8777-777777777777'}),/metadata/);
 await assert.rejects(()=>verifyImportRecovery({...options,worksheetIndex:2}),/metadata/);
 await assert.rejects(()=>verifyImportRecovery({...options,
  mappings:[...f.mappings.slice(0,1),{...f.mappings[1],action:'skip',requiresDecision:false}]}),
  /remaining import mapping/);
 assert.equal(f.calls,2);
});
test('CP-BIMP-15A secure digest rejects missing crypto and is stable across reload',async()=>{
 const a=await importDigest({a:1,rows:['X']},webcrypto);
 assert.equal(a.length,64);
 assert.equal(a,await importDigest({a:1,rows:['X']},webcrypto));
 await assert.rejects(()=>importDigest({a:1},{}),/Secure workbook recovery hashing/);
});
