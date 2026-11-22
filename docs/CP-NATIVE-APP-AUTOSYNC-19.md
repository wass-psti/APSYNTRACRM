# CP-NATIVE-APP-AUTOSYNC-19 — Auth ownership fidelity and module-writer contract audit

## Disposition

**IMPLEMENTED / LOCAL DATABASE AND REGRESSION VERIFIED.** Read-only staging ownership fidelity and canonical module role-contract comparison are integrated into the existing nonproduction acceptance sequence.

**BLOCKED:** isolated GoTrue startup against the restored staging Auth schema; three genuinely signed users on the *same* staging-clone backend; a verified newly registered module-specific writer; signed individual/bulk HTTP persistence/readback; production release.

No new Supabase project, remote staging/production migration, identity change, role grant, privilege/RLS modification or deployment was performed. No new authorization restrictions were added.

## Grounded staging Auth owner topology, November 22, 2026

The actual existing staging Auth schema is owned by supabase_admin with CREATE available to supabase_auth_admin. All **27 Auth tables and 1 Auth sequence** are owned by supabase_auth_admin. Staging contains **84 Auth migrations** with the CP18-verified checksum.

The CP15 schema-only local restore intentionally omits 78 managed ALTER OWNER statements and 12 managed default privileges. Schema structure matches staging, but the restored Auth owners do not. On the shared disposable PostgreSQL cluster, postgres cannot assume supabase_auth_admin without changing global role membership. CP19 does not perform such changes or broaden permissions.

The new sql/acceptance/cp-native-app-autosync-19-auth-ownership.sql performs a read-only clone-specific inventory. scripts/cp-native-app-autosync-19-ownership.mjs compares it against the staging baseline. Direct execution handles the macOS /tmp vs /private/tmp path alias correctly. CP15 now always runs this preflight before synthetic fixtures, diagnosing mismatched owner fidelity while still allowing independent SQL regression testing.

Observed local results:
- CP19_AUTH_OWNER_FIDELITY=BLOCKED.
- 27 Auth tables and 1 sequence observed.
- Auth schema, table and sequence ownership differ from staging.
- postgres cannot assume the local Auth owner role.
- Disposable clone, source dump and lock removed.

## Canonical role-writer vocabulary

scripts/cp-native-app-autosync-19-contract-parity.mjs reads the shipped MODULE_ROLE_OPTIONS and the original installed wm_admin_set_application_role source from the **existing local disposable CRM database**. It compares all 12 named module IDs and exact role vocabularies.

**11/12 modules match.** Toolbox Issues differs:
- Frontend: admin, supervisor, employee, viewer.
- Canonical workspace role writer: team_leader, secretary, standard.

Toolbox Issues may use a distinct domain-specific writer. CP19 reports the difference rather than silently changing the frontend, modifying role permissions or assuming the wrong writer.

The existing connected staging branch lacks a native application registry, work_boards catalog and canonical CRM writer. The inspected local catalog has no verified newly registered board-backed module. No new module ID, role vocabulary or specific domain writer has been fabricated.

## Executed acceptance

- CP19 Auth owner-fidelity read-only preflight: VERIFIED (correctly reports blocked).
- CP19 role vocabulary cross-layer inventory: VERIFIED (12 existing modules, 11 exact matches).
- CP19 focused Node tests: 8/8 PASS.
- Actual staging schema clone, migration fingerprint and constraint validation: PASS.
- CP15 synthetic three-connection persistence and cleanup: PASS.
- CP16 original TimeTracker writer assign/readback/update/denial/revoke/audit: PASS.
- CP17 original two-member Order Intake and TimeTracker SQL persistence, readback and denials: PASS.
- Disposable clone deleted and original local source assignments unchanged (0 rows).
- CP18 genuine local GoTrue sign-ins remain verified **separately**; no joined signed HTTP role write/readback on the staging clone was completed.

## Next solid implementation if still blocked

**CP-NATIVE-APP-AUTOSYNC-20 — Isolated Auth Owner-Compatible Database Bootstrap, Explicit Registered Application Contract Selection, and Genuine Signed Three-Profile Writer-to-Reader Acceptance.**

Use an isolated database context that can reproduce staging's managed Auth ownership without modifying global roles on the shared developer DB. Select a concrete newly registered application with explicit roles and existing writer/reader. Execute genuine signed individual/bulk changes, independent readback, audit, denial and exact restoration on one backend. Keep draft PR #760 unmerged until release evidence is complete.
