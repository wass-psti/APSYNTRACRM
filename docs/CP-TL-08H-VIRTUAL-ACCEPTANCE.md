# CP-TL-08H — Virtual Secondary Reviewer Acceptance

## Purpose

Provide a repeatable, isolated PostgreSQL acceptance simulation when the assigned
secondary reviewer account is unavailable. This is a backend workflow simulation,
not a substitute for a genuine second production identity.

## Safety boundary

- Run only against a disposable PostgreSQL 17 database.
- Never point these commands at the production Supabase project.
- The primary review event is seeded locally from the already verified production
  event (actor UUID and server timestamp) as read-only acceptance evidence.
- The secondary reviewer is the synthetic identity
  `virtual-secondary@apsyntra.test`; it is not the unavailable
  `asenagan@watchdogautomation.com.ph` account.
- The virtual identity receives only a test Board VIEW membership and a non-null
  TradeLink module role in the disposable fixture. No production roles, grants,
  memberships, auth users, documents, or policies are changed.
- Drop the disposable database after acceptance.

## Prerequisites

Use a fresh PostgreSQL 17 database and connect as its database owner/superuser.
The base fixture creates the `anon` and `authenticated` roles and synthetic
workspace, board, user, and session records.

## Execution

From the repository root:

```sh
createdb cp_tl08h_virtual_acceptance
psql -X -v ON_ERROR_STOP=1 -d cp_tl08h_virtual_acceptance \
  -f sql/tests/cp-tl03-disposable-setup.sql
psql -X -v ON_ERROR_STOP=1 -d cp_tl08h_virtual_acceptance \
  -f sql/cp-tl03-staged-domain.sql
psql -X -v ON_ERROR_STOP=1 -d cp_tl08h_virtual_acceptance \
  -f supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql
psql -X -v ON_ERROR_STOP=1 -d cp_tl08h_virtual_acceptance \
  -f sql/tests/cp-tl08h-virtual-review-acceptance.sql
```

Expected final notice:

`CP-TL-08H virtual secondary-review simulation PASS; production untouched`

Run the focused frontend contract tests:

```sh
node --test \
  frontend/tests/tradelink-dual-review-approval.test.mjs \
  frontend/tests/tradelink-dual-review-virtual-acceptance.test.mjs \
  frontend/tests/tradelink-saved-document-output.test.mjs \
  frontend/tests/tradelink-pdf-issuance-contract.test.mjs \
  frontend/tests/tradelink-board-projection.test.mjs
```

## Acceptance coverage

- The primary actor cannot submit the secondary stage.
- The virtual secondary account is independently resolved by its own test email.
- Assigned-document listing and assigned-document read succeed for that account.
- The second stage is recorded on the same document revision.
- The second stage atomically transitions `for-approval` to `approved`.
- Both review rows retain distinct actor IDs and assigned emails.
- Duplicate retry is idempotent.
- Stale revision is denied.
- The linked Board item timestamp and updater remain synchronized with the document.
- The approval audit event is written.

## PDF qualification

The existing browser Print / Save PDF flow re-reads the signed document and Board
projection and is available only for a freshly verified Approved revision. It is
a browser print preview, not an electronically issued/signed PDF. Electronic PDF
issuance and the official PDF template remain disabled pending their separate
backend and template activation. This simulation does not enable them.

## Acceptance classification

A passing run verifies the existing SQL workflow under two distinct local test
identities. It does **not** establish that the real secondary account has signed
in, nor does it close genuine two-account production acceptance. The production
document must remain For Approval until the actual assigned secondary account
records its own review.
