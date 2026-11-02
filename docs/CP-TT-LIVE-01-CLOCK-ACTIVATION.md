# CP-TT-LIVE-01 — TimeTracker Clock controlled activation

## Objective and boundary

Enable existing Clock In / Clock Out only after current, signed server authorization, validated browser GPS, offsite work-note enforcement, atomic shared-state revision + recovery copy, and immutable audit evidence all pass. The client is now *protocol-ready*, but without an exact `ACTIVE` capability response from the server it remains read-only.

Generic `put_module_state` and `delete_module_state` calls for the authoritative attendance and backup keys are explicitly denied after activation, preventing the non-audited legacy path. Other module keys retain their existing policies.

The authoritative attendance records remain under `module_state_entries` / `timetracker.attendance.v1`, with the established transaction-scoped lock and backup. No new attendance store, identity provider, or standalone login is introduced.

## Controlled production migration gate — NOT YET APPROVED / NOT INSTALLED

1. Review and separately authorize the production security/permission changes and operational clock-in/out test. Do not infer authorization from successful GitHub Pages or disposable CI.
2. Back up the current function definitions, ACLs, state contract and source revisions securely; never expose raw attendance or GPS in a report.
3. Review and apply the *existing* staged `sql/cp-tt-gps03-remaining-read-path-redaction.sql` first. Its preflight must pass on the actual database. It retires the original unredacted RPC implementation under an internal non-executable function and introduces a redacted legacy wrapper.
4. Review and apply `sql/cp-tt-live01-staged-atomic-attendance.sql` in one transaction. It stages the audit table and new board-scoped RPC, revokes authenticated access to the legacy writing endpoint, and only grants authenticated access to `timetracker_attendance_commit_v2` and `timetracker_attendance_capabilities`.
5. Validate the resulting function grants and audit RLS using a *read-only* production catalog query. Verify the old RPC is inaccessible and the new function's owner/search path and workboard/session checks have not drifted.
6. Run genuine fresh-session acceptance with separately authorized QA personnel/temporary nonproduction scopes: permitted signed employee Clock In, denied duplicate Clock In, Clock Out on same active record, denied stale session, denied cross-board/workspace, denied revoked membership, missing offsite work note, malformed/outdated GPS, and single immutable audit entry per successful operation. A build or disposable fixture alone does not satisfy this.
7. Confirm the live Pages frontend uses the same signed actor, workspace and dedicated board, and shows an enabled action only after `timetracker_attendance_capabilities` returns a complete identity-bound `ACTIVE` response. The write RPC must return only `recordId`, `revision` and sanitized metadata, never a raw attendance/GPS state.
8. Document genuine evidence, verify audit continuity, and only then classify the Clock operationally accepted.

## Fail-closed behavior

The UI never enables Clock solely from a local flag, signed-in status, inferred role or saved browser session. Missing RPC, revoked/expired session, invalid capability shape, stale actor/workspace/board and API failures leave the button disabled. Backend authorization independently rechecks the current signed session on each mutation. No UI mode can bypass server RPC policies.

Other TimeTracker flows, including Overtime, Team and privileged GPS, retain their own existing activation and authorization gates; this release does not certify their independent write workflows.

## Controlled rollback

If acceptance fails, use `sql/cp-tt-live01-rollback-revoke.sql` to revoke authenticated execution of both Clock v2 RPCs. The frontend immediately returns to read-only on capability failure. **Do not restore the legacy unguarded writer**, delete audit history, alter signed user accounts, or overwrite attendance state as rollback. Record existing attendance data and investigation evidence before any further correction.

## Disposable verification

The GitHub workflow runs the staged GPS-03 migration followed by the LIVE-01 migration and synthetic acceptance under PostgreSQL 17. It does not create or modify production attendance records. The fixture uses mocked session/board identities; operational sign-in acceptance remains separate.

## Required status tracking

- Source implementation: IMPLEMENTED (subject to completed CI)
- Disposable PostgreSQL acceptance: pending CI
- Production migration: BLOCKED until separate authorization
- Genuine signed-user clock-in/out and rollback acceptance: PENDING
- All TimeTracker workflows production-ready: NOT VERIFIED
