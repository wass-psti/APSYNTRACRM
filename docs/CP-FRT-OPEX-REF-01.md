# CP-FRT-OPEX-REF-01 — Reference-led OPEX Analytics

## Scope

Implements the financial command-center layout within the existing signed Fund Released Tracker OPEX Analytics tab, using the six user-provided Monday.com screenshots as visual/section references. No Monday.com screenshots, hardcoded sample amounts, or unrelated finance permissions are imported.

## Authoritative data now rendered

- Company-scoped total requested amounts from active, non-archived requests
- Latest submitted liquidation totals (not bank-transfer confirmation)
- Six-month requested versus submitted-liquidation line series
- Five highest requested line-item expense categories
- Month-by-month submitted-liquidation trend (burn-rate proxy)
- Signed pending-liquidation request count

Each value derives from the existing frt_board_dashboard_safe RPC via loadFRTFinanceReadOnly. The analytics payload is validated against the selected company before rendering; there are no new data queries or mutations. Chart geometry is computed from validated decimal strings with integer-cent arithmetic, avoiding floating-point money accumulation.

## Deliberately not fabricated or enabled

- Approved company budget, budget-used %, net position, and variance (no authoritative budget contract).
- Department budgets, categorized actual spend, and department consumption (no verified department ledger).
- Individual liquidation aging/amounts (aggregate contract returns only safe counts).
- Risk-Aware IC Matrix (no authoritative WASS/PSTI/WAO bilateral receivable/payable balances, intercompany loan events, maturity, or reconciliation evidence).
- Period selection, PDF/CSV download, or save actions that have no signed operational contract.

The IC section is explicitly labeled Not activated; it does not display zero balances or a reconciled badge from unsupported data.

## Preserved behavior

The existing FRT company selector, Fund Tracker, Executive Dashboard, User Manual, signed session guard, authorization checks, private-row redaction, and read-only analytics interface remain unchanged. No new roles, policies, privileges, migrations, or external libraries.

## Verification

- Full frontend test suite: 2,056 PASS, 0 FAIL at implementation branch baseline.
- Targeted FRT tests: 35 PASS, 0 FAIL, including missing/zero aggregate states, escaped category labels, and no invented financial metrics.
- CSS bundle rebuild and deterministic consistency check: PASS.
- Frontend JS syntax check, Pages source integrity, and git diff --check: PASS.

## Next separate milestone

CP-FRT-IC-01 — Risk-Aware Intercompany Matrix Authoritative Ledger and Finance Reconciliation: inspect existing finance ledger entities, define actual intercompany loan/receivable/payable source contracts, enforce existing company/workspace permissions, build balanced entity-pair projection and maturity analysis, test reconciliation and denial cases, then activate the IC Matrix. Do not infer balances or change actual production financial records.
