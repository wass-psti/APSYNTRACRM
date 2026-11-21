# CP-CRM-WM-INVITE-FLOW-02 — Production SMTP Provisioning and Recipient Acceptance

## Current production discovery

Project: `jtlusodorfnyzgyuewkz` (`APSYNTRACRM`), healthy. The production project already contains the eight expected server-side invitation SMTP settings. Secret digests were compared against the previously approved non-secret values without displaying or retrieving the password. Confirmed: SMTP transport, TLS port 465, provider host, sender username, sender address, and production GitHub Pages callback. SMTP password is present. `APSYNTRA_INVITES_EDGE_ENABLED=false`; the private SQL invitation flag is also `false`.

The existing invitation database prerequisites are present **10/10**. There are no invitation or delivery rows. No schema migration is required. `advanced_roles_enabled` remains false.

Existing production test identities were found and checked: inviter `lmsenagan@watchdogautomation.com.ph` is active, email-confirmed, and allowed by `private.ws02d_sender_authorized` for Work Management. Recipient `jspagsuguiron@watchdogautomation.com.ph` is active, email-confirmed, and is not yet a Work Management member. Neither account is created or modified by this implementation.

## Implementation

- Reuse the current SMTP provider and server-only Supabase Edge secrets.
- Add a no-send SMTP `verify()` preflight using the existing pinned Nodemailer dependency.
- Authenticate the SMTP server **before** calling `private.ws02d_issue` or preparing the delivery ledger. A bad password or SMTP connection therefore cannot create an orphaned pending invitation.
- Sanitize connection failures; never return SMTP credentials, error details, or invitation tokens.
- Keep the existing SMTP submission, provider receipt hashing, uncertainty reconciliation, and no-automatic-retry behavior.
- Deploy the existing `ws02d-invite`, `ws02d-manage`, and `ws02d-accept` functions. Do not add another mail provider or function.
- Activate only the existing invitation Edge flag and SQL invitation flag after function deployment and live readiness checks. Keep advanced-role features off.

## Production acceptance

1. Readiness for the inviter's Work Management workspace reports configured, authorized, and enabled.
2. SMTP authentication preflight succeeds without sending a message.
3. One invitation is issued to the verified recipient; exactly one provider submission is recorded.
4. Recipient confirms receipt in the actual mailbox and opens the production acceptance link.
5. Recipient signs in with the matching email and accepts.
6. `private.ws02d_accept` records one membership; inviter and recipient independently read the updated membership/workspace catalog.
7. Recipient's workspace switcher shows Work Management after refresh and a fresh sign-in.
8. Invitation, delivery, event, and membership records reconcile; no duplicate invite or membership is created.

## Boundaries

- No new Supabase project, mail account, or provider.
- No schema changes or new migrations unless live inspection disproves the existing 10/10 structure.
- No new roles, permission tiers, or authorization redesign. Existing sender and recipient validation remain the established invitation contract.
- Do not enable `advanced_roles_enabled`.
- Never copy secrets into GitHub, local files, browser code, logs, or chat.
- Provider SMTP acceptance is not treated as inbox delivery. The recipient must confirm the actual mailbox receipt.

## Local verification

- Full frontend suite: **3,211 passed**.
- Full server suite: **120 passed**.
- Focused invitation/SMTP regression: **24 passed**.
- `npm run lint`: PASS.
- Changed SMTP adapter and tests ESLint: PASS.
- `npm run format:check`: PASS.
- New release note Prettier check: PASS.
- Production Vite build: PASS (existing large-chunk advisory only).
- `npm run check`: PASS.
- `git diff --check`: PASS.
