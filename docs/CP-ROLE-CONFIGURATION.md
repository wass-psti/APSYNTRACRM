# CP-RC01 — Central Role Configuration (Bootstrap-only)

**Implementation date:** October 30, 2026 (Asia/Manila)  
**Repository:** `wass-psti/APSYNTRACRM`  
**Feature branch:** `feature/cp-role-configuration-bootstrap`  
**Base branch:** `main` (NOT MERGED)  
**Overall disposition:** **BACKEND SCHEMA INSTALLED; UNSIGNED LIVE DENIAL VERIFIED; SIGNED USER AND FRONTEND ACCEPTANCE PENDING**  
**Approved live runtime:** GitHub Pages frontend + existing Supabase Auth/Work Management API/PostgreSQL/Storage. No local host or second backend.

## 1. Why the module is not yet visible in the deployed GitHub Pages application

The user's explicit instruction is **not to merge into `main` without final security acceptance and separate merge approval**. GitHub Pages deploys `main`, so this security-sensitive module remains in a reviewable feature branch. The role SQL patch was first validated inside a transaction ending with `ROLLBACK` and has now been **installed in the existing production Supabase project** as an additive, staged-only schema. The frontend remains on its feature branch. Accordingly, the live `#/role-configuration` URL must not be represented as deployed or as accepted.

## 2. Existing authoritative architecture reused

- **Canonical identity:** Supabase `auth.users.id` and `public.profiles`, not a frontend username claim. A new protected `apsyntra_role_bootstrap_identities` table resolves exactly two already-active canonical Auth identities by their existing exact account emails when the schema is installed. After installation, access is bound to their immutable Auth UUIDs and the current matching Auth/profile records.
- **Bootstrap users:** `lmsenagan` and `asenagan` only, both independently confirmed as active `admin_general_manager`. Normal platform administrators do **not** qualify by their role alone.
- **Active authorization remains authoritative:** `profiles.platform_role`, `workspace_members`, `work_board_members`, `module_role_assignments`, `work_board_access`, and existing application-specific role RPCs remain unchanged. The role module does NOT replace or bypass them.
- **Default role hierarchy:** Admin → Supervisor → Employee → Viewer is shown as **immutable reference roles**. Existing backend-specific values (including `admin_general_manager`, HR, and app-specific role names) are not forcibly rewritten.
- **Twelve domain modules:** reuse existing module ID mappings; the UI has a separate permission matrix per module. These draft permissions do **not** yet alter operational API authorization.
- **Storage:** one existing PostgreSQL database with additive, central governance tables and row-level protections. No new database, independent sign-in, new test identities, service-role credentials, or duplicate live assignment store.

## 3. Database security design and protections

Proposed additive SQL: `sql/cp-role-configuration-bootstrap.sql`.

1. Protected bootstrap registry has two immutable Auth UUID bindings; it is private to database-owner functions, with RLS enabled and FORCE RLS, direct privileges revoked.
2. `apsyntra_role_is_bootstrap()` validates `auth.uid()`, exact canonical Auth/profile email and active general-manager status; only then returns true. It does not trust JWT `user_metadata` or frontend state.
3. `apsyntra_role_require_scope(workspace_uuid)` rechecks bootstrap authority, the **server-authoritative active workspace**, and active membership. Every management RPC calls it before accessing data.
4. `apsyntra_role_configuration_snapshot(workspace_uuid)` exposes only workspace-scoped current users, role grants from existing `module_role_assignments`, board identities, immutable reference role definitions, staged proposals, and audit. Non-bootstrap/direct API callers receive `42501`/HTTP 403 after installation.
5. `apsyntra_role_configuration_propose(workspace_uuid,operation,payload)` accepts an explicitly whitelisted set of operations and an upper-bounded JSON payload. It rejects bootstrap privilege keys, self-modification, changes to either protected bootstrap account, inactive/out-of-scope target users and unknown module IDs.
6. Every staged proposal produces a server-side append-only audit event. The audit table's UPDATE/DELETE trigger rejects mutation; direct table grants to `anon` and `authenticated` are revoked and RLS is forced.
7. **No activation/apply RPC is deployed.** Staging a request, including `role.activate`, `assignment.assign`, and permission changes, cannot change a production role, permission, user assignment or membership. A separate approved activation phase must integrate the authorization checks within the existing backend, with migration and regression review. In particular, drafts are NOT effective access rights.

