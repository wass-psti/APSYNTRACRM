/** Composition for the authenticated invitation issuer and email transport.
 * Off by default. The injected issuer and receipt writer MUST independently
 * enforce signed actor, session, workspace, and role authorization in SQL.
 */
import {createTrustedInvitationHttpBoundary} from './ws02d-invitation-http-boundary.mjs';
import {createResendInvitationProvider} from './ws02d-resend-provider.mjs';
export function createWs02dTrustedMailEndpoint({enabled=false,verifySignedActor,
 issueForAuthorizedActor,recordDeliveryOutcome,apiKey,verifiedSender,fetchImpl}={}){
 const sendEmail=createResendInvitationProvider({enabled,apiKey,verifiedSender,fetchImpl});
 return createTrustedInvitationHttpBoundary({enabled,verifySignedActor,
  issueForAuthorizedActor,recordDeliveryOutcome,sendEmail});
}
