# CP-PDL-BOOKING-AVAILABILITY-04 — Acceptance Record

**Scope:** controlled quote-to-reservation verification, receipt readback, idempotency and conflict acceptance, plus hour-first booking duration presentation.

## Implementation

- Added shared duration formatting: `60 → 1 hour (60 minutes)`, `90 → 1.5 hours (90 minutes)`, `120 → 2 hours (120 minutes)`.
- Court cards and court details show the three supported booking periods before schedule selection.
- Booking duration choices show hours as the primary label and minutes as the secondary value. The current selection summary updates immediately when the duration changes.
- Customer details, booking review, payment summary, administrator reservation details, saved rate matrix labels and reservation receipt use the same hour-first presentation.
- Downloaded receipt text includes both the hour value and exact minute value.
- No scheduling, availability, quote, pricing or reservation API fields changed. The browser still sends `durationMinutes` with the exact values `60`, `90` or `120`.
- No database migration, production rate change, payment setting change or authorization-policy change was introduced.

## Verification evidence

| Acceptance                                                                 | Result                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Paseo TypeScript typecheck                                                 | PASS                                                 |
| Paseo unit tests                                                           | 78/78 PASS                                           |
| Paseo production build                                                     | PASS                                                 |
| Responsive browser acceptance                                              | PASS at 390, 768 and 1440 px                         |
| Court selection, duration selection, customer form and review summary      | PASS                                                 |
| Dynamic duration changes and availability refresh                          | PASS                                                 |
| Browser reservation submission                                             | Not invoked                                          |
| Production live availability and quote requests                            | 9/9 PASS                                             |
| Live amounts                                                               | PHP 150.00 / 225.00 / 300.00 across all three courts |
| Production same-day past-slot exclusion                                    | PASS                                                 |
| Disposable PostgreSQL 17 full lifecycle acceptance                         | PASS; transaction rolled back                        |
| Receipt readback / replay / changed-key payload / conflict / expired quote | PASS in disposable PostgreSQL transaction            |
| Post-rollback PDL schema and fixture check                                 | `ROLLBACK_CONFIRMED`, `CLEAN`                        |

The responsive browser test serves the committed Pages build locally and uses deterministic API fixtures to exercise the complete court-selection → duration-selection → customer-details → review flow at all three viewport sizes. The separate production smoke test calls the live guest API for all nine court/duration combinations. It created short-lived quote records only; each quote expires automatically. No production reservation, payment submission, payment proof object, or customer record was created.

The disposable PostgreSQL acceptance applied the complete Paseo migration set and exercised the full SQL quote → reservation → token receipt path, idempotent replay, changed-payload conflict, overlapping reservation, maintenance conflict, changed-rate quote and expired quote. All operations ran inside a single transaction and rolled back. The runner verifies the target is the local `supabase_db_cp16019-disposable-local` PostgreSQL 17 container and checks that the PDL schema is absent afterward.

## Production submission boundary

The production reservation endpoint requires a genuine payment receipt file, validates its signature, stores it in private storage, and records the payment as `submitted` pending staff review. A synthetic fixture is therefore not used against production. No funds were transferred and no false payment evidence was uploaded.

**Status:** `IMPLEMENTED` for hour-first duration display, exact minute-value preservation, production availability and quote acceptance, and disposable end-to-end reservation/receipt/idempotency/conflict acceptance. `PENDING` for a genuine production reservation submission and independent live receipt retrieval using an actual, explicitly designated test booking with valid payment evidence or a venue-approved no-payment test process. Production deployment and post-deployment browser acceptance remain release gates.
