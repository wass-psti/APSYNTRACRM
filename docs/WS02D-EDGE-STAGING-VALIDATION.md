# WS02D / WS11 / BS11 trusted Edge integration — staging only

Status: **review candidate; NOT deployed or enabled**. The four route handlers are
wired to a shared server-only transport on branch
`feat/ws02d-trusted-edge-staging`. The frontend flags and WS02D SQL invitation
feature flag remain **OFF**. Do not merge or deploy to production without approval.

## Implemented contract

- `ws02d-invite`: verified GoTrue user, live session and owner-authorized
  private `ws02d_issue` transaction, then provider-accepted email submission.
  A fresh 32-byte random token is handled server-side only and sent in a
  recipient's one-use invitation link. Browser receipt has no token.
- `ws02d-accept`: verified matching-email authenticated recipient; private
  `ws02d_accept` checks single use and expiry, then records workspace member.
  No automatic workspace switch or board grant.
- `ws02d-manage`: workspace-scoped manager-only `list` and `revoke`,
  using WS11 private routines.
- `bs09-board-access`: `change-board-access` for an **already verified
  active workspace member**, viewer grant/revoke on a single board (BS11).
  Group creation and new-recipient board invites are NOT implemented.

The shared handler checks the bearer token through GoTrue /auth/v1/user,
then executes the private SQL using a server-only database connection with
transaction-local `request.jwt.claims`. The private functions recheck the
session against `auth.sessions` and enforce the signed workspace scope.
Neither a service-role JWT impersonating a browser user nor direct browser
EXECUTE grants are used. CORS is an additional constraint, not authorization.

## Required environment (never commit values)

- `SUPABASE_URL`: project URL (staging, not production).
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`: public JWT gateway
  key used to verify callers through GoTrue.
- `SUPABASE_DB_URL`: server-only **staging** direct PostgreSQL URL, with TLS.
  The database role needs narrowly scoped EXECUTE/access to the private
  routines and live session reads; review direct postgres connection
  privileges, RLS and grants before activation. Prefer a dedicated least-
  privilege role for deployment, rather than a broad superuser.
- `APSYNTRA_ALLOWED_ORIGIN`: exact expected web origin
  (defaults to `https://wass-psti.github.io`).
- `APSYNTRA_INVITES_EDGE_ENABLED`: must equal `true` **only in approved
  staging** after full authorization review.
- `RESEND_API_KEY`, `APSYNTRA_INVITE_FROM`: trusted Resend server credentials
  and verified sender. Do not expose in frontend or repository.
- `APSYNTRA_INVITE_APP_URL`: HTTPS app URL for invitation acceptance link.

## Local acceptance already achieved by SQL-only testing

The isolated local database accepted WS02D/WS11/BS11 SQL. Synthetic owner and
employee accounts, signed sessions and workspace switching were verified.
A signed-clause SQL transaction tested invitation acceptance. The employee's
explicit Board A viewer grant returned `true` and Board B `false` through
`work_board_access`. Direct `public.work_boards` table reads are intentionally
RLS-denied both locally and in production; verify normal signed RPC readers.

**These tests are not Edge Function or provider email E2E verification.**

## Remaining blockers / launch gates

1. Recover and reconcile production baseline and custom auth triggers/roles
   into reproducible staging migration setup. Current staging is missing the
   production database foundation; do not push 190 historical SQL migrations
   onto the consolidated snapshot.
2. Install candidate SQL **in staging only**, preserving default-off flags.
   Confirm exact function signatures, owner grants, active session checks,
   RLS, authenticated negative tests, and schema migration rollback.
3. Harden send/delivery with a durable provider event ledger and reconciliation
   worker: SQL issuance commits before mail provider call; a send failure or
   timeout leaves a pending token **unrecoverable** from `ws02d_issue` alone
   (idempotent replay intentionally does not return it). Do not claim email
   delivery merely on provider API acceptance. Reissue requires controlled
   revoke/replace; never auto-retry with a different request ID.
4. Validate GoTrue-authenticated POST requests to all four routes, including:
   expired/revoked token and session; wrong email; unverified account;
   workspace A/B cross-tenant attempts; duplicate request; revoked invitation;
   acceptance replay; manager listing privacy; Board A yes/Board B no; direct
   table, module RPC, Realtime, Storage and exports isolation.
5. Implement and deploy an owner-authorized, signed board-member directory
   endpoint that supplies `VERIFIED_READ` receipts to the existing board UI.
   Add explicit board email invitation onboarding if required: BS11 only grants
   a board to an **existing workspace member**.
6. Test provider delivery using verified staging-domain email addresses and
   separate real recipient sign-ins. Match the browser client response shape
   exactly; turn on Edge and SQL flags only as part of controlled acceptance.
   Frontend flags remain OFF until full tests pass.

## Deployment caution

**Never** set `APSYNTRA_INVITES_EDGE_ENABLED=true`, turn on frontend flags,
apply schema candidates to production, or merge this branch during preliminary
review. At default settings, the new handlers respond 503 before reading
sensitive payloads or modifying membership.
