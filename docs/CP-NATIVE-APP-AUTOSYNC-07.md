# CP-NATIVE-APP-AUTOSYNC-07 — Native registration, role-contract and signed QA acceptance

## Disposition

IMPLEMENTED AND LOCALLY VERIFIED — GENUINE SIGNED ACCEPTANCE BLOCKED, PRODUCTION SIGN-OFF PENDING.

This checkpoint continues draft PR #760. It does not alter application-role vocabulary, schema constraints, backend authorization, existing assignments, workspace membership, or production deployment.

## Contract findings

1. The existing canonical board registration marker is projected by the unactivated read-only apsyntra_native_application_registry migration.
2. The original signed apsyntra_role_manage_user_access RPC only accepts twelve explicit module IDs. The module_role_assignments_module_id_check and valid_module_role SQL constraints also enumerate those IDs/roles. A newly registered board cannot be persistently assigned using those existing contracts without an explicitly developed application-specific role and assignment backend.
3. The frontend already uses the existing role writers and continues to disable unsupported module assignment changes. This phase clarifies the display to Registered — assignment contract unavailable so discovery is not mistaken for assignability.
4. Existing role vocabularies and assignment writers were preserved; no invented role mappings or new authority were added.

## Executed evidence (November 22, 2026)

- Repository branch was clean at draft PR #760 head 3d84323 before this checkpoint. Tracking showed zero behind and eight ahead of origin/main.
- New focused discovery/role-contract tests: 2/2 PASS.
- Full frontend regression: 3,335 / 3,335 PASS, zero failures.
- Vite build: PASS with pre-existing large chunk warnings.
- Migration manifest integrity: PASS, 222 recovered baseline and 54 tracked forward migration checksums.
- Real unsigned Chromium first paint and startup modules: PASS, baseline 248 vs optimized 230 (reduction 18); login UI remains available.
- Local disposable registry SQL fixture: PASS, rolled back. It uses simulated identity claims and does not qualify as genuine authenticated browser acceptance.
- Existing local disposable database RPC readiness: all three required APIs (apsyntra_native_application_registry, apsyntra_role_user_management_snapshot, and apsyntra_role_manage_user_access) were absent. Do not install unrelated production migrations merely to manufacture acceptance.
- No independent approved signed Chromium CDP sessions were reachable at local endpoints 9222, 9223, 9225, 9226, or 9333.
- No authorized independent signed nonproduction administrator plus two target profiles and no newly registered application's role/writer contract were identified.
- No production permission, credential, user, workspace, or schema modifications; no fixture records requiring reversal.

## Minimum reproducible remaining acceptance

1. Identify an existing approved nonproduction deployment of the complete APSYNTRA CRM signed backend with the reviewed catalog RPC; do not create a new Supabase project.
2. Use scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs to verify independently signed browser profiles and workspace identity without handling credentials. Include a third authorized admin session if necessary for two distinct assignment targets.
3. Select a real newly registered module with a documented role vocabulary, server writer API, and authoritative readback. Develop/activate those specific contracts in isolated nonproduction, preserving established scopes and policies.
4. With disposable authorized nonproduction accounts, capture original assignment records; exercise individual and bulk writes, read from both signed sessions after reload and reconnect, and restore exactly original state with fresh authoritative receipts.
5. Recheck all PR #760 CI, branch parity, reviewer requirements, and database-migration approval before production merge and deployment. No signed validation, merge, or deployment may be inferred from static/synthetic tests.

## Status

- IMPLEMENTED: clear unsupported-contract UI state.
- VERIFIED: source contract inspection, unit/regression, SQL fixture, build, migration integrity and anonymous browser test.
- BLOCKED: signed multi-profile assignment acceptance and new module backend role contract.
- PENDING: full production sign-off, merge and deployment.
