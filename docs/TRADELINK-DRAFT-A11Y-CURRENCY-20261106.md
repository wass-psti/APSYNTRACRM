# TradeLink — Draft Accessibility, Currency Denomination and Signed-Browser Gate

**Date:** 2026-11-06 (Asia/Manila)  
**Scope:** Existing APSYNTRA CRM TradeLink dark-launch editor, frontend-only.  
**Board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` in existing WatchdogWorkspace project.  
**Decision:** **IMPLEMENTED — FRONTEND/ISOLATED/DEPLOYMENT/CDN VERIFIED; GENUINE SIGNED INTERACTIVE BROWSER ACCEPTANCE STILL PENDING.**

## Scope, changes and invariants

**Implementation commit:** `09c06fc78927707cf881220eccfbebd5b6b1a422`.

- `frontend/tradelink-draft-workspace.js`: Added explicit ISO currency denominations beside each commercial amount in the existing unsaved Electronic SI, Quotation and Supplier PO local estimator. PHP equivalent is always clearly `PHP`; base-currency denominations update with the selected currency. Payment AR cash and cheque fields and the commercial unit-price field now show their source currency. Currency strings are validated against the existing list; new labels are updated via DOM `textContent` to avoid unsafe HTML. Reuses the previous local calculation engine, no new formula.
- Added accessible help for discount percentage (0–100), fixed discount in the selected currency, and the meaning of the optional FX rate (**PHP per one unit of selected foreign currency**). Explicitly documents that PHP rates are ignored for PHP and that no online exchange-rate lookup is performed. Numeric amount inputs retain their existing types, bounds and signed context.
- Added `aria-describedby` relationships for discount/rate controls, `aria-atomic=true` for the existing local validation/finance announcements, and clear visible `:focus-visible` styling for buttons, selects, inputs and textareas within the TradeLink Draft panel. Keyboard/click operation remains through the existing native form controls and delegated app actions.
- `frontend/app.js`: Only the existing signed route-scoped in-memory form update now invokes `updateTradeLinkDraftInputCurrencyLabels(form)`. No new domain/RPC calls, storage, role model, session, or mutation path.
- `frontend/tradelink-application.css`: Scoped responsive currency/unit help, focus indicators and readable financial row labels.
- `scripts/pages-smoke.mjs`: Adds the actual `frontend/tradelink-draft-workspace.js` module to the existing GitHub Pages exact-SHA hash list, closing a prior CDN asset-verification omission.
- `frontend/tests/tradelink-draft-workspace.test.mjs`: Four new targeted tests for all commercial types' currency denominations, Payment AR cash/cheque labels, currency switching and rejection of malicious/unrecognized currency strings, labels updated with `textContent`, accessible help/status semantics, disabled submission, and inclusion of the Draft module in the CDN hash list.

**Non-mutating restrictions:** `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false` remain unchanged. Draft creation/saving, approval, payment, workflow transitions, PDFs, attachments, persistence and Stage B EXECUTE grants are still **NO-GO**. No production database query, SQL update, credential/account operation, role/permission mutation or new test user was used in this increment.

## Evidence

| Gate | Status | Direct evidence |
| --- | --- | --- |
| Source implementation, six modules preserved | **VERIFIED** | Source commit `09c06fc7` |
| Focused accessibility, FX guidance and currency display regression | **VERIFIED** | Four added tests PASS |
| Full frontend regression | **VERIFIED** | [Actions 42233464336](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42233464336) final second attempt: **1,120/1,120 passed**, zero failed |
| Disposable PostgreSQL, collaboration and overtime jobs | **VERIFIED** | Success in the same final validation run |
| GitHub Pages code deployment | **VERIFIED** | [Pages 42233464526](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42233464526), success at exact code SHA `09c06fc7` |
| Exact-SHA hosted asset and HTTPS smoke | **VERIFIED** | Failed first while deployment was not yet published; retried live-only job `127948162363` then **PASS**, including `frontend/app.js`, **`frontend/tradelink-draft-workspace.js`**, and `frontend/tradelink-application.css`. Log: `LIVE PAGES SMOKE: PASS for 09c06fc78927707cf881220eccfbebd5b6b1a422` |
| Existing signed browser page read | **OBSERVED** | Connected read-only tab at the authorized TradeLink Draft route showed an active secure session, the previous Quotation editor and explicit `Writes: not activated` label. The page had **not been refreshed to the new code** during this inspection. |
| Genuine signed-browser editing / keyboard / screen reader / currency switching | **BLOCKED / NOT VERIFIED** | Browser integration in Chat mode exposes only tab enumeration and read-only page text. No click, tab navigation, form fill, reload, screen-reader operation or account transition could be executed by this assistant. |
| Live production non-mutation/permissions after this frontend change | **NOT RETESTED** | No production database calls were required; existing prior gate evidence is historical, not freshly certified. |

## Remaining signed-browser acceptance (not independently executed)

Within the existing authorized General Manager session after refreshing the Draft route, use harmless local QA values and **never bypass disabled Write controls**:

1. Keyboard Tab/Shift+Tab through the six module selector, form fields, discount/FX help and **Validate locally**/**Clear local fields**, verifying visible focus and no trapped focus.
2. Select USD or EUR in Quotation, Electronic SI and Supplier PO. Enter one priced line, discount and VAT. Check that every subtotal, discount, taxable, VAT, total row identifies the chosen currency, while PHP equivalent is explicitly PHP; without an explicit FX rate, PHP equivalent remains **—**. With a known entered rate, check the source calculation; invalid input clears stale totals.
3. Change currency and confirm unit-price labels, financial-row denominations and FX-base wording update immediately, even before a valid amount. Switch to Payment AR and verify cash/cheque input currency codes also update; no priced financial preview is rendered.
4. Switch each source module and use **Clear local fields**; old in-memory fields, totals, currency labels, reviewer/recipient data and local preview success must not leak to the next module. No server persistence or workflow occurs.
5. Trigger browser-native required-field errors and local parser errors; verify screen-reader status announcements, label-specific feedback and focus order. Test narrow screen layout and, where available, reduced motion.
6. Reload, sign out or change existing authorized identity. Verify no previous user's unsaved values reappear. This still requires separate genuine signed-session evidence and does **not** certify server-side authorization, revoke/expiry, foreign-workspace RLS or Stage B production readiness.

**Current milestone disposition:** All five independently executed implementation, frontend, isolated-database, deployment and configured CDN gates passed. **Signed interactive browser acceptance PENDING**; do not mark this entire security/UX gate 100% without the missing evidence. No new or enlarged production authority was granted.

## Owner sign-off addendum — 2026-11-06

**User decision:** “all good so whats next.” Record **CLOSED — USER-ACCEPTED WITH EVIDENCE EXCEPTIONS** for the frontend-only accessibility/currency-label gate. Technical evidence remains 1,120/1,120 frontend tests, successful disposable PostgreSQL jobs, exact-code Pages deployment and exact-SHA CDN smoke covering the Draft source module. Genuine signed interactive browser testing (keyboard, currency switching, reset, identity separation) remains **PENDING/NOT INDEPENDENTLY VERIFIED**; user sign-off must not be relabeled as a security test.

**Current release state:** Real Draft writes are not yet activated. See [TradeLink operations](TRADELINK-OPERATIONS.md) for the functional next steps and essential recovery/security boundaries.
