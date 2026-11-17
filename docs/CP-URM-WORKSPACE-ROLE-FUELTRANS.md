# CP-URM-WORKSPACE-ROLE — FuelTrans Workspace Role Integration

## Root causes
1. CRM platform tier assignments are stored by workspace and user, while the
   inherited WatchdogWorkspace identity is stored on the profile. The UI used
   to put inherited identity first instead of the actual CRM workspace role.
2. Legacy module_role_assignments is global per user/module, but FuelTrans
   uses fueltrans_memberships(workspace_id,user_id) as its real authority.
   Disabling global edits for accounts in multiple workspaces prevented leaks,
   but did not provide a source-scoped FuelTrans assignment action.
3. The real FuelTrans role values are lowercase domain roles rather than
   the central Admin/User/Viewer placeholders.

## Implemented
- Display Assigned workspace role first from the signed CRM platform snapshot;
  show inherited account identity as secondary, non-assignable information.
- Read authoritative FuelTrans membership only inside User Role Management when
  the optional workspace-scoped backend contract is available.
- Use the correct FuelTrans roles for individual and batch assignment, change,
  revocation, and optimistic revision checks, with authoritative refresh.
- Keep existing client-coded FuelTrans memberships in the domain-specific editor,
  never overwrite client codes. No writes to global module_role_assignments.
- If the scoped backend is missing or invalid, disable the FuelTrans action with
  a specific explanation rather than allowing cross-workspace side effects.
- Retain existing security and feature behavior for other applications.

## Backend candidate — not active
The file sql/cp-urm-fueltrans-workspace-role-candidate.sql adds two independent
workspace-scoped RPCs for snapshot and mutation using existing FuelTrans source
memberships. Server-side identity, workspace membership, protected-target,
optimistic-lock, and audit checks reuse the current central CRM access contract.

This SQL is deliberately NOT a production migration. Production role/permission
activation requires separate approval; no production role records or grants
were changed by this implementation.

## Acceptance and remaining gate
- Unit tests cover source readback, missing/invalid RPC, workspace display,
  individual assignment/reassignment/revocation, batch behavior, and receipts.
- Disposable PostgreSQL 17 acceptance exercises the real candidate SQL, role
  persistence, revisions, cross-workspace isolation, and audit.
- Genuine production FuelTrans assignment and browser refresh acceptance remains
  pending deliberate activation of the server-side candidate.
