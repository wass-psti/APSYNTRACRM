# CP-FRT-SEC06 — APSYNTRA CRM Platform-Level Role Governance

**Date:** October 30, 2026  
**Branch:** `feature/cp-frt-sec06-crm-platform-rbac`  
**Primary architecture:** 12 standalone application domains → 12 platform boards → unified SDK → central auth/backend → one PostgreSQL/storage authority.  
**Release gate:** No `main` merge or production permission/schema changes until integration acceptance.

## Implemented authorization model

| Level | Authoritative storage | Administrator controls |
| --- | --- | --- |
| WatchdogWorkspace identity / baseline | `profiles.platform_role`, Supabase Auth, `workspace_members` | Existing bootstrap governance; **unchanged** |
| APSYNTRA CRM platform override | New workspace-keyed `apsyntra_crm_platform_roles` | Bootstrap-only set/change/revert; audit and optimistic CAS |
| Application-specific roles | Existing `module_role_assignments` + source domain guards | Existing bootstrap-only assignment RPC |
| Individual board roles | Existing `work_board_members` + `work_board_access` | Existing bootstrap-only board assignment RPC |

The new CRM role assignments use the **existing identity**, existing active workspace, existing `apsyntra_role_require_scope` bootstrap check, existing authoritative role change request + immutable audit, and unchanged module/board membership stores. No separate sign-in, JWT, authentication provider, administrator impersonation or redundant entitlement cache is introduced.

### APSYNTRA CRM tiers

- **Admin:** highest CRM tier, but does not make an account a WatchdogWorkspace bootstrap administrator; it cannot independently administer roles and does not bypass application memberships.
- **Supervisor:** supervisory application ceiling, board view/edit but not manage when explicitly assigned.
- **Employee:** normal operational application ceiling, board view/edit but not manage when explicitly assigned.
- **Viewer:** read-only where an application defines an explicit reader role; no module operational write role, no board edit/manage.

An explicit CRM platform role is an **upper bound**, not an affirmative module or board permission grant. For each of the 12 modules, the role resolver compares its domain-specific role rank against the explicit CRM rank. A stronger application assignment returns no effective module role. The backend's `has_module_access` also denies such access. Board `work_board_access` checks the explicit cap **before** any platform-admin or board-member allow branch.

**Critical FRT domain integration:** The true `private.frt_current_role` resolver now applies the CRM role cap before `private.frt_has_role` / `private.frt_has_membership`. Existing finance workflows delegate through these functions, so the cap must apply to FRT finance requests, approvals, liquidations, listings and attachments without duplicating each handler. Original FRT role vocabulary, request operations and audit remain untouched.

### Protected governance

- Only the existing centralized bootstrap administrators may change CRM roles.
- The mutation rejects actor self-modification, bootstrap identities, WatchdogWorkspace `admin_general_manager` targets, inactive/out-of-workspace users, invalid roles and stale expected revisions (HTTP conflict).
- A role revert removes **only** the explicit CRM override and restores inherited behavior. It never deletes accounts, original host roles, module assignments, board memberships, finance records or audit events.
- Every successful role change and revert writes through the original append-only role-change request/audit transaction.
- SQL table direct access from `PUBLIC`, `anon` and `authenticated` is revoked; row-level security is enabled and forced. The public signed RPC is role-guarded server-side with the current `auth.uid()`.
- Auth JWT / user_metadata is never treated as a role source. Effective access is read from the database each signed operation.

### Compatibility analysis — important

Independent current database read-only inventory found:

- `profiles.platform_role`: 3 WatchdogWorkspace `admin_general_manager`, 2 `hr`, 35 `employee`.
- Existing board ownership: **59 employee board-owner memberships**, plus 15 administrator owner memberships. Blanket default CRM caps would revoke these users' existing manage privileges and break operational workflows.
- Therefore users **without an explicitly assigned CRM role override retain their previous WatchdogWorkspace/module/board behavior**. Once a bootstrap administrator explicitly assigns a CRM override, the new hierarchy is enforced for that user in the active workspace. This migration preserves existing legitimate access and data until a controlled owner/permission reconciliation can safely move these users to explicit tiers.
- Existing `hr` remains a WatchdogWorkspace role; it defaults to CRM Supervisor for presentation and does not overwrite existing TimeTracker HR role.
- All current module assignments are only in `time-tracker`, `fueltrack-plus`, `tradelink` and limited `toolbox-issues`; default employee and HR assignments remain compatible when no override is applied.

## Deployment order (not executed)

1. Independently validate new SQL against a disposable/nonproduction database with the original current schema, full RPC signatures, and RLS.
2. Stage `sql/cp-frt-sec06-crm-platform-role-cap.sql` first, then `sql/cp-frt-sec06-domain-role-ceiling.sql` in the approved environment.
3. Confirm existing signed bootstrap and nonbootstrap sessions still pass the SEC03 7/7 and 5/5 read-only tests, and that the FRT domain is not blocked for unchanged roles.
4. Deploy the updated frontend only after backend RPCs are installed to avoid missing-function errors in the central administrator page.
5. Under explicitly approved nonproduction accounts, test CRM Admin/Supervisor/Employee/Viewer assignments and revert with fresh signed sessions; verify board view/edit/manage matrices, module rank ceilings, FRT approval vs requestor constraints, protected administrators, stale revisions, workspace isolation and audit pairs.
6. Complete canonical `http://127.0.0.1:5173/#/` host and `/api/v1/boards` acceptance independently; GitHub Pages does not establish the 12-board native runtime.

## Status and evidence

| Gate | State |
|---|---|
| Existing SEC03 bootstrap read-only signed result (7/7) | VERIFIED from user-submitted browser result |
| Existing SEC03 nonbootstrap read-only signed result (5/5) | VERIFIED from user-submitted browser result |
| Existing backend source, constraints and role inventories | VERIFIED via connected PostgreSQL read-only queries |
| New CRM platform-role SQL/backend role ceilings | IMPLEMENTED-UNVERIFIED until disposable DB migration and real signed tests |
| New CRM frontend User Role Management + Role Configuration | IMPLEMENTED-UNVERIFIED until CI and browser exercise |
| Current production role modifications | NOT APPLICABLE — deliberately none |
| Work Management canonical local native host | BLOCKED — cannot access user's local 5173 process |
| Cross-workspace signed denial | BLOCKED — one workspace currently has active members |
| Full 12-domain behavior / FRT finance live operations | PENDING |
| `main` merge / deploy | NOT AUTHORIZED |

**Security limitation:** Not all non-FRT application-specific workflow endpoints have yet been independently shown to use `module_role_for` or `has_module_access`. The central module resolver is capped, but source handlers that bypass it require separate integration, inspection and proof before claiming full platform-wide enforcement. Also, the 59 legacy nonadministrator owner memberships require controlled reconciliation, not bulk revocation.

This is a security-sensitive schema/authorization change, so the live PostgreSQL project was **inspected read-only**, not migrated during this checkpoint. A passing frontend unit test must not be reported as a genuine role-assignment/session integration test. Do not merge or deploy on assumptions.
