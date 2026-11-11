# APSYNTRA CRM — Second-stage Interaction Latency Optimization

## Investigation findings

The previous board-table change reduced repeated value scans and made ordinary cell edits local. A source-level review found three remaining per-keystroke redraw paths:

- FuelTrack+ Activity search updated state and called the full application `render()` for every input event.
- TimeTracker Team search did the same, rebuilding the directory and all surrounding board content.
- TimeTracker Overtime search did the same, rebuilding its metrics, charts, request list, board shell, and input element.

Column resizing also wrote table/column width attributes on every pointer event and could synchronously read layout during the pointer-move path. High-frequency pointer events could therefore cause repeated style/layout work within a single display frame.

## Implemented

- Added `applySearchVisibility`, a local DOM-only filter that toggles existing rows, group visibility and empty states. It does not replace nodes, rerender the shell, issue network requests, persist values, or install observers.
- FuelTrack Activity renders the current selected event type once and retains its bounded 250-event page while search narrows or broadens results. Audit export remains filtered by the current search model.
- TimeTracker Team precomputes normalized search text during the existing signed snapshot projection. Search toggles existing role-filtered member cards and updates the visible count without re-projecting or rebuilding the directory.
- TimeTracker Overtime precomputes normalized request search text and retains the current week/status result rows while search toggles visibility. Metrics and signed read contracts are unchanged.
- Added `createFrameCoalescer` for high-frequency pointer input. Column resizing now keeps only the latest pointer width and applies at most one update per animation frame. The pointer-move handler performs no layout reads. Pointer-up flushes the final width before the existing local preference write; pointer-cancel restores the starting geometry.
- Added tests for row identity, search broadening, empty states, group visibility, coalescing, flush/cancel behavior, signed search guards, and the absence of full `render()` calls in the three input handlers.

## Verification

- Focused module tests cover FuelTrack Activity, TimeTracker Team, TimeTracker Overtime, board interaction and the new scheduling/search helpers.
- A disposable headless Chromium fixture exercises the actual `applySearchVisibility` module against 1,200 retained DOM rows in 100 groups. Four search passes measured 0.5–1.8 ms across two local Chromium runs; the same row nodes remained in place. Scheduling 1,000 pointer values produced one frame callback with the final value.
- Existing Chromium frame, long-task, resource-waterfall, startup phase and workspace-read harness checks remain enabled and pass.
- Full frontend suite: 1,807 passed, 0 failed (`node --test frontend/tests/*.test.mjs`).
- JavaScript syntax: `for source in frontend/*.js; do node --check "$source"; done`.
- CSS bundle consistency: `node scripts/build-priority5-styles.mjs --check`.
- Security source guards: `node scripts/verify-pages-source.mjs` and `node scripts/sec14-legacy-read-consumer-guard.mjs`.

## Scope and acceptance boundary

No database, schema, RPC, RLS, role, permission, session, workspace, or deployment policy changes. No new authority, eligibility checks, restrictions, background work, or telemetry. Search attributes contain only values already present in the same signed, rendered data set.

The currently open production browser tab reported `Reconnecting` during investigation. It was not manipulated. Synthetic Chromium timings validate the local DOM update algorithm, not live signed production latency. Final browser acceptance requires a stable signed session and a repeatable real-board interaction sample.
