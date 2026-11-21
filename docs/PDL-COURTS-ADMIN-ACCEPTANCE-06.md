# PDL-COURTS-ADMIN-ACCEPTANCE-06 — Production-Safe Write and Lifecycle Certification

## Objective and status

Complete genuine signed production write/readback only when it can be done without putting venue pricing, real customers, payment recipients, existing bookings or funds at risk. The signed seven-module read-only certification remains accepted from PDL-COURTS-ADMIN-ACCEPTANCE-05.

### Current production boundaries

- The signed production booking queue previously returned **zero reservations**; there is no real paid booking available to verify or cancel without manufacturing a transaction.
- The court and rate configuration remains venue-approval-dependent. This checkpoint does **not** turn on live rates, activate courts, alter recipients or trigger payment settlement.
- Desktop GUI focus changed to another active Mac/browser workflow during an attempted unchanged-policy save. The settings form was not confirmed submitted. No claim of live write acceptance is made.
- A disposable PostgreSQL 17 instance was initialized on localhost port 55438, and all ten Paseo booking migrations applied. Its lifecycle acceptance command was held by the device client's safety review, as was a follow-up query. **No database lifecycle PASS is claimed for this new run.** The independently verified rollback tests from earlier milestones remain background evidence, not newly executed certification.

## Implemented persistence corrections

- **Court Settings and Pricing:** after the server acknowledges a save, fetch current court/rate data again and compare the exact court status, hours, rate duration, minor-unit price and enabled state. Do not report success on a mismatched or failed readback.
- **Calendar:** validate persisted weekday hours and enabled state, verify returned maintenance block identity/fields after creation, and confirm absence after removal. Do not call an unconfirmed write saved.
- **Settings:** verify server acknowledgement plus exact persisted lead time, grace minutes and notice after PUT.
- **Payment QR:** refetch the public method metadata without caching and verify the saved recipient and presence of the method image URL before reporting success. Keep the selected file available on failure so the operator can reconcile the uncertain write.
- **Booking verification:** distinguish an acknowledged decision with failed readback from a confirmed status. Avoid instructing retries before the user successfully refreshes.
- No new permission rules, migrations, providers, dependencies, or financial processing paths.

## Verified implementation gates (2026-11-22)

- Full CRM regression: **3,260 PASS / 0 FAIL**.
- Focused Paseo regression and new contract tests: **40 PASS / 0 FAIL**.
- Paseo production TypeScript/Vite build: **PASS**.
- Lint, syntax and diff whitespace checks: **PASS**.
- Isolated Chromium seven-module workflow acceptance: **PASS** for successful write/readback, six deliberate mismatch responses, payment verification state, and the existing read-only sign-in/navigation behaviors.
- All ten Paseo migrations applied on dedicated disposable PostgreSQL 17: **PASS**. Actual new rollback lifecycle execution: **PENDING device review**.

## Verification strategy

- The existing isolated Chromium acceptance script tests genuine UI handlers with **synthetic, stateful HTTP fixtures**. It checks expected saves and page-refresh persistence, then simulates **six false-positive HTTP 200 acknowledgements** that do not persist server state: court, rate, calendar weekday, maintenance creation, policy, and payment QR. Each must produce a reconciliation warning instead of a success claim.
- The existing disposable PostgreSQL acceptance SQL (`pdl_native04_booking_sync_rollback.sql`, `pdl_native05_rollback.sql`, `pdl_courts_admin_02_rollback.sql`) is retained unchanged. Its new execution requires device-side approval; never run it against production.
- A full CRM test run and Vite build demonstrate that unrelated CRM functionality remains intact.

## Remaining acceptance and next step

**Production write acceptance remains PENDING.** Real booking/payment lifecycle certification requires either a venue-approved isolated real booking scenario with safe rollback and explicit payment reconciliation, or a complete disposable database/API test and separate real signed readback. Neither a frontend build nor synthetic HTTP mocks can certify live production writes.

If the authorized disposable test cannot be run and no genuine safe booking exists, the next scoped milestone is **PDL-COURTS-ADMIN-ACCEPTANCE-07 — Approved Disposable Booking Lifecycle Execution, Genuine Signed No-Change Persistence Readback, and Financial-State Reconciliation Closeout**. No unrelated security or authority changes are part of that scope.
