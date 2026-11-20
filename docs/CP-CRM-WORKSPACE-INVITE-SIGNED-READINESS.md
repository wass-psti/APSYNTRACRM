# CP-CRM-WORKSPACE-INVITE-SMTP-03 — Signed readiness and delivery diagnostics

Date: 2026-11-20. **Implementation: verified in tests and isolated staging deploy. Genuine email delivery / production activation: BLOCKED.**

## Reproduced root causes

1. PR #656 made the Send button actionable but incorrectly treated an authorized WS11 **history listing** as verification that **SMTP delivery** and the SQL invitation feature were ready. Listing could succeed while email credentials or issuance gates were missing. A generic fallback message conflated no Edge route, inactive delivery, unauthorized workspace, expired login, and uncertain SMTP submission.
2. Live production Supabase `jtlusodorfnyzgyuewkz` has **43 Auth users** and native workspace membership infrastructure but **no `private.ws02d_invitations`, issuer, provider delivery ledger, or `ws02d-manage` function**. Production invitation Edge handlers remain dormant v1. The frontend cannot send a real production invitation until those backend components are deliberately installed.
3. The existing isolated staging branch `jeqwjlxubntsddeauvqa` has the private WS02D/WS11 SQL/ledger and Edge routes, but **zero real GoTrue users or live Auth sessions** and **no WS02D SMTP Edge credentials/sender/callback**. The isolated staging SQL invitation feature is still off. Supabase Auth's own SMTP credentials are not automatically available as Edge secrets. The earlier production SMTP TLS handshake did not verify credential login or inbox delivery.

## Implemented, without role changes

- `ws02d-manage` now supports authenticated `operation: 'readiness'`, which is **read-only** and separately validates the current live signed GoTrue actor, the existing workspace sender permission, the private SQL invitation feature, the Edge activation flag, SMTP/Resend configuration and HTTPS callback. It returns a minimal signed `{schemaVersion, workspaceId, authorized, ready, reason}` receipt; it never returns environment variable values, emails, tokens, credentials or membership records.
- This **readiness-only** operation may inspect a disabled backend. All other WS02D operations remain blocked by the same Edge delivery flag. It does not issue or deliver anything; it is not SMTP network authentication or proof of inbox receipt.
- Frontend Workspace Invite launch paths now call `WorkspaceInvitationManagementClient.readiness()` before attempting any delivery; successful history listing no longer means ready. Readiness false prevents issuance. The UI distinguishes feature-disabled, delivery-config-missing, session expired, workspace denied, provider-uncertain and service unavailable without optimistic success or unbounded retries.
- Existing Member-only invitation, token validation, duplicate request ID, salted digest, atomic membership acceptance, SQL scopes and existing platform roles are preserved. Existing Resend fallback and SMTP adapter remain intact; no new service or schema dependency.

## Verification

- Signed-readiness unit tests assert SQL/Edge/SMTP/callback prerequisites independently, no token/secret disclosure, safe disabled-state inspection, expired/non-authorized caller outcomes, no issuance on unready, and no false success from WS11 listing.
- Full frontend and WS02D test suite **3139/3139 PASS** after updating three obsolete assertions; production Vite build PASS; migration SHA-256 source manifest PASS (222 recovered baseline +50 forward files).
- Deployed revised trusted `ws02d-manage` as **v2** to existing isolated staging branch only (`verify_jwt=true`). Staging SQL invitation flag remained `false`, zero signed staging users/invitations/delivery records. An unsigned HTTPS POST to staged `ws02d-manage` returned HTTP **401** via Supabase gateway. Signed positive receipt cannot be tested until real staging Auth users exist.
- No production Edge, SQL, Auth accounts, role permissions, provider secrets or feature flags changed. No email was sent. No production membership was inserted.

## Acceptance remaining

Two accessible test inboxes and independently confirmed staging GoTrue users, actual working SMTP credentials/sender and an approved staging callback must be provisioned before executing the existing 01D onboarding and 01E signed send/list/accept runner. Verify genuine SMTP provider response, actual recipient inbox delivery, token acceptance, precisely one workspace membership, refresh/logout/login and URM/selector synchronization, and duplicate/expired/revoked replay. After true staging acceptance, separately review production private SQL/Edge activation, SMTP Edge secrets and rollback policy. **Do not classify the complete invitation lifecycle as accepted yet.**

Recommended next bounded milestone: **CP-CRM-WORKSPACE-INVITE-SMTP-04 — Genuine Staging SMTP Credentials/Two-Account Acceptance and Controlled Production Backend Activation**. Prerequisite-dependent; do not repeat source-only tests without identities and sender.
