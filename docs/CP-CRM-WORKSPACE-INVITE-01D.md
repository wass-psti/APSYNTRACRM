# CP-CRM-WORKSPACE-INVITE-01D — Genuine staging identity prerequisites and guarded provisioning

**Date:** 2026-11-20. **Status:** Verified staging blockers; isolated onboarding path implemented for future genuine users. Real invitation email delivery and signed recipient acceptance are NOT verified.

## Authoritative staging readback

Supabase isolated branch `apsyntra-invites-staging` (`jeqwjlxubntsddeauvqa`) has existing trusted `ws02d-invite` v3, `ws02d-accept` v3 and `ws02d-manage` v1 (JWT gateway verification enabled). WS02D/WS11 private SQL and the existing workspace foundation were installed and read back in CP-CRM-WORKSPACE-INVITE-01C.

The fresh readback still shows: `auth.users=0`, `auth.sessions=0`, profiles/workspaces/memberships `0`, invitation records `0`, delivery records `0`, and SQL invitation flag `false`. No existing staging identity is available for genuine end-to-end sending or acceptance. No provider sender and inbox delivery have been verified; no secrets were requested or printed.

## Implemented independent steps

1. `sql/staging/cp-crm-workspace-invite-01d-verified-user-onboarding.sql` is a controlled, **staging-only** provisioning transaction, intended to be run by the staging database operator with `psql -v inviter_email=... -v recipient_email=... -f ...` after both *real* users have verified and signed in via the staging GoTrue service. It reads existing user IDs from `auth.users`, requires distinct normalized confirmed emails, nonanonymous identities and live sessions. It refuses partial/nonempty workspaces and enabled invitation flags. It never writes Auth users, creates sessions, changes permissions, or sends an email.
2. On passing all gates, it creates exactly two profiles and separate personal workspaces/memberships using the existing schema and owner relation, with closed workspace metadata. It does not grant native Board/module access or add the recipient to the inviter workspace. That subsequent membership is granted only by signed invitation acceptance.
3. Isolated PostgreSQL 17 CI uses synthetic GoTrue-shaped rows to check **denied** unconfirmed email and repeated onboarding, no writes on rejection, successful two-workspace bootstrap, original recipient isolation and default-off flags. Source tests assert that no server-side account confirmation, Auth insertion or role grants were added. This disposable test does not simulate actual ownership of an email inbox.

## Remaining genuine two-account acceptance

A pair of **user-owned, distinct staging test mailboxes** and verified credentials/session flows must exist before this SQL can run on the isolated branch. Do not use real production employee emails or copy production auth accounts. Once staged users exist, run the guarded provisioning and verify two real GoTrue sessions with the independent workspace identities.

The trusted staging Edge handler also requires a verified staging-only sender/provider (`RESEND_API_KEY`, `APSYNTRA_INVITE_FROM`, staging callback URL and server DB URL). Use server-secret controls without exposing values, and verify provider acceptance separately from inbox delivery. Only then enable the **staging** invitation gates for a controlled one-time invite: owner sends → provider submits → owner/recipient verify inbox delivery → recipient signs in → accepts → membership added to inviter workspace → both sessions refresh and workspace selector/URM readback. Cover wrong/unverified/expired/revoked/replayed tokens, cross-workspace denial and duplicate submissions before considering production.

No production Edge, SQL, Auth, role, invitation or membership records were changed by CP-CRM-WORKSPACE-INVITE-01D.

## Exit classification

- Verified staging identity availability: **BLOCKED (0 signed users)**.
- Validated onboarding SQL and negative test scaffolding: **IMPLEMENTED**, awaiting CI run.
- Actual signed two-account staging invitation, sender acceptance, inbox delivery and membership sync: **NOT EXECUTED**.
- Existing production invite UI/Edge activation: **UNCHANGED / OFF**.

**Next milestone if genuine test identities and sender remain unavailable:** `CP-CRM-WORKSPACE-INVITE-01E — Verified Staging Identity Enrollment, Authorized Test Mailboxes and Sender Configuration, Genuine Signed Invite-and-Accept Closeout`.
