import test from 'node:test';
import assert from 'node:assert/strict';
import {createResendInvitationProvider} from '../ws02d-resend-provider.mjs';
const invitationId='11111111-1111-4111-8111-111111111111';
const providerId='22222222-2222-4222-8222-222222222222';
const envelope={invitationId,to:'recipient@example.invalid',subject:'Workspace invitation',
 text:'Sign in: https://wass-psti.github.io/APSYNTRACRM/#/invitations/accept/'+invitationId+'.'+'ab'.repeat(32)};
const args={enabled:true,apiKey:'re_exampleSecretNeverSentToBrowser123456',
 verifiedSender:'noreply@verified.example.com'};
test('missing credentials, unverified sender and default-off fail closed',async()=>{
 for(const options of [{},{...args,enabled:false},{...args,apiKey:''},
  {...args,verifiedSender:'onboarding@resend.dev'}, {...args,verifiedSender:''}]){
  let called=false;
  const send=createResendInvitationProvider({...options,fetchImpl:async()=>{called=true;throw Error('sent');}});
  await assert.rejects(send(envelope),/provider unavailable/);
  assert.equal(called,false);
 }
});
test('signed email receipt is provider-submitted only and uses stable idempotency key',async()=>{
 const calls=[];
 const send=createResendInvitationProvider({...args,fetchImpl:async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>({id:providerId})};
 }});
 const receipt=await send(envelope);
 assert.deepEqual(receipt,{accepted:true,providerMessageId:providerId});
 assert.equal(Object.isFrozen(receipt),true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.resend.com/emails');
 assert.equal(calls[0].options.headers['idempotency-key'],'apsyntra-ws02d-'+invitationId);
 assert.equal(calls[0].options.headers.authorization,'Bearer '+args.apiKey);
 assert.equal(calls[0].options.redirect,'error');
 assert.deepEqual(JSON.parse(calls[0].options.body),{
  from:args.verifiedSender,to:[envelope.to],subject:envelope.subject,text:envelope.text
 });
});
test('invalid or oversize envelopes cannot invoke the mail provider',async()=>{
 let calls=0;
 const send=createResendInvitationProvider({...args,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({id:providerId})};}});
 for(const draft of [null,{}, {...envelope,to:'a@invalid.com,b@invalid.com'},
  {...envelope,subject:'x'.repeat(161)},{...envelope,text:'X'},
  {...envelope,text:'x'.repeat(4001)},{...envelope,invitationId:'not-uuid'}])
  await assert.rejects(send(draft));
 assert.equal(calls,0);
});
test('provider rejection, timeouts and malformed receipts never imply delivery',async()=>{
 const secret='provider-private-secret-and-recipient';
 for(const fetchImpl of [
  async()=>{throw new Error(secret);},
  async()=>({ok:false,status:429,json:async()=>({message:secret})}),
  async()=>({ok:true,json:async()=>({id:'bad'})}),
  async()=>({ok:true,json:async()=>{throw Error(secret);}})
 ]){
  const send=createResendInvitationProvider({...args,fetchImpl});
  await assert.rejects(send(envelope),e=>{
   assert.equal(e.message.includes(secret),false);
   return true;
  });
 }
});
