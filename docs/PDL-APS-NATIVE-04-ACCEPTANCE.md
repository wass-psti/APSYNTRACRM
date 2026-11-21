# PDL-APS-NATIVE-04 — Functionality-First Booking and Native Readback

**Checkpoint:** 2026-11-21

**Scope:** Finish measurable nonfinancial booking synchronization work independently of rate decisions. Continue using the existing public Paseo Edge API, private `pdl_booking` schema, and signed CRM native application. Preserve all existing access rules. Alex is the designated venue rate configurator; no rate/role/account changes are made by this checkpoint.

## Implementation

1. `frontend/app.js`: native Paseo administration uses a monotonic request identifier. Only the newest refresh in the current signed CRM user/workspace route may replace the booking snapshot. Navigation off the route and session expiry/sign-out invalidate previous requests, preventing a slow earlier response from overwriting newer server records. No polling, telemetry or new background agent added. Existing admin membership checks are untouched.
2. `supabase/pdl-booking/acceptance/pdl_native04_booking_sync_rollback.sql`: executable PostgreSQL integration test run inside one BEGIN/ROLLBACK transaction on the existing Supabase project. All rates, quotes, reservations, customer fixtures and audit writes are temporary and never committed. Reuses existing two active membership records *without pretending those are real signed browser sessions*.
3. `frontend/tests/pdl-aps-native-04-sql-contract.test.mjs`: static acceptance guard against accidental COMMIT, uncontrolled schema/role changes or removal of native/guest RPC coverage.
4. `frontend/tests/pdl-aps-native.test.mjs`: native refresh generation and lifecycle contract regression.

## Real PostgreSQL acceptance

**Executed:** isolated transaction on the configured existing production database; synthetic fixtures were rolled back. Result `ROLLBACK_ONLY_PDL_NATIVE04_SYNC_PASS`, with **1 transient test reservation before ROLLBACK**. Independent post-transaction SQL showed **0 enabled courts, 0 rate rows, 0 quotes, 0 reservations and 0 audit events**.

Assertions verified on actual `pdl_booking` routines:

- A nonproduction rate permits a valid server quote only inside the test transaction.
- Guest submission creates a persisted row and returns a protected receipt; an identical retry replays the original reservation ID; an altered same-key retry returns `idempotency_conflict`.
- A matching receipt token reads the booking, while a wrong token does not expose payment status.
- **Both existing administrator identities** retrieve the same new reservation using the authoritative `public.pdl_backend_v1('list', ...)` gateway that powers native CRM administration.
- An administrator payment decision updates booking/payment statuses and version; the other administrator reads that same updated row. A stale decision is rejected with `verification_conflict`. One audit record is written and the confirmed reservation blocks the original slot.
- Everything is rolled back. The acceptance does not store any real payment proof, contact or financial decision.

## Other regressions

- Full CRM unit suite, syntax, lint, build and independent public/native browser route checks run before merge.
- Actual public API remains nonpayable: zero enabled courts/rates. No real customer booking or settlement was made.
- No database migration, new API endpoint, new dependency, permission, RLS policy, app rewrite, QR configuration change or additional admin role.
- The separate Paseo repository's pre-existing `InteractiveCourtMap.tsx` edit remains untouched.

## Acceptance classification

| Requirement | Status |
| --- | --- |
| Guest quote/submit/replay/receipt/overlap via actual PostgreSQL functions | VERIFIED — ROLLBACK TEST ONLY |
| Native administrator query sees same transaction's reservation and updated status | VERIFIED — ROLLBACK TEST ONLY |
| Native CRM readback latest-refresh race protected | IMPLEMENTED; static/unit regression VERIFIED; no signed live account test |
| Public Pages booking and unsigned CRM login | VERIFIED — local browser regression; prior live Pages acceptance |
| Full user booking without approved prices | NOT APPLICABLE — live payable booking remains disabled |
| Venue pricing configured by designated rate administrator | DEFERRED — venue business decision |
| Genuine paid booking, proof, two signed accounts and settlement | PENDING external financial acceptance |

**Next solid implementation if further nonfinancial work is requested:** `PDL-APS-NATIVE-05 — Guest Booking Lifecycle and Concurrency Resilience, Administrative Pagination, and Production-Safe Failure Recovery`. This should build on the demonstrated transaction parity and focus on cancellation lifecycle, parallel requests and admin list pagination, not wait for venue pricing.
