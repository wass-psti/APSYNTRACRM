import test from 'node:test';
import assert from 'node:assert/strict';
import {createWs02dTrustedMailEndpoint} from '../ws02d-trusted-mail-composition.mjs';
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const id=uuid(1),actorId=uuid(2),sessionId=uuid(3),workspaceId=uuid(4),requestId=uuid(5);
const bearer='headheadhead.payloadpayloadpayload.signsignsign';
const request=()=>new Request('https://example.invalid/functions/v1/ws02d-invite',{
 method:'POST',headers:{origin:'https://wass-psti.github.io',authorization:'Bearer '+bearer,'content-type':'application/json'},
 body:JSON.stringify({workspaceId,requestId,email:'test@example.invalid',role:'member',message:''})
});
const providerConfig={apiKey:'re_'+'a'.repeat(20),verifiedSender:'notify@verified.example.com'};
test('explicitly disabled integration never invokes signed issuance or provider',async()=>{
 let invoked=0;
 const handle=createWs02dTrustedMailEndpoint({enabled:false,verifySignedActor:async()=>{invoked++;},
  issueForAuthorizedActor:async()=>{invoked++;},fetchImpl:async()=>{invoked++;}});
 const res=await handle(request());
 assert.equal(res.status,503);
 assert.equal(invoked,0);
});
test('signed email send yields provider-submitted status only and actor-scoped delivery audit',async()=>{
 const actions=[];
 const handle=createWs02dTrustedMailEndpoint({...providerConfig,enabled:true,
  verifySignedActor:async()=>({id:actorId,sessionId,active:true,verified:true}),
  issueForAuthorizedActor:async(actor,data)=>{
   actions.push({kind:'issue',actor,data});
   return {schemaVersion:1,invitationId:id,idempotent:false,tokenAvailable:true,state:'pending',
    token:id+'.'+'ab'.repeat(32)};
  },
  recordDeliveryOutcome:async(actor,data)=>{actions.push({kind:'audit',actor,data});return {persisted:true};},
  fetchImpl:async(url,options)=>{actions.push({kind:'provider',url,options});
   return {ok:true,json:async()=>({id:uuid(6)})};}
 });
 const res=await handle(request());
 assert.equal(res.status,202);
 assert.deepEqual(await res.json(),{state:'delivery-submitted',invitationId:id});
 assert.deepEqual(actions.map(x=>x.kind),['issue','provider','audit']);
 assert.deepEqual(actions[0].actor,{id:actorId,sessionId});
 assert.deepEqual(actions[2].actor,{id:actorId,sessionId});
 assert.equal(actions[2].data.state,'provider-accepted');
 assert.equal(actions[1].options.headers['idempotency-key'],'apsyntra-ws02d-'+id);
});
test('provider failure records uncertain delivery and never reports a successful send',async()=>{
 const events=[];
 const handle=createWs02dTrustedMailEndpoint({...providerConfig,enabled:true,
  verifySignedActor:async()=>({id:actorId,sessionId,active:true,verified:true}),
  issueForAuthorizedActor:async()=>({schemaVersion:1,invitationId:id,idempotent:false,
   tokenAvailable:true,state:'pending',token:id+'.'+'ab'.repeat(32)}),
  recordDeliveryOutcome:async(_,receipt)=>{events.push(receipt);return {persisted:true};},
  fetchImpl:async()=>({ok:false,status:429})
 });
 const result=await handle(request());
 assert.equal(result.status,403);
 assert.deepEqual(events,[{invitationId:id,state:'delivery-uncertain',providerMessageId:null}]);
});
