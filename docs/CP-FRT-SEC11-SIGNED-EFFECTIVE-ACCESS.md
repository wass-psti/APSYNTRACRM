# CP-FRT-SEC11 — Signed Self-Permission Inspection and Board Empty State

**Date:** 2026-10-31 (Philippines).  
**Origin:** APSYNTRA CRM `main` `0aac9dc9dc35e2f6b5743e34f616ee118a2d177a`.  
**Goal:** Provide reliable signed read-only effective permissions inspection to existing administrators and nonadministrators, including HR users with zero board memberships. Keep the historical SEC10 *controlled role-transition test* separate and gated.

## Root cause verified by source and production read-only inventory

1. The previous `security-sec10-readonly` action was explicitly coded to reject bootstrap administrators. That was correct for a nonbootstrap role-transition test, but the action was misleadingly presented as the only general "Check signed role ceilings — read-only" option. An administrator could not inspect their own effective privileges.
2. The dropdown used `state.boards`, returned by `wm_list_boards('active')`. That existing function returns active boards only when the signed user is a same-workspace board member or a platform administrator. Existing `hr` is **not** a platform administrator and cannot enumerate workspace boards without membership.
3. Production aggregate read-only inventory showed **two active HR-role profiles, zero direct board memberships and zero FRT module assignments for that HR cohort**. This is not a missing frontend privilege; fabricating a board list or automatic membership would violate central authorization. The absence requires an explicit empty state.
4. A nonbootstrap user cannot call `apsyntra_crm_platform_role_snapshot` because it is bootstrap-protected; the internal `apsyntra_crm_effective_role` helper is intentionally not exposed to authenticated clients. The previous frontend therefore had no suitable self-only server contract for actual effective platform role and board/module permissions.

## Implementation

- **Additive signed database RPC:** `sql/cp-frt-sec11-signed-effective-access.sql` defines `public.apsyntra_crm_my_effective_access()` with **no user or workspace arguments**. It obtains `auth.uid()`, verifies active profile and active current-workspace membership, checks the existing bootstrap resolver, then calls the existing CRM effective and explicit role resolvers, central `module_role_for` and `has_module_access`, and `work_board_access` on every same-workspace active board. It returns only the caller's own platform and module permissions and those boards the caller may view.
- The function is read-only (`STABLE`), hardened `SECURITY DEFINER SET search_path=''`, revokes PUBLIC/anon execution, and grants execution to `authenticated` with checks in the function. It never mutates accounts, audit records, roles, sessions, memberships, board data or finances. No direct CRM role-table access is granted.
- **Frontend signed verification:** `frontend/signed-effective-access.js` calls verified Supabase Auth, checks the active workspace against `wm_auth_access_context`, calls the one self-only backend RPC, validates role and board/module schema, and rechecks signed identity/workspace before accepting results. Missing backend RPC is **BLOCKED**, not a fabricated PASS. Copied evidence excludes identities, email, access tokens, workspace and board identifiers or names.
- **UI:** Adds a dedicated general **Check signed role ceilings — read-only** button available to existing signed bootstrap and HR accounts, even with no boards. Shows CRM effective and explicit roles; existing central module roles and module access; every actually authorized board and view/edit/manage scope. If zero boards, displays an explicit empty-state note and does not enable the staged transition dropdown. Renames the earlier nonbootstrap-only SEC10 action to **Run controlled transition capability check** so no false claim that clicking it changes roles. The bootstrap restriction remains on this *separate* controlled-transition action.
- Signed-result cache is invalidated on logout, expired session, workspace/identity changes and active-session reset. No hardcoded user-specific exceptions.
- **Source of truth:** Read-only inspection is not FRT financial transaction certification. Module role/access reflect the existing central resolvers; finance approval and native-domain authorization remain controlled by their existing backend checks.

## Current verified evidence

- Read-only PostgreSQL inventory: **2 active HR-role profiles with zero direct board memberships and no FRT module grants**; **15 active boards**, **75 board memberships** overall; **0 explicit CRM role overrides** when checked. Values are cohort-level, not personal account/session evidence.
- Existing `wm_list_boards`, `work_board_access`, `has_module_access`, `module_role_for`, CRM role resolver and session context were inspected from their live definitions.
- Disposable PostgreSQL 17 tests `sql/tests/cp-frt-sec11-self-access-disposable.sql` check denied unauthenticated calls, same-workspace administrator privileges, legitimate HR member access, successful empty-board results in another workspace, Viewer ceiling and revocation, unchanged module/board assignments, and closed anonymous RPC/table grants.
- Frontend tests cover signed bootstrap/HR reports, empty state, schema validation, context drift, safe rendering and sanitized export. These tests are source-contract verification, **not** authenticated production browser tests.

## Controlled production activation

**The source migration is not an applied production migration.** Deploying the new authenticated read-only `SECURITY DEFINER` RPC is an explicit new production API EXECUTE grant and requires authorized security review and controlled migration release. Do not run this new SQL directly on production merely to make the frontend button pass. After release, recheck the function definition, grants, security advisors, and actual signed requests from the existing administrator and HR accounts.

- The new frontend action must report `SELF_AUTHORIZATION_BACKEND_NOT_INSTALLED` if it is released before the new backend RPC.
- No HR board may be granted implicitly. HR with no authorized boards must see a **successful empty-state report**, not a fabricated board.
- The existing CP09 signed evidence (bootstrap and nonbootstrap) remains valid for its read-only scope; the SEC10 Viewer/Supervisor/Restored actual transition and fresh-session acceptance remain pending in a separate isolated nonproduction environment.

## Exact acceptance boundaries

| Gate | Status |
| --- | --- |
| Root cause: bootstrap-only control mistaken for general inspection | VERIFIED by deployed source |
| Root cause: HR group has no boards under existing membership scope | VERIFIED by production aggregate database query |
| New backend self-scoped inspection contract, no stored permission changes | IMPLEMENTED-UNVERIFIED for production |
| Frontend signed inspection, admin enablement and empty-state UI | IMPLEMENTED-UNVERIFIED for production |
| Isolated SQL and frontend regressions | VERIFIED when final branch CI passes |
| Live SQL migration and safe RPC grants | PENDING controlled security-reviewed release |
| Genuine signed administrator account inspection | PENDING |
| Genuine signed HR account inspection and zero-board confirmation | PENDING |
| Final integrated production acceptance | PENDING |

**No production role, board membership or financial records are to be modified as a condition of the read-only inspection fix.**
