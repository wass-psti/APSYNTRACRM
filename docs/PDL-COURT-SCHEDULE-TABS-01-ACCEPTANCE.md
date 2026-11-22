# PDL Three-Court Schedule Tabs — 01

- **Acceptance date:** 2026-11-22 (Asia/Manila)
- **Target:** Paseo de Lomboy administration calendar at `/paseo/admin/calendar`.
- **Branch:** `feat/pdl-court-schedule-tabs-01`
  **Scope:** Three-court weekly operating schedule organization and its necessary form, booking-availability, responsive, and regression checks.

## 1. Existing behavior

The calendar page loaded all court records from `/v1/admin/calendar` but rendered every weekday row in one combined list. Its separate Court selector controlled the weekday editor, not the saved list. Administrators therefore had to visually distinguish court names within a single long list.

The backend already returns all three court definitions from `/v1/admin/courts`, and each saved weekday row retains its `courtId` and `weekday` identity.

## 2. Implementation

### Court tabs and schedule visibility

- Added three court tabs driven by the existing court readback (`court-1`, `court-2`, `court-3`), sorted by court ID.
- Added per-court saved schedule counts and a visible active-tab treatment.
- Filtered the weekly schedule list by the selected tab's `courtId`. The selected court now appears in the weekly editor heading and its tab panel.
- Court switching updates the editor's court context and restores the selected weekday's saved values through the existing state synchronization effect.
- Selecting Edit on a schedule in another court automatically activates that court's tab and loads the selected weekday values.
- Empty courts display a court-specific empty state rather than a combined-list message.
- Implemented horizontal tab keyboard navigation with Left/Right, Home, and End, managed focus, ARIA tab roles, selected state, and panel relationships.
- Added responsive three-column tab styling for desktop, tablet, and mobile, with reduced-motion handling.

### Preserve maintenance targeting

The weekly court tabs now control only weekly operating-hour management. The maintenance form retains an independent court selector and state. Changing the weekly tab therefore does not silently change the target court of a maintenance block being prepared.

### Persistence and booking-time synchronization

- No database schema, migration, Edge API route, or `ops_schedule_put` change was required.
- Existing saved rows continue using the same `(courtId, weekday)` relationship and existing `PUT`/readback lifecycle.
- Existing `/v1/admin/calendar` and `/v1/admin/courts` reads still retrieve the complete saved state. Filtering is presentation-only; no record is removed or rewritten during tab switching.
- The server availability function already resolves `weekday_hours` by both court code and the requested date's weekday, then generates slots within that court's saved opening and closing minutes. That function remains unchanged.
- A new rollback-only PostgreSQL acceptance fixture writes three distinct weekly windows and verifies that availability returns the matching court ID and start-minute list for each court.

## 3. Verification — LOCAL PASS

- Admin calendar focused unit tests: **12 passed, 0 failed**.
- Paseo frontend test suite: **67 passed, 0 failed** across 13 files.
- Paseo TypeScript typecheck: passed.
- Paseo Vite production build: passed.
- Native Paseo static Pages bundle build: passed.
- Full repository `npm test`: **3,329 passed, 0 failed**.
- Playwright static-host acceptance: passed. It verifies all three tabs, correct per-court visibility, the empty Court 3 state, Court 2 update and refresh without changing Court 1, maintenance court independence, and all existing admin module flows.
- Tab layout and horizontal overflow: passed at **390px, 768px, and 1440px**.
- Disposable PostgreSQL 17 acceptance: `PDL_COURT_SCHEDULE_AVAILABILITY_ROLLBACK_PASS`, `PDL_EDIT_SCHEDULE_ROLLBACK_PASS`, `PDL_SCHEDULE_VISIBILITY_ROLLBACK_PASS`, and `PDL_COURTS_ADMIN_02_ROLLBACK_ONLY_PASS`.
- Browser acceptance script syntax, Prettier check for changed TypeScript/CSS files, and `git diff --check`: passed.

The disposable PostgreSQL database was created with `--network none`. All migrations were applied to that isolated database and each acceptance script ran inside a transaction with `ROLLBACK`. The disposable container was stopped and removed. No production schedules, bookings, payments, court activation, rates, permissions, or roles were changed.

## 4. Changed files

- `frontend/apps/Paseo/source/src/pages/AdminCalendarPage.tsx`
- `frontend/apps/Paseo/source/src/pages/AdminCalendarPage.test.tsx`
- `frontend/apps/Paseo/source/src/styles/pdl-admin-calendar.css`
- `scripts/pdl-aps-native-browser.mjs`
- `supabase/pdl-booking/acceptance/pdl_court_schedule_availability_rollback.sql`
- `paseo/` — regenerated native Paseo static bundle and hashed assets.
- `docs/PDL-COURT-SCHEDULE-TABS-01-ACCEPTANCE.md`

## 5. Scope and release status

No new Supabase project, database migration, booking, payment, court activation, pricing change, role change, permission restriction, or authorization change was introduced. The implementation changes the administration calendar's presentation and selected-court state only; existing server-side booking availability remains authoritative.

**Classification:** `VERIFIED` for local implementation, frontend regression tests, static-host browser acceptance, full repository tests, and disposable PostgreSQL availability/readback acceptance. GitHub CI, PR merge, and production Pages deployment remain pending until release checks complete.
