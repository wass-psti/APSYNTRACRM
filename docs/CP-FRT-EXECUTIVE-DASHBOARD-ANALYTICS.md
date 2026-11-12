# CP-FRT Executive Dashboard — Signed Aggregate Analytics

Date: 2026-11-12 (Asia/Manila)
Scope: APSYNTRA CRM Fund Released Tracker Executive Dashboard, based on the user-provided Monday.com reference.

## Implementation

- Adds a functional Executive Dashboard view alongside the existing Fund Tracker. Company selection is shared and remains restricted to the signed `frt_bootstrap` company list.
- Loads aggregate financial analytics only when the Executive Dashboard is selected. The ordinary Fund Tracker continues to use the existing safe count/list projections.
- Uses a new additive RPC candidate, `public.frt_executive_dashboard_safe(uuid,text)`, which returns only six aggregate keys: total amount, total liquidated, budget utilization, pending liquidation amount, up to five expense categories, and six monthly requested/spent totals.
- The function uses the existing `private.frt_current_role(workspace)` guard, signed `auth.uid()`, explicit workspace/company joins, a blank search path, and no direct table grants. It does not return recipient, banking, requester, voucher, note, department, or request-level records.
- The dashboard renders four PHP KPI cards, the existing signed status counts as a doughnut pipeline, horizontal category bars, and a six-month requested-versus-actual-spent line chart. The 90% warning appears only when verified utilization is greater than 90%.
- Category labels are escaped; malformed or unavailable aggregate responses do not affect the existing Fund Tracker. No sample financial figures are shown when the RPC is unavailable.
- Responsive styling is scoped to the existing FRT dashboard stylesheet.

## Calculation definitions

- **Total Fund Requests:** sum of `frt_requests.total_amount` for non-archived requests in the selected workspace/company.
- **Total Liquidated:** sum of request `total_amount` for requests in `DONE` or `CLOSED` state. This follows the established FRT `frt_dashboard` released-amount definition; it is not the same as actual liquidation spending.
- **Budget Utilization:** Total Liquidated ÷ Total Fund Requests × 100; zero when total requested is zero.
- **Pending Liquidation:** sum of request amounts where finance approval exists, status is neither `CLOSED` nor `REJECTED`, and liquidation status is not `APPROVED`.
- **Top 5 Expense Categories:** aggregate `frt_request_items.amount` by category, descending, capped at five. These are submitted request-item amounts, not a claim of actual paid spending.
- **Six-Month Trend:** six completed calendar months immediately before the current month. Requested uses request `created_at` and `total_amount`; Spent uses `frt_liquidations.submitted_at` and `total_spent`.

The KPI and trend definitions are intentionally distinct: the KPI's liquidated amount follows the existing completed-request reporting definition, while the trend's spent series uses actual submitted liquidation totals.

## Access and operational boundary

The SQL file `sql/cp-frt-sec14-executive-dashboard-safe-analytics.sql` is an **additive candidate migration**. It introduces a new read-only RPC and a narrowly scoped `authenticated` EXECUTE grant; it does not change existing role assignments, RLS policies, direct table grants, legacy RPC grants, or financial mutation contracts.

**Production activation is not authorized or performed by this implementation increment.** The new function's EXECUTE grant is a production permission change and requires separate explicit approval before migration activation. Do not substitute legacy `frt_dashboard` or `frt_list_requests` calls as a fallback. Until activation, the Executive Dashboard clearly reports that aggregate reporting is not activated, while the existing Fund Tracker remains operational.

At implementation baseline, the existing production workspace returned zero active FRT requests for WAO, WASS, and PSTI. Production dashboard values therefore remain genuine zero states until actual records exist.

## Verification

- Frontend tests: `frontend/tests/frt-executive-dashboard.test.mjs`.
- Disposable PostgreSQL acceptance: `sql/tests/cp-frt-sec14-executive-dashboard-safe-analytics-disposable.sql`, scheduled after the existing SEC14 safe-board fixture in the frontend CI workflow.
- The tests cover KPI formatting, 90% threshold, status distribution, category aggregation, six-month series, zero values, escaping, on-demand signed RPC retrieval, legacy RPC non-use, missing-RPC fallback behavior, company/workspace isolation, anonymous denial, and absence of direct table grants.
- CI and browser acceptance remain pending until the branch workflow completes. Production activation, deployed browser values, and live financial-data acceptance are not claimed by this source change.
