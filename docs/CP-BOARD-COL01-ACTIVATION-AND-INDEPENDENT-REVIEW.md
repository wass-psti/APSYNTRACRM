> **Superseded recovery policy — 2026-11-10:** The owner retired mandatory
> 24-hour RPO/RTO, disaster-recovery rehearsal and AWS/offsite backup
> release gates across WatchdogWorkspace/APSYNTRA CRM. References below
> to their mandatory status are historical only. Existing backups,
> authentication, RBAC/RLS, audit and signed acceptance remain required.
> See [current owner decision](RECOVERY-POLICY-RETIREMENT-20261110.md).

# CP-BOARD-COL01 — Independent review request and controlled production activation/rollback

**Status: REVIEW REQUEST PREPARED — NO-GO / NOT ACTIVATED.** This is an engineering runbook and reviewer checklist, **not an independent security signoff**, production permission-change approval, or authority to execute SQL.

## Fixed scope and baseline (2026-11-03, Asia/Manila)

- Canonical repository: `wass-psti/APSYNTRACRM`, direct-to-`main` workflow; security candidate baseline `4a451ab5f2571ae7950a1284e00927808c672b37`. Revalidate the HEAD and all checks at execution time.
- **Only Supabase project:** existing production WatchdogWorkspace, ref `jtlusodorfnyzgyuewkz`. No extra project, database, accounts, or production board modifications are authorized by this runbook.
- Candidate: [authorization SQL](../sql/cp-board-collab01-authorization-candidate.sql). Rollback: [guarded SQL](../sql/cp-board-collab01-rollback.sql). Preflight: [read-only SQL](../sql/cp-board-collab01-production-readonly-preflight.sql). Signed runner: [HTTPS acceptance script](../scripts/cp-board-col01-signed-http.mjs).
- Current production writer `public.wm_add_board_member(uuid,text,text)` source MD5: `0dde086a58def1dd5437b32264c0697a` (must recheck immediately before rollout). Candidate guard and four additive RPCs were absent at inspection.
- Read-only preflight: `PREFLIGHT_SCHEMA_PASS_WITH_SIGNED_SESSION_GATE_PENDING`. Four target tables have RLS, no direct `anon` or `authenticated` SELECT; current board membership anomalies 0 and explicit viewer/editor ceiling conflicts 0.
- Inventory: **2 workspaces, 74 boards, boards in only 1 workspace** at inspection. The real HTTPS runner's **existing foreign-workspace board** prerequisite is not available. Do not substitute a random/nonexistent UUID or assert a passed cross-workspace test.
- Prior candidate evidence: disposable PostgreSQL migration/authorization/rollback CI and frontend unit tests were reported passing for the staging baseline. These simulate identity/session contexts, not real signed GoTrue HTTPS acceptance.
- Review/approval state: **No independent signoff found; no separate production permission-changing approval established.** No COL01 DDL executed by preparation of this document.

## Independent reviewer requirements (must be a distinct qualified reviewer)

Review the *exact immutable candidate and rollback blobs* and record reviewer identity, date, commit and blob SHAs, explicit PASS/FAIL per gate, evidence links, residual-risk acceptance, and signed GO/NO-GO in the linked GitHub review issue. The preparing assistant cannot self-certify independent review.

1. **Privileged execution boundaries:** Every new or replaced `SECURITY DEFINER` routine is scoped, uses pinned `search_path=''`, fully qualified relations, restricted `EXECUTE` (no PUBLIC/anon), and validates `auth.uid()`, the real signed JWT and live GoTrue `auth.sessions`. Confirm the session helper may be safely callable from `public` by `authenticated`, or require a redesign.
2. **Membership integrity:** Manager-only actor authorization; active *same-workspace* invitee; target active profile; explicit role ceiling; owner cannot be demoted; no direct table grants; preserved audit. Examine target workspace revocation/concurrent invitation race and owner/editor update concurrency; require supplemental disposable concurrency tests if unresolved.
3. **Scoped readers and privacy:** Directory is manager-only and workspace-limited, query bounded; per-item update/file metadata and event pagination prevent foreign-workspace and board-scope disclosure. Review actor/profile joins for audit completeness; storage paths must not automatically grant object downloads.
4. **Session coverage:** The candidate protects **only five COL01 RPCs**. Existing `work_board_access`, legacy read/write RPCs and pre-issued JWTs are **not globally protected** against immediate logout by this candidate. Confirm documented scope and any adjacent impact.
5. **Rollback fidelity and risk:** Verify source MD5, grants, no orphaned function dependencies, no modifications of membership/updates/files/audit rows, and successful atomic disposable rollback. **Critical:** exact rollback restores the old writer known to accept active-profile invitees without an explicit same-workspace check and to allow owner role overwrite. Reviewer must approve this exposure or require a separately tested fail-closed fallback (e.g. temporarily withholding writer EXECUTE and disabling invitations), with separate production permission approval. Do not silently weaken security.
6. **Live compatibility:** Check current `auth.sessions(id,user_id,not_after)` layout, function signatures, PostgREST RPC exposure/cache, `pg_catalog` name resolution, platform role taxonomy, FK/unique indexes, duplicate invitations, SQL error codes, transaction behavior and startup/rollback ordering.
7. **Evidence:** Review currently successful frontend/disposable CI, live SELECT-only preflight, and project-wide Supabase security linter notices. 68 no-policy informational findings and privileged-function warnings must be triaged for **direct COL01 impact**, not misreported as confirmed vulnerabilities.

**Independent review acceptance:** All seven items explicitly dispositioned, security-sensitive issues fixed and retested, and a reviewer other than the implementer records approval against unchanged SQL hashes. If any BLOCKER remains, **NO-GO**.

