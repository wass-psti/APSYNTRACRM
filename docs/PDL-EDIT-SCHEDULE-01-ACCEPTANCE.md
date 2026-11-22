# PDL Edit Schedule — 01

**Acceptance date:** 2026-11-22 (Asia/Manila)
**Target:** Paseo de Lomboy administration calendar at `/paseo/admin/calendar`.
**Branch:** `feat/pdl-edit-schedule-01`
**Scope:** Existing weekly schedule edit lifecycle only, including its required validation and readback behavior.

## 1. Root cause — REPRODUCED

The saved-schedule Edit button only changed the selected court and weekday. Form hydration was delegated to a React effect that ran only when one of its dependencies changed.

When an administrator had already selected a schedule, changed its time fields without saving, and clicked Edit for that same schedule again, the court and weekday state remained unchanged. The effect did not run, so the form retained the unsaved values instead of restoring the saved record.

A regression test was added first and failed against the original implementation: expected the persisted opening time `480`, received the unsaved value `540`. The other four existing calendar tests passed during that reproduction.

## 2. Implementation

### Frontend lifecycle

- Added an explicit `editSchedule` handler that loads the saved court, weekday, enabled state, opening time, and closing time directly from the selected record.
- Re-selecting the already active schedule now restores its persisted values without depending on a state-change effect.
- Track the active edit key (`courtId:weekday`) so the form identifies an existing-record update separately from a new schedule save.
- Clear edit mode when the administrator changes the court or weekday selectors.
- Preserve the existing `PUT /v1/admin/calendar/{courtId}/weekdays/{weekday}` request and fresh `GET /v1/admin/calendar` readback confirmation.
- Display an explicit validation message when closing time is not later than opening time; do not send an invalid update.
- Translate the existing backend `invalid_weekday_schedule` and `weekday_booking_conflict` results into actionable messages. Failed updates leave the saved list unchanged.
- Handle an empty or non-JSON error response without masking the save failure with a JSON parse exception.

### Backend and database trace

The existing Edge API route correctly maps the keyed weekday `PUT` request to `ops_schedule_put`. The existing PostgreSQL operation uses `INSERT ... ON CONFLICT (court_code, weekday) DO UPDATE`, returns `updated: true`, and exposes the resulting values through `ops_calendar` readback.

The database update path was correct; no backend route, schema, migration, role, grant, RLS policy, or authorization change was necessary. The fix remains in the editor's state hydration and error presentation.

## 3. Verification — LOCAL PASS

- Regression reproduction before the fix: 1 targeted failure, 4 existing calendar tests passing.
- Paseo frontend unit tests: **63 passed, 0 failed** (13 files).
- Admin calendar focused tests: **8 passed, 0 failed**. Coverage includes same-record reselection, update/readback after component remount, client-side invalid range, backend invalid range, booking conflict, and existing refresh/maintenance behavior.
- TypeScript typecheck: passed.
- Paseo production Vite build: passed.
- Native Paseo static bundle build: passed.
- Playwright static-host acceptance: passed at 390px, 768px, and 1440px. The new Edit Schedule flow restores the saved form values, updates the existing weekday record, reloads the page, and confirms the new values in the editor and saved schedule list.
- Full repository test suite: **3,325 passed, 0 failed** (`npm test` after rebasing on the latest `origin/main`).
- Disposable PostgreSQL 17 migration and rollback acceptance: `PDL_EDIT_SCHEDULE_ROLLBACK_PASS`, `PDL_SCHEDULE_VISIBILITY_ROLLBACK_PASS`, and `PDL_COURTS_ADMIN_02_ROLLBACK_ONLY_PASS`.
- `git diff --check` and browser acceptance script syntax check: passed.

The disposable database was created from the cached PostgreSQL 17 image with no network access. All PDL migrations were applied to that throwaway database; each acceptance script used `BEGIN`/`ROLLBACK`. The container was stopped and automatically removed. Existing Supabase containers and production records were not used or modified.

## 4. Changed files

- `frontend/apps/Paseo/source/src/pages/AdminCalendarPage.tsx`
- `frontend/apps/Paseo/source/src/pages/AdminCalendarPage.test.tsx`
- `scripts/pdl-aps-native-browser.mjs`
- `supabase/pdl-booking/acceptance/pdl_edit_schedule_rollback.sql`
- `paseo/` — regenerated native Paseo static bundle and hashed assets.
- `docs/PDL-EDIT-SCHEDULE-01-ACCEPTANCE.md`

## 5. Scope and release status

No new Supabase project, migration, booking, payment, court activation, pricing change, or authority restriction was introduced. Existing schedule creation, saved schedule listing, maintenance block management, booking conflict handling, and readback behavior remain covered by regression tests.

**Classification:** `VERIFIED` for local implementation, unit/regression tests, static-host browser acceptance, and disposable PostgreSQL acceptance. **PENDING** GitHub CI, review/release policy, and production Pages deployment. No production deployment is claimed by this local acceptance report.
