# CP-FRT-FLOW-03B — Voucher Architecture Reconciliation and Acceptance

## Decision

The canonical production voucher architecture is the implementation merged by PR #455 (`75ae2877`):

- `frt_restricted_request_detail(uuid, uuid)` remains the existing signed source for persisted request, expense, company, preparation, finance-approval and GM-verification data.
- `frt_bank_execution_snapshot(uuid, uuid)` remains the source for recorded bank-execution evidence.
- The A4 PDF is generated from the persisted source snapshot in the browser; preview, download, print and reprint do not allocate another DV number or create a second voucher record.
- Reprint performs a fresh signed request-detail and bank-evidence read, retaining the original `DV-[CO]-[YYYYMM]-[SEQ]` value.
- Expense categories, descriptions, amounts, subtotals and grand total are rendered only from persisted `frt_request_items`; exact-cent reconciliation is required before PDF output.
- Company legal identity remains the existing `frt_companies` code/name. Missing address, logo, contact and chart-of-accounts information is shown as unconfigured; no details are copied from TradeLink or inferred.

A separate experimental FRT persisted-voucher prototype was retained outside this branch and is not part of the canonical architecture. Do not import it. Production migration version `20261117020000` is already applied as `tradelink_immutable_revision_snapshots`; it is an existing TradeLink migration, not an FRT voucher migration. Its exact migration file is now carried into the WF-05A feature branch from origin/main and its source-manifest entry is preserved. Do not recreate it under an FRT name or change its hash.

No new roles, approval stages, authority restrictions, storage buckets, or authorization mechanisms are introduced by CP-FLOW-03B. Existing signed request and bank-evidence contracts remain unchanged.

## Production migration reconciliation

Production project `jtlusodorfnyzgyuewkz` was inspected read-only on 2026-11-17:

| Migration                                                      | Production state | Notes                                                                                                 |
| -------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `20261116104500_frt_wf05a_archive_recovery`                    | PENDING          | Included in open PR #454; disposable acceptance passes                                                |
| `20261116172414_frt_restricted_voucher_projection`             | APPLIED          | Canonical voucher projection already exists in production                                             |
| `20261117010000_frt_wf05b_monthly_voucher_and_duplicate_guard` | PENDING          | Included in open PR #454; disposable acceptance passes                                                |
| `20261117020000_tradelink_immutable_revision_snapshots`        | APPLIED          | Existing TradeLink migration; exact source file and hash carried from origin/main; preserve unchanged |

Production is PostgreSQL 17.6.1.165 and `ACTIVE_HEALTHY`. Read-only preflight found:

- `frt_voucher_counters`: 0 rows.
- `frt_requests`: 0 rows.
- `frt_request_items`: 0 rows.
- `frt_requests.request_date`: absent.
- `frt_voucher_counters.voucher_month`: absent.
- Existing companies: WAO, WASS and PSTI with their persisted legal entity names.
- Existing `frt-attachments` bucket is private; the canonical voucher flow does not need a new bucket or persisted PDF objects.

The empty counter table satisfies the explicit preflight in the monthly-counter migration. The migration is still pending deployment; CP-FLOW-03B does not apply production migrations or create production business records.

## Disposable acceptance

`scripts/cp-frt-flow03b-disposable-acceptance.sh` creates an isolated PostgreSQL 17 container and applies, in timestamp order:

1. WF-05A archive recovery migration.
2. Existing signed voucher projection migration.
3. WF-05B monthly voucher and duplicate guard migration.

It then runs the WF-05A and WF-05B acceptance suites plus the CP-FLOW-03B projection test. All created requests and records are rolled back. No production data is used.

The CP-FLOW-03B test verifies the existing signed request-detail RPC returns the original monthly DV number, company identity, payee/bank, request reference, expense lines, exact-cent totals, finance approval and GM verification; it also asserts that the projection does not depend on a duplicate voucher table or invented company profile.

## Genuine signed-runtime evidence

The existing APSYNTRA CRM browser session was inspected on the live Fund Released Tracker Finance page. It displayed the live signed company context and `GENERAL_MANAGER` role, with the selected WAO company returning zero requests. Production SQL independently confirms there are zero requests and expense lines across FRT.

This establishes signed dashboard/read-path availability but cannot establish request-level voucher retrieval, PDF reprint or bank-execution rendering: there is no real production request to open. No synthetic request was inserted into production. Those request-level signed-runtime checks remain PENDING until an actual FRT request exists.

## Remaining functional gaps

The canonical implementation deliberately does not fabricate information. Production currently has no FRT company address/logo/contact profile and no authoritative chart-of-accounts mapping. The existing voucher therefore renders persisted expense categories and totals, not invented debit/credit account classifications. A persisted manual double-entry editor and authoritative company-profile configuration remain a separate follow-on implementation; they must extend the canonical source rather than add a competing voucher system.

## Acceptance classification

- **VERIFIED:** Existing PR #455 voucher architecture, signed read-contract tests, A4 multi-page PDF generation, preview/download/print/reprint fixture acceptance, exact-cent expense reconciliation.
- **VERIFIED:** Disposable PostgreSQL WF-05A, WF-05B and CP-FLOW-03B voucher projection acceptance.
- **VERIFIED:** Production schema/migration inventory and monthly-counter preflight are read-only and consistent with the current empty FRT data state.
- **PENDING:** PR #454 merge/deployment and its two outstanding production migrations.
- **PENDING:** Genuine signed request-level voucher preview/reprint against a real production request; no requests currently exist.
- **PENDING:** Persistent manual debit/credit accounting editor and authoritative FRT company profile details.
- **NOT APPLICABLE:** Persisted PDF object storage in the canonical PR #455 architecture.
