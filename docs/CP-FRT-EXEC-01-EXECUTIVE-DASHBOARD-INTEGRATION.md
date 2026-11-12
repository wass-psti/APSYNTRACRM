# CP-FRT-EXEC-01 — Executive Dashboard Integration

Date: 2026-11-12  
Repository: `wass-psti/APSYNTRACRM`  
Branch: `cp-frt-exec-01`

## Implemented

- Added functional Fund Tracker, Executive Dashboard, OPEX Analytics and User Manual view navigation inside the existing FRT Finance board tab.
- Preserved the existing signed `frt_bootstrap`, `frt_board_dashboard_safe` and `frt_board_list_safe` request flow and the selected company scope.
- Added responsive two-column analytics panels and a mobile single-column layout.
- Rendered the request-status pipeline from the verified signed summary counts.
- Added Requested, Liquidated, Budget Utilization and Pending Liquidation KPI positions. Pending Liquidation uses the existing signed count; the three monetary KPIs display `—` because the existing safe summary does not provide monetary totals.
- Added explicit unavailable-data states for Top 5 Expense Categories and the six-month Requested-versus-Spent trend.
- The 90% budget warning is not calculated when no verified utilization value exists.
- Kept all existing Fund Tracker request, detail, company switching and refresh actions intact.

## Deliberate boundaries

- No database migration, RPC change, RLS change, role change, permission change, new authority, or additional approval workflow was introduced.
- The current `frt_board_dashboard_safe` projection returns counts only. The existing restricted projection does not supply monetary aggregates, expense categories or monthly requested/spent series. These values are not inferred from titles, dates or status counts.
- The November 12 annotated Monday.com `Display Settings Split View` comment explicitly identifies the intended target as TradeLink. It is not treated as an FRT requirement and no TradeLink source was modified by this priority.

## Verification

- Focused FRT tests: 24/24 PASS.
- Complete FRT test suite: 202/202 PASS.
- Complete frontend regression suite: 1,991/1,991 PASS.
- CSS bundle generated from the existing 46-source manifest; reproducibility check passed.
- Isolated Chromium CSS comparison: 46 source requests versus 1 bundled request; computed cascade identical across 28 representative elements and 3 trials.
- Dropdown/dialog and top-layer regression: PASS at 1280px, 768px and 390px.
- `node --check` passed for the modified frontend modules.
- Genuine signed FRT runtime acceptance and production deployment remain pending; the isolated browser test validates CSS delivery and layout primitives, not authenticated financial data.

## Remaining dependencies

To populate monetary KPIs, category ranking, monthly trend and the 90% warning, a future implementation needs a verified company-scoped financial aggregate contract that fits the existing data-access boundary. This priority intentionally does not widen financial-field access or alter the existing authorization model.
