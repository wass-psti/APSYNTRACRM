import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fixture,workspaceId,userId,boardId,group,id} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
import {reviewMaterialImport,importReviewDigest,executeMaterialImport,importRecoveryKey,readMaterialImportRecovery} from '../apps/MaterialSourcing/bulk-import.js';
import {renderNativeMaterialSourcing} from '../apps/MaterialSourcing/native-screen.js';
const headers=['Part number','Source type','Brand','Material description','Quantity','Buying price','Currency'];
const row=(name,qty='2')=>[name,'Local','Synthetic brand','Synthetic description',qty,'100.50','PHP'];
const sheet=(...rows)=>({headers,rows});
test('preview rejects invalid values and skips repeated and existing archived part numbers',()=>{
 const detail=fixture();detail.items[0].archived_at='2026-11-28T00:00:00Z';
 const review=reviewMaterialImport(sheet(row('new'),row('synthetic-b'),row('Dupe'),row(' dupe '),row('invalid','-2')),detail,workspaceId);
 assert.deepEqual(review.map(r=>r.state),['ready','skipped','skipped','skipped','rejected']);
 assert.equal(review[0].plan.protectedValues[0].value,100.5);
 assert.equal(review[0].plan.ordinary.find(f=>f.name==='Quantity').value,2);
});
test('unknown columns, incomplete board, omitted and formula rows are not silently ignored',()=>{
 const detail=fixture(),s=sheet(row('a'));
 assert.throws(()=>reviewMaterialImport({...s,headers:[...headers,'Unknown']},detail,workspaceId),/unknown/i);
 assert.throws(()=>reviewMaterialImport({...s,omittedRows:[9]},detail,workspaceId),/Clean/);
 assert.throws(()=>reviewMaterialImport({...s,formulaWarnings:[{}]},detail,workspaceId),/Clean/);
 assert.throws(()=>reviewMaterialImport(s,{...detail,pagination:{has_more:true}},workspaceId),/Complete/);
});
function setup(){
 const detail=fixture(),receipts=new Map(),cells=new Map(),data=new Map(),writes=[];
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:userId})};
 let lose=false;
 const api={allowed:async()=>true,context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
  board:async()=>structuredClone(detail),invalidateBoardCache:()=>{},
  rpc:async(name,args)=>{
   if(name==='material_request_hub_bootstrap')return {workspaceId,role:'ADMIN'};
   if(name==='mrh_material_create_receipt'){
    const item_id=receipts.get(args.p_request_id);
    return item_id?{request_id:args.p_request_id,item_id,status:'committed'}:{request_id:args.p_request_id,status:'unresolved'};
   }
   if(name==='mrh_sourcing_board_viewer_read')return cells.get(args.p_item_id)||{};
   assert.equal(name,'mrh_create_material_atomic');
   const item_id=id(500+writes.length);writes.push(args.p_request_id);receipts.set(args.p_request_id,item_id);
   detail.items.push({id:item_id,board_id:boardId,group_id:group.id,title:args.p_part_number,archived_at:null});
   for(const field of args.p_public_fields)detail.values.push({item_id,column_id:detail.columns.find(c=>c.name===field.name).id,value:field.value});
   cells.set(item_id,Object.fromEntries(Object.entries(args.p_private_fields).map(([key,value])=>[key,{value,revision:1}])));
   if(lose){lose=false;throw Error('lost response');}
   return {item_id,request_id:args.p_request_id,created:true};
  }};
 return {detail,storage,writes,lose:()=>{lose=true;},options:{api,auth,workspaceId,storage,locks:null,crypt:webcrypto}};
}
test('interrupted creation resumes same receipt without repeating the first write',async()=>{
 const f=setup(),source=sheet(row('BATCH-A'),row('BATCH-B'));
 let review=reviewMaterialImport(source,f.detail,workspaceId),approvedDigest=await importReviewDigest(review,webcrypto);
 f.lose();
 await assert.rejects(executeMaterialImport({...f.options,review,approvedDigest}),/lost response/);
 const key=importRecoveryKey(userId,workspaceId),marker=readMaterialImportRecovery(f.storage,key);
 assert.equal(marker.rows.length,2);assert.equal(f.writes.length,1);
 assert.doesNotMatch(f.storage.getItem(key),/BATCH-A|Synthetic brand|100.5/);
 review=reviewMaterialImport(source,f.detail,workspaceId);
 assert.equal(review[0].state,'skipped');
 assert.equal(await importReviewDigest(review,webcrypto),approvedDigest);
 const result=await executeMaterialImport({...f.options,review,approvedDigest});
 assert.deepEqual(result.map(x=>x.state),['recovered','verified']);
 assert.equal(f.writes.length,2);assert.equal(f.writes[0],marker.rows[0].requestId);
 assert.equal(readMaterialImportRecovery(f.storage,key),null);
});
test('new duplicate after preview stops without creating any record',async()=>{
 const f=setup(),review=reviewMaterialImport(sheet(row('BATCH-A')),f.detail,workspaceId);
 const approvedDigest=await importReviewDigest(review,webcrypto);
 f.detail.items.push({id:id(999),group_id:group.id,title:'BATCH-A'});
 await assert.rejects(executeMaterialImport({...f.options,review,approvedDigest}),/matching part number/);
 assert.equal(f.writes.length,0);
});
test('signed native route exposes import to editors, not read-only viewers',()=>{
 const detail=fixture();
 assert.match(renderNativeMaterialSourcing(detail,{},new Date(),{workspaceId,canCreate:true}),/data-action="mrh-native-import"/);
 assert.doesNotMatch(renderNativeMaterialSourcing(detail,{},new Date(),{workspaceId,canCreate:false}),/data-action="mrh-native-import"/);
});
