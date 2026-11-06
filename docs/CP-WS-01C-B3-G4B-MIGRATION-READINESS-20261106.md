# CP-WS-01C/B3 Phase G4B — Source provenance, delegated-role hardening and migration readiness

**Date:** November 6, 2026  
**Classification:** SOURCE INVENTORY VERIFIED; FULL SOURCE-FAITHFUL MIGRATION/BEHAVIORAL ACCEPTANCE PENDING; LIVE ACTIVATION NOT APPROVED.

## Scope and provenance

The existing production database was queried **read-only** using PostgreSQL catalog metadata. No user IDs, JWTs, secrets, record contents or unmodified security-sensitive function bodies are included in the repository.

- **63 distinct referencing routines** were inventoried and source fingerprinted using SHA-256 over `pg_get_functiondef`.
- **53 actor-alias calls**: syntactic declarations bind aliases to `auth.uid()`.
- **5 direct `auth.uid()` calls**, and **3 no-argument/default calls**.
- **2 target-user parameter calls** requiring delegated authorization review: `has_module_access` and `module_role_for`.
- Inventory: `sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json`.
- Offline format/coverage validation: `scripts/ws01c-g4b-verify-inventory.mjs`.

**Important:** A verified source hash proves which function body was inventoried. It does **not** prove every call site's runtime identity, a correct RLS policy, or compatibility after a function is replaced. All 63 must remain under change control and the two target-user paths need source-faithful behavior acceptance.

## Architecture decision to test before activation

Preserve the existing function name, argument shape, ownership, and caller contract where compatible; avoid removing legitimate role-management delegation.

1. Ordinary signed users may request only their own authoritative workspace through the public lookup. Validate GoTrue session identity, session validity, active profile and active membership **on the server**.
2. A private helper may resolve an explicitly authorized target user for trusted internal operations only. It must not grant direct `anon` or `authenticated` EXECUTE.
3. The two source-fingerprinted delegated role helpers must enforce caller/target authorization explicitly, not merely accept a target UUID. Preserve legitimate same-workspace administrator delegation and signed same-user role evaluation; prevent nonmanager, foreign-workspace, inactive, mismatched, expired and revoked-session lookups.
4. Keep target-user scope separate from arbitrary user-supplied workspace selectors. Do not activate B4 workspace switching.
5. Review any other exposed security-definer roles, including functions that forward a target-user parameter to the two role helpers. Source lookup behavior must not become an IDOR/BOLA authorization shortcut.

## Existing acceptance and missing evidence

**Verified disposable evidence:** G3 lookup preview and rollback (Actions run 42227343708); G4 representative signed-manager delegated behavior with normal denial cases (run 42229129766). Existing B3 signed creation/denial/replay disposable regression passed in those workflows. Neither preview installed a hardened lookup while compiling and exercising all real production callers.

**New G4B artifact:** Immutable **signature/fingerprint inventory** of the 63 live routines, plus an offline consistency test in the same PG17 workflow. This is provenance verification, **not a source-faithful runtime compatibility test**.

**Required next acceptance:** Stage actual source-matched SQL definitions and dependencies in an isolated PG17 database, then keep the hardened lookup installed during authorized and denied behavior tests for the dependent board, module, user-role, TimeTracker, TradeLink and other callers. Source-hash revalidation must detect live schema drift before proposing production cutover. User-scoped genuine HTTPS denial by a second independently authorized existing user remains separate and pending.

## Controlled, reversible production migration preparation — not an activation script

The following process requires separate approval and is **NOT** authorized by this report:

1. Obtain a security-reviewed production change window, required database backup/recovery assurances and a scoped rollback operator.
2. Capture the current `pg_get_functiondef`, owner, EXECUTE ACL, default arguments, grants, dependent view/trigger/policy references and provenance fingerprints for every changed routine **into an access-controlled rollback bundle outside the public repository**. Do not use a public issue or document to distribute vulnerable legacy SQL or session data.
3. Reconcile all 63 caller fingerprints immediately before staging; abort on any changed signature, source hash, grant or unexpected caller.
4. Re-run complete source-faithful PG17 acceptance with the proposed guarded helper installed, including both positive delegated role resolution and denied foreign/nonmanager/expired/borrowed access.
5. In a separately approved **transactional** production activation, create the least-privilege internal helper(s), update only reviewed/approved routines, preserve owner and access policy, verify protected schemas and direct HTTP API exposure, and assert no B4 change. Roll back **before COMMIT** on any failed postcondition.
6. If an authorized rollback is required after COMMIT, apply **the exact previously captured definition and ACL restore bundle** in a separate reviewed transaction, recheck all affected callers and audit lifecycle records, and record the recovery evidence. A generic `CREATE OR REPLACE` without restoring grants and ownership is not sufficient.
7. Complete genuine signed-browser acceptance with existing authorized users; do not use database-superuser context or synthetic fixture JWTs as substitutes.

## Acceptance state and blockers

| Requirement | Current classification |
| --- | --- |
| Catalog inventory and immutable source fingerprint coverage (63) | IMPLEMENTED — live inventory observed |
| Distinguish target-user callers from self/default call sites | VERIFIED — syntactic review; semantic audit still needed |
| Existing G3/G4 representative disposable security acceptance | VERIFIED |
| Exact source-faithful behavioral migration for both role helpers | PENDING |
| Full 63-caller regression with patched lookup active | PENDING |
| Reversible rollback bundle with exact definitions and ownership/ACL | PENDING — requires secure environment and approval |
| Production database activation | NOT APPLICABLE at this gate; not authorized |
| Genuine independent second-user signed HTTP denial | BLOCKED |
| Original creation response body | UNAVAILABLE |

**Go/no-go decision:** NO-GO for production activation until the missing checks are independently verified. This report, by itself, must never authorize a production SQL execution or a broader access grant.
