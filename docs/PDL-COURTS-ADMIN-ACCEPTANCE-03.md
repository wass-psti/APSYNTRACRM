# PDL-COURTS-ADMIN-ACCEPTANCE-03 — Existing-Session Production Sign-Off

## Scope and evidence classification

Acceptance concerns the seven Paseo administration routes: Court Settings, Court Calendar, Bookings, Pricing, Payments, Customers, and Settings. The goal is genuine existing-session browser verification, without altering customer reservations, approved venue rates, real recipient QR data, or financial state.

### Genuine existing-session observations

- **Court Calendar — VERIFIED READ-ONLY:** The user's selected existing browser tab at `http://localhost:5174/admin/calendar` displayed the authenticated administration shell, three persisted courts and **“Calendar loaded from server.”** This is direct page evidence of a real session and an apparently successful backend read, not evidence of saved calendar changes.
- **Other six modules — PENDING GENUINE SIGNED ACCEPTANCE:** They were not individually navigated and read back in the same signed browser session during this milestone.
- **Production signed write/readback — PENDING:** No genuine signed write was submitted. There is no evidence to certify live save, refresh and persistence across all seven modules, nor any independent second administrator session.

### Production read-only automation

`node scripts/pdl-courts-admin-live-readonly.mjs` visits all seven deep links on the deployed GitHub Pages site with a fresh **unsigned** browser context. It verifies existing sign-in routing, no uncaught JavaScript errors and zero POST/PUT/PATCH/DELETE requests. This test neither authenticates nor touches production data. Passing it must **not** be described as signed acceptance.

### Latest regression evidence (2026-11-22)

- Deployed unsigned deep-link smoke: **7/7 PASS**, `PDL_COURTS_ADMIN_03_ANONYMOUS_PRODUCTION_READONLY_PASS`.
- `npm test`: **3,244/3,244 PASS**.
- Focused native + seven-module tests: **33/33 PASS**.
- `node scripts/pdl-aps-native-browser.mjs`: **PASS**, synthetic-only.
- `npm run build:pdl`: **PASS**.
- `git diff --check`: **PASS**.

### Previously verified functionality (PDL-COURTS-ADMIN-ACCEPTANCE-02)

- Seven-module synthetic HTTP fixture acceptance: UI actions, reload, isolated persistent fixture state, and transient session retry.
- Disposable PostgreSQL 17 rollback-only court/rate/calendar/policy operations and booking lifecycle, all without lasting test data.
- Production route restoration, built bundle, CI and GitHub Pages publication.

These are regression evidence, not a substitute for the missing production signed-user checks.

## Safety and acceptance boundary

No new permissions, authorization restrictions, backend schema, projects, payment transfers, real rates, QR recipients, or customer records should be changed for sign-off. The user's existing browser session is not exported or copied, and browser protections are not disabled.

## Remaining exact acceptance procedure

Using a connected browser that **can interact with the already signed administrator session** (e.g. ChatGPT Work browser interaction, when enabled): navigate to each of the seven actual admin URLs; capture live session success and data load; refresh and return; confirm each existing readback. Only test saves where the operator has explicitly approved a reversible nonfinancial change and verified a safe rollback. Preserve receipts, bookings and recipients; do not create synthetic production financial records. Report route-by-route evidence and separate read-only from write acceptance.

**Status:** IMPLEMENTED verification script; VERIFIED read-only Court Calendar observation and anonymous production deep-link checks; BLOCKED for genuine interactive seven-module signed production sign-off due to the current browser being read-only in Chat mode.

**Next checkpoint if interactive browser control remains unavailable:** `PDL-COURTS-ADMIN-ACCEPTANCE-04 — Existing-Session Interactive Seven-Module Production Readback and Evidence-Based Sign-Off`.
