# CP-NATIVE-APP-AUTOSYNC-17 — Existing-module two-member role persistence and Auth readiness

## Disposition

**IMPLEMENTED AND LOCALLY VERIFIED:** canonical CRM role writer assignments for two different synthetic workspace members and two existing modules, using the real exported staging-schema clone, original source writer, persisted readback, immutable audit and negative cases.

**BLOCKED:** full existing-staging CRM baseline, genuine three-profile GoTrue sessions, any newly registered module writer, signed browser write/readback and production release.

No staging/production database changes, no new Supabase project, no new user roles, and no additional authorization restrictions.

## Functional acceptance

Run: CP16_LOCAL_WRITER_PROBE=1 CP17_LOCAL_BULK_PROBE=1 bash scripts/cp-native-app-autosync-15-staging-clone.sh

The CP15 runner exports schema-only from the existing staging environment to a temporary local PostgreSQL clone. CP16 installs the exact pre-existing source role writer and workspace-scoped role/audit tables in the clone. CP17 restores the *synthetic* second workspace membership previously deleted in CP15 cascade tests; the original wm_admin_set_application_role writes both existing roles in one transaction:

- Member 2: Order Intake / User / enabled.
- Member 3: TimeTracker / Employee / enabled.

A second independent PostgreSQL session verifies the two persisted canonical rows and an Order Intake grant audit. A third session tests that a synthetic nonadministrator cannot assign another member's role and that the existing writer rejects a role change to an inactive member. That denial transaction rolls back. A fourth session confirms the denied writes did not change accepted assignments or add audit records, and checks the canonical CRM snapshot/registered-module backend is still absent. The CP15 teardown deletes the temporary database and source exports.

**Limit:** Synthetic request JWT claims are *not* genuine signed sessions. These two modules and role vocabularies already exist. This is not proof that a new arbitrary module is assignable, nor a signed HTTP or application/browser acceptance.

## GoTrue three-session feasibility (attempted, not accepted)

The original nonproduction GoTrue v2.197.0 Docker image was started in an ephemeral local container pointed exclusively at the disposable clone. A schema-only restore leaves auth.schema_migrations empty; inserting the existing **local** Auth service's migration-version ledger still did not allow startup. The temporary service entered its first migration (00_init_auth_schema.up.sql) against already-restored staging Auth tables. Clone-only Auth schema grants did not resolve it.

The live staging Auth migration maximum observed on November 22, 2026 is 20261030120000; the installed local GoTrue service's migration maximum is 20260831180000. They are not equivalent migration baselines. Consequently it would be misleading or unsafe to copy the older ledger as authoritative, skip migrations, disable Auth verification or claim three signed QA profiles. The experimental GoTrue startup helper was deliberately **not committed**. No genuine accounts were created. All temporary Auth containers, schema files and databases were removed.

The live existing staging backend still has two Auth users, two memberships, zero CRM tracked migrations, and lacks public.work_boards, public.module_role_assignments, canonical workspace-role writer, CRM snapshot and registered-module RPC.

## Acceptance classification

- VERIFIED: actual staging schema restore, existing source writer/role vocabulary, two-member SQL persistence, independent readback/audit, nonadmin denial, inactive-target denial, rollback and clone teardown.
- IMPLEMENTED: CP17 four-stage backend acceptance and regression coverage.
- BLOCKED: complete compatible CRM baseline activation, genuinely signed administrator and two nonproduction members, explicit new-module domain writer, live individual/bulk signed role writes, browser reload/reconnect and signed rollback.
- NOT APPLICABLE: production deployment, remote migration or user-role/permission changes.

## Next checkpoint if blocked

**CP-NATIVE-APP-AUTOSYNC-18 — Staging-Version-Compatible Isolated GoTrue Bootstrap, Genuine Signed Three-Profile QA, and Named New-Module Role Contract Activation.**

Use an Auth runtime/schema migration baseline compatible with the **existing staging Auth schema**, without transplanting an older ledger or altering live Auth. Then establish three real nonproduction signed QA profiles, identify a concrete newly registered module with authorized role vocabulary and an actual server writer/reader, verify signed individual and batch changes plus independent readback/restoration. Preserve existing workspace/invitation functions and leave draft PR #760 unmerged until proof exists.
