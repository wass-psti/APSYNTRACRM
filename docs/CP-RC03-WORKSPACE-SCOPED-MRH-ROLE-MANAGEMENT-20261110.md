# CP-RC03 — Workspace-scoped Material Request Hub role management

Date: 2026-11-10
Repository: wass-psti/APSYNTRACRM
Branch: fix/cp-rc03-mrh-workspace-scoped-roles

## Root cause

The selected account senaganlexx06@gmail.com is active in both Work Management and Main Workspace. The central role-management RPC rejected all module-role changes for a multi-workspace target because module_role_assignments has the global (user_id,module_id) key. This is a deliberate cross-workspace safety boundary.

Material Request Hub already has a separate authoritative material_request_hub_memberships table keyed by (workspace_id,user_id). Its domain role assignment was nevertheless routed through the global setter and then rejected by the central multi-workspace guard. The central role-management path also delegated to the MRH domain setter, which independently required the actor to hold the MRH ADMIN role even though central role management is restricted to the two bootstrap administrators.

## Implementation

- The CP-RC03 migration routes only material-request-hub changes to its existing workspace-scoped membership table.
- It does not mirror MRH roles into module_role_assignments.
- It retains bootstrap-only apsyntra_role_require_scope, target active membership, self-target denial, protected-admin denial, role allowlists, advisory transaction lock, optimistic revision checks, and the existing immutable role-change audit receipt.
- The same multi-workspace user remains blocked from changes to all other legacy globally keyed application roles.
- Workspace-scoped board access remains unchanged.
- The snapshot now reports each account's active workspace count and combines existing global application assignments with MRH's workspace-local assignment.
- The UI disables legacy global application-role actions for multi-workspace users, permits MRH only when the new server contract is verified, and explains the restriction rather than showing a generic permissions toast.
- The application event handler repeats the workspace-scope checks to protect against stale UI state; the database remains authoritative.

## Verification

- Focused role-management UI tests: PASS (16/16).
- PostgreSQL 17 isolated disposable acceptance: PASS, including CP-RC02 rollback restoration and a migration guard that refuses legacy global MRH role rows.
- Disposable cases cover a target in two workspaces, assignment/update/revoke in only the selected workspace, absence of global MRH mirror, stale revision denial, global-role multi-workspace denial, workspace-local board assignment, self/protected/foreign/non-bootstrap denials, snapshot contract, and audit counts.
- Production Supabase was queried read-only to verify the account's two active workspace memberships and absence of an existing global MRH role row.
- No production role, membership, permission, grant, RLS policy, or function was changed. The new migration has not been applied to production. The frontend has not been deployed.

## Release sequence

Apply the additive migration to the existing Supabase project only after the owner authorizes the production access-policy update. Then run signed bootstrap-admin acceptance in Work Management, verify the MRH membership appears only in that workspace and that Main Workspace remains unchanged, and deploy the frontend after the migration is confirmed.
