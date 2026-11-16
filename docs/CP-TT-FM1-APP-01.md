# CP-TT-FM1-APP-01 — FM1-Aligned CRM-Native TimeTracker Application

**Status:** IMPLEMENTED-UNVERIFIED
**Scope:** Frontend route, application shell, navigation, presentation, and existing TimeTracker integration.

## Objective

Replace the board-first TimeTracker experience with a dedicated APSYNTRA CRM application route modeled on the Feedmill Ticketing Portal (FM1), while continuing to use the existing TimeTracker attendance board and domain client.

## Delivered

- Added the CRM sidebar route `#/time-tracker` with a native clock icon.
- Added deterministic discovery of the existing TimeTracker attendance board. The route never creates, provisions, or migrates a board.
- Canonicalized legacy TimeTracker board URLs to the dedicated route and made every route to the TimeTracker board render the application rather than the generic board table.
- Kept the existing CRM shell, signed workspace context, board loader, `TimeTrackerNativeClient`, attendance state, and event handlers. The internal board view remains the established lifecycle host; the board interface is no longer the user-facing TimeTracker page.
- Reorganized the UI into an FM1-style application header, horizontal section navigation, contextual page heading, status notices, domain view, and footer.
- Reused FM1 design tokens and interaction styles for the application shell, with responsive layouts, visible keyboard focus, and reduced-motion handling.
- Added TimeTracker-specific loading and error copy while preserving the existing default Board loading presentation.
- Disabled optional Pixi scene mounting on the dedicated TimeTracker application route; the attendance interface remains native DOM.
- Added scoped contrast corrections for the existing Log, Reports, Calendar, Overtime, My Hours, Team, Monitor, and GPS surfaces after automated browser auditing identified low-contrast legacy labels.

## Preserved behavior and contracts

- Clock-in and clock-out flows, GPS capture, duplicate-session checks, active-session recovery, attendance history, reports, calendar, overtime, My Hours, team, monitor, and GPS views remain connected to their existing modules.
- Existing PHT calculations and attendance classifications are unchanged.
- Existing signed RPCs, attendance persistence contracts, server-side write capability checks, and current Team/GPS eligibility behavior are unchanged.
- No database migration, new role, new permission, authentication change, or authorization policy was added.

## Verification

- Baseline before changes: `npm test` — 2,350 passed, 0 failed.
- Focused route, rendering, loading-state, and CSS tests are included in `frontend/tests/time-tracker-application.test.mjs`.
- Added `npm run test:time-tracker:e2e`, using the existing Playwright and axe-core dependencies with a non-production fixture.
- Browser acceptance covers the Clock, Log, Overview, Reports, Calendar, Overtime, My Hours, Team Directory, Monitor, and GPS views; desktop, tablet, and mobile widths; horizontal navigation; and WCAG 2.2 AA axe checks.
- The fixture deliberately uses read-only attendance data and does not perform clock-in/out writes.
- `npm test` — 2,357 passed, 0 failed.
- `npm run check`, `npm run lint`, and `npm run format:check` — PASS.
- ESLint on all changed JavaScript modules/tests and Prettier on new artifacts — PASS.
- `node scripts/build-priority5-styles.mjs` — PASS; 48 CSS source files bundled.
- `npm run build` — PASS. Non-blocking build warnings remain for the large main chunk and a FuelTrans mixed static/dynamic import; neither is part of this change.
- `npm run test:e2e` — FM1 browser acceptance PASS.
- `npm run test:time-tracker:e2e` — TimeTracker browser acceptance PASS, including all listed views and WCAG 2.2 AA axe checks.

## Acceptance still required

- Verify the dedicated `#/time-tracker` route with a genuine signed employee session in the CRM.
- Exercise actual clock-in, clock-out, duplicate-session prevention, active-session recovery, GPS capture/readback, history, reports, calendar, overtime, My Hours, and existing Team/GPS eligibility paths.
- Confirm the application with real workspace data and actual desktop/mobile browser sessions.

No production deployment or live attendance write is claimed by this milestone.
