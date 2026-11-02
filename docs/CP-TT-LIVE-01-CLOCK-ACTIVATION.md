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

## Production execution handoff — 2026-11-02

**Authorization:** The project owner explicitly authorized the controlled installation of GPS-03 and LIVE-01 and subsequent genuine signed-user acceptance. The automated production migration invocation was **BLOCKED BY EXECUTION SAFETY CONTROLS**; this is not a SQL failure, and must not be circumvented with an alternate tool or unreviewed ad-hoc command. A read-only post-block inspection confirmed both migrations uninstalled, audit table absent and the old authenticated writer still executable. No production data or permissions were altered.

**Operator sequence, using the project's authorized database change-management path:**

1. Confirm the connected project reference is `jtlusodorfnyzgyuewkz` and the database is expected production. Capture the verified function definitions, grants, existing object signatures and migration history in secure evidence (never GitHub or chat for raw employee records/GPS).
2. Execute `sql/cp-tt-gps03-remaining-read-path-redaction.sql` in its own complete transaction, using a trusted authorized operator/CI connection. Stop on any error; transaction rollback must be confirmed before retry. This contains a preflight to prevent running twice.
3. Verify GPS-03 helper installation, signed attendance read redaction and internal raw RPC revocation. Ensure no anonymous or nonprivileged route exposes coordinates. Do not enable clock writes if this fails.
4. Execute `sql/cp-tt-live01-staged-atomic-attendance.sql` in its own complete transaction. It creates the audit table, signed Clock capability and write RPC, blocks generic attendance state write/delete, and revokes the legacy attendance writer.
5. Run the read-only inventory in `sql/tests/cp-tt-live01-production-readonly-preflight.sql` and independently verify `authenticated` can execute only the new scoped Clock RPC, while `anon` and the legacy endpoint cannot. Verify audit RLS/forced RLS, trigger, and generic mutation denials; never use the privileged migration connection to pretend to be a genuine employee.
6. Verify the GitHub Pages asset revision is `3e7301e0476e290eb20cbd7077028a7a6c3a1361` or a later tested successor. Perform fresh genuine owner-approved Clock In/Out on nonproduction or explicitly authorized QA identities only; validate work-note and denied paths, duplicate sessions, stale/revoked sessions, cross-workspace denial, and a matching immutable audit entry for each successful write. Do not create test attendance for a real employee without that actor's operational authorization.
7. If operational acceptance fails, execute `sql/cp-tt-live01-rollback-revoke.sql` through the same trusted change path to disable the new public RPCs. **Never restore the legacy unaudited writer or purge attendance/audit records.** Record incident evidence and verify the UI returns to read-only.

**Current result:** PRE-FLIGHT VERIFIED; SOURCE/CI VERIFIED (338/338 frontend, disposable PostgreSQL); PRODUCTION ACTIVATION BLOCKED; GENUINE SIGNED-USERS PENDING. This handoff does not represent a successful production migration or a verified live Clock workflow.

