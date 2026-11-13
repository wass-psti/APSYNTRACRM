# CP-URM-APP-TOOLBOX-01 — Source Membership Role Assignment

## Root cause

The CRM User Role Management client explicitly rejected new Toolbox Issues assignments. The central apsyntra_role_manage_user_access RPC also treated Toolbox as a global module-role assignment and rejected enabling it until a source membership existed. Its old revoke shim could disable a source row, but the UI snapshot still read the global module_role_assignments shadow row. This prevented the CRM interface from creating or consistently retrieving the actual Toolbox membership.

The deployed source of truth is public.toolbox_issues_memberships, keyed by (workspace_id,user_id) and constrained to admin, supervisor, employee, and viewer.

## Implementation

- Route Toolbox assignment, modification, revocation, and re-enablement through the existing central apsyntra_role_manage_user_access RPC.
- Retain its signed CRM Admin current-workspace guard, active target membership check, exact bootstrap protection, self-assignment denial, advisory lock, optimistic revision check, and central immutable audit.
- Write only the existing toolbox_issues_memberships row; do not create or update a global module_role_assignments shadow record.
- Record source membership changes in the immutable toolbox_issues_activity stream.
- Include workspace-scoped Toolbox memberships in the CRM role-management snapshot, including disabled rows so administrators can re-enable them.
- Exclude stale global Toolbox shadow rows from the UI snapshot.
- Permit multi-workspace targets for Toolbox because the source record is scoped by workspace. Keep global legacy application roles unchanged; Material Request Hub remains separately workspace-scoped.
- Enable the Assign/Change action for unassigned and disabled Toolbox memberships. Keep Revoke visible only for active memberships.
- Use the existing Toolbox role vocabulary; do not map legacy team_leader, secretary, or standard labels into the current membership constraint.

## Boundaries

No new membership tables, no production membership backfill, no global role migration, no new platform authority, and no changes to unrelated application role handlers. The legacy module_role_assignments Toolbox row is left untouched and is no longer treated as the authoritative Toolbox role by the CRM snapshot.

## Verification

The disposable PostgreSQL 17 acceptance fixture covers assignment, modification, revocation, re-enablement, optimistic concurrency, workspace isolation, multi-workspace source membership, snapshot reconciliation, central audit, source activity, self-target denial, bootstrap-target denial, and role vocabulary validation.
