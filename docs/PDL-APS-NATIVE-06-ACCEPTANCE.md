# PDL-APS-NATIVE-06 — Isolated Queue and Recovery Acceptance

**Scope:** Existing Paseo guest/admin lifecycle and administrative UI. No changes to authentication, roles, permissions, rates, payment state or production bookings.

## Implemented

- The admin reservation reader now returns a success/failure result to callers. A successful cancellation followed by a failed readback is not presented as a verified UI refresh.
- After a cancellation error or timeout, a failed reconciliation explicitly warns against another cancellation until a successful readback. The existing booking data remains visible so an operator can refresh without losing context.
- Incremental pagination deduplicates reservations by ID, avoiding duplicate cards when pages overlap under changing server data.
- Extended isolated Chromium HTTP fixtures verify five 25-record cursor pages, all 125 unique records, no remaining Load More button, a simulated cancellation gateway failure, a failed immediate readback, and successful later refresh. No fixture request reaches the live backend.
- Contract tests assert existing PostgreSQL advisory transaction locks, row-level cancellation lock/version check and no automatic refund semantics.

## Evidence and limits

`npm run build:pdl`, `node scripts/pdl-aps-native-browser.mjs`, and `node --test frontend/tests/pdl-aps-native*.test.mjs` are the focused checks.

The Mac's Docker daemon is unavailable. The UI fixture does **not** certify actual simultaneous PostgreSQL connections, database load throughput, live signed users or financial settlement. Existing database concurrency locks were inspected, but no new live load or destructive test was run. Existing 05 rollback-only SQL acceptance remains available for safe database lifecycle checks.

## Remaining acceptance

1. **Disposable database parallel test:** independent connections submit the same quote with identical and different idempotency keys, race overlapping court slots, and race cancellation against verification. Assert one slot winner, stable replays, one audit event and correct conflicts; discard all records.
2. **High-volume database readback:** seed at least 125 disposable reservations, verify deterministic cursor pages under concurrent inserts and updates, and confirm no skips/duplicates across the defined snapshot behavior.
3. **Real signed acceptance:** two existing administrator sessions reconcile the same booking and readback across public/native views, without changing genuine customer or financial data.

Do not activate paid rates or send real payments to complete these gates.

**Next milestone if still blocked:** `PDL-APS-NATIVE-07 — Disposable PostgreSQL Multi-Connection Race Certification and Independent Signed Administrator Closeout`.
