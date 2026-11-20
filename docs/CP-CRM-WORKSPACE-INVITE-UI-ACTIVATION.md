# CP-CRM-WORKSPACE-INVITE — Send Invites UI Activation

Date: 2026-11-20. **Frontend functional improvement implemented; SMTP delivery and production backend activation remain pending external readiness.**

## Verified root cause

The Workspace Invite panel's Send Invites button was disabled by a hard-coded `WS02D_INVITE_CLIENT_ENABLED=false` constant. All three frontend launch paths passed this flag to the dialog, so the already-developed trusted invitation transport was never consulted. The workspace-specific frontend, accept and manager clients were default-off. Production's private WS02D invitation table, delivery ledger and issuance function remain ABSENT from the authoritative Supabase production database, so flipping the flag alone would falsely claim activation.

## Implemented smallest useful change

- Retain all original default-off constants for existing standalone callers; do **not** globally allow unverified client-side issuance.
- The three authenticated Workspace Invitation launch paths now explicitly allow the Send invitation control and route through an **enabled, signed** `WorkspaceInvitationClient`, with a fresh **read-only trusted `ws02d-manage` listing** as a prerequisite on each Send click.
- This check must return normalized `SIGNED_MANAGER_LIST` for the currently signed workspace. Otherwise the dialog displays **"Invitation sending is not yet active on the trusted server. No email was submitted."**, without calling `ws02d-invite` or creating any membership/record. Readiness is not inferred from an optimistic browser toggle or cached result.
- If the read succeeds, the same signed-user and scoped-workspace client calls the existing trusted `ws02d-invite` Edge route once with the existing stable request ID and the Member role. Delivery receipts remain independently verified. An unknown provider outcome cannot be retried as a fresh request; the user is told to reconcile it.
- No new role checks, RLS policies, module assignments, SMTP credentials, dependencies, RPCs, or production database changes. Signed user identity, existing backend workspace scope and invitation audit contracts remain authoritative.

## Verification and honest limitations

- Scoped and frontend regression tests verify mock signed manager readiness, signed workspace scope, no issuer call when manager is disabled, all three launch points wired, error states, safe recipient and request ID contracts.
- Full regression, build and GitHub CI must be reported separately. This change makes the button **clickable with truthful readiness feedback**, not falsely operational when the backend is missing.
- Real production delivery is still **BLOCKED** until the production invitation private schema and trusted endpoints are deliberately activated, actual SMTP credentials authenticate, a working sender/inbox exists and two-account acceptance has passed in staging. The production Auth SMTP setup cannot automatically enable the workspace-specific WS02D backend. A verified server acceptance test remains required for production readiness.

## Remaining acceptance milestone

`CP-CRM-WORKSPACE-INVITE-PRODUCTION-ACTIVATION-01 — Verified SMTP/Two-Account Staging Acceptance, Controlled Production Invitation Backend and Sender Activation, and Genuine Signed UI Send/Accept Closeout`.

This milestone requires a separate reviewed production migration/deployment and credential provisioning; it is not performed by un-greying a button.
