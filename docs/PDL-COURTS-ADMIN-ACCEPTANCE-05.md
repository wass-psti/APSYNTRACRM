# PDL-COURTS-ADMIN-ACCEPTANCE-05 — Genuine Signed Production Readback

**Date:** 2026-11-22 (Asia/Manila)
**Scope:** Seven Paseo Courts Administration modules, actual deployed GitHub Pages frontend and existing live Paseo backend.
**Primary verification:** Existing signed production Chromium tab, accessed on the authorized Mac through Desktop Commander. No test credentials or synthetic API interceptions were used in the signed run.

## Genuine signed server readback — VERIFIED (7/7)

Navigated the original live browser tab to `https://wass-psti.github.io/APSYNTRACRM/paseo/admin/acceptance` without opening a replacement tab. The deployed same-tab server readback UI displayed **7 of 7 read-only checks passed**, based on existing GET requests to the Paseo service. Re-ran the check through **Run readback again** and observed the same seven passing results.

| Module | Observed production readback | Classification |
|---|---|---|
| Court Settings | Three court records loaded | VERIFIED READ |
| Court Calendar | Weekday and maintenance records loaded | VERIFIED READ |
| Bookings | Zero reservations in first page | VERIFIED EMPTY READ |
| Pricing | Per-court rate collections returned; does not establish enabled prices | VERIFIED READ |
| Payments | Payment methods and reservation payment-state collection returned; no paid bookings present | VERIFIED READ; TRANSACTION UNTESTED |
| Customers | Zero distinct contacts derived from first booking page; full customer history not established | VERIFIED EMPTY READ |
| Settings | Operational policy record loaded | VERIFIED READ |

### Genuine same-tab navigation and refresh — VERIFIED (7/7)

Using the remote Mac's Chromium GUI and the same signed production tab:

- Visited `/admin/courts`, `/admin/calendar`, `/admin/bookings`, `/admin/pricing`, `/admin/payments`, `/admin/customers`, and `/admin/settings` independently; all rendered their real module interface without an unexpected sign-in redirect.
- Refreshed each of the seven routes and observed the same authenticated module state and its expected server-loaded status or form.
- Navigated back from Settings to Customers, then forward to Settings; both displayed server-loaded states and preserved the signed session.
- Revisited `/admin/acceptance`, read all seven passing results, and activated its manual repeat control; results remained **7/7**.
- The production Overview previously reported **0 / 3 enabled courts**, consistent with the unapproved venue configuration; no prices or enabled courts were created as test fixtures.

## Scope of functional certification

**CERTIFIED:** Live signed route accessibility, same-tab session retention, read-only backend availability, module rendering, seven-module readback, refresh, back/forward and manual readback repetition.

**NOT CERTIFIED:** Live form write and persistence, real customer creation, paid guest booking, payment proof review/verification, cancellation/refund settlement, two-independent-account acceptance, comprehensive customer-history retrieval or nonempty large-queue readback. Production currently returned no reservations on the first page. No synthetic real-world transactions were manufactured.

Previously completed synthetic-browser and disposable PostgreSQL rollback-only tests cover write contracts and concurrency, but **do not replace genuine production write acceptance**.

## Safeguards and changes

No authentication configuration, roles, permission rules, backend schema, pricing, payment QR recipients, financial records, customer records, or existing reservations were changed. No session token was copied or exported. Only the evidence/report is added in this checkpoint. The unfinished `scripts/pdl-aps-native-07-parallel.mjs` remains untouched and outside this commit.

## Final classification

**VERIFIED — genuine signed production seven-module READ-ONLY certification.**

**PENDING — genuine production WRITE/workflow certification.** Do not claim unconditional final operational sign-off until nonempty booking/payment scenarios and safe authorized persisted writes are actually exercised.

**Next solid milestone, only for the remaining uncaptured scenarios:** `PDL-COURTS-ADMIN-ACCEPTANCE-06 — Safe Reversible Signed Write/Readback and Real Booking Lifecycle Certification`.
