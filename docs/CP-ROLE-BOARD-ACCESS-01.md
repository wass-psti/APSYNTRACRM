# CP-ROLE-BOARD-ACCESS-01 — Board Access in Role Configuration

## Objective

Place the existing individual board access configuration inside the centralized APSYNTRA CRM Role Configuration interface.

## Delivered

- Add a dedicated **Board Access** tab to Role Configuration.
- Read the current active-workspace member, board, and board-assignment snapshot through the existing `UserRoleManagementClient` and `apsyntra_role_user_management_snapshot` contract.
- Provide workspace member selection, board-name search, current access display, Set access, and Revoke actions.
- Reuse the existing `user-role-edit-board` and `user-role-revoke-board` handlers, `apsyntra_role_manage_user_access` backend contract, audit behavior, and authoritative readback.
- Preserve existing Viewer, Editor, and Owner behavior. Existing Owner assignments remain visible and cannot be changed by this editor.
- Keep the role catalog, application-role proposals, permission matrix, and workspace-policy proposals in their existing staged-only mode.
- Add responsive layout, keyboard-focus styling, accessible table labels, and regression coverage.

## Boundaries

- No new role, grant, permission, or board-membership model.
- No database migration or RPC change.
- No change to the CRM role hierarchy or bootstrap identity behavior.
- No changes to existing board access semantics or backend enforcement.
- Board access continues to be workspace-scoped and uses the existing signed server-side assignment workflow.

## Acceptance

- Role Configuration exposes six sections, including Board Access.
- Board Access displays authoritative members, boards, and membership roles.
- Selecting a member updates the displayed board assignments.
- Search filters board rows without losing the current input value.
- Set access and Revoke invoke the existing board assignment handlers and verify refreshed state.
- Protected accounts, the signed-in administrator, and existing board owners remain non-editable in the UI; server-side checks remain authoritative.
- Empty, loading, and filtered states are handled without fabricated records.
