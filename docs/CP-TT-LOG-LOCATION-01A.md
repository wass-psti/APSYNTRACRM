# CP-TT-LOG-LOCATION-01A — Attendance Log GPS role alignment

## Objective
Restore GPS evidence retrieval in TimeTracker → Log → Signed Attendance Record for existing TimeTracker System Admin and HR users without changing the separate GPS Hub eligibility.

## Implementation
- Adds `timetracker_log_gps_snapshot` for signed Attendance Log evidence reads.
- Keeps `timetracker_gps_snapshot` on its existing Bootstrap Administrator and Supervisor role rules.
- Shares one private, sanitized GPS reader between the two public RPC wrappers.
- Keeps general `list_module_state` GPS redaction unchanged.
- Preserves board/workspace scope, active-member employee filtering, Manila-local date bounds, coordinate validation, 500-event cap, and signed actor/workspace/board identity.
- Adds a Log-specific client method and role-aware Log map presentation.
- Tracks query ranges by employee filter and truncation so a truncated all-user snapshot cannot hide a later complete single-employee read.
- Displays clock-in and clock-out GPS states separately. Missing GPS remains missing; no coordinates are synthesized.

## Non-goals
No GPS collection changes, attendance writes/backfills, clock-out policy changes, GPS Hub role expansion, broad state-redaction changes, ML training, fine-tuning, gradient descent, backpropagation, or model weight updates.

## Acceptance
System Admin and HR Log reads; unchanged Bootstrap/Supervisor behavior; ordinary Employee denial; unchanged GPS Hub access; active-workspace employee filter; independent clock-in/clock-out states; cross-midnight date coverage; map-independent coordinate display; synthetic PostgreSQL and focused frontend tests.
