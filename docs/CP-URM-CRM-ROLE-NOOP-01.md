# CP-URM-CRM-ROLE-NOOP-01 — Unchanged Workspace Role Submission

## Root cause
User Role Management preselected an existing explicit CRM platform role but left Apply enabled. An unchanged submission correctly triggered SQLSTATE PT409 from the workspace-scoped role RPC, displayed as an error toast.

## Fix
- Disable Apply when the currently selected role matches the stored explicit assignment.
- Enable Apply immediately upon changing the selection; explain the no-op in an accessible live hint.
- Permit creating a new explicit override equal to an inherited effective role.
- Preserve verified workspace role refresh, optimistic concurrency, audit and protected identities.
- For a concurrent exact same-role assignment, confirm via signed readback and display a neutral no-op message.
- Preserve all other backend errors, including stale revision failures.
- Prevent duplicate generic modal success notifications in this flow.

## Validation and boundaries
Unit and contract tests cover explicit unchanged, inherited-to-explicit, changing and reverting roles, modal button behavior, and signed readback. Full frontend, build and CI acceptance apply. No schema, permissions, roles, or production data were mutated in this fix.
