# CP-PDL-BOOKING-AVAILABILITY-03 — Approved Nine-Rate Provisioning and Reservation Acceptance

**Date:** 22 November 2026 (Asia/Manila)
**Canonical repository:** `wass-psti/APSYNTRACRM`
**Branch:** `feat/cp-pdl-booking-availability-03`
**Production application:** `https://wass-psti.github.io/APSYNTRACRM/paseo/`
**Existing Supabase project:** `jtlusodorfnyzgyuewkz`

## Production configuration readback

The current production database contains the following enabled configuration:

| Court   | Enabled | Weekly schedules | 60 min | 90 min | 120 min |
| ------- | ------: | ---------------: | -----: | -----: | ------: |
| Court 1 |     Yes | 7/7, 08:00–24:00 |   ₱150 |   ₱225 |    ₱300 |
| Court 2 |     Yes | 7/7, 08:00–24:00 |   ₱150 |   ₱225 |    ₱300 |
| Court 3 |     Yes | 7/7, 08:00–24:00 |   ₱150 |   ₱225 |    ₱300 |

All nine rate rows are enabled. GCash, Maya and BPI payment methods have configured recipients and QR image endpoints; each QR endpoint returned HTTP 200.

The current database does not independently record the approval provenance of those prices. This report therefore records them as configured and enabled, not as independently audited management approvals.

Final readback: **0 reservations, 3 expired quotes, 0 active quotes**. The three expired quotes were created by the initial production quote-endpoint checks in this implementation. No production reservation, payment proof or payment verification was created.

## Production backend correction

Applied migration `20261122150000_pdl_exclude_past_same_day_slots.sql` to the existing Supabase project.

- `pdl_booking.availability(jsonb)` now excludes already-started slots for the current Asia/Manila date.
- `pdl_booking.is_valid_interval(text,date,integer,integer)` rejects quotes/submissions whose same-day start minute has passed.
- Future-date slots remain generated from the saved court/weekday operating hours.
- The existing JSON response fields (`source`, `bookingEnabled`, `availabilityReason`, `slots`) remain intact.
- Existing court, rate, reservation, quote, payment and administrator tables were not changed.
- Existing service-role function execution contract was preserved.

Live post-migration checks:

- **9/9** future-date court-duration availability requests returned server-backed bookable slots.
- Same-day availability omitted all slots whose start minute was at or before the current Manila minute.
- A same-day quote request for 08:00 returned HTTP 422 `invalid_schedule`.
- All three courts and all nine configured rates remained enabled after migration.

## Disposable PostgreSQL end-to-end acceptance

`supabase/pdl-booking/acceptance/pdl_booking_availability_03_disposable.sql` runs only against a newly-created disposable PostgreSQL database and wraps all fixture data in one transaction followed by `ROLLBACK`.

Verified against PostgreSQL 17 with the complete Paseo migration set and the CP-PDL-03 migration:

1. All nine court-duration availability combinations.
2. Same-day past-start rejection in both availability and interval validation.
3. SQL quote creation with the configured test amount.
4. Reservation submission and persisted token-restricted receipt readback.
5. Idempotent replay returns the original reservation and leaves one row.
6. Existing reservation overlap and maintenance-block conflicts reject a second quote.
7. Rate changes after quote issuance reject the stale quote.
8. Post-test rollback leaves zero rates, quotes, reservations and weekday rows in the disposable database.

This is real PostgreSQL function/persistence acceptance. It is not represented as a live production reservation.

## Canonical frontend changes

- Public booking copy now describes live server availability and pricing rather than claiming all courts await approval.
- Booking summary identifies the server-issued quote as available at the review step; it does not invent a client-side price.
- Court map copy no longer says rates and availability are unconnected.
- Static Pages bundle was regenerated from `frontend/apps/Paseo/source/` with the existing `/APSYNTRACRM/paseo/` base.
- Native Pages browser acceptance selects tomorrow before checking the full slot grid, avoiding a false expectation that a past same-day start remains available.
- Workflow path filters include the migration, SQL acceptance, contract test and acceptance report.

## Verification

| Check                                       | Result                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Paseo TypeScript typecheck                  | PASS                                                                               |
| Paseo unit suite                            | 67/67 PASS (13 files)                                                              |
| CP-PDL-03 migration/source contracts        | 5/5 PASS                                                                           |
| Native PDL contract suite                   | 24/24 PASS                                                                         |
| Native Pages browser acceptance             | PASS at 390, 768 and 1440 px; admin, receipt and lifecycle fixture paths also PASS |
| Disposable PostgreSQL E2E                   | PASS; full rollback verified                                                       |
| Live production availability                | 9/9 PASS                                                                           |
| Live same-day past-slot and quote rejection | PASS                                                                               |
| Root CRM syntax check                       | PASS                                                                               |
| Root CRM tests                              | 3,340/3,340 PASS                                                                   |
| Root CRM production build                   | PASS (existing large-chunk advisory only)                                          |
| Paseo native bundle build                   | PASS (existing Rollup annotation and static restore-script advisories only)        |
| Pages source verification                   | PASS                                                                               |
| `git diff --check`                          | PASS                                                                               |

Prettier check on several existing compact source/workflow files reports pre-existing formatting differences; those files were not wholesale reformatted to avoid unrelated churn. The new contract test was formatted and checked independently.

## Release boundary and remaining acceptance

The production database migration is applied and live API behavior is verified. The canonical frontend source and generated `paseo/` assets are changed locally on `feat/cp-pdl-booking-availability-03`; they have not been pushed, merged or deployed to GitHub Pages.

The existing browser acceptance uses isolated synthetic fixtures for UI and administrator lifecycle flows. The disposable PostgreSQL test proves the real SQL quote-to-reservation persistence path. A production reservation was deliberately not created using synthetic guest/payment-proof data, because that would create a live pending-payment record in the operational reservation queue.

**Status:** `IMPLEMENTED` for production rate/configuration readback, live availability, same-day correction and disposable database workflow. `PENDING` for canonical Pages deployment/CDN acceptance and a controlled production reservation acceptance using an explicitly designated test booking/cleanup procedure. No payment was initiated or marked verified.
