import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceInvitationClient,WS02D_INVITE_CLIENT_ENABLED,
 normalizeInvitationDeliveryReceipt} from '../workspace-invitation-client.js';

const id='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const invitationId='44444444-4444-4444-8444-444444444444';
const draft={workspaceId:workspace,requestId,email:' PERSON@EXAMPLE.INVALID ',role:'member',message:'Welcome'};
const receipt={invitationId,state:'delivery-submitted'};
function setup({enabled=true,actor=id,workspaceId=workspace,status='active',response=receipt,throwError=null}={}){
 const calls=[];
 const auth={userId:id,getVerifiedUser:async()=>({id:actor}),
  authorized:async(path,opts)=>{calls.push({path,opts});if(throwError)throw throwError;return response;}};
 const api={context:async()=>({user_id:id,workspace_id:workspaceId,profile:{status}})};
 return {calls,client:new WorkspaceInvitationClient({auth,api,enabled})};
}
test('disabled by default and opt-out never call trusted backend',async()=>{
 assert.equal(WS02D_INVITE_CLIENT_ENABLED,false);
 const {client,calls}=setup({enabled:false});
 await assert.rejects(client.send(draft),{status:503});
 assert.equal(calls.length,0);
});
test('one Member recipient uses signed HTTPS function with stable request ID',async()=>{
 const {client,calls}=setup();
 assert.deepEqual(await client.send(draft),receipt);
 assert.deepEqual(calls,[{path:'/functions/v1/ws02d-invite',opts:{
  method:'POST',retryUnauthorized:false,
  body:{workspaceId:workspace,requestId,email:'person@example.invalid',role:'member',message:'Welcome'}
 }}]);
 assert.equal(Object.isFrozen(normalizeInvitationDeliveryReceipt(receipt)),true);
});
test('client rejects unsanctioned role and malformed request before backend call',async()=>{
 const {client,calls}=setup();
 for(const d of [
  {...draft,role:'admin'},{...draft,role:'viewer'},{...draft,email:'bad'},
  {...draft,workspaceId:'../foreign'},{...draft,requestId:''},
  {...draft,message:'\0test'},{...draft,message:'X'.repeat(501)}
 ])await assert.rejects(client.send(d),{status:400});
 assert.equal(calls.length,0);
});
test('unverified caller, foreign workspace and disabled profile fail closed',async()=>{
 for(const options of [{actor:'55555555-5555-4555-8555-555555555555'},
  {workspaceId:'66666666-6666-4666-8666-666666666666'},{status:'disabled'}]){
  const {client,calls}=setup(options);
  await assert.rejects(client.send(draft),{status:403});
  assert.equal(calls.length,0);
 }
});
test('unconfirmed result or failed response must never imply an invite was sent',async()=>{
 for(const response of [null,{}, {state:'delivery-submitted',invitationId:'invalid'},
  {state:'pending',invitationId},{state:'provider-error',invitationId}]){
  const {client,calls}=setup({response});
  await assert.rejects(client.send(draft),{status:409});
  assert.equal(calls.length,1);
 }
 const {client}=setup({response:{invitationId,state:'already-issued'}});
 assert.deepEqual(await client.send(draft),{invitationId,state:'already-issued'});
});
test('redact provider and token details; never automatically resend on timeout',async()=>{
 const secret='secret-token-and-private-recipient';
 for(const status of [0,400,401,403,404,429,500,503]){
  const {client,calls}=setup({throwError:{status,message:secret}});
  await assert.rejects(client.send(draft),error=>{
   assert.equal(error.message.includes(secret),false);
   return true;
  });
  assert.equal(calls.length,1);
 }
});
test('session or workspace changing after a possible send makes receipt unconfirmed',async()=>{
 let count=0;
 const auth={userId:id,getVerifiedUser:async()=>({id}),authorized:async()=>receipt};
 const api={context:async()=>({user_id:id,workspace_id:++count===1?workspace:'77777777-7777-4777-8777-777777777777',profile:{status:'active'}})};
 const client=new WorkspaceInvitationClient({auth,api,enabled:true});
 await assert.rejects(client.send(draft),{status:409});
});
