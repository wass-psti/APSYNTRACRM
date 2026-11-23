# CP-NATIVE-APP-AUTOSYNC-24 — Actual Auth signup failure and three-profile signed connectivity

## Disposition

**IMPLEMENTED / VERIFIED IN A DISPOSABLE BACKEND:** The CP23 isolated GoTrue signup HTTP 500 was traced to a missing **USAGE on schema auth** for the original staging Auth table owner role `supabase_auth_admin`. The CP20 owner-preserving restore omitted Supabase-managed GRANT statements intentionally, so an object owner lacked required schema access when GoTrue performed actual signup operations. Restoring only that permission **inside the disposable clone** allowed three genuine GoTrue signups, password sign-ins and signed `/user` readbacks.

**IMPLEMENTED / VERIFIED IN THE SAME DISPOSABLE BACKEND:** The next HTTP 401 from signed PostgREST calls was traced to a **JWT algorithm/config mismatch**. The source local GoTrue service supplied `GOTRUE_JWT_KEYS` and signed **ES256**, while the temporary PostgREST runtime expected the generated symmetric JWT secret. The disposable GoTrue keyset is now explicitly `[]`; both GoTrue and PostgREST use one newly generated temporary signing secret. The QA JWT is HS256 with role/audience `authenticated`, and the authenticated PostgREST request passes. No source signing keys or accounts are copied to the disposable runtime.

**BLOCKED:** No authoritative newly registered board-backed module or module-specific role writer/reader exists in the inspected staging backend. Therefore signed role assignment/write/readback/denial/audit/revocation is **NOT VERIFIED** and no production release is certified.

## Root-cause verification sequence

1. Existing-staging schema-only export into standalone PostgreSQL 17, original owner restoration, Auth schema/27 tables/one sequence ownership and 84 migration-version fingerprint: PASS.
2. GoTrue + PostgREST on a shared Docker internal-only network and **same disposable database**: HTTP health 200/200 PASS.
3. Initial real signup: HTTP 500; original CP23 log capture read only Docker stdout and could not classify the problem.
4. CP24 sanitizes both Docker stdout and stderr, PostgreSQL logs and structured HTTP error codes. The decisive error class was **permission denied**, with the specific denied object **schema:auth**.
5. A separate minimal synthetic Auth INSERT under a database transaction succeeded and was always ROLLED BACK. This demonstrates the basic trigger chain works, but does not substitute for GoTrue signup.
6. Clone-only `GRANT USAGE ON SCHEMA auth TO supabase_auth_admin` resolved real signup. No shared database or staging/production permission changed.
7. Three unique genuine GoTrue signups, password sign-ins, independent signed `/user` identity readbacks on the same clone: PASS.
8. First signed PostgREST request: HTTP 401. A safe JWT-header inspection revealed **ES256** from the source Auth keyset despite temporary PostgREST's symmetric signing configuration.
9. Reset **only disposable** `GOTRUE_JWT_KEYS` to `[]`, preserve generated `GOTRUE_JWT_SECRET` and matching `PGRST_JWT_SECRET`. Retest: JWT **HS256**, audience/role **authenticated**, and signed PostgREST request: PASS.
10. All temporary Auth records, database, signing credentials, containers, internal network and run lock destroyed by the existing cleanup. Existing source records unchanged.

The isolated QA HS256 signing configuration is not a claim that production/staging must switch algorithms; production signing configuration was neither read out nor changed. The point is a coherent, independent, disposable signing configuration.

## Files and runtime behavior

- `scripts/cp-native-app-autosync-20-isolated-owner-clone.sh`: opt-in `CP24_AUTH_SCHEMA_USAGE_PROBE=1` allowed only in the existing `CP23_DISPOSABLE_RUNTIME_PROBE=1` disposable branch. Default CP20 owner-only mode retains no Docker networking or added grant. PostgreSQL readiness monitoring is deterministic and reports an object-free startup class if it cannot initialize.
- `sql/acceptance/cp-native-app-autosync-24-signup-trigger-probe.sql`: optional `CP24_SIGNUP_SQL_PROBE=1` uses a synthetic Auth email and always ROLLBACKs.
- `scripts/cp-native-app-autosync-23-disposable-runtime.py`: stdout/stderr diagnostic classification, actual three-profile independent Auth verification *before* Data API acceptance, safe non-identifying JWT metadata, explicit removal of inherited asymmetric signing keys, and signed PostgREST call on the same isolated backend.
- `frontend/tests/cp-native-app-autosync-24.test.mjs`: ten focused regression tests including no-training source checks.

## No new authority restrictions or model training

No new CRM RBAC/RLS policy or permission restriction was introduced. The only SQL GRANT is opt-in, executed in a standalone disposable PostgreSQL container and removed with the container. Existing audit triggers, source users, source roles, credentials, and connected staging/production data are untouched.

No gradient descent, backpropagation, model training, iterative weight-update loop, retraining, fine-tuning or training dependency was introduced or executed. The original inference-only application architecture remains unchanged.

## Outstanding module acceptance and release

A registered new-module ID, explicit role vocabulary, server writer and authoritative reader must be observed in the actual application contract before assigning roles. Existing pre-defined modules are not an acceptable substitute for a newly registered one. The connected staging branch has previously been verified to lack the native application registry and canonical workspace writer; this must be rechecked on activation.

Three signed Auth profiles and signed Data API JWT connectivity now PASS in the same disposable database. **They did not execute canonical application role writes.** Signed role assignment/batch, readback, denial, audit, revocation and restoration remain separate, unverified acceptance gates. Keep PR #760 draft, unmerged and undeployed.

## Next solid implementation if blocked

**CP-NATIVE-APP-AUTOSYNC-25 — Genuine Registered-Module Contract Activation, Signed Three-Profile Workspace Role Writes, Independent Readback and Audit/Revoke Acceptance.**

Identify an actual newly registered module and its role contract in a reversible nonproduction environment. Install/activate its authoritative writer/reader using existing approved module-contract conventions without inventing roles or weakening RLS. Reuse the now-working isolated GoTrue/PostgREST QA runtime to assign two members from a separately signed administrator, verify independent readback/audit/denial/revocation, then restore every fixture. Do not promote PR #760 until all required signed application-level acceptance gates pass.
