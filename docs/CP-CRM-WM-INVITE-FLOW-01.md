# CP-CRM-WM-INVITE-FLOW-01

## Objective

Simplify the existing Work Management invitation experience and make the invitation-to-authentication handoff easier to complete without introducing a new invitation backend, role system, or account-admission path.

## User workflow

1. A workspace member opens **Invite members** from the current workspace.
2. The dialog accepts one email address and an optional message.
3. The client checks the existing signed invitation readiness endpoint.
4. The existing invitation service sends a one-time link and records the delivery attempt.
5. An existing account signs in with the invited email and accepts the invitation.
6. The existing acceptance function records the workspace membership; the workspace switcher is refreshed from the signed workspace catalog.

## UI changes

- Replaced the multi-step review/send presentation with one **Send invitation** action.
- Removed the extra role explanation, message suggestion chips, and duplicate review action.
- Kept the existing Member membership contract and signed readiness check.
- Renamed the history section to **Invitations** and retained refresh/revoke controls.
- Added responsive light/dark styling and clearer pending/accepted/expired/revoked states.
- Refreshes invitation history after a send; an in-flight initial history read is followed by a second read so the newly issued invitation is not hidden by a stale result.
- A possibly submitted send is not automatically repeated; the UI directs the sender to reconcile invitation history.

## Authentication continuity

- An invitation token is captured and scrubbed from the URL before processing a GoTrue callback.
- Query-based invitation handoff is also supported and scrubbed.
- The volatile invitation remains in the current tab through sign-in and session expiry.
- The signed-out invitation screen explains the existing-account path.
- Account-access requests open in a separate tab so the original invitation link is not lost.
- Invitation email copy explains both existing-account and new-account paths.

## Existing new-account admission policy

The current registration screen is an administrator-reviewed access request, not self-service account creation. This implementation preserves that existing account-admission policy and does not enable global signup, alter Auth triggers, or create a new invite-only account-provisioning mechanism. New recipients must complete the existing account-admission and email-verification process, then return to the original invitation and sign in before accepting.

A fully self-service invitation-only account-creation flow would require a separate, explicitly scoped Auth admission change. It is not silently enabled by this UI implementation.

## Boundaries

- Reuses the existing Supabase project, Edge Functions, SQL invitation records, SMTP configuration, and workspace membership tables.
- No schema or database migration.
- No new roles, permission tiers, or approval layers.
- No production configuration changes.
- No direct browser membership writes.
- Existing server-side invitation and acceptance validation remains authoritative.

## Acceptance evidence

- Full repository suite: 3,183 tests passed. Focused invitation/auth suite: 89 tests passed.
- Changed JavaScript modules pass `node --check` and ESLint; the changed Markdown document passes Prettier.
- CSS bundle rebuilt with `scripts/build-priority5-styles.mjs`; production Vite build passed.
- Live SMTP submission, recipient inbox delivery, recipient acceptance, and membership readback require staging end-to-end acceptance after deployment.
