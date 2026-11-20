/** Explicit, controlled staging acceptance. Never supply production tokens.
 * Credentials are read from environment only and NEVER printed or saved.
 * Usage: node scripts/cp-crm-workspace-invite-01e-staging.mjs preflight|send|list|accept
 * Required env: WS02D_STAGING_ANON_KEY, WS02D_STAGING_INVITER_JWT,
 * WS02D_STAGING_RECIPIENT_JWT. For send/list add WS02D_STAGING_WORKSPACE_ID.
 * For send add WS02D_STAGING_REQUEST_ID. For accept add WS02D_STAGING_INBOX_TOKEN.
 * Running send/accept may mutate staging membership and send real mail;
 * never execute until test mailboxes/sender and staging flags are approved.
 */
import {createGenuineStagingRunner} from '../server/ws02d-genuine-staging-runner.mjs';
const mode=process.argv[2];
if(!['preflight','send','list','accept'].includes(mode)){
 process.stderr.write('Usage: staging.mjs preflight|send|list|accept\n');
 process.exitCode=2;
}else{
 const runner=createGenuineStagingRunner();
 const env=process.env;
 const shared={inviterJwt:env.WS02D_STAGING_INVITER_JWT,
  recipientJwt:env.WS02D_STAGING_RECIPIENT_JWT,
  publishableKey:env.WS02D_STAGING_ANON_KEY};
 try{
  if(mode==='preflight'){
   await runner.pair(shared);
   console.log('STAGING_IDENTITIES_VERIFIED — two independently signed, confirmed GoTrue users');
  }else if(mode==='send'){
   const result=await runner.send({...shared,
    workspaceId:env.WS02D_STAGING_WORKSPACE_ID,requestId:env.WS02D_STAGING_REQUEST_ID});
   console.log('STAGING_INVITATION_PROVIDER_RESULT',JSON.stringify(result));
  }else if(mode==='accept'){
   const result=await runner.accept({...shared,token:env.WS02D_STAGING_INBOX_TOKEN});
   console.log('STAGING_SIGNED_ACCEPTANCE',JSON.stringify(result));
  }else if(mode==='list'){
   const result=await runner.list({inviterJwt:shared.inviterJwt,
    publishableKey:shared.publishableKey,workspaceId:env.WS02D_STAGING_WORKSPACE_ID});
   console.log('STAGING_MANAGER_READBACK',JSON.stringify(result));
  }
 }catch{
  // Deliberately omit error details: a transport or provider error could
  // inadvertently contain a bearer token or private recipient identifier.
  console.error('STAGING_ACCEPTANCE_BLOCKED — inspect trusted server logs; no automatic retry');
  process.exitCode=1;
 }
}
