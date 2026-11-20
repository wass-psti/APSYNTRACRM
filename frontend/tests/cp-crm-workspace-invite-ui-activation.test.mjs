import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WorkspaceInvitationClient} from '../workspace-invitation-client.js';
import {WorkspaceInvitationManagementClient} from '../workspace-invitation-management.js';
const workspaceId='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const session={workspace_id:workspaceId,user_id:actor,profile:{status:'active'}};
const auth={userId:actor,async getVerifiedUser(){return{id:actor}}};
test('signed server availability can be checked before any Send operation',async()=>{
 let mutations=0,checks=0;
 const signed={...auth,async authorized(path,{body}){
  if(path.endsWith('ws02d-manage')){
   checks++;assert.equal(body.operation,'list');assert.equal(body.workspaceId,workspaceId);
   return {schemaVersion:1,workspaceId,authorized:true,invitations:[]};
  }
  if(path.endsWith('ws02d-invite')){mutations++;throw Error('Synthetic write not permitted')}
  throw Error('Unexpected route');
 }};
 const api={context:async()=>session};
 const manager=new WorkspaceInvitationManagementClient({auth:signed,api,enabled:true});
 const client=new WorkspaceInvitationClient({auth:signed,api,enabled:true});
 const listing=await manager.list(workspaceId);
 assert.equal(listing.status,'SIGNED_MANAGER_LIST');assert.equal(listing.workspaceId,workspaceId);
 assert.equal(checks,1);assert.equal(mutations,0);
 assert.equal(client.enabled,true);
});
test('dormant manager denies and does not imply readiness or send a message',async()=>{
 let sends=0;
 const signed={...auth,async authorized(path){
  if(path.endsWith('ws02d-manage')){const err=Error('Not activated');err.status=503;throw err}
  sends++;throw Error('Unexpected call');
 }};
 const manager=new WorkspaceInvitationManagementClient({auth:signed,api:{context:async()=>session},enabled:true});
 await assert.rejects(manager.list(workspaceId),{status:409});
 assert.equal(sends,0);
});
test('all invite launch points use a live list gate before provider submission, without an optimistic member insertion',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 assert.equal((app.match(/checkInvitationAvailability:checkWorkspaceInvitationAvailability/g)||[]).length,3);
 assert.match(ui,/checkInvitationAvailability:options\.checkInvitationAvailability/);
 assert.match(ui,/const availability=await options\.checkInvitationAvailability\(row\.id\)/);
 assert.ok(ui.indexOf('const availability=await options.checkInvitationAvailability(row.id)') <
  ui.indexOf('const receipt=await options.sendInvitation({workspaceId:row.id'));
 assert.match(ui,/No email was submitted/);
 assert.match(ui,/Delivery outcome is unconfirmed/);
 assert.doesNotMatch(ui,/INSERT INTO public\.workspace_members/);
});
