import test from 'node:test';
import assert from 'node:assert/strict';
import {createResendTransport,WS02D_RESEND_TRANSPORT_ENABLED}
 from '../ws02d-resend-transport.mjs';
import {submitTrustedWorkspaceInvitation} from '../ws02d-trusted-delivery.mjs';

const apiKey='re_syntheticTestingKey123456789';
const from='invite@example.invalid';
const invitationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token=invitationId+'.'+'ab'.repeat(32);
const env={
 to:'recipient@example.invalid',
 subject:'APSYNTRA CRM invitation',
 text:'Use the one-time link: https://wass-psti.github.io/APSYNTRACRM/#/invitations/accept/'+token,
 invitationId
};
const success={
 ok:true,status:200,json:async()=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})
};

test('provider stays off and never calls HTTP without approved credentials',async()=>{
 assert.equal(WS02D_RESEND_TRANSPORT_ENABLED,false);
 let calls=0;
 const send=createResendTransport({
  enabled:false,apiKey,from,fetchImpl:async()=>{calls++;return success;}
 });
 await assert.rejects(send(env),/disabled/);
 assert.equal(calls,0);
 assert.throws(()=>createResendTransport({
  enabled:true,apiKey:'',from,fetchImpl:async()=>success
 }),/credential/);
 assert.throws(()=>createResendTransport({
  enabled:true,apiKey,from:'someone@example.invalid\nBcc: attacker@evil.test',
  fetchImpl:async()=>success
 }),/sender/);
 assert.throws(()=>createResendTransport({
  enabled:true,apiKey,from
 }),/HTTP transport/);
});

test('mock Resend request uses pinned origin, idempotency and no redirect',async()=>{
 let calls=0;
 const send=createResendTransport({
  enabled:true,apiKey,from,
  fetchImpl:async(url,opts)=>{
   calls++;
   assert.equal(url,'https://api.resend.com/emails');
   assert.equal(opts.method,'POST');
   assert.equal(opts.redirect,'error');
   assert.equal(opts.headers.Authorization,'Bearer '+apiKey);
   assert.equal(opts.headers['Content-Type'],'application/json');
   assert.equal(opts.headers['Idempotency-Key'],'workspace-invite/'+invitationId);
   assert.equal(typeof opts.signal?.aborted,'boolean');
   const body=JSON.parse(opts.body);
   assert.deepEqual(body,{from,to:[env.to],subject:env.subject,text:env.text});
   assert.equal('apiKey' in body,false);
   return success;
  }
 });
 assert.deepEqual(await send(env),{accepted:true});
 assert.equal(calls,1);
});

test('rejects malformed recipient, subject injection and oversize payload before HTTP',async()=>{
 let calls=0;
 const send=createResendTransport({
  enabled:true,apiKey,from,
  fetchImpl:async()=>{calls++;return success;}
 });
 for(const bad of [
  {...env,to:'bad'},
  {...env,subject:'Valid\nBcc: malicious@example.test'},
  {...env,invitationId:'other'},
  {...env,text:'X'.repeat(12001)},
  {...env,text:'  '}
 ]){
  await assert.rejects(send(bad),/Invalid email transport envelope/);
 }
 assert.equal(calls,0);
});

test('provider error, invalid JSON, missing receipt and timeout do not leak secrets',async()=>{
 const responses=[
  async()=>({ok:false,status:429,json:async()=>({message:apiKey,raw:token})}),
  async()=>({ok:true,status:200,json:async()=>{throw new Error(token);}}),
  async()=>({ok:true,status:200,json:async()=>({id:'not-uuid'})}),
  async()=>{throw new Error('Timed out '+apiKey+' '+token);}
 ];
 for(const fetchImpl of responses){
  const send=createResendTransport({enabled:true,apiKey,from,fetchImpl});
  await assert.rejects(send(env),err=>{
   assert.equal(err instanceof Error,true);
   assert.equal(err.message.includes(apiKey),false);
   assert.equal(err.message.includes(token),false);
   return true;
  });
 }
});

test('trusted issuer -> mocked Resend accepted receipt never exposes bearer token',async()=>{
 let delivered=0;
 const sendEmail=createResendTransport({
  enabled:true,apiKey,from,
  fetchImpl:async()=>{delivered++;return success;}
 });
 const result=await submitTrustedWorkspaceInvitation({
  workspaceId:'00000000-0000-4000-8000-000000000001',
  requestId:'11111111-1111-4111-8111-111111111101',
  email:env.to,role:'member',message:'Please collaborate.'
 },{
  deliveryEnabled:true,
  issueForSignedActor:async()=>({
   schemaVersion:1,invitationId,idempotent:false,tokenAvailable:true,
   state:'pending',token
  }),
  sendEmail
 });
 assert.deepEqual(result,{state:'delivery-submitted',invitationId});
 assert.equal(JSON.stringify(result).includes(token),false);
 assert.equal(delivered,1);
});
