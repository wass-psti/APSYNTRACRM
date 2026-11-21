# PDL-COURTS-ADMIN-ACCEPTANCE-07 — Disposable Lifecycle and Signed No-Change Closeout

**Acceptance date:** 2026-11-22 (Asia/Manila)
**Target:** The existing Paseo de Lomboy administration module inside APSYNTRA CRM.
**Change scope:** Repeatable disposable PostgreSQL acceptance harness, financial-state reconciliation and evidence only. No production changes to booking, payment, rates, recipients, roles, permissions or database schema.

## 1. Disposable PostgreSQL 17 certification — VERIFIED

Desktop Commander initialized one **fresh, throwaway** `postgres:17` container named `pdl07-acceptance-disposable`, bound only to `127.0.0.1:55439`. All 10 Paseo migrations applied successfully. Three existing acceptance suites executed with real PostgreSQL procedures and transaction rollback:

- `pdl_native04_booking_sync_rollback.sql`: booking quote, submit, receipt, same-key replay, conflicting replay, two-administrator readback, verification, stale-write denial, audit, confirmed-slot occupancy. Output: `ROLLBACK_ONLY_PDL_NATIVE04_SYNC_PASS`.
- `pdl_native05_rollback.sql`: pending cancellation, retained payment state without refund, freed inventory, cancelled receipt replay, stale cancellation conflict, cursor pagination, verification, confirmed-booking cancellation denial. Output: `ROLLBACK_ONLY_PDL_NATIVE05_LIFECYCLE_PASS`.
- `pdl_courts_admin_02_rollback.sql`: court/rate persistence, weekday and maintenance create/read/delete, policy readback, payment-method metadata. Output: `PDL_COURTS_ADMIN_02_ROLLBACK_ONLY_PASS`.

The wrapper `pdl07_disposable_lifecycle.sql` verified **zero persisted test reservations, quotes, rates, audit rows, weekday overrides and maintenance blocks after rollback** and emitted `PDL07_DISPOSABLE_LIFECYCLE_ROLLBACK_PASS`.

A separate reconciliation transaction, `pdl07_financial_reconciliation.sql`, confirmed:

- Pending cancellation retains `payment_status=submitted`, returns `refundStatus=not_processed`, and adds exactly one correct audit event.
- Cancelled booking leaves inventory available and idempotent replay returns the same cancelled receipt.
- A newly verified booking remains confirmed/verified with version 2; a later cancellation is refused and creates no cancellation audit.
- The payment-method recipient records remain byte-for-byte unchanged during the transaction.
- Rollback leaves zero synthetic bookings, quotes, audit events and rates.

Outputs: `PDL07_FINANCIAL_STATE_RECONCILIATION_PASS` and `PDL07_FINANCIAL_RECONCILIATION_ROLLBACK_PASS`.

**Database residue observed after the tests:** 0 reservations, 0 quotes, 0 rates, 0 audit events, 0 maintenance blocks, 0 weekday overrides, 0 enabled courts; the three original synthetic payment-method rows and one default policy row remained. All synthetic administrator identities were local to this disposable container.

### Repeatable fixture procedure

Run only against a newly created disposable PostgreSQL 17 container, not the existing Supabase project or production. The initialization file creates a unique `pdl07_acceptance_guard.disposable_fixture` marker required by the subsequent scripts. They abort without that fixture.

```sh
# Start a fresh disposable PostgreSQL instance on localhost only.
docker run --rm -d --name pdl07-acceptance-disposable \
  -e POSTGRES_PASSWORD=pdl07-acceptance-local \
  -p 127.0.0.1:55439:5432 postgres:17

# From the APSYNTRACRM repository root, after pg_isready succeeds:
export PGPASSWORD=pdl07-acceptance-local
pdl_psql() { psql -h 127.0.0.1 -p 55439 -U postgres -d postgres -X -v ON_ERROR_STOP=1 "$@"; }
pdl_psql -f supabase/pdl-booking/acceptance/pdl07_disposable_bootstrap.sql
for file in supabase/pdl-booking/source/migrations/*.sql; do
  pdl_psql -q -f "$file" || exit 1
done
pdl_psql -f supabase/pdl-booking/acceptance/pdl07_disposable_lifecycle.sql
pdl_psql -f supabase/pdl-booking/acceptance/pdl07_financial_reconciliation.sql
# Only after verifying all accepted results:
docker stop pdl07-acceptance-disposable
```

Test scripts never handle actual payment proofs, transfer or refund funds, or activate venue-approved rates outside the disposable database.

## 2. Genuine signed production no-change readback — VERIFIED

Using the previously authorized MacBook Pro and existing signed Chromium Paseo tab (not a synthetic administrator session), visited the **deployed** `/paseo/admin/acceptance` page. The live interface displayed `7 of 7 read-only checks passed`:

| Module | Signed readback result |
|---|---|
| Court Settings | 3 court records |
| Court Calendar | Weekday and maintenance data loaded |
| Bookings | 0 records in first page |
| Pricing | Rate collections loaded; no rates enabled as part of this test |
| Payments | Payment-method and reservation payment-state collections loaded |
| Customers | 0 distinct contacts in first reservation page |
| Settings | Operational policies loaded |

This matches the previously accepted read-only baseline. No signed POST/PUT/PATCH/DELETE was submitted, and no customer payment, booking, rate, QR recipient or venue policy was deliberately changed. A successful GET is not proof of payment settlement or full nonempty customer-history acceptance.

## 3. Regression and publication evidence

- Full CRM regression: **3,267 passed, zero failures** (`npm test`).
- Focused PDL contract and regression: **44 passed, zero failures**.
- Isolated Playwright seven-module save/reload, negative readback and navigation suite: **PASS**.
- Paseo TypeScript/Vite build, syntax, lint and whitespace checks: **PASS**.
- Final inspection of the disposable database confirmed zero reservations, quotes, rates, audit events, maintenance blocks, weekday overrides and enabled courts; payment methods remained at three and default policy at one.
- The disposable container was stopped and automatically removed; unrelated Supabase containers were not touched.

## 4. Scope, limitations and final classification

**VERIFIED:** Disposable real-PostgreSQL booking lifecycle, two-identity readback, version conflicts, cancellation/payment invariants, audit and rollback isolation, configuration procedures, and existing signed production seven-module **read-only** accessibility.

**NOT APPLICABLE to this no-change milestone:** Real financial transfer or refund, activating venue rates, fabricating a live paid booking, or making irreversible production customer changes.

**Still not certified:** End-to-end genuine *production write* workflow involving a nonempty paid reservation and real proof storage. The original PDL-APS-NATIVE-07 parallel-stress script remains untracked and is not included in this milestone; the lifecycle SQL demonstrates real transactional semantics but does **not** claim independent multiconnection race certification.

No new RBAC/RLS rules, unnecessary restrictions or additional Supabase projects were introduced. This milestone closes the **disposable lifecycle + signed no-change + financial-state reconciliation** acceptance scope without claiming broader live financial certification.
