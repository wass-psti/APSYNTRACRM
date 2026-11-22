# CP-NATIVE-APP-AUTOSYNC-06 — QA session prerequisites and release review

## Scope and outcome

Implementation branch integrates CP02–CP05 native application registry work with current main and adds a dedicated PR CI validation gate. The synchronization code remains unchanged apart from integration of the current main UI refinements. No data or permission mutations, new Supabase project, or production deployment.

## Verified evidence (November 22, 2026)

- Initial branch head: ff30f9b; upstream main: 3b36e4cdcb4833fce6b0712c6fceb7c8edb9346f.
- Local merge of upstream main into feature: 7983da2, no conflicts. Initial git ancestry showed 0 behind, 5 ahead immediately after integration.
- Full integrated frontend regression: 3,332/3,332 PASS.
- Integrated Vite build: PASS (existing large-chunk warnings).
- App access and assignment workflows continue to use existing module role options, scoped writers, and server-authoritative assignment readback.
- New registered module identifiers are displayed from the signed registry but are not assigned automatically without an application-specific role vocabulary and persistence contract.
- Existing disposable-local SQL registry tests pass transactionally; previous checkpoint confirmed rollback and zero fixture remnants.
- Independently signed nonproduction browser sessions: BLOCKED. No loopback Chromium CDP endpoint was reachable at 9222/9223/9225/9333. Local Auth credential provisioning was previously blocked; do not bypass tool safeguards.
- PR CI workflow: defined in .github/workflows/cp-native-app-autosync-06.yml; CI success must be verified after push/PR, not inferred from local tests.

## Acceptance distinctions

- VERIFIED: local merge compatibility, synthetic role/write/readback tests for existing known modules, registry projection, backend SQL transaction fixture, frontend build, and full frontend regression.
- IMPLEMENTED-UNVERIFIED: push/PR and CI until remote receipt and check results are confirmed.
- PENDING: real separately authenticated administrator and two target profiles in a disposable workspace, signed individual/bulk writes with authoritative readback, cross-browser reconnection, and fixture restoration.
- BLOCKED: assignment to a truly new application without its established role and writer RPC contract. No arbitrary authority has been invented.
- NOT APPLICABLE: production database mutations during this QA/review checkpoint.

## Minimum required signed acceptance

Use an approved existing isolated nonproduction app environment with two independent signed profiles, plus an authorized admin in the same workspace. Confirm application module registration and role vocabulary using its real backend, apply reversible role changes only to QA identities, compare independent authoritative snapshots after refresh and reconnect, revoke test grants, and verify baseline restoration. Do not use production employees as QA targets.

The PR should remain a draft until those checks and relevant deployment review are complete. Do not merge to main or deploy the new registry RPC on the strength of this local evidence alone.
