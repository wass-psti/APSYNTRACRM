import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invitationDeliveryReadiness,summarizeInvitationReadiness}
 from '../../supabase/functions/_shared/ws02d-readiness.mjs';
import {normalizeInvitationReadiness,WorkspaceInvitationManagementClient}
 from '../../frontend/workspace-invitation-management.js';
const workspaceId='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const vars={
 APSYNTRA_INVITES_EDGE_ENABLED:'true',APSYNTRA_INVITE_TRANSPORT:'smtp',
 APSYNTRA_INVITE_SMTP_HOST:'smtp.example.invalid',APSYNTRA_INVITE_SMTP_PORT:'465',
 APSYNTRA_INVITE_SMTP_USER:'test@invalid.example',
 APSYNTRA_INVITE_SMTP_PASSWORD:'synthetic-example-only',
 APSYNTRA_INVITE_FROM:'invite@example.invalid',
 APSYNTRA_INVITE_APP_URL:'https://wass-psti.github.io/APSYNTRACRM/'
};
const env=values=>({get:k=>values[k]});
const respond=(sqlEnabled,values=vars)=>summarizeInvitationReadiness({
 workspaceId,authorized:true,sqlEnabled,
 delivery:invitationDeliveryReadiness(env(values))
});
test('SMTP and SQL readiness must both be enabled before a send',()=>{
 assert.deepEqual(respond(true),{
  schemaVersion:1,workspaceId,authorized:true,ready:true,reason:'ready'});
 assert.equal(respond(false).reason,'invitation_feature_disabled');
 for(const key of ['APSYNTRA_INVITE_SMTP_HOST','APSYNTRA_INVITE_SMTP_PORT',
  'APSYNTRA_INVITE_SMTP_USER','APSYNTRA_INVITE_SMTP_PASSWORD',
  'APSYNTRA_INVITE_FROM','APSYNTRA_INVITE_APP_URL']){
  const cfg={...vars};delete cfg[key];
  const result=respond(true,cfg);
  assert.equal(result.ready,false,key);
  assert.equal(result.reason,'delivery_configuration_missing',key);
 }
 assert.equal(respond(true,{...vars,APSYNTRA_INVITES_EDGE_ENABLED:'false'}).reason,'invitation_feature_disabled');
});
test('Resend path keeps its original behavior with valid server configuration',()=>{
 const values={APSYNTRA_INVITES_EDGE_ENABLED:'true',APSYNTRA_INVITE_FROM:'inviter@example.invalid',
  APSYNTRA_INVITE_APP_URL:vars.APSYNTRA_INVITE_APP_URL,RESEND_API_KEY:'provider-secret-stub'};
 assert.equal(respond(true,values).ready,true);
 delete values.RESEND_API_KEY;
 assert.equal(respond(true,values).reason,'delivery_configuration_missing');
});
test('readiness never returns credentials or acceptance tokens and refuses malformed callback',()=>{
 for(const url of ['http://example.invalid/','https://user:pass@example.invalid/',
  'https://example.invalid/path','#/invitations/accept/secret','not a URL']){
  const r=respond(true,{...vars,APSYNTRA_INVITE_APP_URL:url});
  assert.equal(r.ready,false,url);
 }
 const output=JSON.stringify(respond(true));
 assert.doesNotMatch(output,/synthetic-example-only|smtp\.example\.invalid|invite@example\.invalid/);
});
test('client validates exact signed readiness contract, never accepts optimistic list or wrong workspace',async()=>{
 const replies=[respond(false),respond(true),{...respond(true),workspaceId:actor},
   {...respond(true),ready:true,reason:'invitation_feature_disabled'},
   {schemaVersion:1,workspaceId,authorized:true,invitations:[]}];
 for(const reply of replies){
  let requests=0;
  const auth={userId:actor,async getVerifiedUser(){return{id:actor}},
   async authorized(url,args){requests++;assert.equal(url,'/functions/v1/ws02d-manage');
    assert.deepEqual(args.body,{operation:'readiness',workspaceId});return reply}};
  const client=new WorkspaceInvitationManagementClient({enabled:true,auth,
   api:{context:async()=>({user_id:actor,workspace_id:workspaceId,profile:{status:'active'}})}});
  if(replies.indexOf(reply)<2)assert.equal((await client.readiness(workspaceId)).ready,reply.ready);
  else await assert.rejects(client.readiness(workspaceId),{status:409});
  assert.equal(requests,1);
 }
});
test('signed readiness SQL verifies sender role and feature flag but never issues a token',()=>{
 const server=readFileSync('supabase/functions/_shared/ws02d-trusted.ts','utf8');
 assert.match(server,/route === 'manage' && body\.operation === 'readiness'/);
 assert.match(server,/private\.ws02d_sender_authorized\(/);
 assert.match(server,/SELECT enabled FROM private\.ws02d_invitation_flags/);
 assert.match(server,/route==='manage' && body\.operation==='readiness'/);
 assert.match(server,/if \(!deliveryEnabled && !isReadiness\)/);
 assert.match(server,/invitationDeliveryReadiness\(Deno\.env\)/);
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 assert.match(ui,/if\(readiness\.ready!==true\)/);
 assert.ok(ui.indexOf('if(readiness.ready!==true)') < ui.indexOf('options.sendInvitation({workspaceId:row.id'));
 assert.match(ui,/error\?\.status===401/);
 assert.match(ui,/error\?\.status===403/);
 assert.match(ui,/delivery result is unconfirmed/);
});
