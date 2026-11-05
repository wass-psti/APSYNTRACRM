/**
 * CP-WS-02D/B — trusted backend-only email delivery boundary.
 * Not imported by the GitHub Pages frontend. Not deployed or enabled.
 *
 * issueForSignedActor MUST independently validate the real GoTrue caller/session,
 * authoritative workspace ownership, role, rate limits and a fresh request ID
 * through the private database contract. An arbitrary service-role RPC is not
 * a substitute for a signed actor authorization check.
 *
 * sendEmail MUST be a trusted provider adapter holding server-side secrets.
 * This module never logs invitation tokens or returns them to the caller.
 */
const INVITE_TOKEN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const INVITE_HOME='https://wass-psti.github.io/APSYNTRACRM/';
export const WS02D_TRUSTED_DELIVERY_ENABLED=false;

export function validateTrustedDeliveryDraft(draft){
 if(!draft||typeof draft!=='object')return null;
 const workspaceId=String(draft.workspaceId||'').trim();
 const requestId=String(draft.requestId||'').trim();
 const email=String(draft.email||'').trim().toLowerCase();
 const role=draft.role;
 const message=typeof draft.message==='string'?draft.message.trim():'';
 if(!UUID.test(workspaceId)||!UUID.test(requestId)||
    email.length>254||!EMAIL.test(email)||role!=='member'||
    message.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message))return null;
 return Object.freeze({workspaceId,requestId,email,role,message});
}

export function inviteLinkForTrustedEmail(token){
 if(typeof token!=='string'||!INVITE_TOKEN.test(token))
  throw new Error('Invalid trusted invitation token');
 // A hash-route avoids putting the token in the HTTP path or query string.
 // The recipient's browser still receives this token: treat the email link
 // as bearer-secret material. Never log this URL or add it to analytics.
 return INVITE_HOME+'#/invitations/accept/'+encodeURIComponent(token);
}

export async function submitTrustedWorkspaceInvitation(draft,{
 issueForSignedActor,sendEmail,recordDeliveryOutcome,deliveryEnabled=false
}={}){
 if(deliveryEnabled!==true||
    typeof issueForSignedActor!=='function'||typeof sendEmail!=='function'||
    typeof recordDeliveryOutcome!=='function')
  throw new Error('Trusted invitation delivery not activated');
 const valid=validateTrustedDeliveryDraft(draft);
 if(!valid)throw new Error('Invalid workspace invitation draft');
 let receipt;
 try {
  receipt=await issueForSignedActor({
   workspaceId:valid.workspaceId,recipientEmail:valid.email,
   role:valid.role,requestId:valid.requestId
  });
 }catch{
  // Do not forward database errors containing user identity or token values.
  throw new Error('Invitation authorization or issuance was denied');
 }
 if(!receipt||receipt.schemaVersion!==1||!UUID.test(receipt.invitationId))
  throw new Error('Invalid trusted invitation receipt');
 if(receipt.idempotent===true&&receipt.tokenAvailable===false&&
    receipt.state==='pending'&&!Object.hasOwn(receipt,'token')){
  return Object.freeze({state:'already-issued',invitationId:receipt.invitationId});
 }
 if(receipt.idempotent!==false||receipt.tokenAvailable!==true||
    receipt.state!=='pending'||!INVITE_TOKEN.test(receipt.token))
  throw new Error('Trusted invitation token unavailable');
 const link=inviteLinkForTrustedEmail(receipt.token);
 const plainText=[
  'You have been invited to collaborate in an APSYNTRA CRM workspace.',
  'Invitation role: Member.',
  valid.message ? 'Message from the inviter:\n'+valid.message : '',
  'To accept, sign in with this email address and open the invitation:',
  link,
  'The invitation expires after 24 hours. Do not forward this link.'
 ].filter(Boolean).join('\n\n');
 let providerResult;
 try{
  providerResult=await sendEmail(Object.freeze({
   to:valid.email,
   subject:'APSYNTRA CRM workspace invitation',
   text:plainText,
   invitationId:receipt.invitationId
  }));
  if(providerResult?.accepted!==true)
   throw new Error('Delivery provider did not accept the message');
 }catch{
  // The provider may have delivered despite a timeout. Record an unresolved
  // attempt with IDs only, never with the bearer URL, token, or message body.
  try{
   await recordDeliveryOutcome(Object.freeze({
    invitationId:receipt.invitationId,state:'delivery-uncertain',providerMessageId:null
   }));
  }catch{
   // Failure to persist even uncertainty must not expose secrets or retry.
  }
  throw new Error('Invitation delivery outcome requires trusted reconciliation');
 }
 try{
  const providerMessageId=providerResult?.providerMessageId;
  if(typeof providerMessageId!=='string'||!UUID.test(providerMessageId))
   throw new Error('Invalid internal provider receipt');
  const recorded=await recordDeliveryOutcome(Object.freeze({
   invitationId:receipt.invitationId,state:'provider-accepted',providerMessageId
  }));
  if(recorded?.persisted!==true)throw new Error('Unrecorded provider receipt');
 }catch{
  // A message may already have been submitted; fail closed instead of
  // reissuing a token, retrying delivery, or claiming a completed audit.
  throw new Error('Invitation delivery receipt requires trusted reconciliation');
 }
 return Object.freeze({state:'delivery-submitted',invitationId:receipt.invitationId});
}
