# CP-NATIVE-APP-AUTOSYNC-05 — Cross-session catalog synchronization and release gate

Disposition: IMPLEMENTED / LOCALLY VERIFIED; SIGNED ACCEPTANCE AND PRODUCTION RELEASE BLOCKED.

## Implementation

- Native Application Access now responds to existing authoritative board-change invalidations while the role-configuration application-access tab is visible.
- Broadcast hints only trigger a new signed server snapshot. They cannot modify application or assignment state directly.
- A 15-second cooldown and existing busy-state check bound duplicate requests. Role configuration, board workflows, and unrelated tabs do not perform new catalog reads.
- Manual refresh, tab-entry refresh, window focus, and visibility revalidation remain available; there is no new background worker or polling loop.
- No new application-role definitions, assignment storage, RLS policies, grants, user roles, or Supabase projects were created.

## Verification executed November 22, 2026

- Full Node frontend regression suite: 3,327 / 3,327 PASS.
- Vite build: PASS with pre-existing large chunk warnings.
- New focused broadcast synchronization tests: 3 PASS.
- Disposable local SQL lifecycle: PASS for two simulated identity claims, registration, rename, duplicate marker resolution, deactivation, and unrelated-identity rejection.
- Post-rollback disposable readback: zero QA application boards; temporary registry and scope functions absent.
- JavaScript syntax and Git diff checks: PASS.
- Remote main: 3b36e4cdcb4833fce6b0712c6fceb7c8edb9346f. The feature branch was five commits behind tracked origin/main when checked; integration needs a fresh compare and conflict check.
- Open PRs with head cp-native-app-autosync-05: none.
- Probed local signed-browser CDP ports 9222–9227 and 9333: no reachable endpoint.

## Unresolved acceptance prerequisites

1. Real signed nonproduction QA accounts: no verified, isolated administrator plus two independently signed member profiles in a supported nonproduction browser environment. An attempt to provision local Auth credentials was blocked by tool safeguards; no alternative credential extraction or bypass was used.
2. Native assignment contract for a newly registered application: registering a canonical board marker does not define that application's role vocabulary, signed writer, or persistence schema. Its application-specific contract must be identified and activated before assignment can succeed. Existing twelve-module writers remain unchanged.
3. Registry RPC deployment: the read-only CP03 registry migration remains unactivated in production. The local disposable SQL test is not production acceptance.
4. Signed runtime acceptance: actual individual/bulk writes and readbacks, another signed profile, separate browser windows, reconnection, and reversible restoration remain PENDING. Simulated identity claims and mocked assignments must not be described as genuine signed acceptance.
5. Release integration: reconcile with latest main, run branch CI/review, activate reviewed registry RPC in approved nonproduction environment, and verify live signed reads/writes before production deployment.

## Handoff: minimal reproducible next actions

- Provide an authorized existing nonproduction deployment or isolated QA configuration using two independent signed accounts with applicable workspace membership; do not create a new Supabase project without separate instruction.
- Identify one genuinely new registered application's module ID and pre-existing role/assignment API, or specify the target backend contract. Do not invent roles or weaken existing application enforcement.
- Execute node scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs with two existing independently signed CDP browser contexts, then signed individual/bulk writes and authoritative readback against disposable nonproduction fixtures.
- Revert only test-created records and confirm independent signed restoration before release.

Proposed next checkpoint if these prerequisites remain unresolved:
CP-NATIVE-APP-AUTOSYNC-06 — Existing Nonproduction Signed QA Session Enablement, New Module Role-Contract Verification, Reversible Two-Profile Persistence, and CI/Merge Readiness.
