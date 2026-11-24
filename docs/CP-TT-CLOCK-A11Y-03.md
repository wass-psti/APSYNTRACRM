# CP-TT-CLOCK-A11Y-03 — Remove Clock Work Plan and Ring Motion

Date: 2026-11-24 (Asia/Manila)

## Status

Implementation and local acceptance complete. Pending GitHub CI, merge, and production deployment.

## Root cause

CP-TT-CLOCK-A11Y-02 stabilized DOM updates but left two explicit CSS entrance animations active in frontend/apps/TimeTracker/time-tracker-refined.css:

- The Clock Work Plan field ran tt-work-plan-reveal, translating the field from -4px to 0.
- The Clock session ring ran tt-clock-ring-reveal, fading and scaling the ring from 96% to 100%.

Those animations can replay when their elements are mounted or when a real session state transition reconciles the Clock view. The prior browser acceptance checked for zero animation restarts during a narrow same-state refresh but still explicitly required the Work Plan animation to be present. This allowed the visible movement to survive the previous release.

The ring's SVG progress stroke also used a 350ms stroke-dashoffset transition, adding visible movement during each timer update.

## Implementation

- Removed entrance animation from the Clock Work Plan field.
- Removed scale/fade entrance animation from the Clock session ring.
- Removed the ring progress stroke transition so each one-second value update is applied immediately.
- Removed the now-unused Clock ring keyframes.
- Kept the shared Work Plan keyframes for the separate OJT screen; no OJT behavior was changed.
- Preserved timer calculations, live refresh, signed attendance data, session transitions, Work Plan correction behavior, focus, selection, and scroll.
- Rebuilt the deterministic 81-file CSS bundle from its source manifest.

No backend, database, attendance business-rule, role, permission, or authorization changes. No model-training, gradient-descent, backpropagation, or parameter-update code or dependency introduced.

## Acceptance

1. Work Plan and ring computed animation-name are none.
2. Work Plan and ring computed transforms remain none.
3. Ring progress computed transition property is none with zero duration.
4. The Work Plan and ring bounding rectangles remain identical across a 400ms browser observation.
5. Routine signed refresh retains existing DOM nodes, focus, selection, textarea value, and scroll.
6. Remote Work Plan corrections remain deferred while focused and apply after blur.
7. Active-to-idle session reconciliation continues to pass.
8. WCAG 2.2 AA browser checks remain clean.
9. Full frontend regression, lint, syntax, deterministic CSS bundle check, and production build pass.

## Verification record

- Red/green source test: frontend/tests/time-tracker-refined-ui.test.mjs failed before the CSS change because the Clock animation declarations remained, then passed after removal.
- Chromium browser acceptance: both node scripts/cp-tt-clock-a11y-01-browser.mjs and npm run test:tt-clock-a11y-02 passed. CP01's inherited assertion was updated because it still required the now-removed Work Plan animation. CP03 checks computed animation/transform/transition properties, zero active animations, and identical Work Plan/ring bounding rectangles across 400ms.
- Full frontend regression: 3,669 passed, zero failed.
- Focused TimeTracker clock regression: 44 passed, zero failed.
- Production Vite build: passed. Existing build warnings remain for the startup-guard script tag, host-context pseudo-class, and large generated chunks; no build failure.
- Repository lint and syntax checks: passed. Direct ESLint on the changed browser acceptance and TimeTracker unit test: passed.
- Deterministic CSS bundle: 81 source files verified current; 1,688,004 bytes.
- Git diff whitespace check: passed.
- Initial GitHub CI correctly exposed the stale CP01 animation expectation; the inherited browser acceptance was updated to the new no-motion contract and both CP01/CP03 Chromium scripts passed locally. GitHub CI is rerunning on the updated pull request.
