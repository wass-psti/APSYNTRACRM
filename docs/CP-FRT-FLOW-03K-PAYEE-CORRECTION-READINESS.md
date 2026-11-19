# CP-FRT-FLOW-03K — WASS Voucher Payee Correction and Accounting Readiness

**Project:** APSYNTRA CRM · Existing Supabase project `jtlusodorfnyzgyuewkz`
**Date:** 2026-11-19 · **Production voucher:** `DV-WASS-202611-001`
**Status:** IMPLEMENTED-UNVERIFIED (new database RPC) / production financial writes NOT EXECUTED

## Authoritative production finding

Read-only SQL and the signed WASS Fund Tracker voucher display agree that this voucher has one ₱3,000.00 expense item, status `PENDING_APPROVAL`, one persisted voucher allocation, zero accounting entries, zero bank executions and zero liquidations. The stored recipient/payee is literally `None`. The accounting team has not supplied the actual payee or debit/credit account codes/classifications. The request has no recorded Finance approval or GM verification.

The original application intentionally disabled the unverified broad `Edit Request` action. The legacy `frt_update_request` RPC permits field updates without a compare-and-swap expectation and is unsuitable for correction amid concurrent edits.

## Implemented, not yet activated in production

- `supabase/migrations/20261119085100_cp_frt_flow03k_payee_correction_cas.sql`: an additive, signed payee-only compare-and-swap RPC using the existing FRT finance roles; validates the replacement, requires the original payee to match atomically, and writes an audit event. It refuses corrections once Finance/GM, accounting, bank, liquidation, archive or closure milestones exist. It does **not** update the request amount, company, voucher number, voucher counter, accounting, bank or approval data.
- `frontend/frt-payee-correction.js`: verifies signed user, company, role, request membership and current persisted payee before one RPC call; independently reads the saved payee and unchanged voucher afterward. No automatic retry after uncertain writes.
- `frontend/fund-tracker-native.js`, `frontend/frt-finance-ui.js`, `frontend/app.js`, `frontend/data.js`: integrate a pending-request **Correct payee before approval** action through the existing Fund Tracker adapter, confirmation dialog and signed refresh, without enabling legacy broad editing.
- `frontend/tests/frt-payee-correction.test.mjs` and `frontend/tests/board-cache-channel.test.mjs`: cover write-scoped API classification, existing-role denials, session changes, stale/uncertain outcomes, validation and the UI.
- `supabase/migration-source-manifest.json`: adds the new migration SHA-256 entry without modifying historical migrations.
- `scripts/cp-frt-flow03k-disposable-acceptance.sh`, `sql/tests/cp-frt-flow03k-disposable.sql` and `.github/workflows/cp-frt-flow03k-payee-cas.yml`: additive disposable PostgreSQL 17 success/denial/stale/financial-state/audit acceptance, executed by CI rather than production.

## Verification

- Focused new feature: 7/7 tests PASS.
- Focused board-sync plus payee: 23/23 PASS.
- Full frontend suite: 2,844/2,844 PASS.
- `npm run build`: PASS; existing large-chunk warning remains nonfatal.
- Migration manifest: PASS (222 baseline, 36 forward entries).
- Disposable database integration: PENDING — the local Docker daemon is unavailable; a dedicated GitHub Actions PostgreSQL 17 fixture has been added but must pass on CI. SQL migration has **not** been applied to production.
- Genuine production accounting/PDF/approval acceptance: PENDING actual business data and authorized operational events.

## Activation gates

1. Execute the additive migration in disposable PostgreSQL with authenticated Finance-role positive tests and denied/stale/concurrent/approved/accounting/bank/liquidation cases. Verify exactly one audit event per successful edit and unchanged voucher/counter/total.
2. Re-run frontend/unit/integration/build/CI checks. Deploy database migration before a frontend that invokes the new RPC; verify signed readback and rollback strategy.
3. Enter the **actual payee from source business documents** directly in the signed Fund Tracker. Do not replace `None` with an invented placeholder or perform a silent production SQL update.
4. Confirm actual chart-of-accounts codes and debit/credit treatment with Finance. Save and read back balanced ₱3,000.00 journal entries, then verify the real branded PDF.
5. Execute genuine Finance/GM approvals, bank evidence, and liquidation only when the business events occur. Preserve the original DV and audit history.

**Production integrity:** No financial record, voucher counter, accounting entry, payee, approval, bank evidence, liquidation, role, credential, or production policy was changed during this implementation.
