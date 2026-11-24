# CP-OI-NATIVE-04 — Dashboard and Sales Intelligence

## Scope
Reconstruct sales intelligence with existing registry and signed transport. CP03 remains dependency on PR #855; original CI failure was ECR image data limit, not a failed assertion. Upstream main 3844eb61 integrated at 1d0cb0e6. No production schema, data or authorization changes.

## Functional delivery
Automatic sequential bounded page scan on dashboard entry/refresh. Reuses complete shared read collection across views; no page-by-page publication; preserves previous rows on failure and explicitly labels provisional totals. Existing ordinary list pagination preserved when entering list directly. Repeated dashboard requests share a current complete scan; stale responses suppressed on scope change. Offset traversal is not a transactional point-in-time snapshot; duplicate detection catches overlapping pages, refresh reconciles concurrent changes. Existing data contract requires no migration.

Executive counts, open workflow orders (known status excluding Collected, Closed, Cancelled), collected/cancelled, separate native/historical currency totals with per-measure coverage, manager/company/industry/status distributions, calendar month received counts, recent orders. Unknown currency/status/archive/date explicit. Historical source values not reinterpreted as VAT-derived or recognized accounting revenue. Exact decimals. Filters on dashboard and scoped browser preferences for view and structured filters; free-text/record IDs not persisted. Explicit URL overrides preferences. No new authorization or training/model updates.

## Evidence
47/47 focused Order Intake tests including six new analytics/read-state/preferences tests. Signed disposable PostgreSQL/GoTrue/PostgREST readback of 909 historical + one native active fixture; nine financial sum/coverage comparisons (three groups x three measures) against independent PostgreSQL numeric aggregates; signed Chromium automatic 910-row dashboard scan in ten reads, fiscal filter 166 records, no repeat tab reads, detail, refresh, mobile, zero page errors. CP03 signed create/edit and browser acceptance also passed. Final stale-generation guard verified by focused suite. Full regression and build/check/lint recorded in local logs. No new production records or migrations. Private source data and evidence remain outside Git.

Release and actual signed production acceptance pending CI/merge/Pages. Existing branch and PR #855 retained for coordinated CP03/04 release; no repeated production import.
