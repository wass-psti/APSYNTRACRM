import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,workspaceId,userId,boardId,group,id} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
import {DomainApi} from '../data.js';
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

test('real DomainApi commercial read cannot invalidate simultaneous atomic edit board readback',async()=>{
 const detail=fixture();
 detail.items.forEach((row,index)=>{row.position=index;});
 const cells=new Map(ids.map(item=>[item,{'Buying Price':{value:10,revision:1}}]));
 const writes=[],readOptions=[];
 let releaseBoard;
 const gate=new Promise(resolve=>{releaseBoard=resolve;});
 let gateNext=false;
 const auth={isSignedIn:true,userId,accessToken:'synthetic-signed-token',getVerifiedUser:async()=>({id:userId}),
  authorized:async(path,options)=>{
   const name=path.split('/').at(-1),args=options.body;
   if(name==='wm_auth_access_context')return {user_id:userId,workspace_id:workspaceId,profile:{status:'active'}};
   if(name==='work_board_access')return true;
   if(name==='material_request_hub_bootstrap')return {workspaceId,role:'ADMIN'};
   if(name==='wm_get_board_shell')return {board:detail.board,groups:detail.groups,columns:detail.columns,members:[]};
   if(name==='wm_get_board_items_page'){
    if(gateNext)await gate;
    return {items:structuredClone(detail.items),values:structuredClone(detail.values),has_more:false,next_cursor:null};
   }
   if(name==='mrh_sourcing_board_viewer_read'){
    readOptions.push(options.requestKind);
    if(gateNext)releaseBoard();
    return structuredClone(cells.get(args.p_item_id)||{});
   }
   assert.equal(name,'mrh_edit_material_atomic');writes.push(args);
   const change=args.p_private_changes[0],row=cells.get(args.p_item_id);
   assert.equal(row[change.field_name].revision,change.expected_revision);
   row[change.field_name]={value:change.value,revision:change.expected_revision+1};
   gateNext=true;
   return {item_id:args.p_item_id,public_count:0,private_count:1};
  }};
 const api=new DomainApi(auth),scope={api,auth,workspaceId};
 const review=await reviewBatchOperation({...scope,itemIds:ids,action:'edit',field:'Buying Price',value:'150.75'});
 const result=await executeBatchOperation({...scope,review});
 assert.equal(result.complete,true);
 assert.deepEqual(result.results.map(r=>r.state),['verified','verified']);
 assert.equal(writes.length,2);
 assert.ok(readOptions.every(kind=>kind==='read'));
 assert.ok(ids.every(item=>cells.get(item)['Buying Price'].revision===2));
});
test('single transient post-receipt board invalidation re-reads without replaying a mutation',async()=>{
 const f=setup(),review=await reviewBatchOperation({...f.scope,itemIds:ids,action:'edit',field:'Buying Price',value:'150.75'});
 const original=f.api.board;let reads=0;
 f.api.board=async()=>{if(++reads===1)throw Object.assign(Error('invalidated'),{code:'BOARD_READ_INVALIDATED'});return original();};
 const result=await executeBatchOperation({...f.scope,review});
 assert.equal(result.complete,true);assert.equal(reads,3);assert.equal(f.writes.length,2);
});
test('repeated invalidation stops after one read retry and never replays or advances writes',async()=>{
 const f=setup(),review=await reviewBatchOperation({...f.scope,itemIds:ids,action:'edit',field:'Buying Price',value:'150.75'});
 let reads=0;
 f.api.board=async()=>{reads++;throw Object.assign(Error('invalidated'),{code:'BOARD_READ_INVALIDATED'});};
 const result=await executeBatchOperation({...f.scope,review});
 assert.equal(result.complete,false);assert.equal(result.remaining,1);assert.equal(reads,2);assert.equal(f.writes.length,1);
 assert.equal(f.cells.get(ids[0])['Buying Price'].revision,2);
 assert.equal(f.cells.get(ids[1])['Buying Price'].revision,1);
});
test('post-save departure during invalidation prevents a retry and the next write',async()=>{
 const f=setup(),review=await reviewBatchOperation({...f.scope,itemIds:ids,action:'edit',field:'Buying Price',value:'150.75'});
 let current=true,reads=0;
 f.api.board=async()=>{reads++;current=false;throw Object.assign(Error('invalidated'),{code:'BOARD_READ_INVALIDATED'});};
 const result=await executeBatchOperation({...f.scope,review,isCurrent:()=>current});
 assert.equal(result.complete,false);assert.equal(result.remaining,1);assert.equal(reads,1);assert.equal(f.writes.length,1);
});
