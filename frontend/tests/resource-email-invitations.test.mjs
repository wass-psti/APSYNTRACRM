import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 RESOURCE_EMAIL_INVITES_ENABLED,RESOURCE_INVITE_ROLE,
 normalizeRecipientEmail,validateResourceInviteRequest,
 resourceEmailInviteReadiness,normalizeResourceInviteReceipt,
 ResourceEmailInvitationClient
} from '../resource-email-invitations.js';
import {renderBoardSharePreview} from '../board-share.js';

const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const actorId='33333333-3333-4333-8333-333333333333';
const requestId='44444444-4444-4444-8444-444444444444';
const board={id:boardId,workspace_id:workspaceId,status:'active'};
const invite={workspaceId,resourceKind:'board',boardId,requestId,
 email:' Client@Example.COM ',role:'viewer'};

test('invitation transport is disabled and no workspace invite flag is altered',()=>{
 assert.equal(RESOURCE_EMAIL_INVITES_ENABLED,false);
 assert.equal(RESOURCE_INVITE_ROLE,'viewer');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'board-share-preview':/);
 assert.match(readFileSync('frontend/workspace-invitation-client.js','utf8'),
  /WS02D_INVITE_CLIENT_ENABLED=false/);
 assert.match(readFileSync('frontend/auth-account-flows.js','utf8'),
  /REGISTRATION_ADMISSION_ENABLED=false/);
});
test('single recipient identity is normalized, lists/injection/control chars rejected',()=>{
 assert.equal(normalizeRecipientEmail(' Client@Example.COM '),'client@example.com');
 for(const bad of [null,'','a@b','foo@example.com,bar@example.com',
  'x@-example.com','a@domain..com','bad\n@example.com',
  'a@example.com\r\nBcc:other@example.com', 'a'.repeat(65)+'@example.com',
  '<img>@example.com']){
  assert.equal(normalizeRecipientEmail(bad),null,String(bad));
 }
});
test('invitations require exact target scope, role and idempotency id',()=>{
 assert.deepEqual(validateResourceInviteRequest(invite),{
  workspaceId,resourceKind:'board',boardId,requestId,
  email:'client@example.com',role:'viewer'
 });
 assert.equal(validateResourceInviteRequest({...invite,role:'editor'}),null);
 assert.equal(validateResourceInviteRequest({...invite,workspaceId:boardId+'x'}),null);
 assert.equal(validateResourceInviteRequest({...invite,resourceKind:'application'}),null);
 assert.deepEqual(validateResourceInviteRequest({
  ...invite,resourceKind:'application',moduleKey:'timetracker'
 }),{workspaceId,resourceKind:'application',moduleKey:'timetracker',
  email:'client@example.com',role:'viewer',requestId});
 assert.equal(validateResourceInviteRequest({
  ...invite,resourceKind:'application',moduleKey:'../../admin'
 }),null);
});
test('readiness denies unauthorized, protected app, and unapproved policy',()=>{
 for(const context of [
  {board,workspaceId,manage:false},
  {board:{...board,status:'archived'},workspaceId,manage:true},
  {board:{...board,workspace_id:actorId},workspaceId,manage:true},
  {board,workspaceId,manage:true,moduleKey:'timetracker'},
  {board,workspaceId,manage:true,enabled:true,approvedPolicy:false}
 ]){
  assert.equal(resourceEmailInviteReadiness(context).allowed,false);
 }
 assert.equal(resourceEmailInviteReadiness({
  board,workspaceId,manage:true,enabled:true,approvedPolicy:true
 }).allowed,true);
});
test('workspace-first share panel does not directly send board invitation emails',()=>{
 const normal=renderBoardSharePreview({board:{...board,name:'Project'},
  workspaceId,manage:true});
 const protectedApp=renderBoardSharePreview({board:{...board,name:'HR'},
  workspaceId,manage:true,moduleKey:'evaluation'});
 for(const html of [normal,protectedApp]){
  assert.match(html,/Invite someone new/);
  assert.match(html,/Open workspace invitations/);
  assert.doesNotMatch(html,/Copy invitation link|name="password"|data-board-share-email-form/);
 }
 assert.match(normal,/data-bs09-tab="people"/);
 assert.match(normal,/data-bs09-tab="groups"/);
 assert.match(protectedApp,/Sensitive applications need a separate permission review/);
});
test('strict receipt binds target and email and gives no token',()=>{
 const validated=validateResourceInviteRequest(invite);
 assert.deepEqual(normalizeResourceInviteReceipt({
  invitationId:actorId,state:'delivery-submitted',
  email:'client@example.com',resourceKind:'board'
 },validated),{invitationId:actorId,state:'delivery-submitted'});
 assert.throws(()=>normalizeResourceInviteReceipt({
  invitationId:actorId,state:'delivery-submitted',
  email:'other@example.com',resourceKind:'board'
 },validated),/could not be verified/);
});
test('send never calls backend with disabled flag even if identity looks valid',async()=>{
 let touched=false;
 const auth={userId:actorId,getVerifiedUser:async()=>({id:actorId}),
  authorized:async()=>{touched=true;}};
 const api={context:async()=>{touched=true;return {}}};
 await assert.rejects(new ResourceEmailInvitationClient({auth,api}).send(invite),
  /not yet activated/i);
 assert.equal(touched,false);
});
test('signed transport checks actor and workspace before network request',async()=>{
 let touched=false;
 const auth={userId:actorId,getVerifiedUser:async()=>({id:actorId}),
  authorized:async()=>{touched=true;}};
 const api={context:async()=>({
  user_id:actorId,workspace_id:'55555555-5555-4555-8555-555555555555',
  profile:{status:'active'}
 })};
 await assert.rejects(new ResourceEmailInvitationClient({
  auth,api,enabled:true
 }).send(invite),/identity or workspace changed/);
 assert.equal(touched,false);
});
test('signed transport sends only normalized board-scoped identity and expects verified receipt',async()=>{
 let body,callCount=0;
 const auth={userId:actorId,getVerifiedUser:async()=>({id:actorId}),
  authorized:async(path,options)=>{
   assert.equal(path,'/functions/v1/resource-email-invite');
   assert.equal(options.retryUnauthorized,false);
   body=options.body;callCount++;
   return {invitationId:actorId,state:'delivery-submitted',
    email:body.email,resourceKind:body.resourceKind};
  }};
 const api={context:async()=>({
  user_id:actorId,workspace_id:workspaceId,profile:{status:'active'}
 })};
 const result=await new ResourceEmailInvitationClient({
  auth,api,enabled:true
 }).send(invite);
 assert.equal(callCount,1);
 assert.equal(body.email,'client@example.com');
 assert.equal(body.boardId,boardId);
 assert.equal(body.resourceKind,'board');
 assert.equal(body.moduleKey,undefined);
 assert.equal(result.state,'delivery-submitted');
});
