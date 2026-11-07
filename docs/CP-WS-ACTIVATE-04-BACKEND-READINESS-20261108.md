# CP-WS-ACTIVATE-04 — Controlled Backend Cutover Readiness

**Date:** 2026-11-08 (Asia/Manila)
**Scope:** The already-deployed, default-off Workspace Per-User switching UI and existing CP-WS-01B session-selection candidate
**Production go/no-go:** **NO-GO** until delegated-role source-faithful compatibility and independent signed-user HTTPS acceptance are complete and a separate production SQL/grant/flag approval is recorded.

## Authoritative production inventory (read-only)

- Existing Supabase project: `jtlusodorfnyzgyuewkz` (no new Supabase project).
- 3 workspaces and 41 active memberships; existing creation flag enabled; selection flag disabled.
- Existing private session-choice table and signed-session verifier installed; `public.wm_ws01_select(uuid,uuid)`, `wm_ws01_config_read(uuid)` and `wm_ws01_config_update(uuid,text,text,bigint)` absent. No activation was attempted.
- Production `current_workspace_id`, `has_module_access` and `module_role_for` exact source fingerprints match the H3 manifest (3/3). An authorized read-only CLI extraction placed the original three definitions in a protected 0700 directory with 0600 files **outside the repository**. The existing H3 SHA-256/ACL guard returned MATCHED_3_OF_3; the source and directory were immediately deleted. Neither the SQL bodies nor credential material were printed, published, logged, or retained. **This was a provenance check, not source-faithful runtime execution.**
- Live SQL catalog SHA-256s matched the existing G4B (63 direct lookup callers) and G4C (54 direct role dependents) catalogs, with 44 overlapping signatures and **73 unique affected function definitions, 0 mismatches**. Fingerprint identity proves source provenance, **not runtime behavior after the cutover**.
- Server-supplied authorization and session scope remain authoritative. No caller's workspace should ever be inferred from UI ownership labels or locally persisted identifiers.

## Implemented isolated verification

`scripts/ws01-activate04-concurrent-cas-disposable.sh` is an additional regression step inside the existing **PostgreSQL 17 `workspace_disposable`** workflow. It only runs after the synthetic lifecycle/GoTrue fixture and signed cutover have been installed and enabled in the disposable database. It fails closed if the connection database, PostgreSQL version, host, role, synthetic session or selected flag do not match the disposable fixture.

Two separate real PostgreSQL connections share one synthetic signed GoTrue session. Connection A selects workspace B and holds the session lock. Connection B simultaneously tries to select workspace A against the stale expected workspace A and **must** receive SQLSTATE `40001`. The test checks exactly one selection audit event, the persisted session-specific choice, the authoritative scoped lookup, and session-choice cleanup on synthetic revocation. It logs only a pass/fail marker and removes temporary files. It **does not** contact production.

This complements existing signed switching, foreign-membership denial, session revocation, expiry, separate-session isolation, stale compare-and-set, RLS and rollback tests. It does not substitute for a genuine deployed HTTPS user interaction or the 73-source-faithful runtime replay.

## Approval boundary and reversible production plan

1. **Source fidelity:** In a protected review environment, reconcile **actual** unchanged source bodies/ownership/ACLs and exercise delegated role behavior under the modified lookup. The guarded H3 private SQL snapshot must stay outside the public repository and CI artifacts. Test the affected 73 real callers, not only mock adapters, including platform-role management, board predicates, module-specific reads/writes, and TimeTracker/TradeLink. Do not remove legitimate delegated authorization or allow foreign-target data leakage.
2. **Nonproduction signed HTTPS:** Use distinct existing user sessions to test valid membership switching, denied foreign-workspace selection, RLS board isolation, refresh/revisit persistence for the **same** session, different-session isolation, concurrent CAS, stale/expired/revoked tokens, membership removal, and failure recovery. A synthetic GoTrue fixture is not independent production-equivalent acceptance.
3. **Protected rollback evidence:** Before any cutover, preserve the exact original `current_workspace_id(uuid)` function body, owner, search path and grants in a restricted rollback bundle. Record all touched schema, trigger, RPC and ACL changes. Ensure the authoritative table/session state and immutable audit history are not deleted in rollback. No public upload of production function bodies or secrets.
4. **Separate production authorization:** Only after steps 1–3 PASS may a separately approved migration install the reviewed `wm_ws01_select` and cutover guard (initially without client execute grants and with selection disabled). Run read-only production preflight again, verify every source fingerprint, signed session and privileged caller behavior, and authorize controlled `GRANT EXECUTE`/selection flag enablement independently. Rollback must first disable `selection_enabled`, revoke the selection RPC execute privilege, and restore the prior source/ACL state as reviewed, not silently weaken RLS or revoke legitimate users.
5. **Frontend activation:** Only after signed backend acceptance and the production authorization gate, separately enable the existing `WS01_SWITCHING_ENABLED` frontend constant. The installed client already rechecks signed discovery, CAS, server receipt and post-write authoritative context, and reloads the application to discard old workspace-scoped state. Keep configuration (`WS01_CONFIGURATION_ENABLED`) and invitations off until their own distinct audited backend contracts are accepted.

**No production migration, permission grant, role assignment, lifecycle flag, database write, user sign-out or external invitation has been performed by CP-WS-ACTIVATE-04.** This is controlled nonproduction assurance, not activation approval or a production-ready certificate.
