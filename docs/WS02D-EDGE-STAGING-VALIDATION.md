# WS02D / WS11 / BS11 trusted Edge integration — staging only

Status: **review candidate; NOT deployed or enabled**. The four route handlers are
wired to a shared server-only transport on branch
`feat/ws02d-trusted-edge-staging`. The frontend flags and WS02D SQL invitation
feature flag remain **OFF**. Do not merge or deploy to production without approval.

## Implemented contract

- `ws02d-invite`: verified GoTrue user, live session and owner-authorized
  private `ws02d_issue` transaction with atomic, token-free delivery ledger preparation, then provider-accepted email submission.
  A fresh 32-byte random token is handled server-side only and sent in a
  recipient's one-use invitation link. Browser receipt has no token.
- `ws02d-accept`: verified matching-email authenticated recipient; private
  `ws02d_accept` checks single use and expiry, then records workspace member.
  No automatic workspace switch or board grant.
- `ws02d-manage`: workspace-scoped manager-only `list` and `revoke`,
  using WS11 private routines. Listings additionally include manager-only
  delivery statuses, where `submitted` means Resend HTTP submission accepted,
  not mailbox delivery.
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
3. A **candidate** private delivery ledger is now authored in
   `sql/ws02d-invitation-delivery-ledger-STAGING-CANDIDATE.sql`. It atomically
   prepares a status record in the issuance transaction, and records
   `submitted`, `rejected`, or `uncertain` after the provider call. It
   stores no token or acceptance URL. Idempotent replays never send a second
   email. This is NOT yet deployed or end-to-end validated. When an Edge worker
   dies after Resend accepts a message but before recording it, the ledger
   remains `prepared`; that ambiguous state must be reconciled manually.
   Before production activation, add operator recovery documentation, provider
   webhook/status reconciliation and expired-invitation cleanup. Reissue
   requires controlled revoke/replace and a fresh request ID; never auto-retry
   a delivery with an unknown outcome.
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


## Local-only validation procedure (after pulling new PR commits)

1. Stop the local `supabase functions serve` process. Pull the updated
   `feat/ws02d-trusted-edge-staging` branch into the separate
   `APSYNTRACRM-invites-test` clone, then copy the updated
   `supabase/functions/_shared/ws02d-trusted.ts` file into the local
   `apsyntra-baseline-sandbox` matching path. The existing four route
   entrypoints need no changes for this pass.
2. Open local Supabase Studio SQL Editor at `http://127.0.0.1:54323` and
   apply ONLY the new `sql/ws02d-invitation-delivery-ledger-STAGING-CANDIDATE.sql`
   contents to the sandbox. Do not reset the DB or use production/staging.
3. Confirm `to_regclass('private.ws02d_invitation_delivery')` and
   `to_regprocedure('private.ws02d_delivery_prepare(uuid,uuid,uuid)')`,
   `to_regprocedure('private.ws02d_delivery_record(uuid,uuid,text,text)')`,
   `to_regprocedure('private.ws02d_delivery_list(uuid)')` are non-null.
4. Restart Edge serving. Re-run existing authorized `ws02d-manage` listing
   using the owner JWT: `authorized=true`, previous invitations are present,
   and `delivery=[]` is expected for invitations issued before the ledger.
   Re-run employee cross-workspace denial: HTTP 403.
5. Keep `private.ws02d_invitation_flags.enabled=false`. Do **not** set it
   to true until the true email issuance/acceptance integration tests and
   provider reconciliation have been planned and reviewed. Production remains
   unchanged.

### Deliberately excluded from this pass

- Automatically resending invitation email after any provider error or timeout.
- Declaring an email 'delivered' from provider HTTP submission alone.
- Treating an accepted workspace invitation as a board access grant.
- Exposing a direct browser SQL EXECUTE grant to invitation tables/functions.
- Modifying production auth triggers, RLS, migrations or feature flags.
