# CP-BOARD-INTERACTION-LATENCY-FINAL — Current-main reconciled retained DOM and resize coalescing

## Integration decision

PR #251 (e6cc9be) is based on 7349883, well behind current main. Its whole app.js may not be merged wholesale: current main includes newer signed column-edit, role, TradeLink, workspace and import flows. This integration applies only compatible presentation changes to current main and leaves the existing signed board column save paths intact.

## Changes

- FuelTrack+ v3 Activity, TimeTracker Attendance Team, and TimeTracker Attendance Overtime: render the currently authorized bounded result subset once and update matching rows/groups in place as the user types. Search broadening and clearing do not replace DOM nodes. Existing signed role, scope, paging, export, edit and session checks are unchanged.
- Column resizing: coalesce high-frequency pointer widths to one requestAnimationFrame update. Read starting width once on pointerdown; never measure layout during pointermove; flush the final width on pointerup; cancel pending frame and restore starting geometry on pointercancel. Local board-layout persistence remains the existing endpoint.
- Scoped [hidden] styles ensure rendered row/group/empty elements actually disappear despite feature-specific display rules.
- Local helper modules contain no API requests, persistence, observers, telemetry or background tasks.

## Current-main safeguards preserved

- Board rename and column mutations retain the newer managed CAS writer, signed preflight, status-palette handling, and projection/readback logic. The older PR #251 full-app rewrites were explicitly NOT transplanted.
- Team Directory remains restricted to its pre-existing signed bootstrap eligibility. No new authority is granted and no extra restrictions introduced.
- No schema, RPC, RLS, role, data or credential changes.

## Verification

- Targeted frontend interaction, FuelTrack Activity, Team and Overtime tests.
- Full frontend regression suite, JavaScript syntax, Pages source graph, SEC14 legacy read guard, generated CSS bundle.
- Disposable, isolated Chromium benchmark: 1,200 retained rows across 100 groups; searches including broadening/clearing; original DOM nodes preserved. 1,000 queued resize widths coalesce to one application. Timings are recorded only in the local one-shot test, not persisted as telemetry.
- Signed production browser search interaction acceptance after Pages deployment is separate from the synthetic fixture; record actual result without assuming the benchmark equals live app FPS.

## Excluded

No wholesale import of PR #251’s historical column-edit lifecycle, no new performance promises such as universally sustaining 120 FPS, and no global full-DOM refactor. Reconsider column-edit performance only for a reproducible current-main latency issue with signed browser evidence.
