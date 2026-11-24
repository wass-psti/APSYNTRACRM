# CP-TT-SAFARI-GPS-01 — Diagnostic Instrumentation and Compatibility Baseline

## Status

**IMPLEMENTED — automated verification passed; real Safari device reproduction remains pending.** This phase adds diagnostic evidence only. It does not change the GPS timeout budget, location freshness rules, attendance RPC, database schema, permission policy, or attendance-write behavior.

## Purpose

Capture the actual stage at which a TimeTracker location attempt fails so the next remediation is based on observed Safari behavior rather than speculative timeout or permission changes.

## Diagnostic coverage

Each GPS capture records:

- Browser family and version when exposed by the user agent.
- Operating-system family and device class when exposed.
- Secure-context status and Geolocation API availability.
- Permissions API availability and best-effort geolocation permission state.
- Document visibility, focus and online state at each recorded event.
- Visibility, focus, page lifecycle and network transitions while acquisition is pending.
- Attempt number, high-accuracy setting, timeout, cache allowance and elapsed duration.
- Browser geolocation error category: permission denied, position unavailable or timeout.
- Invalid position category without recording the coordinate values.
- Position age and reported accuracy in metres.
- Clock-In/Clock-Out submitter availability, GPS success, commit start/result and signed readback result.
- HTTP status or stable error code when the attendance commit fails.

The Permissions API query is observational only. It is never a prerequisite for calling `getCurrentPosition()`, and a query failure does not interrupt GPS acquisition.

## Privacy and runtime behavior

- Diagnostics are held in a bounded in-memory buffer (maximum 60 events).
- The report is explicitly user-exported using **Copy GPS diagnostics** on the TimeTracker Clock screen.
- Clipboard failure falls back to a user-visible copy prompt.
- The buffer is cleared on sign-out and naturally resets on page reload.
- No latitude, longitude, work plan, email, user ID, workspace ID, board ID, access token or raw user-agent string is included.
- No diagnostic network request, analytics service, local storage or session storage is used.
- The report includes explicit privacy flags: coordinates excluded, no persistent storage and no remote transmission.

## Files

- `frontend/time-tracker-gps-diagnostics.js` — bounded diagnostic collector, environment classifier, permission/lifecycle observation and report export.
- `frontend/time-tracker-native.js` — records GPS acquisition attempts, outcomes, accuracy and position age without altering the returned GPS payload.
- `frontend/app.js` — records manual attendance submit, GPS-to-commit transition, commit result, readback result and missing `SubmitEvent.submitter`.
- `frontend/apps/TimeTracker/time-tracker-auto-clockout-execution.js` — records foreground automatic clock-out GPS and commit stages.
- `frontend/time-tracker-ui.js` — exposes the local diagnostic export control after diagnostic events exist.
- `frontend/time-tracker-clock-command.css` and generated `frontend/apsyntra-styles.bundle.css` — minimal control styling.
- `frontend/tests/time-tracker-gps-diagnostics.test.mjs` — regression coverage.

## How to collect a Safari failure

1. Open APSYNTRA CRM in Safari and enter TimeTracker → Clock.
2. Reproduce the failed Clock-In attempt once.
3. Do not reload the page before exporting diagnostics.
4. Select **Copy GPS diagnostics** below the Clock controls.
5. Paste the report into the engineering issue or diagnostic conversation.

The report identifies whether the attempt stopped before GPS, during a specific geolocation attempt, after a valid fix, during attendance commit, or during signed readback.

## Known limitations

- In-memory diagnostics are lost on full page reload or tab closure. Export before reloading.
- Safari/iOS may not expose a reliable Permissions API state. In that case, the report records that permission inspection was unsupported or failed and preserves the actual geolocation callback result.
- Automated tests validate the instrumentation contract; they do not replace a real iOS Safari device test.
- This phase does not change the current 10-second high-accuracy and 12-second balanced fallback timeouts.

## Acceptance criteria

- [x] Record browser and OS family/version when exposed.
- [x] Record secure context, geolocation availability, permission API availability and permission state when supported.
- [x] Record foreground/background, focus and network transitions during acquisition.
- [x] Record both acquisition attempts, requested options, elapsed time, error category, accuracy and position age.
- [x] Record submitter availability and distinguish GPS, commit and readback stages.
- [x] Provide a user-initiated local report export.
- [x] Exclude precise coordinates and personal/workspace identifiers from the report.
- [x] Do not persist or transmit diagnostic records.
- [x] Preserve existing GPS acquisition options, attendance writes, automatic clock-out and reconciliation.
- [x] Introduce no training, model optimization or gradient-descent execution paths.

Real Safari device reproduction and deployed-browser acceptance remain separate validation steps.
