# CP-CRM-WORKSPACE-INVITE — Production integration investigation

**Date:** 2026-11-20 · **Scope:** Existing APSYNTRA CRM project and signed workspace invitation flow. **Status:** root cause verified; production invitation lifecycle NOT operational.

## Evidence and verified defects

| ID | Verification | Root cause / disposition | Corrective action |
|---|---|---|---|
| INV-01 | Signed Administrator desktop browser: Invite Members opens, `Send invites — pending activation` disabled, invite-history Refresh disabled. Repository flags `WS02D_INVITE_CLIENT_ENABLED=false`, `WS02D_ACCEPTANCE_ENABLED=false`, `WS11_INVITATION_MANAGEMENT_ENABLED=false`. | The frontend intentionally never sends, accepts, lists or revokes invitations. Not a failed form submit. | Activate only following verified trusted lifecycle; preserve explicit disabled state until rollout gates pass. |
| INV-02 | Production Supabase Edge list: `ws02d-invite` and `ws02d-accept` ACTIVE v1 with JWT gateway verification. Retrieved production source imports shared `ws02d-inactive.mjs`, returning `503 {state:'unavailable'}` on allowed POST and never reading bodies or calling DB/Email. | A deployed route name is only a dormant placeholder, **not** an operational invitation service. Repository candidates instead import `ws02d-trusted.ts`; deployment differs from source. | Reconcile deployed source fingerprints, deploy trusted handlers only after disposable and signed staging acceptance. |
| INV-03 | Production `information_schema.tables`/`pg_proc`: no `private.ws02d_invitations`, `private.ws02d_issue`, `private.ws02d_accept`, or invitation status/ledger installed. | No authoritative pending-invitation persistence or acceptance transaction in production. | Validate staged SQL issue/accept schema, delivery ledger and lifecycle in isolated PostgreSQL first; prepare reversible migration. |
| INV-04 | Production Edge list contains **no** `ws02d-manage`; `WorkspaceInvitationManagementClient` routes to this missing endpoint and is disabled. | Pending/accepted/revoked/expired listing and cancellation cannot work live. | Mount and verify manager-only listing/revocation after private schema and issue/accept contracts exist; preserve existing workspace membership model. |
| INV-05 | `WS02D_ACCEPTANCE_ENABLED=false`, deployed accept route is dormant; candidate `private.ws02d_accept` requires single-use token, nonexpired pending invitation, matching confirmed auth email, existing active profile, and writes `workspace_members` only upon signed acceptance. | No delivered link can currently result in a verified new membership. | Verify genuine two-account send → authenticated email match → accept, expiration/revocation/replay, then refresh and reauthentication. |
| INV-06 | Candidate trusted backend/Resend adapter and delivery-ledger SQL exist in repository but the deployed Edge routes are dormant; provider send and delivery reconciliation not production-verified. | Email delivery and ambiguous outcomes cannot be certified. | Configure verified server-side sender in isolated staging, test provider-accepted vs delivered and uncertain outcomes; never put provider secrets in GitHub Pages. |
| INV-07 | Existing form validates one email, normalizes recipient, uses one UUID request ID per unchanged draft, prevents concurrent submit, and displays uncertain outcomes without optimistic membership. Existing staged issuance SQL uses workspace-row locking and duplicate-pending guards. | UI safeguards exist, but concurrency, idempotency, cross-workspace writes and lifecycle persistence have not been integration-tested end to end in the deployed service. | Test same/different request IDs, concurrent send, mail uncertainty, duplicate existing member, workspace scope, refresh and cross-session list consistency in disposable/staging environment. |

## Existing established boundaries

- Frontend: `frontend/workspace-ui.js`, `frontend/workspace-invitation-client.js`, `frontend/workspace-invitation-management.js`, `frontend/workspace-invitation-acceptance.js`, wired through `frontend/app.js`.
- Staged backend: `supabase/functions/_shared/ws02d-trusted.ts`, `supabase/functions/ws02d-{invite,accept,manage}/index.ts`, candidate SQL under `sql/cp-ws02d-*` and `sql/ws11-*-CANDIDATE*`.
- Production workspace membership uses the **existing** `public.workspace_members` primary key `(workspace_id,user_id)` and FKs to existing workspaces/profiles. Production read-only inventory counted 45 memberships across five workspaces. Do not create duplicate membership tables or introduce a second workspace model.
- Invitation is a pending enrollment claim, **not** a new account, automatic board permission, or workspace switch. Registration/auth state comes from existing GoTrue/CRM; accepted membership must be visible only after signed transaction and fresh workspace/member/URM readbacks.
- All baseline issue/accept/frontend contract tests passed during investigation: 24/24 (plus 28/28 invitation tests before the new preflight). Newly added test makes current production-off boundaries explicit, without toggling them.

## Priority, sequence and acceptance

### Next solid milestone — CP-CRM-WORKSPACE-INVITE-01

**Trusted Workspace Invitation Backend Integration, Disposable Lifecycle Acceptance, and Signed Two-Account Staging Verification**

1. Inventory the production source baseline, staged SQL dependencies, route response shapes, and approved delivery provider configuration (metadata only; no secret disclosure). Reuse the existing project and role/membership models.
2. Exercise staged schema, `ws02d_issue`, acceptance/revoke, delivery status/reconciliation and expiry in isolated PostgreSQL. Prove exact-workspace membership, idempotent duplicate issuance, transaction rollback, concurrent requests, existing member reuse/denial, and single-use acceptance. No business data or permission changes in production.
3. Validate trusted Edge handlers in isolated staging with genuine signed inviter and recipient accounts, including invalid/wrong-email/unconfirmed/expired/revoked/replayed token cases; prove no email secret is sent to the client. Check manager-only listing and cancellation.
4. Verify message delivery using an approved sender and real test inbox. Distinguish provider submission, inbox delivery, and uncertain reconciliation. Avoid automatic resends after ambiguous outcomes.
5. Prove successful invitation appears after refresh, reauthentication, workspace selection, and existing User Role Management membership read. Reject duplicate membership and cross-workspace leakage. Existing native app/board assignments must remain unchanged.
6. Once staging gates pass, prepare a specific controlled production activation/rollback proposal (separate production permission/data approval) and only then enable production Edge/database/frontend flags together.

**Acceptance matrix:** Send creation and stable idempotent retry; verified pending state; cancellation; expiry; exact matching recipient acceptance; duplicate and replay rejection; existing-user and new-user registration path; workspace isolation; no implicit board access; signed membership and URM readbacks after refresh and reauthentication; negative session and concurrency cases; no unnecessary network polling; mobile and keyboard dialog behavior; untouched existing native application functionality.

### Following milestone, only after CP-CRM-WORKSPACE-INVITE-01 passes

**CP-CRM-WORKSPACE-INVITE-02 — Controlled Production Activation, Verified Email Delivery, Genuine Recipient Acceptance, and Cross-Module Membership Closeout.**

Do not advertise functional completion before actual issuance, delivery receipt, acceptance, persisted membership, and cross-session readback are observed. Do not enable default-off flags as a substitute for missing server contracts.
