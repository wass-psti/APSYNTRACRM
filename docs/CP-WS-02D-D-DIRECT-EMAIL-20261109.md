# CP-WS-02D/D — Exact-email recipient flow

## Root cause

The existing private `ws02d_issue` contract already accepts a normalized `p_email` and **does not require a preexisting user ID**. However, the invitation dialog offered a multiple-recipient draft (up to 10 emails) and unimplemented elevated roles, while the deployed trusted `ws02d-invite` and `ws02d-accept` Edge routes were intentionally default-off. The production private invitation schema and authorized mail provider are not active. A user ID was never the real technical prerequisite for delivery.

## Implemented

- The existing Invite Members dialog now accepts exactly one recipient email address through a labeled accessible `type=email` input. It reuses the existing normalized invitation draft contract, rejects comma/semicolon/newline lists, and does not prompt for or resolve a user ID. Existing membership identities are not modified in the browser.
- The only currently safe proposed permission is workspace **Member**, which is explicitly shown as noneditable. No client-provided role or platform permission can bypass the private role ceiling. Platform role, workspace administrator privilege, application- and board-level assignments must remain separate signed User Role Management operations after independently authorized role approval. The link itself conveys no elevated privileges.
- An authenticated, default-disabled one-recipient transport is already present in `WorkspaceInvitationClient`. Its exact email value reaches the trusted endpoint only after signed current-workspace validation; this increment does not turn on the feature flag or send email.
- The private candidate `ws02d_issue` now denies a second unexpired pending invite for the same workspace and normalized recipient even with a different request ID, while preserving idempotent same-request replay. The workspace row lock serializes competing authorized senders. A disposable PostgreSQL test checks duplicate-pending denial without adding a user or membership.
- Delivery UI distinguishes a provider-submitted message from confirmed delivery; messages are not described as received or accepted. An unconfirmed response is not retried with a new request key.

## Existing and new identities

An invite targets the email address, not a fabricated user ID. A registered recipient signs in using their existing GoTrue account. A new recipient must use the existing registration and administrative activation path before server-side acceptance can identify an active, verified account. The private acceptance function must bind a single-use token to the verified recipient email and preserve the existing account/roles. **Do not call `admin.inviteUserByEmail` for an existing identity or create a shadow account merely to deliver workspace invitations.**

## Remaining live activation prerequisites

- Production `ws02d` tables and function grants are still absent; `ws02d-invite`/`ws02d-accept` are deployed but currently return `unavailable` for authorized requests and require Supabase JWT verification.
- Supabase documents that its default SMTP service delivers only to project-team email addresses; custom SMTP/sender-domain configuration is required to send to arbitrary addresses reliably. There is no verified production invitation mail provider configuration. Do not claim a genuine email was sent to the example address.
- Signed server transaction bindings, durable provider receipts, lifecycle reconciliation, newly registered-user activation, and genuine end-to-end email/acceptance tests are still outstanding. Also preserve the agreed provider-hosted recovery RPO/RTO acceptance gate; successful local recovery alone does not certify that contract.

No production Auth, SQL, Storage, role or SMTP mutations are performed in this increment. Default-off feature flags are unchanged.
