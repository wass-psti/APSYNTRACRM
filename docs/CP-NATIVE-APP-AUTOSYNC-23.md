# CP-NATIVE-APP-AUTOSYNC-23 — Actual disposable same-database GoTrue/PostgREST connectivity

## Disposition

**IMPLEMENTED AND VERIFIED:** Existing-staging Auth schema owner topology, 84-version migration fingerprint, and genuine HTTP 200 health responses from GoTrue v2.197.0 and PostgREST v16.4 **against the same disposable PostgreSQL 17 database** on a Docker internal-only network.

**BLOCKED:** Three genuine signed signup/sign-in sessions on that database, authoritative new-module registration and role writer, signed role write/readback/denial/audit/revocation and production acceptance. The exact signed API failure is GoTrue **POST /signup → HTTP 500**. The cause is not yet established; it must not be misclassified as a JWT or application role problem.

No new Supabase project, live staging/production change, shared local Auth record/role/permission change, extra authority restriction or model training was introduced. No production deployment or PR merge is authorized by CP23.

## Engineering rationale and architecture

Prior CP20–22 validated staging Auth owner restoration but GoTrue and PostgREST remained connected to the existing shared developer database. CP23 adds an opt-in integration probe to the already verified owner-preserving clone.

To avoid the failed network reconnect attempt, CP23 creates the isolated **internal-only** Docker network before the disposable PostgreSQL instance is started. The normal CP20 owner-only command still uses `--network none`. During the opt-in runtime probe, the owner clone, temporary GoTrue and PostgREST containers start together on `cp_native23_internal_qa` with **no published ports**.

The opt-in command is:

    CP23_DISPOSABLE_RUNTIME_PROBE=1 bash scripts/cp-native-app-autosync-20-isolated-owner-clone.sh

The script refuses to overwrite pre-existing containers or networks. The external staging project's schema-only export contains no Auth user records. Auth migration **version identifiers only** are reconstructed from the existing local 82-version GoTrue ledger plus the two individually verified staging versions; the complete 84-version source fingerprint must match `89b5e505220d565bc38e8092af7b6c0f`. This verifies ledger provenance, not runtime/DDL equivalence.

The service-specific database URIs are rewritten to point to the same temporary `cp_native20_owner_clone` database. A new random disposable JWT secret is shared between the two services. A generated temporary database password and the temporary environment files are held under owner-only permissions and removed by teardown. No source Auth users or session tokens are copied. The service connectivity probe uses the **temporary PostgreSQL superuser** exclusively inside the isolated database as a bootstrap expedient; this is not evidence of production-equivalent service grants.

Internal HTTP checks execute from the isolated PostgreSQL container using `wget` against the private service names, not from the host. Secrets needed for optional sign-in checks are delivered through short-lived mode-0600 files, not command-line arguments or logs. Temporary request/bearer files are removed after each call.

## Actual observed acceptance

- CP20 staging schema-only export and owner verification: **PASS**.
- 27 staging Auth tables and one sequence owned by `supabase_auth_admin`, schema owned by `supabase_admin`: **PASS**.
- 84 Auth migration identifiers and expected ordered fingerprint: **PASS**.
- Initial attempt: Docker rejected connecting an existing `--network none` container. **Resolved** by creating the internal network first.
- Host-side health checks on an internal network returned no response. **Resolved** by executing health probes inside the same private Docker network.
- GoTrue `GET /health`: **HTTP 200 PASS**.
- PostgREST `GET /`: **HTTP 200 PASS**.
- Genuine signup: **HTTP 500 BLOCKED**; three signed profiles were **not established**.
- Independent signed `/user`, signed Data API requests, canonical role assignment and readback: **NOT VERIFIED**.
- Temporary PostgreSQL/Auth/PostgREST containers, internal network, temporary passwords and lock: **cleanup PASS**.
- Existing shared local Auth users, roles/assignments and remote staging/production were unchanged.

The script does not claim a successful signed user merely because both services passed health checks.

## Application contract blocker

The existing local CRM has **zero active board-backed new-module registrations**, while the connected existing staging branch lacks the native registry and canonical workspace-role writer. The 12 pre-defined modules do not qualify as a newly registered app. CP23 neither fabricates an application ID/role vocabulary nor bypasses the original canonical role writer. Therefore even a successful Auth signup would not suffice for full CP23 acceptance.

## No model training

No gradient descent, backpropagation, model training, fine-tuning, retraining, optimizer step, model-parameter update or training dependency was introduced or run. No inference code or runtime behavior was changed. Focused tests cover known prohibited training patterns.

## Next solid implementation if still blocked

**CP-NATIVE-APP-AUTOSYNC-24 — Isolated GoTrue Signup HTTP-500 Root-Cause Reproduction, Staging-Compatible Auth Schema Validation, and Authoritative Native-Module Writer Contract Activation.**

Capture only sanitized GoTrue/PostgreSQL error codes from the same isolated environment (never tokens or credentials), determine whether the HTTP-500 derives from newer staging Auth DDL, missing required Auth bootstrap data, or a real runtime mismatch, then repair the nonproduction fixture without changing live Auth or weakening existing safeguards. Obtain a legitimate board-backed module registration and its role contract, and only then execute three independent signed role-write/readback/denial/revoke/audit acceptance in the same isolated backend. Keep PR #760 draft.
