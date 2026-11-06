# CP-TL-03C / Phase 3 — Stage B production-change approval and recovery readiness

**Decision date:** 2026-11-06 (Asia/Manila)  
**Decision:** **NO-GO — production write EXECUTE remains denied.**  
**Checkpoint classification:** **Technical boundary VERIFIED; change/rollback packet PREPARED; recovery proof, accountable owner and separately scoped production authorization PENDING.**  
**Target:** Existing WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz`, existing TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`; **no new Supabase project** and no standalone identity or role system.

This decision authorizes **no production migration, grants, revokes, role/workspace membership changes, data writes, document fixture, browser token extraction, data restoration, or frontend feature activation**. The requester initiated a readiness/approval checkpoint, not a separate production permission-change approval.

## 1. Verified baseline and supporting evidence

- Stage A additive read-only schema was installed under already-approved migration `20261105011611 cp_tl03c_stage_a_readonly_domain_activation` on 2026-11-05. Do **not** reapply the old schema DDL.
- Reusable `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` previously returned `STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED` with **15/15** checks on the live project, including exact board scope, authoritative tables, RLS, 13 dependency/function fingerprints, audit immutability, read/list grants and denied write RPCs. This is the existing accepted **Phase 1** evidence; it need not be inflated into new signed-user proof.
- **Fresh Phase 2 signed read acceptance:** User-submitted existing `AUTHORIZED_MANAGER` and independent existing HR `BOARD_MANAGER_DENIED` reports each had **six of six PASS** and `writesAttempted=0`, `documentsDisclosed=0`. The assistant did not control the human users' browser sessions. See `docs/CP-TL-03C-PHASE-2-SIGNED-READ-AND-STAGE-B-APPROVAL-PACKET-2026-11-06.md`.
- **Disposable integration and rollback:** GitHub Actions PostgreSQL 17 [CP-TL-03B run #16](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42177877866), job `127760532389`, completed successfully. Actual decoded logs verified synthetic create/retry/CAS/archive/restore, role and foreign-workspace denials, expired/revoked fixture behavior, immutable audit, **narrow Stage B-only write revoke retaining Stage A reads and all records**, and broader emergency disable. Node checks: **16 PASS, 0 FAIL**. This is a disposable fixture, not a real production write or backup-restoration rehearsal.
- **Current live read-only inspection (2026-11-06):** Project status `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.165`. `public.tradelink_documents` count `0`, document events `0`, TradeLink board items `0`. Both public/private signed commit RPC `EXECUTE` grants `FALSE`; signed read and list `TRUE`; anonymous commit `FALSE`; both document/audit tables have RLS enabled. No write, grant, revoke, migration, role or session mutation occurred in this checkpoint.
- **Current security advisor:** Older TradeLink asset/reconciliation `SECURITY DEFINER` callable functions and four old RLS-enabled/no-policy tables remain in the project-wide advisory (11 TradeLink-related WARN findings, four INFO). They were **not** modified or silently waived. No new `tl03_document_*` warning was surfaced in the current filtered inventory. Relevant guidance: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable. Triage legacy modules under their own scope; determine whether an existing finding materially affects the new Stage B boundary before approval.

## 2. Exact proposed production permission change (NOT APPROVED)

**Repository candidate:** `sql/cp-tl03c-write-permission-candidate.sql` (Git blob `b5c8edff4ca42814ae43c2286e2d504a4a1ba90e`).

Only two proposed PostgreSQL privileges, in its guarded transaction:

```sql
GRANT EXECUTE ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb) TO authenticated;
```

This change does **not** modify module roles, accounts, workspace memberships, RLS, schemas, board items, document rows, audit records, or the frontend's `TL03_DOMAIN_READS_ENABLED=false` / `TL03_DOMAIN_WRITES_ENABLED=false`. Those flags do **not** protect a directly reachable PostgreSQL RPC.

The public entry point is an invoker wrapper; the private definer implements a live GoTrue session check, exact TradeLink board/workspace match, TradeLink `General Manager` module role, effective board `manage` access, SQL-NULL fail closed, strict Draft-only operations (`create/update/archive/restore`), row-lock/revision CAS, atomic linked board-item projection and append-only domain/board activity audit. This source behavior was examined in Stage A and simulated in disposable PostgreSQL. It still requires fresh production authorization and postactivation signed evidence. Do not enable source workflow approvals, PDF generation, attachments, or imports as part of this grant-only change.

## 3. Recovery readiness — evidence versus unknowns

| Recovery prerequisite | Current evidence | Decision |
| --- | --- | --- |
| Source project identity and active database | Verified live project `jtlusodorfnyzgyuewkz` | **VERIFIED** |
| Historical backup availability | User confirmed the scheduled-backup screen was satisfactory earlier in the project | **PRIOR USER ATTESTATION ONLY** |
| Latest usable backup point / retention / project backup status today | The connected Supabase project API does not expose backup inventory; browser origin is inaccessible in this chat | **NOT INDEPENDENTLY VERIFIED** |
| Database recovery procedure and expected impact | Supabase's backup/PITR documentation reviewed, but the actual project restore mode, credentials, expected downtime, RPO and RTO are not established | **PENDING OPERATOR REVIEW** |
| Successful nonproduction restore drill | No supported evidence; do not create a new Supabase project or restore production without separate approval | **NOT VERIFIED** |
| Privilege-only Stage B rollback | `sql/cp-tl03c-stage-b-write-revoke-candidate.sql` plus disposable PostgreSQL acceptance PASS in run #16 | **VERIFIED IN DISPOSABLE** |
| Emergency full API isolation | `sql/cp-tl03c-emergency-disable-candidate.sql`, run #16 disposable acceptance PASS | **VERIFIED IN DISPOSABLE** |
| Named release/rollback operator and change window | Neither recorded in this checkpoint | **PENDING** |

**Recovery distinction:** The preferred narrow Stage B rollback **revokes only the two write EXECUTE grants**, leaves Stage A read/list reachable, and **preserves all existing document, board and immutable audit rows**. It is **not data undo**. The broader emergency-disable candidate also disables approved Stage A reads; use only after separate emergency authorization. A database restore, if ever required, has different implications and may affect the entire shared multi-module project. It must never be initiated solely to test this gate.

Official platform backup guidance: https://supabase.com/docs/guides/platform/backups. Supabase's restore-to-new-project flow may create a **billable separate project** and does not copy Storage objects; this is explicitly **not initiated** because the user requires retaining the single existing project. The backup service may be viable without a drill, but **a recovery claim must not be certified until the operator has documented the latest available backup and acceptable recovery method**.

## 4. Ownership, risk and human decision record

**Scope of approval requested, when eligible:** a one-time production SQL permission change consisting solely of the two `GRANT EXECUTE` statements in the exact reviewed candidate; separate authorization for a narrow `REVOKE` rollback if required. Any real production document-create/CAS test records, retention or cleanup require **additional data-operation authorization**.

**Required decision fields (deliberately unset):**

| Field | Required evidence | Current state |
| --- | --- | --- |
| Production change sponsor / accountable operator | Approved named operator, authorized by organization | **UNASSIGNED** |
| Security/RBAC reviewer | Independent review disposition for both write RPCs and legacy overlapping access risks | **NOT RECORDED** |
| Production window and incident contact | Change schedule, rollback trigger, immediate stop authority | **UNASSIGNED** |
| Current backup verification | Backup type, latest successful recoverable timestamp, retention and chosen recovery route | **NOT RECORDED** |
| Recovery impact decision | Explicit acceptable RPO/RTO and handling of shared workspace / cross-module data | **NOT RECORDED** |
| Production write-grant authorization | Explicit scoped approval for exactly the two function EXECUTE grants | **NOT RECEIVED** |
| Production test-record policy | Whether any live Draft may be created, by whom, what synthetic input, and how to retain/reconcile it | **NOT AUTHORIZED** |

**Primary risks:** accidentally callable draft mutator after broad authenticated EXECUTE; privileged SQL definer behavior, role/workspace/session drift, CAS/audit or board projection inconsistency; unknown recovery point/downtime; exposure of other modules via over-broad emergency isolation; unauthorized production test records. **Mitigations:** server-side signed manager/module/workspace checks, pinned implementation/source fingerprints, existing Stage A RLS/grants, transactional CAS/append-only audit, gated test data, complete disposable integration and narrow write-only rollback, plus mandatory explicit change authorization.

**Release criterion:** Re-run the already committed **Phase 1 read-only 15-check verifier** immediately before any separately authorized change, confirm all grants/role/session guards are unchanged and the database is recoverable, then follow repository change approvals and approved window. A post-grant read-only privilege check and separately approved real signed manager and lower-role tests are mandatory before any frontend write flag is enabled. Stop on authorization/record/audit drift.

## 5. Evidence ledger and decision

| Gate | Classification |
| --- | --- |
| Installed Stage A, exact scope, RLS/grants/function preflight | **VERIFIED** |
| Genuine current signed manager and HR Stage A read checks | **VERIFIED (user-submitted, 2/2)** |
| Disposable Stage B guarded mutation, denial and narrow backout | **VERIFIED (CI run #16)** |
| Current production writes withheld and zero document/audit/board records | **VERIFIED (live read-only query)** |
| Latest backup restore-point and recovery impact documentation | **PENDING** |
| Named change/security/rollback owner and approved window | **PENDING** |
| Separately scoped Stage B production permission approval | **PENDING** |

**Readiness: 4 of 7 concrete decision gates VERIFIED. Decision remains NO-GO (not a failed security test, but an approval/recovery prerequisite stop).** The production permission script, backup restore, role changes and test-record creation remain prohibited until individually authorized.

**Next required gate:** `CP-TL-03C / Phase 3B — Current Backup Evidence, Change Ownership and Explicit Stage B Permission Decision`. The Phase 3A technical decision record can close as verified; Stage B activation must not proceed without separately scoped approval.
