# PDL Schedule Visibility and Calendar Readback — 01

## Problem

The public booking availability request returned HTTP 422 `invalid_schedule` for a saved operating-hour schedule when the court was not enabled. The booking page retained its loading state after that error.

The administration calendar fetched weekly overrides and maintenance blocks but did not provide a complete, persistent visual register. Its maintenance readback was also limited to a rolling date window.

## Production baseline

Read-only inspection of the existing APSYNTRA Supabase project on 2026-11-22 found:

- Court 1, Court 2, and Court 3 are all disabled.
- No enabled venue rates are configured.
- One weekly override is saved: Court 1, Sunday, 8:00 AM–10:00 PM.
- No maintenance blocks are currently saved.

These existing values were not changed.

## Implementation

### Availability

- Generate 30-minute start-time candidates from the saved weekday override, or the court's existing default opening hours when no override exists.
- Return a server availability result for a valid schedule even when the court is disabled or no enabled rate exists.
- Mark every candidate unavailable until the court, weekday, and matching duration rate are enabled.
- Return a specific reason: `court_not_enabled`, `weekday_closed`, or `rates_not_configured`.
- Continue using the existing `is_available` function for enabled court/rate combinations, preserving maintenance and reservation conflict checks.
- The booking page now displays the returned time options, never enables unavailable options, exits the loading state on errors, and offers an explicit retry.

### Administration calendar

- Display every saved weekly override with court, weekday, open/closed state, and hours.
- Allow an administrator to load an existing schedule directly into the editor.
- Display every saved maintenance block across all courts and dates, with a direct remove action.
- Add a manual refresh action.
- Show explicit loading and retry states; a failed first read never appears as an empty saved list.
- Keep the existing authoritative write → fresh readback confirmation for schedule saves, maintenance creation, and removal.

### Database migration

`supabase/pdl-booking/source/migrations/20261122014311_pdl_schedule_visibility_and_calendar_readback.sql`

- Replaces only the existing availability and operations function bodies.
- Removes the rolling date filter from maintenance readback.
- Does not create or change roles, grants, revokes, RLS policies, tables, columns, or application data.
- Retains the existing function signatures and execution privileges.

The migration remains in the dedicated PDL source directory. It is intentionally not copied into CRM's automatically executed `supabase/migrations` directory.

## Production deployment

- Supabase migration applied and recorded as version `20261122014311` (`pdl_schedule_visibility_and_calendar_readback`).
- The production availability endpoint was rechecked for Court 1 on Sunday 2026-11-29, 60 minutes: HTTP 200, 27 server-generated 60-minute start times (8:00 AM–9:00 PM), 26 90-minute start times (8:00 AM–8:30 PM), and 25 120-minute start times (8:00 AM–8:00 PM). All remain unavailable, with `bookingEnabled: false` and `availabilityReason: court_not_enabled`.
- A fresh read-only database snapshot confirmed the original one Sunday override, three disabled courts, zero enabled rates, and zero maintenance blocks remain unchanged.

## Verification

- Paseo frontend: 59 tests passed (13 files).
- TypeScript typecheck: passed.
- Native Paseo production build: passed.
- Static-host browser acceptance: passed at 390px, 768px, and 1440px.
- Calendar browser acceptance: save → reload → list readback → remove → reload verified.
- PostgreSQL 17 disposable rollback-only acceptance: passed for disabled court, missing rate, available slots, maintenance overlap, closed weekday, and maintenance blocks outside the former rolling window.
- Post-rollback disposable counts: zero weekday overrides, maintenance blocks, rates, and admin users; Court 1 remains disabled.
- Focused CRM/Paseo acceptance: 34 tests passed.
- Full CRM root test suite: 3,318 passed, 0 failed.
- Production function privilege readback: service role retains execution; authenticated role remains without execution; no role/grant/revoke/policy statements were introduced.
- Root migration-source manifest verification: passed.
- No live booking, payment, court activation, rate, or maintenance data was modified during testing.

## Functional boundary

Operating hours are visible independently of booking activation. A displayed time is selectable only when the existing court, weekday, rate, and availability checks permit it. This implementation does not activate courts, add rates, create bookings, or change administrator authority.
