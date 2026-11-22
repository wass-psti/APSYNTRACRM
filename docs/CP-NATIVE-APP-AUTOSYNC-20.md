# CP-NATIVE-APP-AUTOSYNC-20 — Isolated owner-preserving staging database and registration readiness

## Disposition

**VERIFIED:** A separate PostgreSQL 17 database container can restore actual existing-staging Auth ownership with no changes to any shared, production or remote database roles. The owner topology matches 27 Auth tables, one sequence and the Auth schema's official ownership. The container is removed after verification. A read-only registration preflight detects that no new board-backed application has been registered in the inspected local CRM backend.

**BLOCKED:** Genuine GoTrue signed sessions on this standalone owner-faithful database, an explicitly registered new module with an approved role vocabulary and writer/reader, and three-profile signed writer-to-reader acceptance. No production deployment is authorized by this checkpoint.

## Database architecture and safety

scripts/cp-native-app-autosync-20-isolated-owner-clone.sh creates one temporary postgres:17-alpine container named cp_native20_pg_owner_qa with Docker network **none**, a randomly generated temporary database password and no persistent volume. It refuses to overwrite any existing matching container. Only containers created in the same run are eligible for cleanup.

The script uses the existing linked staging project's schema-only Supabase CLI export; no Auth users, sessions, emails or credentials are copied. It validates the known 78 object-owner declarations and 12 managed default-privilege declarations. In the standalone cluster it creates minimal **NOLOGIN** local role shells so the original object ownership declarations can be restored. It omits platform GRANT, REVOKE and default-privilege declarations that require full platform role provisioning; these omissions are **only** in the temporary restore, not the staged schema.

sql/acceptance/cp-native-app-autosync-20-owner-clone.sql verifies:
- Only the dedicated cp_native20_owner_clone database is accepted.
- auth schema owner is supabase_admin.
- 27 Auth tables and one Auth sequence are owned by supabase_auth_admin.
- No real Auth user records are present.

The SQL is executed via psql stdin (rather than an unconnected file descriptor) with ON_ERROR_STOP=1, so the ownership verification actually runs. All temporary SQL files, randomly generated passwords, Docker resources and run lock are removed after the command.

**Scope:** This proves owner-definition fidelity, not full platform grant/role topology or live GoTrue runtime compatibility. The standalone database currently has no connected Auth HTTP service. The attempt to add an isolated credential-handling GoTrue launcher was blocked before execution and was **not shipped**.

## Registered module selection

scripts/cp-native-app-autosync-20-registered-contract.mjs reads active, nonarchived board registration descriptors from the installed disposable local CRM work_boards table and compares their module IDs against the existing frontend role vocabulary. A new ID cannot be considered ready without an explicit role list and verified server writer/reader; this selector never writes assignments or adds a default role.

Actual local inventory: **zero** active board-backed registration descriptors. The existing connected staging branch also lacks the canonical Boards, native application registry and role writer. Therefore there is no actual registered-new-module contract to activate or assign. Existing 12 application module IDs are not labeled as newly registered.

## Implementation constraints and evidence

No gradient descent, backpropagation, weight-update steps, training loops, model retraining, or fine-tuning was added or executed. No new dependencies were installed. The application and any inference-only behavior remain unchanged. Focused tests statically check the new CP20 source for training mechanisms.

- Focused CP20 Node tests: 8/8 PASS.
- Standalone network-isolated PostgreSQL 17 startup: PASS.
- Actual staging schema-only export and owner-preserving restore: PASS.
- Source owner declarations: Auth schema owner, 27 tables and one sequence PASS.
- Platform ACLs: intentionally omitted in standalone owner-fidelity test; full fidelity NOT VERIFIED.
- Existing CP15–19 staging-clone and canonical-writer SQL test evidence remains independent, not signed HTTP acceptance.
- Genuine CP18 local GoTrue identities remain **separate** from the CP20 staging owner clone; no signed end-to-end writer acceptance exists.
- Staging/production users, credentials, roles, permissions, records and migrations untouched.
- Production release: PENDING.

## Next solid implementation if still blocked

**CP-NATIVE-APP-AUTOSYNC-21 — Owner-Compatible Isolated GoTrue Runtime, Actual Registered-Module Domain Contract, and Three Genuine Signed Role-Write/Readback Acceptance.**

Use the now-verified owner-preserving standalone schema clone. Establish an isolated nonproduction Auth and Data API runtime only through supported, reviewed secret-handling mechanisms; verify three real independently signed QA profiles in that **same** database. Select an actual newly registered module with role vocabulary and authoritative server writer/reader, then perform signed assignment, denial, audit, independent readback, revocation and reversible cleanup. Preserve production and the existing staging service. Keep PR #760 draft until genuine acceptance is complete.
