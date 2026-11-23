# CP-NATIVE-APP-AUTOSYNC-08 — Nonproduction backend readiness

## Disposition

IMPLEMENTED / LOCALLY VERIFIED; NONPRODUCTION ROLE ACTIVATION AND FINAL SIGN-OFF BLOCKED BY MISSING BACKEND PREREQUISITES.

No production role, schema, permissions, or user data changed. No new Supabase project was created.

## Existing Supabase staging branch (read-only inspection, November 22, 2026)

- Existing development branch: apsyntra-invites-staging, project ref jeqwjlxubntsddeauvqa. Production parent ref: jtlusodorfnyzgyuewkz.
- The staging database has two Auth users and two workspace-member rows, which does not establish three independently signed QA participants.
- Missing required tables: public.work_boards, public.module_role_assignments, public.apsyntra_role_change_audit.
- Missing workspace scope guard: apsyntra_role_require_scope(uuid).
- Missing RPCs: apsyntra_role_user_management_snapshot(uuid), apsyntra_role_manage_user_access(uuid,uuid,text,text,text,boolean,timestamptz), and apsyntra_native_application_registry(uuid).
- Installing only the read-only catalog RPC would not supply functional assignments. Do not apply an unreviewed production migration chain to the partial staging schema.
- Mac CDP endpoints 9222, 9223, 9225, 9226 and 9333 were not reachable. The local disposable database also lacks the signed role RPC stack.

## Delivered

- scripts/cp-native-app-autosync-08-readiness.mjs: credential-free 13-gate evidence assessment. It makes no RPCs, does not handle tokens, and never automatically approves production activation.
- frontend/tests/cp-native-app-autosync-08.test.mjs: four tests for incomplete staging, unsupported module roles/writers, review-only completed evidence, and invalid inputs.
- No new role grants, mappings, policies, migrations, or production changes.

## Verification

- New readiness tests: 4/4 PASS.
- Full frontend regression: 3,339/3,339 PASS.
- Vite build: PASS (pre-existing large asset warnings).
- Source migration manifest integrity: 222 recovered baseline and 54 forward migrations PASS.

## Next necessary acceptance

1. Reconcile the existing staging schema baseline and restore canonical board, module assignment, role audit, scope guard, and signed RPCs through a reviewed nonproduction migration plan.
2. Obtain a genuine signed administrator plus two independent QA member sessions in that staging workspace.
3. Define a specific newly registered application's existing or reviewed new role vocabulary, assignment writer, and authoritative readback. Registration alone does not authorize assignment.
4. Record initial QA assignments; verify individual/bulk signed writes, independently authenticated cross-session refresh/reconnect readback, concurrency and failure behavior, then restore initial records and verify their readback.
5. Only after real acceptance, complete pull-request and production release review.

Recommended next checkpoint: CP-NATIVE-APP-AUTOSYNC-09 — Existing Staging Schema Baseline Recovery, Approved Three-Profile Signed QA Provisioning, New-Module Role Contract Installation, and Reversible End-to-End Assignment Acceptance.
