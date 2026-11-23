# CP-NATIVE-APP-AUTOSYNC-04 — Registry lifecycle and assignment acceptance

## Result

**IMPLEMENTED — LOCALLY VERIFIED; SIGNED NONPRODUCTION ACCEPTANCE PENDING**

- The native application registry remains the existing canonical work_boards marker projection from CP03.
- Entry into Role Configuration → Native Application Access now fetches a fresh signed registry snapshot. Other role tabs retain existing behavior and avoid extra registry queries.
- Existing native individual and bulk assignment writers and readback behavior remain unchanged. New application identifiers lacking a known domain role contract are discoverable but cannot be assigned, because inventing a role would not create a functional application backend.
- No role-grant migration, permission policy, additional registry table, new Supabase project, production data modification, or deployment was introduced.

## Changed files

- frontend/app.js: refresh signed role-management and native catalog when entering Native Application Access.
- frontend/tests/cp-native-app-autosync-04.test.mjs: simulated two-profile individual/bulk persistence and readback, unsupported module behavior, rename and removal, and navigation refresh checks.
- scripts/cp-native-app-autosync-04-local-acceptance.sh: disposable local SQL registry acceptance in a transaction ending with ROLLBACK; refuses database containers not explicitly named disposable-local.

## Executed verification

- Full frontend regression: **3,324 tests PASS, zero failures**.
- Vite build: **PASS** (existing large-chunk warning).
- Syntax and git diff --check: **PASS**.
- Disposable local PostgreSQL lifecycle: **PASS** for two simulated identity claims, registration, rename, duplicate reconciliation, deactivation, and unrelated-identity rejection. The fixture uses a temporary local role-scope function and existing disposable workspace profile IDs; it is not a genuine browser session or a production authorization test.
- Post-rollback readback: zero remaining qa-new-app boards; local temporary registry and scope functions absent.

## Why full acceptance is pending

1. The available connected Supabase project is the existing APSYNTRA CRM production project. An approved, isolated, genuinely signed nonproduction app environment with a matched administrator and two independent target accounts has **not been verified**.
2. The CP03 read-only registry RPC migration has not been applied to production, so a production signed browser test cannot exercise the new contract.
3. No arbitrary new application's domain-specific role vocabulary and persistence RPC were supplied. The existing twelve native application assignment routes are preserved; new module registration alone cannot define or validate new roles.
4. No signed two-profile role mutation, reload/reconnect, second-window readback, assignment reversal, and independent acceptance was performed.

## Next focused phase

**CP-NATIVE-APP-AUTOSYNC-05 — Approved Nonproduction Signed QA Fixture and Native Module Role Contract Activation, Two-Profile Persistent Assignment Acceptance, Cross-Window Revalidation, and Production Release Gate.**

Use an authorized nonproduction environment and isolated real signed accounts. First confirm the native application's actual roles and existing writer RPC; make only its necessary compatible changes. Activate reviewed registry projection there, run genuine signed individual and bulk changes with independent readback, and restore reversible fixtures. Preserve existing role policies and review/CI/deployment requirements. Do not treat synthetic identity claims as signed-user acceptance.
