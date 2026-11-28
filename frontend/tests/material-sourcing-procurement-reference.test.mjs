import test from 'node:test';
import assert from 'node:assert/strict';
import {id,workspaceId,userId,boardId,fixture} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
import {procurementFixture} from '../../scripts/fixtures/cp-ms-crm-05d-procurement-fixture.mjs';
import {SUPPLIER_PO_BOARD_ID,projectProcurementReferences,filterProcurementReferences,readProcurementReferences} from '../apps/MaterialSourcing/procurement-reference.js';
import {renderNativeMaterialSourcing} from '../apps/MaterialSourcing/native-screen.js';

test('historical procurement projection retains source UUIDs, excludes archived records and groups only normalized names',()=>{
 const source=procurementFixture(),result=projectProcurementReferences(source,workspaceId);
 assert.equal(result.records.length,3);
 assert.deepEqual(result.suppliers,[{name:'Synthetic Supplier',count:2}]);
 assert.equal(result.unnamed,1);
 assert.equal(result.records[0].id,id(650));
 assert.equal(result.records[0].clientReference,'CLIENT-123');
 assert.equal(result.records[1].legacyMaterialReference,'<unverified legacy reference>');
 assert.equal(result.records[2].supplier,'');
 assert.equal(filterProcurementReferences(result.records,'client-123').length,1);
 assert.equal(filterProcurementReferences(result.records,'','SYNTHETIC SUPPLIER').length,2);
 assert.equal(filterProcurementReferences(result.records,'po-test-003','Synthetic Supplier').length,0);
 assert.equal(filterProcurementReferences(result.records,id(651))[0].reference,'PO-TEST-002');
 assert.equal(filterProcurementReferences(result.records,'ARCHIVED').length,0);
});
test('source projection rejects partial, foreign, duplicate or malformed source data',()=>{
 for(const change of [
  d=>{d.pagination.has_more=true;},d=>{d.pagination.loaded=false;},
  d=>{d.board.workspace_id=id(999);},d=>{d.board.status='archived';},
  d=>{d.items[1].id=d.items[0].id;},d=>{d.items[1].board_id=boardId;},
  d=>{d.columns=d.columns.slice(1);},d=>{d.values.push(d.values[0]);},
  d=>{d.values[0].value={unexpected:true};}
 ]){
  const detail=procurementFixture();change(detail);
  assert.throws(()=>projectProcurementReferences(detail,workspaceId));
 }
});
function signedFixture(){
 const calls=[],auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:auth.userId})};
 let denied=null,contextWorkspace=workspaceId;
 const api={
  context:async()=>({user_id:userId,workspace_id:contextWorkspace,profile:{status:'active'}}),
  allowed:async(id,access)=>{calls.push(['allowed',id,access]);return denied!==id;},
  board:async(id,options)=>{calls.push(['board',id,options]);return procurementFixture();},
  rpc:async()=>{throw Error('Unexpected RPC');}
 };
 return {auth,api,calls,deny:id=>{denied=id;},foreign:()=>{contextWorkspace='33333333-3333-4333-8333-000000000999';}};
}
test('signed procurement lookup reads only existing authorized complete source board',async()=>{
 const f=signedFixture();
 const result=await readProcurementReferences({...f,workspaceId});
 assert.equal(result.records.length,3);
 assert.deepEqual(f.calls,[['allowed',boardId,'view'],['allowed',SUPPLIER_PO_BOARD_ID,'view'],['board',SUPPLIER_PO_BOARD_ID,{complete:true}]]);
});
test('source and material board denial prevent loading the procurement board',async()=>{
 for(const denied of [boardId,SUPPLIER_PO_BOARD_ID]){
  const f=signedFixture();f.deny(denied);
  await assert.rejects(readProcurementReferences({...f,workspaceId}));
  assert.ok(!f.calls.some(c=>c[0]==='board'));
 }
});
test('workspace or route departure fails closed before or after source read',async()=>{
 const f=signedFixture();f.foreign();
 await assert.rejects(readProcurementReferences({...f,workspaceId}));assert.equal(f.calls.length,0);
 const g=signedFixture();let current=true;
 const read=g.api.board;g.api.board=async(...args)=>{current=false;return read(...args);};
 await assert.rejects(readProcurementReferences({...g,workspaceId,isCurrent:()=>current}),/view changed/);
});
test('native sourcing list exposes the reference panel without an editor-only gate',()=>{
 const detail=fixture();
 for(const canCreate of [true,false]){
  const html=renderNativeMaterialSourcing(detail,{},new Date(),{workspaceId,canCreate});
  assert.match(html,/data-action="mrh-native-procurement-references"/);
  assert.match(html,/data-ms-procurement-references hidden/);
 }
 const html=renderNativeMaterialSourcing(detail,{},new Date(),{workspaceId,canCreate:true,view:'add'});
 assert.doesNotMatch(html,/data-action="mrh-native-procurement-references"/);
});
