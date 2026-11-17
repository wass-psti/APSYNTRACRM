# CP-TT-FLOW-01C — Signed Attendance and OT Runtime Acceptance

Repository: wass-psti/APSYNTRACRM. Existing Supabase project: jtlusodorfnyzgyuewkz. Base: CP-TT-FLOW-01B, PR #516, merge commit 6f73890d.

## Live evidence and acceptance boundary
Read-only production SQL inspection showed 0 OT requests, 0 OT audit events, and 1 attendance-board projection. A newly opened TimeTracker tab in the connected Chromium profile displayed the workspace sign-in screen. No genuine signed production Clock In/Out, OT write, reviewer decision, audit mutation, or signed readback was executed. Existing historical attendance records, database grants, roles, and credentials were not changed.

## Browser acceptance additions
The isolated Playwright fixture now tests two browser tabs sharing the same origin, pending Clock In marker storage event, reload recovery, exact user/workspace/board scoping, synthetic signed snapshot resolution, marker cleanup, and exclusion of GPS, work notes and credentials. It also tests signed OT submit controls, disabled controls without the OT contract, and bootstrap reviewer controls versus ordinary users. These are simulated client contract checks, NOT real signed production operations.

## Accessibility and UI fixes
The expanded WCAG 2.2 AA checks identified low contrast in the OT submission modal and request-review table/pending badge. The scoped component styles and generated CSS bundle were corrected and the tests pass.

## Authoritative duration rules preserved
The existing PostgreSQL 12:00–13:00 Asia/Manila lunch overlap deduction remains authoritative. The reference's full-hour crossing-13:00 deduction, 570-minute cap and additional approved OT credited hours were not activated; those require a separate business-policy decision. Reports continue to compare signed OT overlap without changing creditedMs.

## Operational acceptance

| Gate | Status |
| --- | --- |
| Production RPC and record-count inspection | VERIFIED |
| Two-tab and reload fixture recovery | VERIFIED |
| OT signed-contract browser fixture | VERIFIED |
| OT modal and review accessibility | VERIFIED |
| Full regression, CI and deployment | Verify at PR and merge |
| Genuine signed Clock In/Out and readback | BLOCKED: signed browser session unavailable |
| Genuine signed OT submit, reviewer decision and audit | BLOCKED: signed session and designated disposable records unavailable |
| Payroll rule replacement | NOT APPLICABLE to this milestone |

## Reproducible remaining signed-runtime sequence
With a genuine signed account and expressly designated disposable attendance and OT records: record baseline IDs/revision; Clock In once with GPS; verify signed row, audit and projection; reload and check cross-tab recovery without replaying a write; Clock Out and inspect separate GPS and duration; submit test OT; have a distinct existing authorized reviewer approve or reject exactly once; read back records/audit and Reports; confirm ordinary-user experience; clean up only expressly designated disposable records through existing audit-preserving operations. Never use historical production records for destructive tests and never bypass existing permissions.

Next, only if blocked: CP-TT-FLOW-01D — Genuine Signed Attendance and OT Acceptance, Persistent Projection Readback, and Final Production Closeout.
