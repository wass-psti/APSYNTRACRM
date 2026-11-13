# CP-MAIN-WS-OWNER-ADMIN-01 — Main Workspace Owner CRM Admin

## Decision

A user is automatically a CRM Admin in their personal Main Workspace only when all of the following are true:

1. The signed account is an active profile and active member of the requested workspace.
2. private.ws02_personal_workspaces maps that user to that exact workspace.
3. private.ws01_member_roles records that same user as the workspace owner.

The owner-derived Admin result takes precedence over a stale lower explicit CRM tier for that personal workspace. It does not create or modify a row in apsyntra_crm_platform_roles.

## Scope boundaries

- The effective role remains workspace-specific.
- A Main Workspace owner receives no owner-derived elevation in Work Management or another workspace.
- Ordinary workspace ownership alone is not sufficient; the personal-workspace mapping is also required.
- Existing bootstrap identity behavior and all unrelated role fallback behavior remain unchanged.
- Existing signed-session, active-membership, current-workspace, and server-side CRM Admin checks remain authoritative.

## Workspace member email display

User Role Management requests the signed apsyntra_role_user_management_snapshot with the current workspace ID and rejects a response for another workspace. The server snapshot obtains emails only by joining workspace_members to profiles for that exact workspace and active membership.

The selector displays email addresses only. It does not query or display a global profile directory. Work Management membership is not copied into a Main Workspace. The existing invitation-history UI remains workspace-ID scoped and its separate invite-management activation remains unchanged.

## Verification

- Disposable PostgreSQL 17 acceptance verifies owner Admin in Main Workspace, no owner-derived Admin in Work Management, no elevation for non-owner or unmapped workspace owners, existing bootstrap fallback, inactive-member denial, and separate Main Workspace / Work Management email sets.
- Frontend tests verify workspace ID binding, email-only member selection, owner-role labeling, and rejection of a foreign workspace snapshot.
