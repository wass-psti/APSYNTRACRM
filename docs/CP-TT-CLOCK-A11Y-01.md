# CP-TT-CLOCK-A11Y-01 — Existing Clock Tab Mobile Accessibility Correction

## Scope

Correct the existing TimeTracker Clock Work Plan reveal contrast behavior and eliminate visual bouncing caused by periodic signed attendance reconciliation. Preserve the existing Clock workflow, attendance rules, GPS behavior, refresh cadence, and backend contracts.

## Findings

- The Clock Work Plan reveal animation previously used opacity, temporarily blending its text with the background and causing a WCAG contrast failure during animation.
- The current main baseline already contains the transform-only animation correction in `frontend/apps/TimeTracker/time-tracker-refined.css` (commit `116e42e`). This implementation adds regression coverage rather than duplicating the CSS change.
- `refreshCorrectedTimeTrackerClock()` performs a background signed snapshot every 45 seconds while the active Clock view is visible. When the snapshot changed, it called the global `render()`, reconstructing the application DOM and causing visible movement.

## Implementation

- Added `syncTimeTrackerClockView()` to reconcile the updated signed snapshot into the existing Clock stage.
- Added a small keyed DOM morph that retains compatible elements and updates text, attributes, and only the structural nodes required for real idle/active session transitions.
- Changed background reconciliation to update the snapshot and Clock stage without calling the global application renderer.
- Expanded change detection to include active session identity, clock-in time, location, department, work plan, record fields, and automatic clock-out state/deadline.
- Preserved the existing 45-second refresh interval, focus-triggered refresh, signed read, revision checks, scope checks, and no-write behavior.
- Preserved existing success/error messages during background refresh to avoid refresh-induced layout changes.
- Added focused browser acceptance for WCAG 2.2 AA, transform-only Work Plan animation, node identity, focus, scroll, layout stability, and active-to-idle transitions.

## Verification

- `npm test`: 3,644 tests passed.
- `npm run build`: passed. Existing Vite warnings remain for the non-module startup guard script and large application chunks.
- `npm run lint`: passed.
- `npm run check`: passed.
- Changed-module ESLint: passed.
- Prettier checks for the added script, documentation, package manifest, and workflow: passed.
- CSS source manifest: `CSS_BUNDLE_UP_TO_DATE`, 80 files.
- node scripts/cp-tt-clock-a11y-01-browser.mjs: passed in Chromium with zero WCAG 2.2 AA violations in active and idle Clock states. Existing Clock DOM nodes, focus, scroll, and layout were retained during a simulated signed correction.
- `npm run test:time-tracker:e2e`: passed.

## Data, deployment, and training

No database migration, backend mutation, attendance write, production data change, permission change, new dependency, telemetry, background agent, gradient descent, model training, or model-parameter update was introduced.

This implementation is locally verified. Production deployment and signed production acceptance remain pending.
