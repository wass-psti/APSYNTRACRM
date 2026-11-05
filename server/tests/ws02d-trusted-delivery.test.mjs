import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WS02D_TRUSTED_DELIVERY_ENABLED,validateTrustedDeliveryDraft,
 inviteLinkForTrustedEmail,submitTrustedWorkspaceInvitation
} from '../ws02d-trusted-delivery.mjs';

const workspaceId='00000000-0000-4000-8000-000000000001';
const requestId='11111111-1111-4111-8111-111111111101';
const invitationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token=invitationId+'.'+'ab'.repeat(32);
const draft={workspaceId,requestId,email:'  MEMBER@EXAMPLE.INVALID ',
 role:'member',message:'Coordinate the next project milestone.'};
const receipt={schemaVersion:1,invitationId,token,tokenAvailable:true,
 idempotent:false,state:'pending'};

test('trusted delivery remains disabled by default; invalid drafts never issue',async()=>{
 assert.equal(WS02D_TRUSTED_DELIVERY_ENABLED,false);
 let issued=0,delivered=0;
 const handlers={
  issueForSignedActor:async()=>{issued++;return receipt;},
  sendEmail:async()=>{delivered++;return {accepted:true};}
 };
 await assert.rejects(
  submitTrustedWorkspaceInvitation(draft,handlers),
  /not activated/);
 for(const bad of [
  {...draft,email:'not-email'},
  {...draft,role:'admin'},
  {...draft,role:'viewer'},
  {...draft,role:'owner'},
  {...draft,workspaceId:'../../other'},
  {...draft,requestId:''},
  {...draft,message:'X'.repeat(501)},
  {...draft,message:'Control\u0000character'},
 ]){
  assert.equal(validateTrustedDeliveryDraft(bad),null);
  await assert.rejects(
   submitTrustedWorkspaceInvitation(bad,{...handlers,deliveryEnabled:true}),
   /Invalid workspace invitation draft/);
 }
 assert.equal(issued,0);
 assert.equal(delivered,0);
});

test('normalized recipient uses trusted signed issuance, provider sees URL fragment only',async()=>{
 let issueCalls=0;
 let providerCalls=0;
 const result=await submitTrustedWorkspaceInvitation(draft,{
  deliveryEnabled:true,
  issueForSignedActor:async args=>{
   issueCalls++;
   assert.deepEqual(args,{workspaceId,requestId,
    recipientEmail:'member@example.invalid',role:'member'});
   return receipt;
  },
  sendEmail:async message=>{
   providerCalls++;
   assert.equal(message.to,'member@example.invalid');
   assert.match(message.subject,/APSYNTRA CRM/);
   assert.match(message.text,/Coordinate the next project milestone/);
   assert.ok(message.text.includes('#/invitations/accept/'));
   assert.ok(message.text.includes(token));
   assert.equal(message.text.includes('?token='),false);
   assert.equal(Object.isFrozen(message),true);
   return {accepted:true};
  }
 });
 assert.equal(issueCalls,1);
 assert.equal(providerCalls,1);
 assert.deepEqual(result,{state:'delivery-submitted',invitationId});
 assert.equal(JSON.stringify(result).includes(token),false);
 assert.equal(Object.isFrozen(result),true);
 assert.match(inviteLinkForTrustedEmail(token),
  /^https:\/\/wass-psti\.github\.io\/APSYNTRACRM\/#\/invitations\/accept\//);
});

test('idempotent reissue does not reveal or resend an unrecoverable token',async()=>{
 let sent=0;
 const result=await submitTrustedWorkspaceInvitation(draft,{
  deliveryEnabled:true,
  issueForSignedActor:async()=>({
   schemaVersion:1,invitationId,idempotent:true,tokenAvailable:false,state:'pending'
  }),
  sendEmail:async()=>{sent++;return {accepted:true};}
 });
 assert.equal(sent,0);
 assert.deepEqual(result,{state:'already-issued',invitationId});
});

test('provider failure, malformed receipt and issuer errors never leak token',async()=>{
 for(const handlers of [
  {issueForSignedActor:async()=>{throw new Error('sensitive '+token);},
   sendEmail:async()=>({accepted:true})},
  {issueForSignedActor:async()=>({...receipt,token:'not a token'}),
   sendEmail:async()=>({accepted:true})},
  {issueForSignedActor:async()=>receipt,
   sendEmail:async()=>{throw new Error('provider '+token);}},
  {issueForSignedActor:async()=>receipt,
   sendEmail:async()=>({accepted:false})},
 ]){
  await assert.rejects(
   submitTrustedWorkspaceInvitation(draft,{...handlers,deliveryEnabled:true}),
   error=>error instanceof Error&&!error.message.includes(token));
 }
});
test('email bearer link rejects arbitrary data and cannot alter destination',()=>{
 for(const unsafe of ['','../../','https://evil.example/',token+'?',token.toUpperCase()])
  assert.throws(()=>inviteLinkForTrustedEmail(unsafe));
});
