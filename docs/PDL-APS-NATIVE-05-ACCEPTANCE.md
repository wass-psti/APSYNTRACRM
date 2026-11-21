# PDL-APS-NATIVE-05 — Guest Booking Lifecycle, Pagination and Safe Recovery

**Date:** 2026-11-21
**Scope:** Paseo de Lomboy public booking, connected administrator queue and signed native APSYNTRA CRM projection. Existing shared Supabase project `jtlusodorfnyzgyuewkz`, isolated `pdl_booking` schema. No other CRM module, role, price, account or beneficiary was changed.

## Delivered

1. **Backend administrative pagination:** The isolated service-only `public.pdl_admin_lifecycle_v1('page', payload)` accepts a bounded page size (1–50, default 25) with deterministic descending `(created_at,id)` keyset continuation. Query text remains bounded at 80 characters. The legacy `/v1/admin/reservations` route and gateway remain unchanged for compatibility.
2. **Supported cancellation lifecycle:** `POST /v1/admin/reservations/{id}/cancel` accepts `expectedVersion`. The database locks the record, checks its current version, and transitions only `pending_verification` + `submitted` to `cancelled` + `submitted`, increments the version, and creates an audit event. The canceled reservation stops blocking the court. A repeated/stale request returns `cancellation_conflict`; a verified/confirmed or already-cancelled reservation is not silently altered. **No refund is performed or claimed. Any submitted funds still require independent financial reconciliation.**
3. **Signed API separation:** Existing Supabase Auth + Paseo active-membership validation still runs before either route. The dedicated PostgREST function is executable by `service_role` only, as before. No new CRM permissions, accounts, RLS changes or public customer data exposure.
4. **Connected admin UI:** Incremental “Load more reservations” with server-returned cursor, preserved search query, bounded retrieval, and latest-response-only state updates. Pending cancellations show a clear, deliberate confirmation and an explicit no-automatic-refund warning. Uncertain timeout and version-conflict outcomes trigger a fresh readback before a retry. Existing proof preview, payment verification and venue configuration are preserved.
5. **Native APSYNTRA administration:** The signed `#/paseo` view also reads the bounded cursor endpoint, supports an incremental page button and keeps previous refresh/session invalidation safeguards. It continues to use the same underlying Paseo database as the public booking portal.

## Production database and Edge activation

- Database migration applied using existing project and recorded in remote history: **`20261121153857_pdl_admin_paginated_lifecycle`**. No new table, schema change, public grant, or financial setting.
- Live Edge function activated as **`pdl-guest-api` v11**, with unchanged `verify_jwt=false` for the public guest entry and existing signed route checks. A source-diff guard confirmed the only v10 changes were the two new signed admin routes and their dedicated RPC adapter.
- Live unauthenticated HTTP smoke: public health 200; no-rate availability 422; payment-method metadata 200; legacy admin list, new admin page and cancel routes all 401. All returned expected APSYNTRA Pages origin CORS headers.
- The database shows **zero enabled courts, rates, quotes, reservations and payment audit events** after activation. Existing venue-rate decisions remain deferred to Alex; neither test fixture pricing nor private proof content is published.

## Database functional acceptance

The actual PostgreSQL rollback-only acceptance source is `supabase/pdl-booking/acceptance/pdl_native05_rollback.sql` and is deliberately executed inside `BEGIN ... ROLLBACK`, with short lock/statement timeouts. Its synthetic venue amount, proof path and customer data exist only in the transaction.

**Result:** `ROLLBACK_ONLY_PDL_NATIVE05_LIFECYCLE_PASS`, 2 transient reservations, then ROLLBACK. Covered: quote, booking, cancellation, release of the court slot, idempotent replay of an already cancelled booking, unchanged submitted payment evidence, exactly one cancellation audit event, paginated two-page readback, bounded page-size denial, successful verification of a distinct pending reservation, stale cancellation denial and no cancellation of verified payment. No permanent records remained.

This validates concurrency **conflict/version behavior** using actual PostgreSQL locks and row versions. It does **not** claim a genuine parallel multi-connection load test or a real payment reversal; those are separate runtime acceptance gates.

## Automated and browser acceptance

- Native unit tests include cursor behavior, signed administrator denial and previous generation-based refresh coherence.
- `frontend/tests/pdl-aps-native-05-contract.test.mjs` covers the migration, API signed route, cancellation semantics, UI controls, and rollback-only scenario.
- The existing Chromium public/native browser smoke now includes an **isolated administrator HTTP-fixture** acceptance: page one/two loading, cancellation confirmation, explicit no-refund messaging, mobile layout and fresh admin readback. The browser test does not send a real cancellation or use real payment details.
- The CRM build, lint, syntax, full regression, production Pages workflow and CDN readback are separately verified before final closeout.

## Remaining external acceptance

- Real two-account signed administrator end-to-end acceptance requires genuine existing sessions; tests are synthetic and do not replace real operators.
- Actual concurrent HTTP submit/cancel tests under competing signed requests need a disposable isolated environment and verified rate fixtures; not run against live customer data.
- Full paid booking, refund, settlement and real rate activation remain deferred pending venue authorization and legitimate payment evidence. The new cancellation state **never** auto-refunds.

**Next nonfinancial milestone if needed:** `PDL-APS-NATIVE-06 — Isolated Parallel Booking/Cancel Stress Acceptance, Recovery After Uncertain Writes, and Large-Queue Readback Certification`. Continue without waiting for live rates, using a disposable test environment only.
