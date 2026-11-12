# CP-FRT-EXEC-02 — Signed Company-Scoped Financial Aggregates

Date: 2026-11-12  
Repository: `wass-psti/APSYNTRACRM`  
Branch: `cp-frt-exec-02`

## Implementation

Extend the existing `public.frt_board_dashboard_safe(uuid,text)` response. Do not add a second financial RPC.

The original five workflow-count keys remain unchanged. Five additive keys are returned:

- `company_code`
- `requested_total`
- `spent_total`
- `top_categories` (maximum five requested categories)
- `monthly_trend` (six consecutive calendar months, including the current database-local month)

The browser continues to call the existing signed `frt_bootstrap`, `frt_board_dashboard_safe`, and `frt_board_list_safe` contracts. Financial analytics are parsed from the existing dashboard response. Older dashboard responses without aggregate fields continue to render the Fund Tracker and show analytics as unavailable.

## Aggregate definitions

- **Requested total:** Sum of `frt_requests.total_amount` for the selected workspace/company, excluding archived requests. Request status does not exclude a request.
- **Spent total:** Sum of `frt_liquidations.total_spent` for the selected workspace/company where `submitted_at IS NOT NULL`, excluding archived requests. Unsubmitted liquidation drafts are excluded. This represents the latest currently saved submitted liquidation snapshot per request, not a verified bank transfer. Resubmission replaces the prior liquidation snapshot; the current schema does not retain a complete historical revision ledger.
- **Top 5 categories:** Sum of `frt_request_items.amount` grouped by trimmed `category`, excluding archived requests. This is requested line-item spend, not categorized liquidation spend.
- **Six-month trend:** Requested values grouped by request `created_at` month; spent values grouped by the latest saved liquidation `submitted_at` month. Missing months are returned as zero. Because a resubmission overwrites the prior liquidation snapshot, this trend is a current-record view, not a complete historical spend ledger.
- **Budget utilization:** Remains unavailable. No authoritative company budget field or budget source was identified. No 90% warning is fabricated.
- **Currency:** The current FRT schema does not provide a verified currency code. Amounts are displayed as decimal values without assuming a currency symbol.

Amounts are returned as decimal strings to preserve precision through JSON and JavaScript.

## Scope and security

- Reuses the existing signed FRT membership resolver and existing dashboard RPC.
- Preserves the existing function owner, security-definer mode, pinned empty search path, and existing execute ACL through `CREATE OR REPLACE`.
- Adds no new RPC and no new function grant.
- Does not change role assignments, RLS, table grants, table schemas, credentials, or workspace membership.
- Does not expose request IDs, titles, individual request amounts, requester identities, bank details, vendors, invoice numbers, notes, or document payloads.
- Unknown company codes retain the existing dashboard's zero-result behavior; the frontend still validates company choices against the signed bootstrap response.
- No finance workflow writes are added.

## Disposable acceptance coverage

The new PostgreSQL fixture checks:

- Exact company totals and category aggregation.
- Six-month contiguous series.
- Same-workspace company isolation.
- Existing Finance Manager and General Manager access parity.
- Foreign-workspace, non-member and unsigned denial.
- No direct authenticated table SELECT grants.
- Existing dashboard execute privilege remains available to authenticated and unavailable to anon.
- Aggregate response contains no request, recipient, bank, vendor or invoice details.
- Test rows and mutations are rolled back.

## Production baseline observed (read-only)

The existing Supabase project is `jtlusodorfnyzgyuewkz` (PostgreSQL 17.6.1.165). Read-only inventory showed zero current rows in `frt_requests`, `frt_request_items`, and `frt_liquidations`. Consequently, live production aggregates are expected to be zero until actual company data exists; this does not replace disposable fixture acceptance.

The existing request and liquidation indexes were inspected. No new indexes were added because the current FRT tables contain no production rows and there is no measured query-plan evidence to justify additional index changes.

## Deployment status

- Frontend and SQL implementation: in progress.
- Disposable PostgreSQL acceptance: pending CI.
- Production function replacement: pending successful CI and final migration review.
- Authenticated live aggregate round-trip: pending production activation and actual FRT data.
- No production data has been inserted, updated, or deleted by this implementation.
