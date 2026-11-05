# CP-WS-01 — Multi-Workspace Selector, Discovery, and Creation

## Goal and verified architecture baseline (2026-11-05)

Use the nine user-supplied Monday.com reference screenshots as interaction guidance, **not** as evidence of APSYNTRA CRM backend functionality. Retain APSYNTRA identity and the preexisting single GoTrue authentication, one Supabase project, and all board/module security boundaries.

The existing production backend was inspected read-only:

- `public.workspaces` has `id`, `name`, `created_at`; there is **no workspace privacy or owner column**.
- `public.workspace_members` has `workspace_id`, `user_id`, `active`, `created_at`; it **does not distinguish owner, member, collaborator**.
- Both tables have RLS enabled and **no direct authenticated SELECT or INSERT grants**. Direct client queries cannot implement safe discovery/creation.
- `public.current_workspace_id(p_user_id)` deterministically chooses the user's **earliest active workspace membership**. Neither session-specific switching nor an authorized switch RPC exists.
- `public.wm_auth_access_context()`, `wm_list_boards()`, `work_board_access()` and multiple modules depend on that authoritative current workspace. Replacing it without auditing the entire authorization graph would create a cross-workspace risk.
- Production currently has two workspaces, but the second has no active membership. This prevents the separate TradeLink genuine foreign-workspace signed negative acceptance from passing.

## Increment CP-WS-01A — frontend shell (IMPLEMENTED, live deployment pending acceptance)

Changes on `main`:

- `frontend/workspace-ui.js` renders a signed-context **workspace selector** replacing the static sidebar workspace label.
- Searchable **Recent workspaces** dropdown, **Browse all** dialog, search and **All/Recent/Owner/Member/Collaborator** category controls.
- **Add workspace** dialog with name and **Open/Closed** privacy input and client-side validation; button is explicitly **Review readiness**, not an unauthorized create operation.
- `frontend/workspace-ui.css` provides APSYNTRA-branded desktop/mobile dialogs and accessible focus, Escape and outside-click handling, reduced-motion compatibility.
- `frontend/app.js` wires the sidebar/topbar entry point, preserves central auth, and clears workspace overlays on sign-out/session expiration.
- `index.html` loads the styles, and `scripts/pages-smoke.mjs` requires the new JavaScript and CSS assets on Pages.

**Security boundary:** the frontend currently shows only `workspaceCatalog({id: context.workspace_id, name: workspaceName()})` from the verified existing `DomainApi.context()`. It never reads other workspace identifiers, runs a workspace mutation RPC, persists a second workspace, or presents an unverified owner label. Owner/collaborator filters correctly return no claims until the backend has a real workspace-role model. The create review cannot write production data.

Explicit disabled gates: `WS01_DISCOVERY_ENABLED=false`, `WS01_CREATION_ENABLED=false`, `WS01_SWITCHING_ENABLED=false`.

## Increment CP-WS-01B — server-authorized discovery contract (STAGED, NOT ACTIVATED)

- `sql/cp-ws01-discovery-activation-candidate.sql` stages `public.wm_ws01_list()` returning only the real actor's active memberships and workspace names.
- Requires live `auth.uid()`, existing `private.wm_board_config_session_active()`, active profile, and active membership; uses fully qualified table references and a restricted, authenticated-only EXECUTE grant.
- The candidate **was not executed in Supabase**. Its production EXECUTE grant is a production permission change requiring separate approval.
- `normalizeServerWorkspaceCatalog` validates exact actor/current-workspace correspondence and unique server-returned memberships. It exists for later integration; the browser does not call the staged RPC yet.

## Next backend work — not authorized for production activation

1. Add a well-defined workspace ownership/membership/collaboration model, including a privacy policy and invitation/admission mechanism. Separate workspace owner from platform bootstrap admin; do not use editable user metadata for permissions.
2. Implement an account-authorized creation transaction with workspace name uniqueness/validation policy, initial owner membership, audit, idempotency, and rollback.
3. Implement **session-bound** authoritative workspace selection. Validate current `auth.sessions`, active target membership, and server-side current-workspace scope. Keep no arbitrary workspace override in HTTP headers, local storage, user metadata, or caller-controlled JWT claims.
4. Audit every consuming module and board RPC for cross-workspace safety. Update platform-sync cache keys, board list/detail access, attendance/finance/TradeLink projections, files, activities and subscription scopes on switches. Establish revocation, concurrent session and data-isolation acceptance.
5. After staged disposable database tests and separate production approvals, activate read discovery, creation and switching one gate at a time. Run actual signed-user Pages acceptance under primary and foreign workspace memberships.

## Evidence and classification

- Focused JavaScript source-replay regression assertions: **9/9 PASS**, validating no foreign disclosure, safe search/filtering, names/HTML escaping, privacy form validation, signed RPC normalization, and disabled mutation/creation paths.
- GitHub Pages full frontend CI, live interactive browser UX, and deploy asset check: **PENDING separate verification**.
- Production schema or permission changes for CP-WS-01: **NONE**. Only read-only catalog/security inspection was performed.
- **Overall CP-WS-01: PARTIALLY IMPLEMENTED**. The selector and browse/create review UI exist; genuine multi-workspace discovery, creation, ownership, privacy and switching remain blocked on server contracts and separate activation approval.
