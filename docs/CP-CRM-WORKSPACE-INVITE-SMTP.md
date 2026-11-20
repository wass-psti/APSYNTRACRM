# CP-CRM-WORKSPACE-INVITE — Reuse existing Supabase SMTP

## Authoritative read-only discovery (2026-11-20)

The **production** Supabase project `jtlusodorfnyzgyuewkz` has a custom Supabase Auth SMTP configuration: host/user/password/sender settings present, port **465**; Auth email enabled; automatic email confirmation disabled; SMTP frequency 60. The **isolated staging branch** `jeqwjlxubntsddeauvqa` has no custom SMTP host/user/password/sender; it still has zero GoTrue users/sessions/memberships and WS02D invitation SQL flag disabled. Values were not printed or committed. Auth configuration was read using the Supabase Management API, not guessed from environment variables.

A non-delivery connectivity test against production SMTP established TLS handshake on port 465 and AUTH advertisement. **Authentication did NOT pass using the configuration representation returned by the management interface**. This could reflect a redacted credential value or an actual credential/server mismatch; neither cause is independently proven. No SMTP MAIL FROM, RCPT TO or DATA command was issued, and no real email was sent. Actual deliverability **NOT VERIFIED**.

Supabase custom SMTP is wired into **GoTrue Auth mail flows** (signup confirmation, account invitations, OTP, recovery). It does not offer an arbitrary authenticated SMTP send endpoint for application-specific workspace tokens. Supabase `auth.admin.inviteUserByEmail` is for new Auth account enrollment and fails for existing confirmed users. Replacing `private.ws02d_issue` with an Auth invite would lose workspace-specific idempotent pending/accepted/revoked state and existing-user support. Refer to Supabase custom SMTP and Auth invitation docs.

## Scoped implementation

This PR preserves existing WS02D SQL issuance, token and membership acceptance, staging-only JWT Edge guards, sender/recipient verification, idempotent ledger, retry-uncertainty and default-off frontend/SQL/Edge gates. It adds a **selectable SMTP send adapter to the existing trusted Edge route**, without replacing any existing access/permission model and without creating another SMTP provider account. `APSYNTRA_INVITE_TRANSPORT=smtp` opts into SMTP; absent value retains existing Resend behavior.

It uses **pinned `npm:nodemailer@10.6.0`** only for the selected SMTP transport, with TLS required and validated on SMTP port 465 or STARTTLS port 587. It demands explicit private Edge environment values:

- `APSYNTRA_INVITE_SMTP_HOST`, `APSYNTRA_INVITE_SMTP_PORT`, `APSYNTRA_INVITE_SMTP_USER`, `APSYNTRA_INVITE_SMTP_PASSWORD` (server only)
- `APSYNTRA_INVITE_FROM`, `APSYNTRA_INVITE_APP_URL` (stage-specific callback)
- `APSYNTRA_INVITE_TRANSPORT=smtp`, `APSYNTRA_INVITES_EDGE_ENABLED=true` (staging-only after gate)

These are **not automatically shared from Supabase Auth SMTP settings**. A project operator must set the Edge secrets using authorized secure secret management. Do not copy a production SMTP password into staging without explicit credential-handling authorization. Do not put SMTP credentials in browser env, GitHub Actions, committed code or logs.

The adapter sends a single message addressed only to the normalized recipient, with the existing signed WS02D acceptance link, validates SMTP accepted-recipient result and hashes provider `messageId` before recording an allowed ledger identifier. Provider SMTP acceptance is **not** proof of inbox delivery. TLS errors, login errors, timeouts, disconnected recipients, or missing receipts are recorded as `uncertain` and require manual ledger reconciliation; no automatic resend. Invalid credentials/configuration stop **before** invitation issuance.

## Verified / pending

- Local unit and integration/source tests verify SMTP 465/TLS, SMTP 587/STARTTLS, outbound envelope, supported sender, no unsafe header/body injection, missing credentials, ambiguous results, one send only, no secret/token response, stable SMTP ledger message ID, and unchanged Resend path.
- Deployment of updated trusted Edge route may be made only in the **existing isolated staging branch** with current invitation feature gates **OFF**. Do not deploy to production without the separate production-role/config/data impact approval.
- Real signed staging invite/accept remains **BLOCKED** while there are zero test users, no approved staged sender credentials, and an inactive SQL invitation feature gate. After both users verify via GoTrue, a controlled staging-only provider/inbox acceptance can proceed, including registration for new users, existing-user matching, refresh/logout/relogin and workspace selection/URM readback.

## Next acceptance milestone

**CP-CRM-WORKSPACE-INVITE-SMTP-02 — Verified Staging SMTP Credential Activation, Two Real GoTrue Accounts, Delivered Workspace Invitation and Cross-Session Acceptance.** This is a genuine external environment/provisioning gate, not a reason to bypass existing authentication.
