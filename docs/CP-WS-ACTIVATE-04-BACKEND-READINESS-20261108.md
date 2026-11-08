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

## 2026-11-08 — Protected original-definition replay attempt

**Result: PARTIAL SOURCE REPLAY, NOT PRODUCTION ACCEPTANCE.** All operations were limited to authorized read-only catalog inspection and a temporary isolated local test.

- Extracted **74 live original function definitions**: the authoritative workspace lookup plus **73 distinct affected caller definitions**. Every complete SQL source matched its G4B/G4C/H3 pinned SHA-256: **74/74 matched, zero drift**. Source was held in a restricted temporary directory outside the repository. No production rows, identities, credentials or JWTs were exported.
- Registered **74/74 source-identical definitions** in an in-memory PGlite PostgreSQL **18.6** engine against synthetic schema objects, with **zero installation errors**. Function-body validation was deliberately deferred because production table dependencies were not fully installed. This establishes **definition installation only**, not actual function execution, role compatibility, or PostgreSQL 17 runtime acceptance.
- Inspected the exact definitions of five additional original role helpers for subsequent delegated-role replay. The attempted role-execution harness was **blocked by a tool safety control before execution**. No bypass was attempted, and no delegated-role result is claimed.
- The protected SQL files, test package, embedded database and local checkout were deleted. No database daemon/service was started. A Homebrew PostgreSQL 17 installation was cancelled before it could upgrade shared system libraries; CA certificates, OpenSSL and LZ4 retained their existing versions.
- A count-only read of existing authorized database metadata found **one account with a currently nonexpired GoTrue session and membership outside Work Management**. This does not provide usable access to that separate account and **does not establish HTTP denial**. Available browser tabs exposed only the current administrator's signed session; no second user was impersonated or accessed.

### Still-required activation evidence

1. **BLOCKED — production-source-faithful delegated-role regression:** A qualified security reviewer in an approved protected PostgreSQL 17 environment must execute the original role functions and all 73 affected real callers under the hardened lookup, preserving legitimate delegated administrative paths while denying unauthorized workspace/module/board access. SHA parity and deferred-body installation alone are insufficient.
2. **PENDING — two-user signed HTTPS acceptance:** The existing read-only Security UI must capture a truly authorized row under one existing signed user and confirm genuine server-side foreign-workspace denial under a *separately signed* existing user. Attribute the reviewer; preserve redacted HTTP results. Do not copy credentials, extract tokens, impersonate, or manufacture a production account.
3. **PENDING — independently reviewed rollback and separate production approval:** Preserve the original function body, owners, search paths, ACLs, source hashes and audit/restore guarantees in a restricted recovery bundle. Only after security acceptance should the exact production RPC cutover, grants and feature flags receive their separately required authorization.

**Production decision: NO-GO.** No production SQL writes, roles, grants, sessions, memberships or feature flags changed. The already verified disposable PostgreSQL 17 concurrent-CAS test remains useful evidence but is not a production go-live certificate.

## 2026-11-08 — Option A: consolidated acceptance workflow (PR #104)

Keep **only existing issues [#79](https://github.com/wass-psti/APSYNTRACRM/issues/79) and [#80](https://github.com/wass-psti/APSYNTRACRM/issues/80)** as the acceptance records. Do not start additional checkpoint families. Retain existing PostgreSQL 17 disposable regressions and 73-source-faithful independent review requirements. This change simplifies *operator evidence collection*, not the production security or approval criteria.

### One guided genuine two-user test — issue #80

1. From **Access acceptance → B3 · Genuine foreign-workspace table RLS**, the existing authorized Work Management user clicks **1. Capture existing authorized row**. Require `READY / owner-row-confirmed`; an empty result is inconclusive, not denial. Only the row UUID and owner context are retained in **volatile tab memory**, with a maximum lifetime of **15 minutes**.
2. Click the new **Continue: sign out this session only and sign in as the foreign user** action directly in the B3 panel and confirm its scope. This uses only `auth.signOut({scope:'local'})`, not the global sidebar logout, and intentionally does **not** run the unrelated revoked-JWT acceptance probe. The volatile reference is not written to persistent storage or sent to the second account. A page refresh or navigation away from the browser tab that reloads the app invalidates this temporary reference.
3. Sign in **in the same open tab** as a different existing authorized account. When the temporary reference remains live, the application returns automatically to **#/security**. Confirm the currently connected workspace is **not Work Management**. Click **2. Test after signing in as foreign-workspace user** only; clicking Step 1 again would discard the reference. The verifier distinguishes `foreign-same-user` and `foreign-same-workspace` without exposing identities. Both are **INCONCLUSIVE**; they cause **zero** foreign-row GETs.
4. Only the actual direct signed **PostgREST GET** of the exact previously authorized row returning **200 with an empty JSON array**, after server-verified distinct user/workspace context, may produce `PASS / foreign-row-denied`. Copy only the UI's sanitized report into issue #80. An authorized reviewer records the timestamp, environment and PASS/FAIL/INCONCLUSIVE disposition. `PASS` covers **one row/table** only, not all workspace services.

**Stop conditions:** If the row reference expires, the app reloads, identity changes mid-read, user or authoritative workspace does not differ, sign-in fails, network fails, or a 403/non-JSON response arrives, record the exact nonsecret inconclusive/blocked stage. Do not fabricate a PASS or move identifiers/JWTs into storage to bypass the limitation. A foreign-row exposure is **FAIL** and requires security remediation before activation.

### Evidence consolidation and current boundary

- **Issue #79:** Existing PG17 disposable CAS, foreign-membership, JWT/session revocation and rollback fixtures remain supporting synthetic checks. An accountable qualified independent reviewer must still verify protected source-faithful behavior across 73 affected real routines, owners, grants, RLS, delegated roles and restore strategy. An AI assessment or green synthetic CI alone cannot sign off.
- **Issue #80:** Earlier human-provided reports include `READY / owner-row-confirmed`, `INCONCLUSIVE / owner-no-fixture`, and `INCONCLUSIVE / foreign-principal-required`. No qualifying real foreign-row denial has yet been furnished. A staged diagnostic/UI change and synthetic tests cannot substitute for the signed-user result.
- **CI:** The focused B3 contract suite passes **14/14** on PR #104 head `67ba70b41`; the full frontend run passes **1254/1260** with six unrelated Settings experience failures also present on unmodified `main` (run [42484796954](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42484796954)). Keep those failures visible; no blanket full-suite PASS is claimed.
- **Production NO-GO:** Do not install switching RPCs, change grants/roles/session policy/RLS, set `selection_enabled`, or change `WS01_SWITCHING_ENABLED` before both existing acceptance issues pass and separate production change authorization is obtained.
