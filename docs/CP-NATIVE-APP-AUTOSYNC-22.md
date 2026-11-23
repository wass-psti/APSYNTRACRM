# CP-NATIVE-APP-AUTOSYNC-22 — Deterministic Owner-Clone Diagnostics and Runtime Readiness

## Decision and scope

**IMPLEMENTED AND VERIFIED:** The isolated, staging-owner-preserving PostgreSQL 17 clone successfully restored and verified the Auth object-owner topology again in CP22. A deterministic non-mutating diagnostic channel now identifies the failing stage and error category before cleanup. Read-only GoTrue/PostgREST integration prerequisites and actual board-backed module registration remain explicitly blocked.

**NOT ACCEPTED:** GoTrue login to the same staging owner clone, an actual new registered module with server-side role writer/reader, and three independently signed role writes/readbacks. No JWT or signed writer results are invented.

No change was made to production, connected staging, shared local database roles/permissions/users, Auth configuration or the application runtime. No new Supabase project or unrelated access restrictions were added.

## Root-cause analysis and recovery evidence

CP21 had reported a nonzero rerun of `scripts/cp-native-app-autosync-20-isolated-owner-clone.sh` without preserved failure diagnostics. The exact historical failure cause is **unknown**, not proven to be an Auth ownership issue. CP22 instruments the original runner with explicit operation-stage tracking, safe classification (missing disposable role, ownership/permission, object conflict, connection, timeout, PostgreSQL error), and failure exit status. Only category/stage are emitted; passwords, URLs, tokens and schema are not dumped. The existing cleanup removes only resources created in the current run.

Fresh CP22 execution:
- Standalone PostgreSQL 17 container with Docker `--network none`: PASS.
- Read-only existing-staging schema-only export: PASS.
- Staged 78 object-owner declarations retained: PASS.
- Platform-managed ACL/default-privilege statements omitted **only** in the disposable owner test: PASS.
- Original staging Auth schema owner `supabase_admin`, 27 tables and 1 sequence owned by `supabase_auth_admin`: PASS.
- Temporary container and lock cleanup: PASS.

This establishes **owner fidelity**, not a full Supabase platform grant topology or running Auth service.

A second, deliberately injected `--diagnostic-self-test` fails before Docker/network/staging activity and proves the error stage, error class and return code are output and the run lock is removed. This controlled expected failure is a successful diagnostic test, not an owner-clone failure.

## Supported service readiness and module contract

`scripts/cp-native-app-autosync-22-runtime-preflight.mjs` reads Docker metadata and nonproduction database information without outputting secrets or changing services. It inspects the installed original images:
- GoTrue `public.ecr.aws/supabase/gotrue:v2.197.0`.
- PostgREST `public.ecr.aws/supabase/postgrest:v16.4`.
- Existing local Auth migration ledger 82 entries, vs 84 independently verified for connected staging.
- Active, nonarchived board-backed module descriptors in the installed local CRM: 0.

Actual result: `CP22_RUNTIME_INTEGRATION=BLOCKED`. Current GoTrue and PostgREST still connect to the **shared existing local Supabase database**, not the now-owner-compatible disposable database. Their compatibility, signed health, and JWT-backed role writer/readback against the isolated clone remain unverified. The existing backend has no genuinely newly registered module with a confirmed role vocabulary and domain writer. This check requires actual same-backend targeting, compatible migrations, healthy services and explicit module contracts before it can declare runtime readiness.

The original source audit/history policy remains untouched. CP21 documented why using the shared local source for temporary canonical role writes would create immutable audit records and could not be safely cleaned up just by removing QA users.

## Tests and change constraints

Focused CP22 regression covers:
- Exact isolated GoTrue and Data API target matching and independent health checks.
- Auth version/ledger compatibility.
- Real new-module registration plus verified role contract.
- Diagnostic stage/error output and safe cleanup.
- A real executable self-test exercising failure/lock teardown with no external services.
- Static absence of new model-training or optimizer entry points.

No gradient descent, backpropagation, weight updates, model training, retraining, fine-tuning or dependencies were added or executed. The inference-only application behavior is unchanged.

## Outstanding acceptance

The remaining user-requested signed end-to-end objective still requires a supported Auth + Data API runtime connected to the **same** disposable owner-compatible database, three genuinely independent signed identities, a real board-backed newly registered module with approved roles and a functioning writer/reader, followed by individual/bulk writes, independent signed readback, authorization denials under existing policy, audit verification, revocation and exact teardown. None are certified by CP22 owner restore alone.

Keep draft PR #760 unmerged and production untouched.

## Next logically necessary solid implementation

**CP-NATIVE-APP-AUTOSYNC-23 — Disposable Same-Database GoTrue/PostgREST Runtime Activation, Authoritative Registered-Module Provisioning, and Three-Session Signed Writer Acceptance.**

Only proceed with real signed acceptance once GoTrue and Data API are genuinely healthy on a single disposable backend and an authoritative module role contract exists. Do not fake migration history, copy existing user credentials, alter global/shared roles, disable audit triggers, or add arbitrary role mappings.
