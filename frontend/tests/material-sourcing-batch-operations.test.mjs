import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,workspaceId,userId,boardId,group,id} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
import {reviewBatchOperation,executeBatchOperation} from '../apps/MaterialSourcing/batch-operations.js';
const ids=[id(200),id(201)];
function setup(){
 const detail=fixture(),writes=[],cells=new Map(ids.map(item=>[item,{'Buying Price':{value:10,revision:1}}]));
 let failSecond=false;
 const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:userId})};
 const api={allowed:async()=>true,context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
 board:async()=>structuredClone(detail),invalidateBoardCache:()=>{},rpc:async(name,args)=>{
  if(name==='material_request_hub_bootstrap')return {workspaceId,role:'ADMIN'};
  if(name==='mrh_sourcing_board_viewer_read')return cells.get(args.p_item_id)||{};
  writes.push({name,args});
  if(failSecond&&writes.length===2)throw Error('simulated uncertain response');
  if(name==='wm_set_board_item_archived'){
   detail.items.find(i=>i.id===args.p_item_id).archived_at=args.p_archived?'2026-11-28T12:00:00Z':null;
   return null;
  }
  assert.equal(name,'mrh_edit_material_atomic');
  for(const change of args.p_public_changes){
   let cell=detail.values.find(v=>v.item_id===args.p_item_id&&v.column_id===change.column_id);
   if(cell)cell.value=change.value;
   else detail.values.push({item_id:args.p_item_id,column_id:change.column_id,value:change.value});
  }
  for(const change of args.p_private_changes){
   const old=cells.get(args.p_item_id);
   assert.equal(old[change.field_name].revision,change.expected_revision);
   old[change.field_name]={value:change.value,revision:change.expected_revision+1};
  }
  return {item_id:args.p_item_id,public_count:args.p_public_changes.length,private_count:args.p_private_changes.length};
 }};
 return {detail,writes,cells,api,auth,scope:{api,auth,workspaceId},fail:()=>{failSecond=true;}};
}
test('batch ordinary edit previews expected values and uses one existing atomic edit per material',async()=>{
 const f=setup();
 const review=await reviewBatchOperation({...f.scope,itemIds:ids,action:'edit',field:'quantity',value:'4'});
 assert.deepEqual(review.rows.map(r=>r.publicChanges[0].expectedValue),[0,2.5]);
 assert.equal(f.writes.length,0);
 const result=await executeBatchOperation({...f.scope,review});
 assert.equal(result.complete,true);assert.equal(f.writes.length,2);
 assert.ok(result.results.every(r=>r.state==='verified'));
});
test('commercial edit reuses protected revision and preserves per-item verification',async()=>{
 const f=setup();
 const review=await reviewBatchOperation({...f.scope,itemIds:ids,action:'edit',field:'Buying Price',value:'100.50'});
 assert.ok(review.rows.every(r=>r.privateChanges[0].expectedRevision===1));
 const result=await executeBatchOperation({...f.scope,review});
 assert.equal(result.complete,true);
 assert.ok(ids.every(id=>f.cells.get(id)['Buying Price'].revision===2));
});
test('archive and restore keep the same UUIDs and material values',async()=>{
 const f=setup(),original=structuredClone(f.detail.values);
 for(const action of ['archive','restore']){
  const review=await reviewBatchOperation({...f.scope,itemIds:ids,action});
  assert.equal((await executeBatchOperation({...f.scope,review})).complete,true);
 }
 assert.equal(f.writes.length,4);
 assert.deepEqual(f.detail.items.slice(0,2).map(i=>i.id),ids);
 assert.ok(f.detail.items.every(i=>!i.archived_at));
 assert.deepEqual(f.detail.values,original);
});
test('uncertain row stops later writes and reports verified prefix',async()=>{
 const f=setup();f.fail();
 const review=await reviewBatchOperation({...f.scope,itemIds:[...ids,id(202)],action:'archive'});
 const result=await executeBatchOperation({...f.scope,review});
 assert.equal(result.complete,false);assert.equal(result.remaining,1);
 assert.deepEqual(result.results.map(r=>r.state),['verified','needs reconciliation']);
 assert.equal(f.writes.length,2);
});
test('duplicate, archived and foreign selection rejected before writes',async()=>{
 const f=setup();
 await assert.rejects(reviewBatchOperation({...f.scope,itemIds:[ids[0],ids[0]],action:'archive'}),/distinct/);
 await assert.rejects(reviewBatchOperation({...f.scope,itemIds:[id(999)],action:'archive'}),/not in the loaded/);
 await assert.rejects(reviewBatchOperation({...f.scope,itemIds:ids,action:'restore'}),/lifecycle state/);
 assert.equal(f.writes.length,0);
});
