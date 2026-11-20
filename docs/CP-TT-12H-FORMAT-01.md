# CP-TT-12H-FORMAT-01 — Standardized TimeTracker clock display

## Scope
TimeTracker UI clock and timestamp presentation uses frontend/time-tracker-time-format.js. Local Philippine time (Asia/Manila) is rendered as hh:mm AM/PM or hh:mm:ss AM/PM; date-time labels include the date. Covered views: Clock, Overview, Main Group Attendance Board projection, Log, Reports, Calendar, My Hours, GPS/Map, Monitor, and automatic Clock-Out.

Overtime request details and visible start/end fields use 12-hour notation. Form submission converts visible values to the existing HH:mm server contract. Administrative attendance correction fields use YYYY-MM-DD hh:mm AM/PM; parsing converts to the existing UTC ISO write contract, retaining the original timestamp precision when unrelated fields change.

Attendance exports (My Attendance, Overview, Log, and Reports export reusing Log) format timestamps as Philippine date-times; CSV escaping and authorized source semantics are unchanged.

## Invariants
- No changes to PostgreSQL timestamps, server policies, timezone arithmetic, session timers, approved overtime calculations, access control, or database schema.
- Date-only fields remain dates. Machine-readable datetime attributes and stored RPC fields remain machine-readable.
- Durations (elapsed hours/minutes, countdown, credited hours) retain duration notation, without AM/PM.
- Malformed clock times are rejected instead of guessing or silently changing an instant.

## Acceptance
- Tests include midnight, noon, 12-hour conversion, administrator precision preservation, OT boundary, and CSV output.
- Browser locale no longer controls visible overtime or admin-correction time presentation.
- Run node --test frontend/tests/time-tracker*.test.mjs and npm run build.
- Any unrelated failures from the full repository suite or migration manifest should be tracked separately.
