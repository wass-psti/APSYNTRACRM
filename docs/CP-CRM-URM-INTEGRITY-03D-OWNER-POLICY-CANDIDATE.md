# CP-CRM-URM-INTEGRITY-03D — Personal Main Workspace Owner Native Role Policy Candidate

**Date:** 2026-11-20, Asia/Manila. **Status:** Nonproduction policy candidate, NOT an activated authorization change.

## Verified root cause

A read-only production source and row-count audit established that the signed personal Main Workspace owner has an effective CRM Admin role but does not hold the platform's `admin_general_manager` profile role, has no explicit CRM override, and has **zero active scoped role assignments** for the four native applications. `is_platform_admin` recognizes the platform profile role. Actual `module_role_for` and `has_module_access` do not automatically grant those four roles to a personal workspace owner, although the CRM effective-role projection recognizes that owner as `admin`. CORE-03C correctly reports native availability but intentionally preserves the server's denial.

The affected owner is also an active Employee member of the separate Work Management workspace. Two independent genuinely signed Employee accounts were placed in that shared workspace temporarily, verified their assigned native application readbacks, and restored to their original workspaces. This **does not** establish a signed admin-to-employee role mutation test.

## Nonproduction candidate and explicit boundaries

`sql/cp-crm-urm-integrity-03d-owner-native-role-candidate.sql` is a standalone, **SECURITY INVOKER**, read-only helper under the private schema. It proposes the native role a verified personal Main Workspace owner *could* receive:

| Native application | Proposed role name |
| --- | --- |
| TimeTracker | System Admin |
| Fund Tracker | GENERAL_MANAGER |
| FuelTrack+ | Admin |
| TradeLink | General Manager |

The helper requires the existing personal-workspace mapping **and** owner relation, active profile and membership, the same currently selected workspace, effective CRM Admin, and no explicit workspace CRM ceiling. It returns NULL for other applications, other workspaces, nonowners, inactive profiles/members, and explicit overrides. No `GRANT EXECUTE` or `SECURITY DEFINER` is introduced. No existing function invokes this helper. No production permission records or native authorizers are changed.

`sql/tests/cp-crm-urm-integrity-03d-owner-native-policy.sql` uses only synthetic users and a disposable PostgreSQL 17 fixture, with a rollback; it verifies both the four positive proposal values and all specified negative cases, and separately verifies that the actual `has_module_access` and `module_role_for` remain unchanged. The dedicated GitHub Actions workflow has no access to production database credentials.

**This candidate is not approval to activate the proposed roles in production.** Integration into native authorization is a material permissions-policy change and requires a separately authorized migration and signed runtime acceptance. The helper by itself does not prove those proposed role labels suffice for every native application's operation-level authorization or Board context.

## Remaining acceptance

- Actual owner-native module authority remains **PENDING** and the current backend denials remain active.
- Genuine same-workspace signed Administrator→Employee role mutations, independent target readback, allow/deny workflow actions, post-revocation refresh/re-login and cross-user eventual synchronization remain **BLOCKED** without a genuinely signed administrator in that shared nonproduction workspace.
- No new Supabase project, workspace membership changes, production records, role assignments, grants, RLS policies or UI restrictions.

Next scoped milestone if required: **CP-CRM-URM-INTEGRITY-03E — Controlled Owner Native Role Authority Decision, Disposable Backend Integration, and Genuine Administrator–Employee Signed Capability Closeout**. This must not auto-activate broad privileges merely to make the acceptance suite pass.
