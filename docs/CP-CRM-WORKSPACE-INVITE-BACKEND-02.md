# CP-CRM-WORKSPACE-INVITE-BACKEND-02 — Genuine staging acceptance and Bootstrap Administrator sender parity

2026-11-20. **Production activation NOT EXECUTED.** The candidate SQL and tests are reviewable preparation, not evidence of a live email delivery or role mutation.

## Live findings

- Existing isolated staging `jeqwjlxubntsddeauvqa`: **0 `auth.users`**, **0 active Auth sessions**. Private WS02D invitation, delivery and `ws02d_sender_authorized` infrastructure installed. The staging project has **no production canonical Bootstrap Administrator registry or `public.apsyntra_role_is_bootstrap()` helper**. Edge secrets inventory has **no** SMTP host, port, username, password, sender, transport, callback or activation flag. Therefore genuine two-account signed acceptance is blocked; do not fabricate users or transplant production identities.
- Existing production `jtlusodorfnyzgyuewkz`: **43 Auth users**, **128 session records**, missing `private.ws02d_invitations`, `private.ws02d_invitation_delivery`, and private `ws02d_sender_authorized` routine. Production has the existing canonical two-entry Bootstrap Administrator registry, CRM effective-role resolver and existing workspace memberships. The reported bootstrap account is active, registered, a confirmed Auth user, and effective CRM `admin` in Work Management and Main Workspace; its Work Management workspace relation is `member` and Main Workspace relation `owner`. These are distinct dimensions.
- The previously prepared WS02D sender candidate permits workspace owners and dedicated WS02D admin members, but not the existing verified Bootstrap Administrator in Work Management. This is **separate from the current production 404 backend error**, which occurs before role evaluation. No existing role restriction was changed.

## Scoped implementation — NOT APPLIED

`sql/activation/cp-crm-workspace-invite-bootstrap-sender-parity-CANDIDATE-NOT-APPLIED.sql` is an additive in-place `CREATE OR REPLACE FUNCTION` patch for a **future controlled production deployment after WS02D issuer exists and genuine staging acceptance passes**. It preserves existing owner/WS02D-admin checks and existing active *current workspace* membership requirement. It recognizes a Bootstrap Administrator only when the account is an exact match to the **existing canonical bootstrap registry**, confirmed Auth email, active profile `admin_general_manager`, and existing effective CRM `admin` for the selected workspace. It does not grant permissions to unrelated CRM users or introduce a new role category.

The file fails before changing the function if the issuer, canonical bootstrap registry, or CRM effective-role resolver is missing; keeps direct public/anon/authenticated EXECUTE revoked, and changes no accounts, workspaces, members, feature flags or SMTP credentials. It must be reviewed with the existing ordered SQL deployment/migration and rollback strategy, not run on its own. No changes were made to the existing production role resolver.

## Verification and remaining gates

- Local source/contract suite **123/123 PASS**, migration source integrity **272 entries PASS**. Source tests do **not** establish that the candidate was executed against Postgres or that signed bootstrap and nonbootstrap callers were accepted/denied in a live environment.
- A genuine acceptance needs two independently controlled confirmed staging GoTrue accounts, working approved SMTP Edge sender credentials, a real message delivered to the recipient inbox, signed token acceptance and membership persistence, and Work Management bootstrap sender parity plus ordinary member denial in a controlled test environment.
- A separately reviewed controlled production cutover must install WS02D/WS11 schema, issuer, manager and Edge functions with rollback, then activate SMTP after approved credential installation, run signed admin/recipient readback and confirm no duplicate memberships or unrelated role changes. Do not declare production readiness from this candidate or unit tests alone.

**Decision:** BLOCKED ON EXTERNAL SMTP AND STAGING IDENTITIES; PRODUCTION ACTIVATION NOT APPROVED. Avoid further coding-only milestone loops until genuine test mailboxes and provider credentials are provisioned.
