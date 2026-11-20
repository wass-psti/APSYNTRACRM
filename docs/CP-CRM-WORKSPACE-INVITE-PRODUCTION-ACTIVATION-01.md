# CP-CRM-WORKSPACE-INVITE-PRODUCTION-ACTIVATION-01

**2026-11-20 — Production activation not executed: signed SMTP/recipient staging acceptance is absent.** This is a genuine release decision, not another invitation backend rewrite.

## Live read-only verification

- Existing production project `jtlusodorfnyzgyuewkz`: 43 Auth users, 126 stored session records. Five required existing platform structures verified: profiles/workspaces/memberships, native workspace scope, signed-session verification, owner-role model and digest extension. **Five invitation-specific structural checks MISSING**: invitation private schema/flag, trusted issuer/acceptor, manager, provider delivery ledger, and direct browser isolation check (cannot establish it until the invitation tables exist).
- Existing isolated staging branch `jeqwjlxubntsddeauvqa`: **10/10** production-compatibility SQL structural checks present, including private browser isolation, but **0 Auth users, 0 Auth sessions** and no genuine email-delivery or cross-session acceptance evidence. Three staging trusted routes are deployed; production still has dormant v1 invite/accept functions and no manager route.
- Both production and staging `SUPABASE_DB_URL` exist. `APSYNTRA_INVITE_SMTP_HOST`, `APSYNTRA_INVITE_SMTP_PORT`, `APSYNTRA_INVITE_SMTP_USER`, `APSYNTRA_INVITE_SMTP_PASSWORD`, `APSYNTRA_INVITE_FROM`, `APSYNTRA_INVITE_TRANSPORT`, `APSYNTRA_INVITE_APP_URL` and `APSYNTRA_INVITES_EDGE_ENABLED` are all missing as **Edge secrets** in both environments. Production Supabase Auth's separate custom SMTP settings cannot be assumed to be Edge secrets. No secret values were printed.
- Prior mail-server test established TLS handshake at SMTP port 465 and AUTH capability, but not successful login. Provider credential representation returned by the management API may be masked; no actual test inbox delivery has been observed.
- PR #656 already deployed an actionable, signed-readiness-gated Send button. It does not and should not falsely claim success when the production manager and issuer are not installed.

## New release evidence

`sql/diagnostics/cp-crm-workspace-invite-production-readiness.sql` is a **read-only** ten-component check of existing versus invitation-specific DB infrastructure. It ran against **both live projects**, initially exposed and then fixed a missing-table probe error, and now reports production 5/10, staging 10/10. No SQL migration, policy, credential change, or membership write was performed.

`server/ws02d-production-readiness.mjs` and its tests require independent real staging signatures, authenticated SMTP plus actual inbox delivery, signed recipient acceptance, cross-session membership and verified trusted Edge behavior, **in addition** to database structural completion. It does not turn on production flags or introduce new role checks; it is a release-evidence validator only.

## Existing functionality to use, not rewrite

1. Use existing staging SQL, trusted SMTP Edge v4 and signed recipient CLI from PRs #646–#651/#653. First establish **two independently verified real staging GoTrue accounts** with accessible inboxes. Account creation and confirmation must use genuine auth flows.
2. Verify approved SMTP credentials through the provider and configure **staging-only** Edge secrets; do not copy production SMTP credentials into staging without credential-owner approval. Validate sender identity and a staging acceptance callback.
3. Perform positive and denied signed staging invite/accept, real recipient inbox evidence, exactly one accepted membership, refresh/log-out/log-in workspace and role UI readback; demonstrate no token replay and duplicate issuance. Keep independent role assignments unchanged.
4. Only after staging is actually accepted, review production activation as a separate production data/config change: apply the existing ordered private SQL candidates to the existing production schema, deploy the reviewed trusted invite/accept/manage functions, configure approved production Edge SMTP sender and callback, and activate SQL/Edge/UI reception coherently. Include rollback and post-deployment signed real-user acceptance; don't change unrelated permissions.

**Final state: BLOCKED for genuine staging SMTP acceptance and production deployment.** No production data, permission, SMTP credential or Edge activation changed.

**Next bounded milestone:** `CP-CRM-WORKSPACE-INVITE-ACTIVATION-02 — Verified Staging SMTP Credentials and Two Real Inbox Accounts, Signed Send/Accept Verification, Then Controlled Production Rollout`.
