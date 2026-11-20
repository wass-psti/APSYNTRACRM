# CP-TB-INDEPENDENT-NATIVE-02C — Controlled V2 Activation and Server-Authoritative Timer Preflight

Date: November 20, 2026. Repository: wass-psti/APSYNTRACRM.
Target existing Supabase project: jtlusodorfnyzgyuewkz (PostgreSQL 17.6).

## Scope and independence

APSYNTRA CRM TalkBox remains native. monday.com is not used for application authentication, data, hosting, RPCs, storage or synchronization. Existing workspace access, roles, RLS, privileges, historical records and application behavior remain unchanged in the production project during this milestone.

Native V2 threaded replies and attachment cleanup were verified against isolated PostgreSQL 17 in CP-TB-INDEPENDENT-NATIVE-02B. This iteration adds a second non-deployed SQL candidate for server-clock start and stop of persisted native timers, along with frontend support and compatibility tests.

## Server-clock design

The 02C server timer candidate implements two RPCs:

- toolbox_issues_timer_start(workspace_id, issue_id, expected_version) obtains the row lock, validates the existing workspace access and exact optimistic version, records authoritative PostgreSQL clock_timestamp() and time-source metadata in the existing time_tracking JSON, creates an activity event, and returns the existing issue projection.
- toolbox_issues_timer_stop(workspace_id, issue_id, expected_version) locks the issue row, rejects absent/stale or client-authored sessions, calculates elapsed whole seconds from the original PostgreSQL start timestamp to PostgreSQL stop timestamp, adds them to existing seconds without double counting, clears the active marker, stores the server stop time and activity event, and returns the issue projection.

The native V2 capability RPC is extended with serverTimer:true only when the candidate is installed. The browser calls these RPCs only when the signed capability receipt confirms support. It independently reads back the updated issue and matches the server timestamp/total. Older backends continue using their existing client-based timer path; legacy running sessions are not silently rewritten.

Two independently signed simulated users, conflicting versions, duplicate starts, unauthorized workspace access, anonymous denial, and refresh/readback are exercised in isolated PostgreSQL. This is not proof that production accepts actual multi-account mutations.

## Remaining operational gates

The 02C SQL depends on the 02B candidate. Neither file is in the deployable supabase/migrations directory; neither has been executed in production. A production activation would be a material operational schema change, requiring separate explicit approval, backup/rollback review, migration-history discipline, and controlled deployment of both candidates.

A controlled activation must verify the exact current production schema/functions, prepare a reversible rollback preserving all existing user data, assess provider-specific storage privileges and lock duration, and use the existing Supabase project only. No new RLS/RBAC policies or account permissions are introduced by these candidate functions.

Production acceptance is PENDING genuine two-account signed testing with disposable records in a controlled workspace. Required readback: issue creation, parent/child replies with author/timestamp, upload/downloaded-byte integrity, private deletion and interrupted-cleanup recovery, server timer start/stop across refresh/reopen and independent sessions, cross-workspace denial and audit persistence. Existing live records must not be used for destructive acceptance. The existing generic issue-update RPC still accepts manual timeTracking corrections; this is distinct from authoritative timer-session elapsed calculations.

## Acceptance status

- Server timer SQL in isolated PostgreSQL 17: VERIFIED if local/CI tests pass.
- Native frontend server-capability integration and independent readback: VERIFIED by tests if green.
- Pull request merge and Pages deployment: report actual evidence.
- Production V2 schema activation: PENDING separate approval.
- Genuine two-account signed production acceptance: PENDING.
- Final native functional parity: PENDING.

Next milestone: CP-TB-INDEPENDENT-NATIVE-02D — Approved Transactional V2 Production Activation, Genuine Two-Account Native Runtime Acceptance, and Final Functional Parity.
