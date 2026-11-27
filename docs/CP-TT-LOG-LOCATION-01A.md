# CP-TT-LOG-LOCATION-01A — HR and System Admin Recorded GPS Visibility

## Objective

Enable assigned TimeTracker HR and non-bootstrap System Admin users to read precise, previously recorded GPS evidence through the existing TimeTracker Log and GPS & Location Hub.

## Implementation

- Extend the existing signed `timetracker_gps_snapshot` role allowlist with the exact TimeTracker module roles `HR` and `System Admin`.
- Preserve existing Supervisor access and the independent bootstrap-administrator path.
- Extend the native client’s initial and post-read role checks.
- Extend the Log and GPS Hub UI eligibility, map rendering, and existing map controls for the same role set.
- Keep the existing signed snapshot response, 31-day date-window limit, active-workspace employee filter, coordinate validation, 500-event bound, and sanitized event fields unchanged.
- Keep the broad attendance-state read redaction unchanged; precise coordinates continue to come only from the dedicated signed GPS snapshot.
- Preserve the existing database function owner and execute grants.

## Explicitly unchanged

- Employee, Finance, IT Administrator, OJT, and all other non-allowlisted TimeTracker roles.
- Existing Supervisor and bootstrap administrator capabilities.
- GPS capture, browser geolocation, clock-in/out, attendance records, overtime, and record-management workflows.
- No live tracking, background location collection, new tables, new database privileges, or role assignments.

## Acceptance criteria

1. Assigned HR users can retrieve and view precise recorded GPS evidence in Log and GPS & Location Hub.
2. Non-bootstrap System Admin users can retrieve and view the same recorded evidence.
3. Assigned Supervisors retain access.
4. Bootstrap administrators retain access independent of module role.
5. Employee, Finance, IT Administrator, and OJT remain denied by the dedicated GPS snapshot RPC.
6. The client rejects a role revoked while a GPS request is in flight.
7. The server continues to enforce signed session, current workspace, canonical TimeTracker board, active employee filter, date window, valid coordinates, and bounded output.
8. The GPS Hub and Log use the same existing snapshot contract; no new collection or live tracking is introduced.
9. Existing GPS-redacted attendance reads and unrelated application behavior remain unchanged.
10. Frontend regression/build checks and disposable PostgreSQL 17 role acceptance pass.

## Production migration

`20261127170000_cp_tt_log_location_01a_hr_admin_gps_read.sql` replaces only the existing `timetracker_gps_snapshot(uuid,date,date,uuid)` function body. It preserves the current function signature, owner, and authenticated-only execution grant; no tables or stored attendance data are modified.
