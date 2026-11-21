# PDL-COURTS-ADMIN-ACCEPTANCE-02 — Seven-Module Readback and Recovery

## Implementation

- An HTTP 401/403 from the existing administrator session endpoint still redirects to sign-in. A temporary network failure or HTTP 5xx now preserves the current module and offers **Retry session check** instead of falsely treating the user as signed out.
- No new roles, authorities, authentication contracts, backend schema, payment recipients, customer records, or live venue rates.
- Browser tests use stateful isolated HTTP fixtures for all seven modules and verify write → fresh GET → page refresh. Tests include court configuration, synthetic rates, weekday and maintenance updates, operational policies, bookings/payment verification, customer projection, and a synthetic GCash QR upload. These fixtures are not genuine signed production writes.
- `supabase/pdl-booking/acceptance/pdl_courts_admin_02_rollback.sql` exercises real PostgreSQL procedures for court/rate changes, calendar maintenance CRUD, operational policies, and payment metadata. It executes entirely within BEGIN/ROLLBACK. Existing PDL-NATIVE-05 rollback acceptance covers booking/guest replay/cancel, conflicting versions, and pagination.

## Verified execution (2026-11-22)

- Native production build and CRM production build: **PASS**.
- CRM regression: **3,240 passed, 0 failed**.
- Focused PDL acceptance and regression: **33 passed, 0 failed**.
- Native Chromium synthetic test suite: **PASS**, including all seven module save/readback fixtures, browser reloads, and transient session recovery.
- Existing PostgreSQL lifecycle acceptance: `ROLLBACK_ONLY_PDL_NATIVE05_LIFECYCLE_PASS`.
- Disposable PostgreSQL 17 configuration acceptance: `PDL_COURTS_ADMIN_02_ROLLBACK_ONLY_PASS`.
- Disposable database post-rollback counts: zero test reservations, rates, active administrators, weekday overrides, and maintenance blocks.
- Git diff check and repository lint: **PASS**. No new permission restrictions or production data writes.

## Verification

Run `npm run build:pdl`, `node scripts/pdl-aps-native-browser.mjs`, and `node --test frontend/tests/pdl-courts-admin-acceptance-02.test.mjs frontend/tests/pdl-admin-navigation-recovery.test.mjs frontend/tests/pdl-aps-native*.test.mjs`.

Database test requires the verified local disposable PostgreSQL 17 container and its isolated credentials. Run the acceptance SQL through `psql -X -v ON_ERROR_STOP=1 -f supabase/pdl-booking/acceptance/pdl_courts_admin_02_rollback.sql` only against that disposable environment. Verify resulting records and configuration remain unchanged after ROLLBACK. Do not run write acceptance against the live Supabase database.

## Limitations

- Live production session for one user was previously visible in a read-only browser tab; it did not establish seven independent signed write/readback scenarios.
- Existing Chromium does not permit JavaScript via Apple Events; this setting was not changed, and no session tokens were extracted or copied.
- Independent genuine signed-user end-to-end acceptance remains pending. No live customer payment, approved rate, or recipient was altered to manufacture evidence.

**Next checkpoint if the live gate remains pending:** PDL-COURTS-ADMIN-ACCEPTANCE-03 — Genuine Existing-Session Browser Walkthrough and Production Functional Sign-Off.
