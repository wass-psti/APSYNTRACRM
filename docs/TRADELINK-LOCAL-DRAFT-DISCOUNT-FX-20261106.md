# TradeLink — Local Draft Discount and Explicit FX Preview

**Date:** 2026-11-06 (Asia/Manila)  
**Repository:** `wass-psti/APSYNTRACRM`  
**TradeLink board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`  
**Scope:** Existing authorized frontend-only, read-only/unsaved TradeLink Draft UX. No SQL migrations, production permissions, persisted business records, workflow activity, or separate auth.

## Baseline and accepted scope

The previous six-module UX checkpoint was owner-accepted for roadmap continuation with genuine browser interaction exceptions preserved. Its implementation, CI and deployment were verified, but the owner sign-off did not waive production security gates. The current next increment is a bounded reuse of `frontend/tradelink-finance.js` for discounts and exchange rates in the **existing** unsaved commercial Draft estimator.

## Implementation

**Code SHA:** `c87ae3d5d120b40fcdb3ecdd0c090c7884954055`.

- `frontend/tradelink-draft-workspace.js`: Adds source-defined `discountType` (`percentage` / `fixed`), bounded `discountValue`, and optional `exchangeRate` input to the three priced Draft forms: Electronic SI, Quotation, PO to Suppliers. Uses the preexisting `calculateTradeLinkAmounts` and `formatTradeLinkAmount` functions; displays subtotal, discount, taxable amount, VAT, total and PHP equivalent. For non-PHP selected currencies with **no positive, explicitly entered** rate, PHP equivalent is **—**, never a fabricated conversion. Invalid financial input clears all calculated values; initial and rerendered in-memory values are recalculated consistently.
- `frontend/app.js`: Includes the three existing source-contract keys in the same signed, route-bound, in-memory field capture. Reuses the existing text-only DOM refresh, with no added network request or persistence.
- `frontend/tradelink-application.css`: Responsive fields scoped to TradeLink, preserving unrelated modules.
- `frontend/tests/tradelink-draft-workspace.test.mjs`: Three new tests for source-calculation correctness, explicit FX vs missing rate, invalid/negative/zero/out-of-range values, existing SQL field-allowlist compatibility, safe rerendering and disabled writes. All previous six-module tests remain.
- The staged `private.tl03_validate_draft` SQL allowlist **already** includes `discountType`, `discountValue` and `exchangeRate`. No schema changes were needed. The original source calculation clamps a fixed discount to subtotal and applies VAT to the discounted taxable amount. This increment adds no currency-rate provider, tax authority or approval policy.
- Packing List, Delivery Receipt, and Payment AR intentionally show no commercial estimate in this feature; the Payment AR preview still does **not** process payments.

## Verification evidence

| Gate | Status |
| --- | --- |
| Code changes on `main` | **VERIFIED** — `c87ae3d5` |
| Focused discount, FX, form and rerender regression | **VERIFIED** — three new cases passed |
| Full frontend regression | **VERIFIED** — 1,116 tests passed, 0 failed |
| Disposable PostgreSQL, collaboration and OT jobs | **VERIFIED** — all successful, no production DB mutations |
| Pages deployment | **VERIFIED** — [Actions 42232033626](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42232033626), success at exact implementation SHA |
| Live HTTPS and CDN smoke | **VERIFIED** — [Actions 42232034399](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42232034399), success. Live smoke reported `LIVE PAGES SMOKE: PASS for c87ae3d5d120b40fcdb3ecdd0c090c7884954055` after propagation. Smoke directly hashes configured assets including `frontend/app.js` and `frontend/tradelink-application.css`, but its configured list does not independently hash `frontend/tradelink-draft-workspace.js`. |
| Genuine signed-browser entry, edit and module-switch click acceptance | **PENDING** — the available Chat-mode browser connector supports page-text reads, not interactive form control. |
| Production Stage B, live document persistence and signed write acceptance | **NO-GO / NOT APPLICABLE** |

The earlier signed-browser screenshot evidence and past read-only production data/grants checks were not repeated. This frontend-only increment did not require production SQL, scope widening, permission changes, new test users or additional live-backend operations.

## Invariants and next direction

`TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false` remain unchanged; Create Draft, authoritative Read/Refresh, Save, Archive, Restore, financial transactions, approvals, PDF/file flows and all Stage B permission grants remain disabled.

**Next authorized technical direction:** Non-mutating UI acceptance and accessibility/currency-label checks, optionally improving exact CDN asset coverage for the TradeLink Draft workspace module. Do not promote this milestone to production security acceptance until the original signed-user, cross-workspace, revoked-session and recovery/change-control gates are met.

**Progress:** All independently executed source/tests/isolated database/deployment/smoke technical gates passed. Signed-browser acceptance is **PENDING**, and full production readiness is **not verified**.
