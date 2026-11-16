# CP-TT-FM1-APP-02 — Genuine Signed Runtime Integration, Complete Attendance Workflow Acceptance, and CRM Deployment

**Status:** IMPLEMENTED-UNVERIFIED — deployment and post-deployment signed acceptance pending
**Base:** `feat/cp-tt-fm1-app-01` rebased onto current `main` (`63b1c234`)
**Working branch:** `feat/cp-tt-fm1-app-02`

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
- Monitor's on-demand snapshot reported a blocked workspace-admission check. GPS reported no signed evidence for the selected view. These are pre-existing runtime observations; no authority, role, permission or GPS restrictions were changed.
- No production clock-in/out, correction, overtime submission, approval, or attendance mutation was performed.

## Changes in APP-02

- Rebased APP-01 onto current `main`, preserving the newer Global Search, TradeLink, migration and CI changes.
- Added `frontend/time-tracker-application.js`, `frontend/time-tracker-ui.js` and `frontend/time-tracker-application.css` to the live Pages CDN smoke asset inventory.
- Added a regression test requiring the dedicated TimeTracker route/renderer/style assets to be checked after deployment.
- Added a focused pull-request workflow for full frontend regression, CSS bundle integrity, production build, and FM1/TimeTracker browser acceptance.
- Added `scripts/time-tracker-live-acceptance.applescript`, a macOS Chromium procedure that navigates the already-signed active CRM tab and checks only the dedicated application shell and navigation tabs. It never activates attendance writes or other mutation controls.

## Verification evidence

- Focused TimeTracker, loading, sidebar, Monitor, Pixi, CSS bundle, Global Search and TradeLink integration tests: 61 passed.
- Full frontend suite: 2,378 passed, 0 failed. The first concurrent run had one transient timeout-test failure; the isolated test and complete rerun both passed.
- `npm run check`, `npm run lint`, `npm run format:check`: PASS.
- Changed JavaScript ESLint and new artifact Prettier checks: PASS.
- `npm run build`: PASS. Existing non-blocking main-chunk and FuelTrans mixed-import warnings remain.
- Existing FM1 Playwright/axe acceptance: PASS.
- TimeTracker Playwright/axe fixture acceptance: PASS for all implemented views and desktop/tablet/mobile widths.
- Pages smoke now includes the new TimeTracker assets; the post-deployment live CDN comparison must still run against the merged main SHA.
- The live AppleScript acceptance procedure compiles successfully with macOS `osacompile`; it is intentionally not run until the dedicated route is deployed.

## Remaining acceptance gates

1. Create and pass the GitHub pull request checks for this branch.
2. Merge through the repository's normal GitHub protection/CI process; do not bypass required checks.
3. Verify the GitHub Pages live smoke reports the merged source SHA and the new TimeTracker assets match exactly.
4. Run `osascript scripts/time-tracker-live-acceptance.applescript` in the already-signed Chromium CRM session.
5. Verify the deployed `#/time-tracker` route, canonical legacy board redirect, FM1 shell, and each view with the genuine session.
6. Validate clock-in/out capability and duplicate-session prevention without writing a real attendance event. A real production clock-in/out requires a separately approved operational test record or a user-performed real session; this implementation does not create one.
7. Confirm the actual workspace's Team/GPS visibility and read-only behavior without changing existing eligibility rules.

No production deployment, production attendance write, or final signed-runtime acceptance is claimed until those gates are evidenced.
