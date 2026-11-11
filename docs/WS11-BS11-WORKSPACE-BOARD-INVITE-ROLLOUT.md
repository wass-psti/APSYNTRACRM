# WS11 / BS11 — Workspace and board invitation implementation handoff

Status: **source implementation staged, NOT production-activated** (2026-11-11).
This is an incremental integration atop the existing WS02D invitation and BS09
board-management UI. No production Supabase database access is available through
the connected GitHub account. No SQL has been run, no member or account has been
created, and no invitation email has been sent.

## Intended user journey

1. A verified workspace owner or explicitly delegated administrator enters a
   recipient email and sends a **Member** invitation. A pending record is
   created by a private server transaction and sent by a trusted email provider.
2. The owner sees *pending*, *accepted*, *revoked*, *expired* or *declined*
   invitation statuses from the signed manager-only service; they can revoke a
   pending invitation, with server audit.
3. A recipient signs up/signs in through Supabase Auth with the exact
   email address, verifies ownership of that email, and accepts the single-use
   invitation. Membership begins ONLY upon verified acceptance.
4. Workspace membership grants **no board visibility by itself**. An owner
   with exact-board **manage** access grants an existing active workspace member
   **viewer** access to one board (without elevating any role).
5. Invitation acceptance does not automatically switch the current workspace;
   separately authorized signed workspace selection must succeed.

**Invited email is not an authenticated/registered user.** Treat an invitation
as a pending enrollment claim, not proof of registration. Only verified Auth
identity plus successful acceptance authorizes workspace membership.

## Source included in this change

- `frontend/workspace-invitation-management.js`: manager-only list/revoke
  contract, exact workspace and signed actor checks, receipt validation.
- `frontend/workspace-ui.js`: verified status display/revoke controls;
  pending data never synthesized locally or from email drafts.
- `frontend/workspace-board-groups.js`, `frontend/board-share.js`, and
  `frontend/app.js`: existing-member board viewer grant action. Re-reads signed
  directory after a committed backend receipt. No optimistic access changes.
- `sql/ws11-invitation-management-CANDIDATE-NOT-APPLIED.sql`: private,
  source-locked listing and revocation wrappers, no browser EXECUTE grants.
- `sql/bs11-direct-board-access-CANDIDATE-NOT-APPLIED.sql`: private
  manager-authorized exact-board viewer grant/revoke transaction, idempotency,
  row locking and audit. No browser grants.
- `frontend/tests/ws11-invitation-management.test.mjs`: negative tests and
  integration assertions. `frontend/soft-minimalist.css` plus deterministic CSS
  bundle provide low-clutter dialog styling.

## Why this cannot be activated with a frontend flag

The live Supabase endpoints `ws02d-invite` and `ws02d-accept` are intentionally
inert 503 handlers. The trusted PostgreSQL invitation schema, issuance,
acceptance, delivery ledger, SMTP/Resend provider, and secure Auth signup
trigger are **candidate implementations**; they have not been established as
installed and verified in production. The `bs09-board-access` signed Edge
function and authoritative board-management backend are not deployed.
The manager-only status route `ws02d-manage` must be implemented and mounted
using a verified GoTrue JWT/session and server-held DB secrets.

Do not enable:
`WS02D_INVITE_CLIENT_ENABLED`,
`WS02D_ACCEPTANCE_ENABLED`,
`WS11_INVITATION_MANAGEMENT_ENABLED`,
`BOARD_GROUP_ACCESS_ENABLED`,
`BOARD_COL01_DIRECTORY_ENABLED` or change SQL flags until live security
acceptance passes. Do not make raw `private` tables callable by browsers.

## Required Supabase delivery sequence (IT partnership)

1. Read-only inventory: installed functions, source fingerprints, owners, grants,
   RLS, auth.users triggers, current workspaces, active session mapping, domain
   ACL/Storage/Realtime surfaces and original migration rollback.
2. Harden existing signup/verified-email admission and personal Main Workspace
   provisioning (WS02B), without automatic platform admin or board grants.
3. Install and test WS02D private schema, issue/accept/revoke, expiration,
   delivery receipts and provider event ledger **in a disposable database**.
   Verify real GoTrue session revocation, email confirmation, single-use token,
   duplicate request and rate-limit behavior.
4. Implement Edge routes with JWT gateway verification and a trusted
   server-side session check (no service-role impersonation of browser users).
   Keep provider/API/DB secrets in Supabase Edge secrets, never in GitHub Pages.
   Provider-accepted is not inbox-delivered; reconcile uncertain outcomes.
5. Install WS11 and BS11 candidates in disposable DB and test **both**
   authentic owner and foreign employee, revoked session, wrong workspace,
   board mismatch, duplicate idempotency keys, target not a workspace member,
   non-owner manager and concurrent owner-transfer cases.
6. Verify every board view, item read/write, export, realtime subscription and
   Storage policy respects the same exact-board grant. A workspace role ceiling
   does not itself confer board access. Sensitive application modules need
   separate module-specific policies before grants.
7. Deploy disabled Edge routes, verify sealed 403/503 behavior, run two-account
   staging acceptance (one sender, one recipient), then use signed canary
   activation and rollback. Only after positive AND negative acceptance,
   enable the corresponding frontend flags in a separately reviewed change.

## QA acceptance

- Owner can invite by exact email, see pending, revoke; emails are not exposed
  to ordinary workspace users or other workspaces.
- Receipt contains no bearer token or provider secret.
- Unverified/wrong-email user cannot accept; accepted user has only the
  intended workspace Member role and no implicit board visibility.
- Board manager can grant *viewer* to an existing active workspace member for
  one board. Another board stays inaccessible. Ownership and editor role are
  unchanged. Revocations are reflected in new signed reads.
- Session expiry/revocation, denied permissions, network timeouts and
  uncertain delivery produce no optimistic success.
- All existing APSYNTRA UI, board rendering, and 45-source stylesheet integrity
  tests remain green.

Security posture: **default deny** until independently demonstrated live.
