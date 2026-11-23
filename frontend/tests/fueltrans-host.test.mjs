import test from 'node:test';
import assert from 'node:assert/strict';
import {connectFuelTrans,listTickets,insertTicket,verifiedUser} from '../fueltrans/supabase-client.js';
const workspaceId='00000000-0000-4000-8000-000000000001',userId='actor';
function context(edit=true,onMutation=()=>{}){return {workspaceId,userId,boardId:'board',onMutation,isCurrent:()=>true,
 auth:{getVerifiedUser:async()=>({id:userId}),token:async()=>'test-token'},
 api:{rpc:async()=>true,context:async()=>({user_id:userId,workspace_id:workspaceId}),board:async()=>({board:{workspace_id:workspaceId,name:'FuelTrans Standalone'}}),allowed:async(_,permission)=>permission==='view'||edit}};}
test('FuelTrans verifiedUser reuses the host-verified identity without a second Auth request',async()=>{
 const original=globalThis.fetch;let authReads=0,networkCalls=0;
 globalThis.fetch=async()=>{networkCalls++;throw Error('duplicate /auth/v1/user request');};
 const host=context();
 host.auth.getVerifiedUser=async()=>{authReads++;return {id:userId,email:'user@example.test'};};
 const disconnect=connectFuelTrans(host);
 try{
  assert.deepEqual(await verifiedUser(),{id:userId,email:'user@example.test'});
  assert.equal(authReads,1);
  assert.equal(networkCalls,0);
 }finally{disconnect();globalThis.fetch=original;}
});

test('FuelTrans locks requests to current board workspace and current host lifetime',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('[]',{headers:{'content-type':'application/json','content-range':'*/0'}});};
 const disconnect=connectFuelTrans(context());
 try{
  assert.deepEqual((await listTickets('workspace_id=eq.'+workspaceId)).rows,[]);
  await assert.rejects(listTickets('workspace_id=eq.foreign'),/workspace/);
  assert.equal(calls,1);disconnect();
  await assert.rejects(listTickets('workspace_id=eq.'+workspaceId),/authorized CRM board/);
 }finally{disconnect();globalThis.fetch=original;}
});
test('FuelTrans denies mutation for board viewers before transmission',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('should not send');};
 const disconnect=connectFuelTrans(context(false));
 try{await assert.rejects(insertTicket({workspace_id:workspaceId}),/editing permission/);assert.equal(calls,0);}
 finally{disconnect();globalThis.fetch=original;}
});
test('FuelTrans publishes a content-free host invalidation only after successful writes',async()=>{
 const original=globalThis.fetch;let mutations=0;
 globalThis.fetch=async()=>new Response(JSON.stringify([{id:'ticket-1',workspace_id:workspaceId}]),{
  status:201,headers:{'content-type':'application/json','content-range':'*/1'}
 });
 const disconnect=connectFuelTrans(context(true,()=>mutations++));
 try{
  const result=await insertTicket({workspace_id:workspaceId});
  assert.equal(result.id,'ticket-1');assert.equal(mutations,1);
 }finally{disconnect();globalThis.fetch=original;}
});
test('FuelTrans does not publish failed writes or ordinary reads',async()=>{
 const original=globalThis.fetch;let mutations=0;
 globalThis.fetch=async(url,options)=>{
  if(options.method==='GET')return new Response('[]',{headers:{'content-type':'application/json','content-range':'*/0'}});
  return new Response(JSON.stringify({message:'denied'}),{status:403,headers:{'content-type':'application/json'}});
 };
 const disconnect=connectFuelTrans(context(true,()=>mutations++));
 try{
  await listTickets('workspace_id=eq.'+workspaceId);
  assert.equal(mutations,0);
  await assert.rejects(insertTicket({workspace_id:workspaceId}),/denied/);
  assert.equal(mutations,0);
 }finally{disconnect();globalThis.fetch=original;}
});
test('FuelTrans discards a response after workspace or identity context changes',async()=>{
 const original=globalThis.fetch;const first=context();let replacement;
 globalThis.fetch=async()=>{replacement=connectFuelTrans(context());return new Response('[]');};
 const disconnect=connectFuelTrans(first);
 try{await assert.rejects(listTickets('workspace_id=eq.'+workspaceId),/view changed/);}
 finally{disconnect();replacement?.();globalThis.fetch=original;}
});
