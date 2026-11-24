# CP-TT-CLOCK-A11Y-02 — Stable Timer and Work Plan Live Synchronization

## Root cause

The prior CP-TT-CLOCK-A11Y-01 patch removed the global application `render()` call, but still rendered a fresh Clock template and recursively reconciled the entire `.tt-clock-stage` after changed signed snapshots. The generic DOM morph could reinsert/move nested nodes when conditional siblings changed. The timer ring and Work Plan wrapper have CSS entrance animations, so moving those nodes can restart their animations and look like UI bouncing.

The one-second clock ticker also used `textContent` writes, which replace existing text child nodes, and it set the SVG `stroke-dashoffset` on every tick even when the computed value was unchanged.

## Implementation

- Replaced whole-Clock-stage morphing during an unchanged active session with targeted updates to existing timer, session context, Work Plan, and auto-clockout nodes.
- Kept structural reconciliation only for a genuine idle-to-active or active-to-idle transition.
- Added `updateClockText()` to update an existing text node's `nodeValue` instead of replacing child nodes.
- Avoided redundant SVG progress attribute writes when the calculated dash offset has not changed.
- Preserved the existing timer tick and 45-second signed attendance polling cadence.
- Preserved accurate credited-work calculations, the Philippine lunch deduction, corrected signed Clock-In timestamps, active-session details, and automatic clock-out status/countdown updates.
- Added a signed Work Plan baseline to the active readonly textarea. A remote correction is applied only when the field still matches its last synchronized value and is not focused; a focused field is left untouched and can receive the correction on a later refresh after blur.
- Kept the idle editable Work Plan draft outside background snapshot updates.
- Added browser acceptance for both screenshot components at desktop dimensions, repeated background refresh, zero child-list mutations, no animation restarts, no redundant progress-attribute writes, focus/selection/value/scroll preservation, deferred Work Plan corrections, automatic clock-out state changes, and genuine active-to-idle transitions.

## Verification

- Dedicated Chromium acceptance: `npm run test:tt-clock-a11y-02` passed (`CP_TT_CLOCK_A11Y_02_BROWSER_PASS`).
- Full frontend regression: `npm test` — 3,645 passed, zero failures.
- Focused TimeTracker regression suite: 62 tests passed.
- Production build: passed. Existing warnings remain for the startup guard script, unsupported `:host-context` minification, and large chunks.
- Full lint: passed.
- Repository syntax and migration-manifest check: passed (222 recovered baseline and 86 forward migration files).
- Changed-module ESLint and Prettier: passed.
- Existing CP-TT-CLOCK-A11Y-01 Chromium acceptance: passed.
- The broader `npm run test:time-tracker:e2e` currently fails at the existing Log admin-toolbar border-radius assertion (actual 16px, expected 0px). This exact failure was reproduced on a clean `origin/main` worktree at the same commit after a clean production build, so it is pre-existing and unrelated to Clock. It was not changed as part of this task.

Production deployment and hosted CI acceptance remain pending.

## Scope preservation

No backend/database changes, migrations, attendance writes, production data changes, permissions changes, dependencies, telemetry, background agents, gradient descent, backpropagation, model training, or model-parameter updates were introduced.