All new `SECURITY DEFINER` entry points have explicit `search_path`, revoked `PUBLIC` default EXECUTE, specific `authenticated` grants only where required and live bootstrap/workspace checks inside the function. This is intentionally fail-closed and must still undergo signed-user direct-API tests after installation.

## 4. Interface implemented (branch only)

- Central administrative navigation entry appears only after the **signed server-side bootstrap RPC** returns true. Role route checks the server again, including direct URL visits; logout, token expiration and identity changes clear role state.
- Role catalog dashboard, default-role hierarchy, proposed create/edit/activate/deactivate, active user/module assignment listing, assignment/revocation proposals, 12-module × 7-capability matrix, workspace restrictions, search, filters, and immutable history.
- Existing assignment table is labeled as read-only authoritative data. Effective-permission preview shows stored platform and module grants but **does not claim to compute permissions under every backend guard**. Full effective-permission evaluation is a later server-authoritative capability, not client-side role inference.
- Every write-capable control is labeled **stage/propose**. The UI cannot activate a role or grant permissions without a separately approved backend release.

## 5. Acceptance classification

| Requirement | Status | Evidence / limitation |
| --- | --- | --- |
| Existing protected bootstrap identities | **VERIFIED** | Real Auth and profile account inspection confirmed both designated users active |
| Server-bootstrap access predicate | **IMPLEMENTED-UNVERIFIED** | SQL function reviewed and transactionally dry-run; no genuine bootstrap signed RPC run |
| Regular administrator denial, hidden UI | **IMPLEMENTED-UNVERIFIED** | UI/authorization unit tests pass; production API not installed, signed denial test pending |
| Direct API and database/table protections | **IMPLEMENTED-UNVERIFIED** | FORCE RLS and REVOKE checked in SQL source and rollback transaction |
| Workspace isolation | **IMPLEMENTED-UNVERIFIED** | Server current-workspace/membership guards; genuine second-workspace session pending |
| Existing-role dashboard and assigned users | **IMPLEMENTED-UNVERIFIED** | Snapshot assembled from authoritative tables; not yet executed in production |
| Custom role lifecycle | **IMPLEMENTED-UNVERIFIED** for proposals; **PENDING** activation | Staging only, no active role mutation |
| Assign/revoke user roles | **IMPLEMENTED-UNVERIFIED** for proposals; **PENDING** application | Existing module role assignments untouched |
| Seven module/board capabilities | **IMPLEMENTED-UNVERIFIED** for configuration proposals; **PENDING** active enforcement | 12×7 UI controls, no permission decision changes |
| Workspace access restrictions | **IMPLEMENTED-UNVERIFIED** for proposals; **PENDING** activation | Existing `workspace_members` unchanged |
| Effective permission preview | **IMPLEMENTED-UNVERIFIED** for current assignment inspection; **PENDING** true effective authorization evaluation | Do not confuse stored grant with access decision |
| Immutable change history | **IMPLEMENTED-UNVERIFIED** | Append-only trigger and proposal audit prepared, live verification pending |
| Twelve-board compatibility | **VERIFIED** for baseline preservation | Previously accepted 12/12 board infrastructure and QA; no board API changed |
| Role persistence and full signed mutation tests | **PENDING** | Actual additive schema installation/activation and genuine bootstrap session required |
| CI / TypeScript contract tests | **VERIFIED** | Feature-branch frontend and backend Actions passing |
| Merge to `main` | **BLOCKED** until explicit final user approval | No merge executed |
| Phase A negative access acceptance | **PENDING** | CP-A12.2 is paused until Role Configuration acceptance is resolved |

