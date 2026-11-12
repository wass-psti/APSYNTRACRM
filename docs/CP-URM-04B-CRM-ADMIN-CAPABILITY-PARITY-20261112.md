# CP-URM-04B — CRM Administrator Capability Parity

**Date:** 2026-11-12  
**Status:** Implementation staged; PostgreSQL acceptance pending  
**Scope:** CRM role administration, central application-role assignment entry points, and bootstrap identity separation.

## Authorization contract

| Concern | Required authority |
|---|---|
| CRM Role Configuration | Effective CRM Admin in the signed active workspace |
| User Role Management | Effective CRM Admin in the signed active workspace |
| Central application/module role assignment | Effective CRM Admin in the signed active workspace |
| Bootstrap identity classification | The two fixed accounts in `apsyntra_role_bootstrap_identities` only |
| Bootstrap-protected account targets | The exact fixed bootstrap identity set, not every `admin_general_manager` account |
| TimeTracker Team Directory | Existing bootstrap-only boundary, via a dedicated narrow snapshot |
| FRT financial workflow operations | Existing FRT role predicate; unchanged |
| Tool Traceability workflow administration | Existing module-admin predicate remains valid; CRM Admin is additionally accepted only for its central role-assignment operation |
| Global `is_platform_admin` | Unchanged |

## Implementation

- Add `apsyntra_role_is_admin()`, which derives authority from the server-side effective CRM role, active profile, active workspace membership, and current workspace.
- Change `apsyntra_role_require_scope(uuid)` to authorize CRM Admin in the signed current workspace.
- Add an internal bootstrap-only scope guard for the TimeTracker Team Directory.
- Add `timetracker_team_directory_snapshot(uuid)`; it returns only directory users and TimeTracker assignments, not the full CRM role catalog, proposals, boards, or audit history.
- Add `adminVerified` to CRM administration snapshots and keep `bootstrapVerified` as the actual bootstrap identity result.
- Remove inherited `is_platform_admin(target)` locks from central CRM role-management target checks. Self-target and exact bootstrap target protections remain.
- Reconcile the internal application-role dispatcher and FRT/Tool Traceability role-assignment entry points so CRM Admin can use central role-management operations. Existing FRT business-role checks and Tool Traceability module-admin access remain intact.

## Explicit non-goals

- No change to `is_platform_admin` or global platform roles.
- No profile/Auth identity, workspace membership, role assignment, board membership, or application data mutation.
- No broad bypass of application-specific business permissions.
- No expansion of TimeTracker GPS, monitor, attendance, or diagnostics access.
- No change to FRT approvals, releases, finance workflows, or Tool Traceability operational permissions.

## Controlled activation sequence

1. Validate the migration against the disposable PostgreSQL 17 fixture and the full frontend regression suite.
2. Apply the database migration first, preserving existing bootstrap access.
3. Deploy the frontend bundle that calls the new CRM Admin snapshot contract.
4. Verify signed CRM Admin, bootstrap, employee, revoked-role, inactive-member, and foreign-workspace behavior.
5. Check Supabase security/performance advisors and inspect actual function grants.
6. If runtime acceptance fails, apply `sql/cp-urm04b-rollback.sql` and restore the matching frontend release.

## Evidence

- Frontend regression: 1,986 tests passed in the latest completed run.
- PostgreSQL 17 migration acceptance: pending latest run.
- Production migration: not yet applied.
- Frontend production deployment: not yet performed.
- Signed production runtime acceptance: pending.
