# APSYNTRA CRM — Access V2 REST contract (staging proposal)

**Status:** Contract and disabled-by-default Edge transport. **Not a deployed API.** The router is in \`supabase/functions/access-v2/index.ts\`. It refuses every live request unless \`APSYNTRA_ACCESS_V2_ENABLED=true\` is explicitly approved, and its proposed SQL RPCs and RLS have passed PostgreSQL 17 and signed multi-account acceptance.

## Common requirements

Base: \`/functions/v1/access-v2\`. Every request requires \`Authorization: Bearer <verified Supabase access token>\`. POST, PATCH, DELETE require \`Content-Type: application/json\`. The \`workspaceId\` must be an active, server-verified workspace for the authenticated user; a request-supplied actor, role, owner or admin flag is **never** trusted. Mutations require \`expectedRevision\` read from the last signed snapshot and must re-read the record after the server's committed receipt. All payloads below are illustrative and use synthetic IDs.

Success envelope: \`{"ok":true,"data":<server-signed result>}\`. Errors: \`{"ok":false,"error":{"code":409,"message":"Role data changed. Refresh and retry"}}\`. Sign-in and strict validation failures return 401/400; unauthorized operations 403; nonexistent authorized resource 404; stale revision/last owner/last admin 409; unavailable or incomplete backend 503. Never return raw SQL error, tokens or another workspace's data.

A strict HTTP success **does not** by itself prove a permission change. The caller must independently re-read a signed snapshot with the new revision and exact target projection.

## Workspace Teams

| Verb and path | Required permission | Contract |
| --- | --- | --- |
| GET \`/teams?workspaceId=...\` | Current signed workspace; all teams for System Admin, own teams for member | team counts, owners, content, effective system-admin source |
| POST \`/teams\` | System Admin | Create, name unique in workspace |
| PATCH \`/teams/:teamId\` | Team owner or System Admin | Rename |
| DELETE \`/teams/:teamId\` | Team owner or System Admin; not is_system | Delete with last-admin guards |
| POST \`/teams/:teamId/members\` | Team owner or System Admin | Add member, owner when first member |
| DELETE \`/teams/:teamId/members/:userId\` | Team owner or System Admin | Remove with last-owner and last-admin guards |
| PATCH \`/teams/:teamId/members/:userId\` | Team owner in both teams or System Admin | \`move\`, \`add_other_team\`, \`make_owner\`, \`remove_owner\` |
| POST \`/teams/:teamId/board-access\` | Team owner plus board owner, or System Admin | Give Viewer/Editor board access |
| PATCH \`/teams/:teamId/board-access/:boardId\` | Same | Change existing team board role; **RPC pending** |

Example:

\`\`\`http
POST /functions/v1/access-v2/teams HTTP/1.1
Authorization: Bearer <SIGNED_USER_TOKEN>
Content-Type: application/json

{"workspaceId":"11111111-1111-4111-8111-111111111111","name":"Information Technology (IT)","expectedRevision":12}
\`\`\`

Expected signed mutation receipt from the proposed RPC (after activation):

\`\`\`json
{"ok":true,"data":{"contract":"apsyntra-teams-change-v1","state":"committed","workspaceId":"11111111-1111-4111-8111-111111111111","actorId":"22222222-2222-4222-8222-222222222222","action":"create","teamId":"33333333-3333-4333-8333-333333333333","revision":13}}
\`\`\`

## Board access

| Verb and path | Required permission | Current readiness |
| --- | --- | --- |
| GET \`/boards/:boardId/access?workspaceId=...\` | Exact-board manager or System Admin, signed | \`apsyntra_access_board_snapshot_v2\` RPC proposed but not implemented |
| GET \`/boards/:boardId/teams?workspaceId=...&q=IT\` | Exact-board owner or System Admin | Signed \`apsyntra_board_team_invite_candidates\` SQL review candidate exists |
| POST \`/boards/:boardId/teams\` | Exact-board owner or System Admin | Viewer-only \`apsyntra_board_invite_team_viewer\` SQL review candidate exists |
| POST \`/boards/:boardId/people\` | Board owner/manager or System Admin | Not activated; existing BS09/CRM signed Viewer invitation remains authoritative |
| PATCH \`/boards/:boardId/people/:userId\` | Exact-board owner/manager or System Admin | Viewer↔Editor **not activated** without signed role-change RPC |
| DELETE \`/boards/:boardId/people/:userId\` | Exact-board owner/manager or System Admin; cannot delete final owner | Existing dedicated signed remove path retained until cutover |

\`Owner\` is **not** a third assignable role in the role dropdown. Ownership is a protected, separate relationship; at least one owner must remain.

Example:

\`\`\`http
POST /functions/v1/access-v2/boards/44444444-4444-4444-8444-444444444444/teams HTTP/1.1
Authorization: Bearer <SIGNED_USER_TOKEN>
Content-Type: application/json

{"workspaceId":"11111111-1111-4111-8111-111111111111","teamId":"33333333-3333-4333-8333-333333333333","role":"viewer","expectedRevision":7}
\`\`\`

Expected after activation: \`{"ok":true,"data":{"contract":"apsyntra-board-team-invite-change-v1","state":"committed","workspaceId":"11111111-1111-4111-8111-111111111111","boardId":"44444444-4444-4444-8444-444444444444","teamId":"33333333-3333-4333-8333-333333333333","actorId":"22222222-2222-4222-8222-222222222222","revision":8}}\`.

## Application roles

| Verb and path | Required permission | Behavior |
| --- | --- | --- |
| GET \`/apps/:appKey/roles?workspaceId=...\` | System Admin or that app's App administrator | Read app-specific roles, features and capability checks |
| POST \`/apps/:appKey/roles\` | Same | Add a custom role |
| PATCH \`/apps/:appKey/roles\` | Same | Edit name/description/capabilities and assign/revoke people |
| DELETE \`/apps/:appKey/roles\` | Same | Delete only after reassignment or explicitly audited removal |

These paths refer to proposed \`apsyntra_access_app_roles_snapshot_v2\` and \`apsyntra_access_app_roles_change_v2\` signed RPCs. They are **not yet present**; the router therefore returns 503 on activation until implemented and authorized. App keys, feature keys and historic role keys are preserved through an approved mapping.

Example proposed batch patch:

\`\`\`http
PATCH /functions/v1/access-v2/apps/fueltrans/roles HTTP/1.1
Authorization: Bearer <SIGNED_USER_TOKEN>
Content-Type: application/json

{"workspaceId":"11111111-1111-4111-8111-111111111111","action":"update_capabilities","roleId":"55555555-5555-4555-8555-555555555555","capabilities":{"fuel_requests":{"approve":true,"export":false}},"expectedRevision":3}
\`\`\`

Readback must match the exact roleId, appId, workspace, actor, revision, and allowlisted feature/capability keys. A checkbox rendered on the frontend has no security authority.

## System Admin and audit

\`POST /system-admin/grants\` / \`DELETE /system-admin/grants\`: require **an existing System Admin**; payload \`{workspaceId,teamId,userId,expectedRevision}\`. Signed RPC checks effective inheritance and explicit grants independently. Inherited General administration status is never stored as an explicit user grant. Deny removing the final effective admin, including self.

\`GET /audit?workspaceId=...&limit=50&after=...\`: System Admin, or narrowly scoped authorized app/board owner reads of relevant events only. Signed cursor pagination; **proposed RPC not yet implemented**. Events carry actor, action, target, metadata, UTC timestamp; no client-originated "success" audit entries. Writes are append-only.

## Fail-closed contract

- GET/role write 401/403/404/409/503 do not create synthetic rows or optimistic permanent grants.
- Optimistic UI state is transient; rollback to the preceding signed snapshot on any error.
- Reauthenticate after session revocation, workspace switch, or stale revision; abort any active modal.
- Every content/app-role mutation needs server-side audit, workspace scope and active membership.
- Direct user board access, team access, and app capabilities remain enforced by their **existing production authorization checks** until a full, verified cutover updates them all.
