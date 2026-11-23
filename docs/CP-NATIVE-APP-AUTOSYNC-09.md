# CP-NATIVE-APP-AUTOSYNC-09 — Existing staging schema recovery assessment

## Disposition

IMPLEMENTED AND LOCALLY VERIFIED. Signed nonproduction acceptance and production deployment remain BLOCKED.

This phase identified and verified an existing, isolated Supabase staging branch instead of creating another project. No staging data, production data, memberships, roles, credentials, or permissions were changed. No SQL migration was applied to staging.

## Verified environment (read-only Supabase inspection)

- Parent project: jtlusodorfnyzgyuewkz (production); existing staging branch: apsyntra-invites-staging, project ref jeqwjlxubntsddeauvqa.
- The staging branch is an invitation/workspace-only foundation: 14 public/private application tables, including profiles, workspaces, workspace_members, and private invitation/workspace tables.
- The Supabase migration ledger contains **zero rows**. Do not assume it is a valid empty clone or replay the entire recovered production baseline over its existing objects.
- Missing CRM application tables: public.work_boards, public.module_role_assignments, and public.apsyntra_role_change_audit.
- Missing RPCs: apsyntra_role_require_scope(uuid), apsyntra_role_user_management_snapshot(uuid), apsyntra_role_manage_user_access(uuid,uuid,text,text,text,boolean,timestamptz), and apsyntra_native_application_registry(uuid).
- Two Auth users and two workspace membership rows were observed, but signed session status, distinct eligible roles, and a separate authorized admin plus two target accounts were NOT established.
- Local disposable Supabase and browser probes similarly lack the complete signed role-management environment.

## Delivered

- scripts/cp-native-app-autosync-09-schema-plan.mjs: credential-free offline staging inventory evaluator, producing ordered missing tables/functions, baseline provenance and signed-session requirements. It cannot execute SQL or alter a role.
- sql/acceptance/cp-native-app-autosync-09-staging-inventory.sql: read-only SQL inspection without personal identifiers or session secrets.
- frontend/tests/cp-native-app-autosync-09.test.mjs: four tests for missing schema, insufficient signed users, actual readiness classification, and malformed evidence rejection.
- Merged latest origin/main into the local feature branch without conflicts. No extra permissions or authority restrictions were introduced.

## Verification

- New schema planning tests: 4/4 PASS.
- Full integrated frontend suite: 3,344/3,344 PASS.
- Vite production build: PASS, with pre-existing bundle-size warnings.
- Prior registry projection SQL lifecycle fixture: verified rollback only, simulated identity claims. No claim of genuine signed acceptance.

## Exact remaining prerequisites

1. Establish a reviewed, reversible **baseline-reconciliation plan** for this existing partially initialized staging branch, preserving private invitation/workspace schema and existing Auth/member data.
2. Install CRM core board, module assignment, role audit and workspace-scope contracts in staging only, with dependency order, migration provenance, SQL checks, and rollback verified first on a disposable clone. Existing production migrations are not safe to replay blindly on this branch.
3. Provide three separately authenticated QA sessions in nonproduction: an authorized admin plus two target members in the same isolated workspace. Their genuine sign-in and eligibility must be independently confirmed.
4. Identify the exact new application's module ID and supported domain role vocabulary. Only install a real persistence writer/readback for that module, never a generic inferred role.
5. Exercise signed individual and bulk changes, independent second-session reload/readback, cross-session updates, conflict/revocation behavior, then restore original fixtures and obtain authoritative readback.
6. Once 1–5 pass, verify PR CI and production migration approval. Do not merge PR #760 or deploy production based solely on the current synthetic/local evidence.

Next checkpoint: CP-NATIVE-APP-AUTOSYNC-10 — Existing Staging Baseline Reconciliation on Disposable Clone, Approved Signed Three-Profile Fixture, New-Module Persistence Contract Activation, and Final Reversible Acceptance.