## 6. Required signed acceptance and final release gate

Only after the role module is separately approved for deployment:
1. Review the migration's exact SQL and bootstrap identity mapping.
2. Install the additive schema without changing any existing production roles, memberships or module assignments.
3. Obtain a genuine signed session from each existing bootstrap account and verify `apsyntra_role_is_bootstrap` and the scoped snapshot; verify all other users (including existing general managers) receive denial.
4. Perform actual rejected direct-RPC and cross-workspace calls under existing signed identities. Inspect SQL grants and audit integrity independently.
5. Validate draft proposal persistence and audit (no effective role changes), still without account provisioning or service keys.
6. Following a **separate user approval to apply role changes**, integrate and test actual activation/revocation against the authoritative `module_role_assignments`, `profiles` and workspace/board permission paths. Do not activate drafts silently.
7. Complete security and app compatibility regression, then request explicit user approval **before merging into `main`**.

**Next checkpoint:** CP-RC01.1 — Signed bootstrap-only backend verification and isolated deployment acceptance. CP-A12.2 negative-role/workspace acceptance remains paused.

## CP-RC01.1 production backend installation — 2026-10-30

**This addendum supersedes the earlier section that said the role schema had not been installed.**

- The exact additive role schema in \`sql/cp-role-configuration-bootstrap.sql\` was installed in the existing Supabase project through an applied database migration \`cp_rc011_install_bootstrap_role_configuration\`. Feature-source SQL had already passed a rollback-only dry run.
- Exactly **two immutable Auth UUID bootstrap records** were verified; both original accounts have active \`admin_general_manager\` profiles, valid active primary-workspace memberships, and primary authoritative workspace.
- All **four newly installed tables** have **RLS enabled and forced**. Neither \`anon\` nor \`authenticated\` has direct \`SELECT\`/\`INSERT\`/\`UPDATE\` access. Stored \`SECURITY DEFINER\` RPCs have explicit paths; three public-facing entry points (\`is_bootstrap\`, \`snapshot\`, \`propose\`) are granted to \`authenticated\` but require Auth identity and appropriate server-side scope. Internal helper and audit functions have no anonymous or authenticated EXECUTE grants.
- **Real unsigned HTTPS API negative tests passed 4/4:** \`is_bootstrap\` RPC, scoped snapshot RPC, proposal RPC, and direct role catalog read each returned **HTTP 401**. Source: \`scripts/verify-role-config-anon.mjs\`, [successful Action](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41017991980).
- Live database integrity after installation: 12 application boards, 0 active dedicated board items, 121 preexisting module-role assignments unchanged, four protected system-role references, 0 new proposals and 0 new audit records before signed test execution. No live role or permission was changed.
- **Still pending:** signed \`lmsenagan\` and \`asenagan\` bootstrap read/write-proposal acceptance, genuine nonbootstrap-admin direct API denial, server workspace mismatch denial, independently reconciled user-signed proposal/audit, and deployed frontend UI acceptance. A console-based, token-safe signed procedure is available in [CP-RC01.1-SIGNED-ACCEPTANCE.md](CP-RC01.1-SIGNED-ACCEPTANCE.md) and independent after-test SQL in \`sql/cp-rc011-acceptance-evidence.sql\`.
- Supabase advisor continues to report general SECURITY DEFINER function warnings across the broader database; the *new* authorized entry points are intentionally available to signed users but restrict every call server-side, with no role/board authorization changes.

**Current milestone:** backend additive installation and real unsigned denial **VERIFIED**; genuine signed account authorization and frontend interaction **PENDING**. **Feature branch and draft PR remain unmerged.** Do not claim that the role UI has been deployed to GitHub Pages.
