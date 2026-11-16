# CP-TT-FM1-APP-02 — Genuine Signed Runtime Integration, Complete Attendance Workflow Acceptance, and CRM Deployment

**Status:** DEPLOYED-VERIFIED — genuine signed read-only runtime acceptance passed; real production attendance writes not performed
**Base:** `feat/cp-tt-fm1-app-01` rebased onto current `main` (`63b1c234`)
**Merged pull request:** [#424](https://github.com/wass-psti/APSYNTRACRM/pull/424)
**Production commit:** `d24ad91cd5ac215c6d7a958d00bcd1ecde58c648`
**Follow-up branch:** `fix/cp-tt-fm1-app-02-live-acceptance`

## Scope

- Continue the dedicated FM1-aligned TimeTracker application within the existing APSYNTRA CRM route, session, workspace, attendance board and data contracts.
- Preserve current attendance functionality, TimeTracker role/eligibility behavior, GPS privacy, and existing backend authorization. This milestone does not redesign roles, permissions, RLS or authentication.
- Keep attendance board data authoritative; do not create a replacement board, database or local attendance store.
- Ensure live GitHub Pages smoke verification checks every newly shipped TimeTracker route, renderer and stylesheet asset.
- Provide a read-only signed-runtime acceptance procedure for the actual deployed CRM session.

## Genuine production runtime observations (2026-11-16)

- Existing production board located through the signed CRM Global Search: `TimeTracker Attendance` (`46bf4ee7-368a-4c35-842c-8593ea1f6ac3`).
- Existing signed workspace verified; production UI reported the signed Clock capability active.
- Read-only inspection exercised Clock, Overview, Attendance Log, Reports, Calendar, Overtime, My Hours, Team Directory, Monitor and GPS.
- Attendance Log, Reports, Calendar and My Hours returned existing records/summary data.
- The deployed dedicated `#/time-tracker` route was opened with the genuine signed Chromium session. The live acceptance script verified the FM1 application shell, all ten navigation sections (Overview, Clock, Log, Reports, Calendar, OT, My Hours, Team, Monitor and GPS), absence of generic board controls, and return to Clock.
- Monitor's on-demand snapshot reported a blocked workspace-admission check. GPS reported no signed evidence for the selected view. These are pre-existing runtime observations; no authority, role, permission or GPS restrictions were changed.
- No production clock-in/out, correction, overtime submission, approval, or attendance mutation was performed.

## Changes in APP-02

- Rebased APP-01 onto current `main`, preserving the newer Global Search, TradeLink, migration and CI changes.
- Added `frontend/time-tracker-application.js`, `frontend/time-tracker-ui.js` and `frontend/time-tracker-application.css` to the live Pages CDN smoke asset inventory.
- Added a regression test requiring the dedicated TimeTracker route/renderer/style assets to be checked after deployment.
- Added a focused pull-request workflow for full frontend regression, CSS bundle integrity, production build, and FM1/TimeTracker browser acceptance.
- Added `scripts/time-tracker-live-acceptance.applescript`, a macOS Chromium procedure that navigates the already-signed active CRM tab and checks only the dedicated application shell and navigation tabs. It waits for the signed attendance snapshot before clicking tabs and never activates attendance writes or other mutation controls.

## Verification evidence

- Focused TimeTracker, loading, sidebar, Monitor, Pixi, CSS bundle, Global Search and TradeLink integration tests: 61 passed.
- Full frontend suite: 2,378 passed, 0 failed. The first concurrent run had one transient timeout-test failure; the isolated test and complete rerun both passed.
- `npm run check`, `npm run lint`, `npm run format:check`: PASS.
- Changed JavaScript ESLint and new artifact Prettier checks: PASS.
- `npm run build`: PASS. Existing non-blocking main-chunk and FuelTrans mixed-import warnings remain.
- Existing FM1 Playwright/axe acceptance: PASS.
- TimeTracker Playwright/axe fixture acceptance: PASS for all implemented views and desktop/tablet/mobile widths.
- TimeTracker-specific unit/contract suite: 222 passed, 0 failed.
- Dedicated APP-02 CI on the PR and merged main commit: PASS.
- GitHub Pages build and deployment job `43821096425`: PASS.
- Main-branch frontend validation and disposable PostgreSQL integration jobs: PASS.
- Live Pages smoke job `43821096605`: PASS for exact merged SHA `d24ad91cd5ac215c6d7a958d00bcd1ecde58c648`.
- Live CDN asset comparisons: PASS for `frontend/time-tracker-application.js`, `frontend/time-tracker-ui.js`, and `frontend/time-tracker-application.css`.
- Signed Chromium acceptance: `READ_ONLY_SIGNED_RUNTIME_ACCEPTANCE_PASS`; all ten navigation sections selected successfully and the app returned to Clock.
- The first live acceptance attempt exposed a race before signed-read readiness; the script now waits for the `Signed workspace verified` notice and retries each tab selection until confirmed.

## Remaining operational acceptance

- Clock-in/out and duplicate-session behavior are covered by the existing 222 TimeTracker tests, including validation, duplicate prevention, fresh GPS requirements, active-session checks and ambiguous clock-out reconciliation.
- No real production attendance event was created. A genuine clock-in/out write should be performed only as a real user session or against a separately approved operational test record, because it changes attendance data.
- Existing Monitor workspace-admission and GPS-evidence observations remain unchanged and are not being treated as new defects in this functionality-first scope.

The dedicated TimeTracker application is deployed and its genuine signed read-only runtime acceptance has passed. Production attendance writes were deliberately not simulated.
