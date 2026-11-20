# Share & Access — APSYNTRA CRM code map

This guide is for developers changing the board's **Share & Access** window and its separately controlled authorization behavior. It reflects the staged frontend and backend contracts, **not** proof that production invitations are activated.

## Current Invite / N board header (November 20, 2026)

- The single top-right **Invite / N** control is rendered by `boardInviteControl()` in `frontend/board/collaboration/people.js`. The invitation modal is lazily loaded from `frontend/board/collaboration/invite.js`; the old Share & Access popup remains in the repository for compatibility but is not launched by the main board toolbar.
- The modal has **People only**, no Agents placeholder. Signed managers can type in the search field. Search results are drawn from verified server-scoped workspace members, never guessed from browser profiles.
- A verified CRM Administrator can use the existing `apsyntra_role_user_management_snapshot` + `apsyntra_role_manage_user_access` contracts through `UserRoleManagementClient`. Only a Viewer grant, or an existing Viewer/Editor revocation, is offered for a nonprotected user. The server rechecks administrator scope, active workspace and board permissions. Owner/self/protected role changes are denied and post-write membership is reconciled.
- Nonadministrator board managers may use the separately authorized COL01 directory **if deployed**; the BS09 direct-member writer remains disabled. If the server denies either directory, the modal must show a clear unavailable status and never silently claim an invitation succeeded.
- Workspace invitations by email are **not** board membership. An administrator adding an existing member through this dialog does not grant workspace membership, edit application roles or bypass the server ACL.
- After UI changes, run `node --test frontend/tests/board-invite-header.test.mjs frontend/tests/board-invite-admin-access.test.mjs frontend/tests/board-share.test.mjs frontend/tests/ws11-invitation-management.test.mjs` and `npm run build`.

## Start here

| Goal | Primary file | What to look for |
| --- | --- | --- |
| Change Share & Access popup text or sections | `frontend/board/collaboration/share.js` | `renderBoardSharePreview()` |
| Change popup interactions | `frontend/board/collaboration/share.js` | `openBoardSharePreview()` |
| Change popup colors, spacing, and sizes | `frontend/board-share-clean.css` | `.board-share-stage-*` rules |
| Find the Share button and its event handler | `frontend/app.js` | `board-share-preview` |
| Change the direct board-member display | `frontend/board/collaboration/people.js` | `renderBoardPeople()` |
| Change user/group picker and grant/revoke transport | `frontend/workspace-board-groups.js` | `renderBoardAccessChoices()`, `BoardGroupAccessClient` |
| Change workspace invitation dialog | `frontend/workspace-ui.js` | `inviteContent()`, `openWorkspaceInvitationDialog()` |
| Change workspace invitation sending (browser side) | `frontend/workspace-invitation-client.js` | `WorkspaceInvitationClient.send()` |
| Change invitation history and revoke (browser side) | `frontend/workspace-invitation-management.js` | `WorkspaceInvitationManagementClient` |
| Change direct resource-email invitation contract | `frontend/resource-email-invitations.js` | `ResourceEmailInvitationClient` |
| Change protected invitation routing | `supabase/functions/_shared/ws02d-trusted.ts` | `serveInvitationRoute()`, `trustedSql()` |
| Change authoritative database privileges | `sql/bs11-direct-board-access-CANDIDATE-NOT-APPLIED.sql` and `sql/ws11-invitation-management-CANDIDATE-NOT-APPLIED.sql` | Private functions, grants, and guards (review candidates only) |

## Request flow

1. `frontend/app.js` handles `board-share-preview` and calls `openBoardSharePreview()`.
2. `renderBoardSharePreview()` builds the HTML; `board-share-clean.css` styles it.
3. The user can open the signed **People** view, switch the People/Groups picker, or open workspace invitations.
4. Board grant/revoke requests would call `BoardGroupAccessClient.changeBoardAccess()` at `/functions/v1/bs09-board-access`.
5. Workspace invitation sending would call `WorkspaceInvitationClient.send()` at `/functions/v1/ws02d-invite`.
6. The server must authenticate the current user and authorize the exact workspace and board before changing membership. SQL/RLS, not button visibility, is the security authority.

**Important distinction:** Inviting someone to a workspace does not give them access to every board. Application permissions and board permissions are also separate.

## Activation is separate from formatting

At the time this guide was created, these frontend switches are set to `false`:

- `BOARD_SHARE_LINKS_ENABLED` — board invitation links
- `BOARD_GROUP_ACCESS_ENABLED` — grant/revoke board access
- `WS02D_INVITE_CLIENT_ENABLED` — sending workspace invitations
- `WS11_INVITATION_MANAGEMENT_ENABLED` — listing/revoking invitations
- `RESOURCE_EMAIL_INVITES_ENABLED` — direct resource-email invitations

Do not flip them just to make buttons clickable: the server endpoints, migrations, GoTrue authorization, RLS, and negative tests require independent review. The `sql/*CANDIDATE-NOT-APPLIED.sql` files are not proof of a production migration.

## Consistent formatting

The repository already has **Prettier** installed. To run a full standards-based formatting pass on the related JS, TS and CSS modules:

```bash
npm install
npm run format:share-access
```

The command also rebuilds the generated CSS bundle. **Review the Git diff** after running it: CSS source and the generated bundle must stay synchronized. Avoid reformatting the entire large `frontend/app.js` file when your task only changes a single handler.

## Local checks before merging

```bash
node --check frontend/board/collaboration/share.js
node --check frontend/board/collaboration/people.js
node --check frontend/workspace-board-groups.js
node --check frontend/workspace-invitation-client.js
node --check frontend/workspace-invitation-management.js
node --check frontend/resource-email-invitations.js
node --test frontend/tests/board-share.test.mjs frontend/tests/board-people.test.mjs frontend/tests/ws11-invitation-management.test.mjs
npm run build
```

Use a feature branch for behavior changes, especially invitations, role assignments, or RLS. Formatting changes must preserve policy flags and fail-closed behavior.
