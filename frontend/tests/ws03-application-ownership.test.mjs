import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WS03_APP_OWNER_TRANSFER_ENABLED,APP_OWNER_SUPPORTED_MODULES,
 normalizeAppOwnerCapabilities,validateAppOwnerTransfer,AppOwnerTransferClient
} from '../application-ownership.js';
const workspace='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const owner='33333333-3333-4333-8333-333333333333';
const target='44444444-4444-4444-8444-444444444444';
const requestId='55555555-5555-4555-8555-555555555555';
const signed={schemaVersion:1,workspaceId:workspace,actorId:actor,authorized:true,
 apps:[{moduleId:'material-request-hub',ownerUserId:owner,
  canTransfer:true,transferAuthority:'owner'}]};
test('apps are independently authorized and the transfer transport stays off',()=>{
 assert.equal(WS03_APP_OWNER_TRANSFER_ENABLED,false);
 assert.ok(APP_OWNER_SUPPORTED_MODULES.includes('material-request-hub'));
 assert.ok(APP_OWNER_SUPPORTED_MODULES.includes('order-intake'));
 assert.equal(APP_OWNER_SUPPORTED_MODULES.includes('unregistered-app'),false);
});
test('only backend-signed known module ownership is usable',()=>{
 const caps=normalizeAppOwnerCapabilities(signed,{userId:actor,workspaceId:workspace});
 assert.equal(caps.status,'SIGNED_APP_OWNER_CAPABILITIES');
 assert.equal(caps.canTransfer,true);
 for(const bad of [
  null,{...signed,authorized:false},
  {...signed,workspaceId:owner},
  {...signed,actorId:owner},
  {...signed,apps:[...signed.apps,...signed.apps]},
  {...signed,apps:[{...signed.apps[0],transferAuthority:'admin'}]},
  {...signed,apps:[{...signed.apps[0],ownerUserId:'invalid'}]},
  {...signed,apps:[{...signed.apps[0],moduleId:'hidden-module'}]},
  {...signed,apps:[{...signed.apps[0],canTransfer:false}]}
 ]){
  assert.equal(normalizeAppOwnerCapabilities(bad,{
   userId:actor,workspaceId:workspace
  }).status,'UNAVAILABLE');
 }
});
test('transfer payload cannot create an owner without an existing owner and exact module',()=>{
 const valid={workspaceId:workspace,moduleId:'material-request-hub',
  expectedOwnerId:owner,targetUserId:target,requestId};
 assert.deepEqual(validateAppOwnerTransfer(valid),valid);
 assert.equal(validateAppOwnerTransfer({...valid,targetUserId:owner}),null);
 assert.equal(validateAppOwnerTransfer({...valid,moduleId:'another-application'}),null);
 assert.equal(validateAppOwnerTransfer({...valid,workspaceId:'invalid'}),null);
});
test('disabled client makes zero Auth, RPC or network requests',async()=>{
 let touched=0;
 const client=new AppOwnerTransferClient({auth:{
  getVerifiedUser:async()=>{touched++;return {id:actor};},
  authorized:async()=>{touched++;}
 },api:{context:async()=>{touched++;}}});
 await assert.rejects(client.readCapabilities(workspace),/not activated/);
 const req={workspaceId:workspace,moduleId:'material-request-hub',
  expectedOwnerId:owner,targetUserId:target,requestId};
 await assert.rejects(client.transfer(req,
  normalizeAppOwnerCapabilities(signed,{userId:actor,workspaceId:workspace})),/not activated/);
 assert.equal(touched,0);
});
test('signed simulated transfer and verify receipts must match resource and request',async()=>{
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor}),
  authorized:async(path,{method,body,retryUnauthorized})=>{
   assert.equal(path,'/functions/v1/ws03-app-ownership');
   assert.equal(method,'POST');
   assert.equal(retryUnauthorized,false);
   if(body.operation==='capabilities')return signed;
   if(body.operation==='transfer')return {
    schemaVersion:1,actorId:actor,workspaceId:workspace,
    moduleId:body.request.moduleId,requestId,
    targetUserId:target,committed:true
   };
   return {schemaVersion:1,actorId:actor,workspaceId:workspace,
    moduleId:body.request.moduleId,requestId,currentOwnerId:target,verified:true};
 }};
 const api={context:async()=>({
  user_id:actor,workspace_id:workspace,profile:{status:'active'}
 })};
 const client=new AppOwnerTransferClient({auth,api,enabled:true});
 const caps=await client.readCapabilities(workspace);
 const req={workspaceId:workspace,moduleId:'material-request-hub',
  expectedOwnerId:owner,targetUserId:target,requestId};
 assert.equal((await client.transfer(req,caps)).state,'COMMITTED');
 assert.equal((await client.verify(req)).verified,true);
});
test('frontend cannot reinterpret global app Admin as ownership',async()=>{
 const unsigned=normalizeAppOwnerCapabilities({...signed,
  apps:[{moduleId:'order-intake',ownerUserId:owner,
    canTransfer:false,transferAuthority:null}]
 },{userId:actor,workspaceId:workspace});
 assert.equal(unsigned.canTransfer,false);
 const client=new AppOwnerTransferClient({enabled:true});
 await assert.rejects(client.transfer({
  workspaceId:workspace,moduleId:'order-intake',expectedOwnerId:owner,
  targetUserId:target,requestId
 },unsigned),/not verified/i);
});
