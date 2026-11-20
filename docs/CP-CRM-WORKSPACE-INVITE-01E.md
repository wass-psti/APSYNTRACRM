# CP-CRM-WORKSPACE-INVITE-01E — Real staging identities and trusted provider acceptance

**Date:** 2026-11-20. **Disposition:** Genuine signed acceptance **BLOCKED** on external test-account/sender prerequisites. The staging-only execution harness is implemented and tested. Production untouched.

## Verified live state

The existing isolated staging branch `apsyntra-invites-staging` (`jeqwjlxubntsddeauvqa`) still has **0 GoTrue users, 0 Auth sessions, 0 workspace profiles/memberships, 0 invitations and 0 delivery records**. Private WS02D SQL issue/accept/management routines and trusted staging-only Edge `ws02d-invite` v3, `ws02d-accept` v3 and `ws02d-manage` v1 exist, retaining `verify_jwt=true`. The private SQL invitation feature flag is **OFF**. The connected Mac's available process environment exposes no `RESEND`, `SMTP`, `SUPABASE` or invitation test credentials; staging public Auth settings returned HTTP 401 when requested without a publishable key. No test mailbox or provider delivery has been independently established.

Accordingly, it would be inaccurate to claim real email receipt, staging signed-user enrollment, or recipient membership. Do not invent mailbox identities or insert GoTrue verification records directly.

## Implemented

- `server/ws02d-genuine-staging-runner.mjs` pins the isolated staging host and requires **two distinct real GoTrue `/auth/v1/user` responses** with verified emails before sending. It uses the staging publishable key and two signed bearer tokens only in memory; it rejects duplicate identities and missing confirmation. It sends only to the email returned for the authenticated recipient, with Member role, stable request ID and expected workspace scope.
- `scripts/cp-crm-workspace-invite-01e-staging.mjs` offers explicit operations: `preflight` (no writes), `send` (one intentional staging invitation), `list` (owner-scoped reconciliation), `accept` (requires bearer token retrieved from the recipient's verified inbox). It never prints access tokens, acceptance tokens or passwords and does not automatically retry a failed/uncertain send. A successful provider submission is **not** claimed as an inbox delivery; `inboxDelivered` remains false until separately evidenced by the recipient.
- Tests cover absent/unconfirmed/same-account denial before writes, normalized verified recipient address, exact staging host, provider receipt validation, no automatic retry, token avoidance and distinct owner/recipient flows. Dedicated CI never receives external credentials.

## Genuine controlled acceptance procedure

1. Establish **two real user-owned staging test inboxes**, one inviter and a different recipient. Authenticate and confirm each account through the *existing staging* GoTrue flow. No production account cloning or Auth SQL verification updates. Verify the staging branch has the two authenticated identities and live session rows.
2. Run the previously merged guarded staging-only onboarding SQL `sql/staging/cp-crm-workspace-invite-01d-verified-user-onboarding.sql` with the two confirmed addresses. This creates separate personal workspaces, keeping invitation flags OFF. Verify the inviter owns their workspace and the recipient remains in a separate one.
3. Verify stage-only `SUPABASE_DB_URL`, `RESEND_API_KEY`, `APSYNTRA_INVITE_FROM`, `APSYNTRA_INVITE_APP_URL` and `APSYNTRA_INVITES_EDGE_ENABLED` configuration through secure service controls. Never print or commit their values. Approve a usable staging sender and recipient inbox. Ensure callback target is a staged acceptance UI with the client acceptance feature enabled only for staging; the production GitHub Pages frontend remains OFF.
4. Explicitly enable staging-only invite SQL and Edge flags *after* all negative and recovery checks. Supply ephemeral environment values `WS02D_STAGING_ANON_KEY`, `WS02D_STAGING_INVITER_JWT`, `WS02D_STAGING_RECIPIENT_JWT` and run `node scripts/cp-crm-workspace-invite-01e-staging.mjs preflight` (no writes). Confirm distinct verified users.
5. For a controlled one-time send, provide the intended `WS02D_STAGING_WORKSPACE_ID` and stable `WS02D_STAGING_REQUEST_ID`, run `... staging.mjs send`, then `... staging.mjs list`. A submitted provider receipt only establishes provider API acceptance. Independently verify **actual delivery in the recipient inbox** before extracting the one-time acceptance token into ephemeral `WS02D_STAGING_INBOX_TOKEN` and calling `... staging.mjs accept`.
6. Verify exactly one new membership in the inviter workspace, unchanged recipient personal workspace selection and no automatic Board grants. Repeat manager list and membership/URM readback from separate sessions, refresh and reauthentication. Test wrong-account/expired/revoked/replayed tokens, duplicate sends, ambiguous provider outcomes and workspace isolation. Disable staging test flags when complete.

### Remaining gate

**Genuine acceptance is not yet complete.** It requires real accessible test mailboxes, valid staging GoTrue accounts/sessions, verified sender credentials and explicit staging acceptance UI configuration. The production SQL schema, Edge placeholders, UI feature flags, memberships and permissions have not been changed.

**Next solid milestone if blocked:** `CP-CRM-WORKSPACE-INVITE-01F — Verified Staging Test-Account Enrollment and Sender Provisioning, Signed Invite/Accept Execution, and Final Cross-Session Closeout`.
