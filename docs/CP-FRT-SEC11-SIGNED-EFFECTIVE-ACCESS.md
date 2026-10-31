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

**Production activation completed on October 31, 2026.** The reviewed `sql/cp-frt-sec11-signed-effective-access.sql` was applied as `cp_frt_sec11_signed_effective_access_activation` following the explicit CP-FRT-SEC11 Backend Activation request. Its signed read-only `SECURITY DEFINER` RPC requires an active `auth.uid()` and active workspace membership, accepts no caller user/workspace parameters, and delegates actual module and board permissions to existing central authorization functions. Independent SQL checks confirmed: zero anonymous/PUBLIC EXECUTE, authenticated EXECUTE enabled, forced RLS unchanged, no direct authenticated role-table reads/writes, and unchanged role/module/board membership and audit counts. The security advisor now flags the authenticated SECURITY DEFINER entry point (lint 0029) by design; it remains restricted by the in-function signed identity and workspace guards. **Actual signed-browser response is still pending** for both existing administrator and HR accounts. No live role or finance data was changed.

- The new frontend action must report `SELF_AUTHORIZATION_BACKEND_NOT_INSTALLED` if it is released before the new backend RPC.
- No HR board may be granted implicitly. HR with no authorized boards must see a **successful empty-state report**, not a fabricated board.
- The existing CP09 signed evidence (bootstrap and nonbootstrap) remains valid for its read-only scope; the SEC10 Viewer/Supervisor/Restored actual transition and fresh-session acceptance remain pending in a separate isolated nonproduction environment.

## Exact acceptance boundaries

| Gate | Status |
| --- | --- |
| Root cause: bootstrap-only control mistaken for general inspection | VERIFIED by deployed source |
| Root cause: HR group has no boards under existing membership scope | VERIFIED by production aggregate database query |
| New backend self-scoped inspection contract, no stored permission changes | VERIFIED installed with signed self-only source contract and preserved role/membership counts; real signed browser response PENDING |
| Frontend signed inspection, admin enablement and empty-state UI | IMPLEMENTED-UNVERIFIED for production |
| Isolated SQL and frontend regressions | VERIFIED: frontend plus disposable PostgreSQL 17 PASS in [GitHub Actions run #41169961544](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41169961544) |
| Live SQL migration and safe RPC grants | VERIFIED: production migration `cp_frt_sec11_signed_effective_access_activation` applied; authenticated EXECUTE only, anonymous/PUBLIC denied; read-only independent checks passed |
| Genuine signed administrator account inspection | PENDING |
| Genuine signed HR account inspection and zero-board confirmation | PENDING |
| Final integrated production acceptance | PENDING |

**No production role, board membership or financial records are to be modified as a condition of the read-only inspection fix.**

## Final isolated integration evidence

GitHub Actions [run #41169961544](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41169961544) completed successfully on the committed frontend and SQL code. Both the **frontend** and **disposable-postgres** jobs passed. The SQL tests exercised the actual proposed new function plus existing central-role and board-role resolvers on isolated PostgreSQL 17 fixtures. These are not production signed-user runs. A separate targeted read-only production query matched one active administrator profile and one active HR profile, confirmed both were active workspace members, and measured **13** active direct board memberships for the administrator and **0** for HR; **0** FRT grants for HR. No personal identifiers were exported into the repository.

## CP-FRT-SEC11 controlled production backend activation evidence — 2026-10-31

**Applied migration:** `cp_frt_sec11_signed_effective_access_activation` (1 ledger entry, successful); exact SQL: `sql/cp-frt-sec11-signed-effective-access.sql`, Git blob `b6d222bffbfdd5528ae74cd7aad221bd3a75f554`, baseline `main` commit `7c965e2b1da2c2a95cee81bd7c78ca95a103ee79`.

- Signed self-only `public.apsyntra_crm_my_effective_access()`: **installed**, `STABLE`, `SECURITY DEFINER`, fixed empty search path, no caller arguments, owned by the existing DB administrative role.
- RPC execute: `anon=false`, `PUBLIC=false`, `authenticated=true`.
- `apsyntra_crm_platform_roles`, `apsyntra_role_bootstrap_identities`, `apsyntra_role_change_audit`: forced RLS **enabled**; direct anonymous/authenticated SELECT denied; authenticated UPDATE denied.
- Before/after unchanged: **0** explicit CRM overrides; **121** module assignments; **75** board memberships; **3** FRT memberships; **2** bootstrap identities; **0** role-change audit events.
- Existing `apsyntra_crm_effective_role`, `apsyntra_crm_explicit_role`, `module_role_for`, `has_module_access`, `work_board_access`, and `apsyntra_role_is_bootstrap` remain authoritative; no role grants, board memberships, or finance records modified.
- Supabase security advisor flags `authenticated_security_definer_function_executable` for this RPC ([lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). This is a known, sensitive authenticated self-inspection entry point, not a direct table grant; its `auth.uid()` and active-workspace guard and same-workspace view-only board filter were reviewed and isolated-test verified.
- **Genuine signed runtime acceptance pending:** existing bootstrap administrator's effective platform/module/board report; existing HR member's permitted modules and zero-board empty state. Do not invent results or substitute SQL role impersonation for real signed Supabase Auth evidence. User-provided reports must be sanitized; never store account IDs, JWTs or email addresses in public evidence.

**Acceptance boundary:** backend installation and grants VERIFIED; genuine signed browser acceptance PENDING; CP-FRT-SEC10 role-transition and new-session acceptance remains separate.
