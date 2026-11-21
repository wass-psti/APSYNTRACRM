/** Explicit, controlled staging acceptance. Credentials are env-only and never printed.
 * Usage: node scripts/cp-crm-workspace-invite-01e-staging.mjs preflight|send|list|accept|verify-acceptance
 * All modes require WS02D_STAGING_ANON_KEY. preflight requires both JWTs.
 * send/list/verify-acceptance require only the inviter JWT; accept requires only recipient JWT.
 * send additionally requires WS02D_STAGING_WORKSPACE_ID, WS02D_STAGING_REQUEST_ID,
 * and WS02D_STAGING_RECIPIENT_EMAIL. accept requires WS02D_STAGING_INBOX_TOKEN.
 * verify-acceptance requires WS02D_STAGING_WORKSPACE_ID and WS02D_STAGING_INVITATION_ID.
 */
import { createGenuineStagingRunner } from "../server/ws02d-genuine-staging-runner.mjs";
const mode = process.argv[2];
if (
  !["preflight", "send", "list", "accept", "verify-acceptance"].includes(mode)
) {
  process.stderr.write(
    "Usage: staging.mjs preflight|send|list|accept|verify-acceptance\n",
  );
  process.exitCode = 2;
} else {
  const runner = createGenuineStagingRunner();
  const env = process.env;
  const publishableKey = env.WS02D_STAGING_ANON_KEY;
  try {
    if (mode === "preflight") {
      await runner.pair({
        inviterJwt: env.WS02D_STAGING_INVITER_JWT,
        recipientJwt: env.WS02D_STAGING_RECIPIENT_JWT,
        publishableKey,
      });
      console.log(
        "STAGING_IDENTITIES_VERIFIED — two distinct, confirmed GoTrue accounts",
      );
    } else if (mode === "send") {
      const result = await runner.send({
        inviterJwt: env.WS02D_STAGING_INVITER_JWT,
        publishableKey,
        workspaceId: env.WS02D_STAGING_WORKSPACE_ID,
        requestId: env.WS02D_STAGING_REQUEST_ID,
        recipientEmail: env.WS02D_STAGING_RECIPIENT_EMAIL,
      });
      console.log("STAGING_INVITATION_PROVIDER_RESULT", JSON.stringify(result));
    } else if (mode === "accept") {
      const result = await runner.accept({
        recipientJwt: env.WS02D_STAGING_RECIPIENT_JWT,
        publishableKey,
        token: env.WS02D_STAGING_INBOX_TOKEN,
      });
      console.log("STAGING_SIGNED_ACCEPTANCE", JSON.stringify(result));
    } else if (mode === "verify-acceptance") {
      const result = await runner.verifyAcceptance({
        inviterJwt: env.WS02D_STAGING_INVITER_JWT,
        publishableKey,
        workspaceId: env.WS02D_STAGING_WORKSPACE_ID,
        invitationId: env.WS02D_STAGING_INVITATION_ID,
      });
      console.log(
        "STAGING_INVITER_ACCEPTANCE_READBACK",
        JSON.stringify(result),
      );
    } else {
      const result = await runner.list({
        inviterJwt: env.WS02D_STAGING_INVITER_JWT,
        publishableKey,
        workspaceId: env.WS02D_STAGING_WORKSPACE_ID,
      });
      console.log("STAGING_MANAGER_READBACK", JSON.stringify(result));
    }
  } catch {
    // Never print provider response bodies, JWTs, or invitation tokens.
    console.error(
      "STAGING_ACCEPTANCE_BLOCKED — reconcile signed server and invitation state; no automatic retry",
    );
    process.exitCode = 1;
  }
}