## Production activation — conditional, approval-gated sequence

These are instructions for a **future separately approved operation**, not authorization to run them now. Do not run candidate or rollback on live production during this review stage.

### Phase A — prerequisites and evidence freeze (no production writes)

1. Capture reviewer approval, designated deployment and rollback operators, approved maintenance window, business impact/communications and **separate explicit production SQL permission-change authorization**. Follow existing GitHub repository protections and required checks.
2. Resolve genuine signed HTTPS test prerequisites: two **dedicated disposable** legitimate GoTrue accounts with appropriately scoped roles; a same-workspace board; a **genuine board in a foreign workspace** and authorized actor for denial checks; a near-expiry valid token. Creation of test users, sessions, boards, workspace memberships or other production data needs its own change scope/approval; do not use employee credentials or production records for destructive tests. A production-only test is not equivalent to nonproduction signoff and entails accepted operational risk.
3. Verify current repository HEAD, CI results, disposable migration+rollback run, SQL file SHA/content and approved rollout artifact. Confirm backup and point-in-time restore/restore-owner readiness, rollback SQL checksum, production availability and an observability/incident contact. Confirm an actual recovery rehearsal on disposable PostgreSQL; do not restore over real operational records as a test.
4. Run **only** `sql/cp-board-collab01-production-readonly-preflight.sql` in production. Require exact `PREFLIGHT_SCHEMA_PASS_WITH_SIGNED_SESSION_GATE_PENDING`; check source MD5 `0dde086a58def1dd5437b32264c0697a`, 5 missing candidate objects, unchanged grants/RLS, 0 foreign/inactive memberships and 0 viewer/editor conflicts. Any drift -> STOP and re-review.

### Phase B — approved transactional deployment

5. Reconfirm approval immediately before execution, feature-use freeze for invites and other affected RPCs, valid backup and ready rollback operator.
6. Apply the exact approved `sql/cp-board-collab01-authorization-candidate.sql` **once as one transaction** in the existing project using the approved SQL deployment mechanism. The file already contains `BEGIN;` / `COMMIT;`. Never paste fragments or grant broad table access.
7. Query `pg_proc`/`pg_get_functiondef`, `to_regprocedure`, `has_function_privilege` and table privileges to verify all five protected routines, `SECURITY DEFINER`/search-path settings, intended authenticated grants only, and no RLS/table/Storage grant regressions. Check PostgREST recognizes new RPCs; if schema cache is stale, use only the approved cache-reload procedure.
8. Execute bounded HTTPS acceptance using **dedicated** signed admin and nonadmin test accounts: own-workspace actor/roles, real foreign-workspace denial, authorized/denied directory and reader results, isolated fresh-session logout revocation, and a formerly valid JWT crossing expiry. The current harness logs out sessions it creates and optionally revokes an additional disposable session: these are real Auth mutations and must be explicitly in the approved test scope. Capture redacted PASS/FAIL logs and verify session cleanup.
9. Check signed Pages workflows, operations, grants, RLS, audit sequence and no cross-workspace metadata leakage. Do not enable corresponding frontend capability before post-activation acceptance and monitoring of immediate errors.

### Phase C — stop/rollback and stabilization

10. **STOP and initiate approved rollback** for unexpected anon/PUBLIC access, unauthorized manager action, cross-workspace disclosure, wrong role ceiling, revoked JWT acceptance at protected RPCs, data integrity anomaly, repeated RPC failures, missing audit, or unacceptable operational impact. Freeze the affected frontend actions and record the incident/time.
11. Execute `sql/cp-board-collab01-rollback.sql` as its single guarded transaction **only if its guard matches the deployed candidate**. If it fails, do not blindly force-drop or partially restore functions: stop and escalate to the rollback operator for a reviewed corrective transaction. No row deletion, credential rotation or role reset is included.
12. Verify restored writer MD5 `0dde086a58def1dd5437b32264c0697a`, expected auth/anon `EXECUTE` privileges, five candidate routines absent, and unchanged counts/integrity of member/update/file/event data. **Security warning:** this restores legacy writer weaknesses. The reviewer must predetermine a separately approved fail-closed containment option if that exposure is unacceptable.
13. Re-run signed Pages regression and read-only scope checks, record incident resolution and changed grants, and re-open review rather than reattempting activation without disposition.
14. On successful acceptance, capture final commit/checks, operator, reviewer, production approval, SQL artifact/hash, UTC timestamp, redacted signed test outcomes, audit/grant checks and final GO status. Only then announce activation and remove temporary UI freeze.

## Required go/no-go record

| Gate | Current decision | Required artifact |
| --- | --- | --- |
| Exact candidate, rollback and disposable CI | STAGED; previous CI reported passing | Approved SHA + fresh checks and executable rollback |
| Independent SQL/security review | **PENDING** | Separate reviewer signoff against immutable SQL |
| Foreign-workspace, two-actor and near-expiry test prerequisites | **BLOCKED** | Approved disposable accounts/foreign board and scope |
| Genuine signed HTTPS revocation + expiration acceptance | **PENDING** | Redacted actual GoTrue/PostgREST PASS evidence |
| Separate production permission-change approval | **PENDING** | Explicit authorized approval of exact SQL and rollback risk |
| Production SQL activation | **NOT RUN** | Approved transactional execution record |
| Post-activation and rollback acceptance | **NOT RUN** | Runtime, grants, audit, denial and recovery evidence |

**Decision: NO-GO.** Repo-only review documentation is safe to stage. No waiver of a second Supabase project is a waiver of an actual security gate, and no statement in this file grants production permission-change authority.
