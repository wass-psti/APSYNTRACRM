# CP-ROLE-NATIVE-APP-ACCESS-02 — Existing-Session Functional Acceptance and Assignment Persistence

**Date:** 2026-11-22 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM`
**Base:** latest `origin/main` at implementation start
**Scope:** existing Native Application Access inside Role Configuration; individual and bulk application assignment write routing and authoritative readback.

## 1. Implementation

The CP-01 interface and existing application-specific RPC contracts were already deployed. CP-02 consolidates the duplicated individual and native-bulk write routing into `frontend/native-application-role-assignment.js`.

- `writeNativeApplicationRoleAssignment()` routes all twelve application IDs through the existing specialized assignment setters or the existing generic role-management RPC.
- Individual and bulk operations now share the same service mapping.
- Existing workspace-source revision handling is preserved for FuelTrans, Fund Tracker, Charter Navigator, the six shared-source applications, and Tool Traceability.
- The six shared-source applications retain their existing generic single-workspace fallback when the scoped contract is unavailable; no new fallback or access grant is introduced.
- `nativeApplicationRoleAssignmentPersisted()` confirms the requested role and enabled state only from a refreshed authoritative assignment snapshot. Revocation is confirmed only when the row is absent or disabled.
- Backend errors remain visible to the existing caller. An RPC acknowledgement alone is not classified as persistence success.

No database migration, SQL function, RLS policy, grant, role hierarchy, workspace membership, permission assignment, or production application assignment was changed.

## 2. Existing signed production session — read-only

The existing browser tab was inspected without signing out, creating a new session, or changing credentials.

- Session indicator: **Secure session**.
- Synchronization indicator: **Live synced**; the earlier reconnecting state was no longer present on the subsequent read.
- Role Configuration and Native Application Access were available in the current workspace.
- Workspace overview: 42 workspace users; 41 active workspace members; 265 accessible boards.
- Native Application Access snapshot: 12 native applications and 390 application assignments.
- The selected member's twelve-row assignment view rendered persisted role states: 10 active, 1 disabled, and 1 unassigned.
- Individual configuration and Batch configuration controls were present.

This is genuine existing-session **read-only** production evidence. It does not claim a post-write production readback.

## 3. Automated persistence and service-routing tests

`frontend/tests/native-application-role-assignment.test.mjs` verifies:

1. All twelve native application IDs route to the correct existing RPC.
2. Source-specific optimistic revision values are forwarded only where the current snapshot identifies that source.
3. The six shared-source applications preserve the existing generic fallback when their scoped contract is unavailable.
4. Missing specialized contracts do not silently switch to a different assignment source.
5. Individual and native bulk UI paths use the same write and readback helpers.
6. A two-member / two-application assignment matrix is read back from a refreshed simulated RPC snapshot.
7. The same matrix is revoked and read back as disabled.
8. Failed RPC calls are not reported as persisted.

The in-memory RPC harness verifies frontend orchestration and readback classification. It is not represented as a live Supabase write.

## 4. Verification

- Focused role/application regression: PASS.
- Full frontend suite: **3,281 / 3,281 PASS**.
- `npm run check`: PASS.
- `npm run lint`: PASS.
- Focused ESLint for changed app/helper/tests: PASS.
- Production Vite build: PASS; existing large-chunk advisory remains nonblocking.
- Repository formatting: PASS.

Disposable PostgreSQL 17 role-setter acceptance is tracked through the existing CP-CRM-URM-INTEGRITY-03 scoped matrix, CP-03T four-native mutation/restoration, CP-URM scoped role, and CP-RC03 MRH workflows.

## 5. Production mutation boundary

No production assignment was written, revoked, or modified during this checkpoint.

The current Work Management workspace is live production data. The previously designated QA Employee account is present in the workspace member list, but it is not a disposable nonproduction assignment fixture. Prior project direction limits role-mutation testing to reversible nonproduction fixtures and prohibits substituting ordinary employee accounts or changing production assignments for acceptance.

The existing FRT acceptance QA workspace has no active memberships. No confirmed same-workspace nonproduction administrator/employee pair and disposable application-assignment fixture were available in the current project state. Therefore a genuine signed post-write production readback cannot be truthfully certified in this checkpoint.

## 6. Disposition

- **IMPLEMENTED:** shared individual/bulk write routing and authoritative readback helper.
- **VERIFIED:** all twelve RPC mappings, source revision handling, assignment/revocation readback classification, full frontend regression and production build.
- **VERIFIED READ-ONLY:** existing signed production session is Secure and Live synced; all twelve application rows and the 390-assignment snapshot are visible.
- **PENDING:** genuine signed post-write individual and multi-member/multi-application bulk persistence readback against an approved nonproduction QA fixture.
- **NOT APPLICABLE:** production role/permission mutation, database migration, new Supabase project, and authorization-model changes.

**Next solid implementation if post-write acceptance is still required:** `CP-ROLE-NATIVE-APP-ACCESS-03 — Approved Nonproduction Assignment Fixture, Genuine Signed Individual and Bulk Write/Readback, Cross-Session Reconciliation, and Final Production Closeout`. It must first use an existing or separately approved nonproduction workspace and two designated same-workspace test identities; it must not write to ordinary production employees or create new accounts/permissions as an implicit test prerequisite.
