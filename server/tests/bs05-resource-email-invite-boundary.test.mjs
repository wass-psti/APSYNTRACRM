import test from 'node:test';
import assert from 'node:assert/strict';
import {createResourceEmailInviteBoundary,RESOURCE_EMAIL_INVITE_HTTP_ENABLED}
 from '../bs05-resource-email-invite-boundary.mjs';
const endpoint='https://example.test/functions/v1/resource-email-invite';
const origin='https://wass-psti.github.io';
const id='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const boardId='33333333-3333-4333-8333-333333333333';
const requestId='44444444-4444-4444-8444-444444444444';
const body={workspaceId,boardId,requestId,
 resourceKind:'board',email:'partner@example.test',role:'viewer'};
const headers={'origin':origin,'authorization':'Bearer abc.def.ghi','content-type':'application/json'};
const req=(value=body,extra={})=>new Request(endpoint,{
 method:'POST',headers:{...headers,...(extra.headers||{})},
 body:JSON.stringify(value)
});
const adapters={verifySession:async()=>({id,emailVerified:true,sessionActive:true}),
 authorizeInvitation:async()=>true,
 issueAndDeliver:async()=>({invitationId:id,state:'delivery-submitted',
  email:body.email,resourceKind:'board'})};

test('default OFF never calls adapters',async()=>{
 let touched=0;
 const response=await createResourceEmailInviteBoundary({
  ...adapters,verifySession:async()=>{touched++;return adapters.verifySession();}
 })(req());
 assert.equal(RESOURCE_EMAIL_INVITE_HTTP_ENABLED,false);
 assert.equal(response.status,503);
 assert.equal(touched,0);
});
test('wrong origin and missing signed actor are rejected',async()=>{
 const handler=createResourceEmailInviteBoundary({enabled:true,...adapters});
 assert.equal((await handler(req(body,{headers:{origin:'https://attacker.test'}}))).status,403);
 assert.equal((await handler(req(body,{headers:{authorization:'none'}}))).status,401);
});
test('refuses unauthorized/inactive/unverified identities',async()=>{
 const handler=createResourceEmailInviteBoundary({enabled:true,...adapters,
  verifySession:async()=>({id,emailVerified:false,sessionActive:true})});
 assert.equal((await handler(req())).status,401);
 const deny=createResourceEmailInviteBoundary({enabled:true,...adapters,
  authorizeInvitation:async()=>false});
 assert.equal((await deny(req())).status,403);
});
test('rejects forged actors, extra scope, editor role and recipient lists',async()=>{
 const handler=createResourceEmailInviteBoundary({enabled:true,...adapters});
 for(const payload of [
  {...body,actorId:id},
  {...body,role:'editor'},
  {...body,email:'a@example.test,b@example.test'},
  {...body,email:'Partner@example.test'},
  {...body,resourceKind:'application',moduleKey:'timetracker'},
  {...body,boardId:'invalid'}
 ])assert.equal((await handler(req(payload))).status,400,JSON.stringify(payload));
});
test('requires independent application authorization for application invites',async()=>{
 let seen;
 const handler=createResourceEmailInviteBoundary({enabled:true,...adapters,
  authorizeInvitation:async(actor,request)=>{
   seen=request;
   return request.resourceKind==='application'&&request.moduleKey==='orders';
  },
  issueAndDeliver:async(_,request)=>({
   invitationId:id,state:'delivery-submitted',
   email:request.email,resourceKind:request.resourceKind
  })
 });
 const payload={workspaceId,requestId,resourceKind:'application',
  moduleKey:'orders',email:'partner@example.test',role:'viewer'};
 assert.equal((await handler(req(payload))).status,200);
 assert.equal(seen.moduleKey,'orders');
 assert.equal(seen.boardId,undefined);
 assert.equal((await handler(req({...payload,moduleKey:'../private'}))).status,400);
});
test('authorized issuance returns narrow receipt and no raw token',async()=>{
 let count=0;
 const handler=createResourceEmailInviteBoundary({enabled:true,...adapters,
  issueAndDeliver:async(actor,request)=>{
   count++;
   assert.deepEqual(actor,{id});
   assert.deepEqual(request,body);
   return {...await adapters.issueAndDeliver(),token:'secret-must-not-return'};
  }
 });
 const response=await handler(req());
 assert.equal(response.status,200);
 assert.equal(count,1);
 const result=await response.json();
 assert.deepEqual(result,{invitationId:id,state:'delivery-submitted',
  email:body.email,resourceKind:'board'});
 assert.doesNotMatch(JSON.stringify(result),/token|secret/);
});
test('uncertain delivery reports unconfirmed, never retries',async()=>{
 let count=0;
 const handler=createResourceEmailInviteBoundary({enabled:true,...adapters,
  issueAndDeliver:async()=>{count++;throw Error('Simulated SMTP timeout');}
 });
 const response=await handler(req());
 assert.equal(response.status,409);
 assert.deepEqual(await response.json(),{state:'unconfirmed'});
 assert.equal(count,1);
});
