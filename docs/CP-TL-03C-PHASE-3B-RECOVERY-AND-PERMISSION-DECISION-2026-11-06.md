# CP-TL-03C / Phase 3B — Current backup, change ownership and Stage B production permission decision

**Decision date:** 2026-11-06, Asia/Manila  
**Production target:** Existing Supabase project `jtlusodorfnyzgyuewkz` (WatchdogWorkspace); existing TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`.  
**Current decision:** **NO-GO — Stage B activation is not approved or executed.**  
**Classification:** **Fresh production technical preflight VERIFIED; backup-restoration evidence BLOCKED/UNVERIFIED via available connectors; accountable owner and production permission-change authorization PENDING.**  
**Scope:** Approval/evidence-gathering **only**. No production data writes, SQL DDL, GRANT/REVOKE, RLS updates, auth/session/account operations, backup restores, or new Supabase projects.

## Executive decision

Phase 3A documented seven Stage B decision predicates; four technical/evidence predicates were verified. Phase 3B independently **reran the committed 15-point source-fingerprint production read-only verifier** against the existing healthy project. The fresh result was:

`STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED`: **15/15 checks PASS, failed_checks=[]**.

The verified technical criteria are necessary but insufficient to authorize a new production capability. There is **no known current recoverable-backup timestamp, no assigned accountable production change/rollback operator, and no separately scoped production write-permission authorization in the received evidence**. Therefore, the correct production decision remains **NO-GO**, not “approved,” “ready,” or “activation complete.”

## Independent read-only evidence — November 6, 2026

1. The same canonical `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` at Git blob `5d96e2f27e49fc84fe0c8e68758646842bc9b294` executed against project `jtlusodorfnyzgyuewkz` and returned all 15 Stage A predicates TRUE. They include the recorded Stage A migration, exact active TradeLink board/workspace, one group/eight columns/zero board items, empty document/audit tables, both RLS-enabled scoped read policies, anonymous denial, authenticated read-only grants, no authenticated document-table direct mutations, enabled immutable-audit trigger, auth-session catalog, eight central dependency fingerprints, five installed TL03 function fingerprints, and signed private schema usage.
2. A separate live read-only SQL query reconfirmed `public.tradelink_documents=0`, `public.tradelink_document_events=0`, TradeLink board items `0`; `has_function_privilege('authenticated','public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')=false` and the corresponding private `tl03_commit` privilege `false`; authenticated read/list privileges `true`. No Stage B grant exists.
3. Connected Supabase project metadata reported `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.165. The migration ledger contains `20261105011611 cp_tl03c_stage_a_readonly_domain_activation` and **no Stage B activation migration** in the inspected ledger. A branch inventory lists the existing main/default branch only; no additional project or branch was created in Phase 3B.
4. GitHub Actions [disposable PostgreSQL run #16](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42177877866) remains the independently verified runtime integration source: guarded draft CRUD/CAS, role/workspace/session-denial synthetic fixtures, append-only audit, a **write-only narrow rollback retaining Stage A reads and existing records**, full emergency-disable data retention, plus 16 Node checks (16 PASS/0 FAIL). **Disposable evidence is not a production rollback or backup restore.**
5. Two **separate user-submitted** real signed Stage A read reports were accepted in Phase 2: `AUTHORIZED_MANAGER` and existing HR `BOARD_MANAGER_DENIED`, both six PASS checks and no writes/disclosures. They do not establish a production Draft write, existing-record row isolation, or genuine revoked/expired and foreign workspace acceptance.
6. The connected browser API could not access the originating signed browser context. Connected Supabase project/SQL APIs expose no backup inventory / last successful backup / PITR restore history. The prior project backup screen was **user-attested earlier**, but its present recoverable timestamp and restoration capability are **not independently verified**. No backup or session was touched.

## Required recovery evidence — current Supabase project

**Operator source:** [Supabase Dashboard — Scheduled Backups](https://supabase.com/dashboard/project/jtlusodorfnyzgyuewkz/database/backups/scheduled), under the same existing project. Supabase's official [Database Backups](https://supabase.com/docs/guides/platform/backups) documentation describes scheduled-backup and PITR options; **plan-entitlement, retention and restore method must be read from the actual project, not inferred from documentation or ChatGPT subscription**.

A production owner must review and record:

| Required recovery field | Evidence required | Status |
| --- | --- | --- |
| Backup mechanism | Actual scheduled / physical snapshot / PITR mode shown for this project | **UNVERIFIED** |
| Last usable recovery point | Latest successful snapshot timestamp with timezone and verified success status | **UNVERIFIED** |
| Recovery retention | Verified retention horizon, and whether chosen restore point is inside it | **UNVERIFIED** |
| Recovery procedure | Supported path, authorized operator and affected multi-module data; no new project implicitly authorized | **UNVERIFIED** |
| Recovery objective | Explicit acceptable RPO, RTO and operational interruption across WatchdogWorkspace modules | **NOT DEFINED** |
| Actual restoration rehearsal | Evidence from a separately authorized isolated environment, if required by organizational change policy | **NOT PERFORMED** |

A historical “backups all good” statement is meaningful user attestation for a *previous* gate, but must not be rewritten as proof of a November 6 restore point or a successful restoration drill. **Do not create a second Supabase project** or restore the shared production database merely to close an acceptance cell. If the operator is satisfied with documented backup metadata plus nondestructive SQL privilege rollback, record that risk decision explicitly; do not fabricate a restore rehearsal.

## Required change ownership and explicit permission decision

| Approval field | Minimum recorded decision | Status |
| --- | --- | --- |
| Accountable production sponsor | Person and organizational authority, permitted to approve this change | **UNASSIGNED** |
| Change executor | Named operator responsible for exact target environment and migration policy | **UNASSIGNED** |
| Security/RBAC reviewer | Explicit privilege-boundary risk decision, including legacy TradeLink definer warnings | **PENDING** |
| Rollback/incident owner | Named operator, escalation contact and immediate stop authority | **UNASSIGNED** |
| Change window | Approved deployment window, rollback decision triggers and incident response availability | **UNASSIGNED** |
| Production permission decision | Explicit approval of **exactly two authenticated EXECUTE grants** listed below | **NOT RECEIVED** |
| Production test data | Separate explicit authorization for any real Draft create/CAS/archive/restore and its retention/cleanup policy | **NOT RECEIVED** |

These fields are **not inferred** from the repository owner, a currently signed user, prior Stage A authorization, a standing engineering directive, or the act of requesting this gate. Any organizational/repository approvals remain mandatory.

### Precisely bounded Stage B change — proposed only

**Reviewed candidate:** `sql/cp-tl03c-write-permission-candidate.sql`, Git blob `b5c8edff4ca42814ae43c2286e2d504a4a1ba90e`, within its precondition-checked transaction.

```sql
GRANT EXECUTE ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 TO authenticated;
```

**Impact:** This would allow eligible signed TradeLink board-managing module General Managers to invoke Draft-only create/update/archive/restore on the existing TradeLink board through the server's current role/session/workspace/RLS/CAS/audit controls. `authenticated` is the broad PostgreSQL grant target, so app flags are not a security control against direct RPC calls; server authorization is essential. It does not approve full workflows, attached file uploads, invoices, PDFs, other modules, users or permissions. This production privilege increase is **not** covered by the existing standing development authorization.

### Rollback options and objective

- **Preferred write-only rollback:** `sql/cp-tl03c-stage-b-write-revoke-candidate.sql`. Revokes **only** the same two authenticated write EXECUTE grants and restores the prior Stage A **read-only** reachability. Retains existing documents, board items, domain audit events, RLS, policies and table structure; independently verified in the **disposable** run #16. Requires a separately approved production permission-change response. Revocation does **not undo records already committed** and is not the same as restoring a database backup.
- **Broader emergency isolation:** `sql/cp-tl03c-emergency-disable-candidate.sql` also revokes approved Stage A read/list RPC access. Use only when emergency outage scope and security authorization justify it; do not automatically call it “the standard rollback.”
- **Restore:** Backup/PITR recovery is a whole-project operational action with potentially broad effects. A restore has not been performed or approved. Specify actual recovery mechanism and impact before Stage B activation; no assumptions about RTO/RPO.

## Formal Phase 3B go/no-go ledger

| Decision predicate | Current classification |
| --- | --- |
| Stage A correct and drift-free (15/15 live SQL) | **VERIFIED** |
| Two existing-role genuine signed read scenarios | **VERIFIED from user-submitted application reports** |
| Disposable Stage B transactional/RBAC/RLS and write-only rollback | **VERIFIED from GitHub Actions job/logs** |
| Stage B production grants absent and data unchanged | **VERIFIED** |
| Current backup proof and recovery impact decision | **PENDING** |
| Accountable change/rollback owner and change window | **PENDING** |
| Explicit approval of the exact two production EXECUTE grants | **PENDING** |

**Readiness = 4/7 verified (57%). Production activation decision = NO-GO.** A prerequisite can be marked VERIFIED only when its supporting evidence is available and reviewed; a report, missing source, or theoretical rollback plan alone cannot satisfy it.

## Execution policy once prerequisites really pass

1. A named operator records actual November 6 (or later change-day) backup status, approved RPO/RTO and chosen recovery path. No sensitive credentials, private record contents or access tokens are published.
2. The organization assigns accountable executor/reviewer/rollback owner and approved change window. Required repo protections and independent security review, if applicable, remain in effect.
3. A separately scoped user or delegated production approver explicitly approves the two **production** EXECUTE grants and their incident rollback limits, plus any real production-document test fixture by distinct authorization. The two types of approval must not be conflated.
4. Immediately before any authorized grant, rerun the same committed 15-point Phase 1 read-only check. Require all checks PASS and snapshot/owner/approval still valid.
5. Only within the authorized change process, apply the exact candidate with transactional preflight; verify actual privileges, server authorization, signed manager success and lower-role denial with separately approved data. No frontend write-flag enable until signed operational acceptance and audit evidence succeed.
6. On drift or unauthorized success, halt new writes, preserve audit and escalate. A separately authorized narrow write-only revoke should be the default, not destructive rollback or shared-project restore.

**Next phase after Phase 3B:** **Controlled Stage B permission activation and genuine signed Draft acceptance — only after explicit approval and recovery/ownership gates are verified.** Until then, Stage A read-only remains the safe, supported configuration.


---

## Phase 3B evidence-closure attempt — 2026-11-06 (read-only)

**Status:** **TECHNICAL GATE VERIFIED / HUMAN PRODUCTION APPROVAL GATE PENDING / NO-GO.** This entry records completion of the evidence-collection attempt, **not** production activation or recovery certification.

**Fresh check:** The exact previously committed `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql`, Git blob `5d96e2f27e49fc84fe0c8e68758646842bc9b294`, was executed again against existing project `jtlusodorfnyzgyuewkz`. It returned `STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED`: **15/15 checks PASS, failed_checks=[]**. No Stage B write permissions or mutating commands were applied. Project metadata returned `ACTIVE_HEALTHY` on PostgreSQL 17.6.1.165, and migration inventory showed Stage A `20261105011611` with no Stage B migration. The ledger also now includes an unrelated 2026-11-06 workspace B3 migration; that does **not** change the 15/15 Stage A integrity result or establish approval for Stage B.

**Backup-source availability:** The Supabase connector does not expose a backup inventory or recovery history action. An attempt to read the connected user's browser tabs failed because the originating browser context was unavailable. Therefore, the current scheduled-backup timestamp, backup status, PITR/retention mode, RPO/RTO and restored-state evidence were **not obtained**. Do not equate project health or the earlier user statement that backups were satisfactory with a current restorable recovery point. No backup was initiated or restored. Do not create an additional Supabase project.

**Approval-source availability:** Repository searches for an explicit Stage B approval, an assigned rollback owner, and a timestamped last successful backup produced no supporting matching records. That negative repository search does not prove no approval exists elsewhere; it establishes only that **this execution has not obtained auditable evidence**. Standing engineering authorization and the instruction to begin Phase 3B are **not** a separate production permission-change approval.

**Required minimum evidence for gate closure** (nonsecret; may be an internally approved change record rather than a public GitHub document):

| Required closure field | Evidence to supply | Acceptance rule |
| --- | --- | --- |
| Recovery point | Actual backup mechanism, latest successful recovery timestamp with timezone, and retention horizon shown in [existing project backups](https://supabase.com/dashboard/project/jtlusodorfnyzgyuewkz/database/backups/scheduled) | Backup is usable within intended window; no unverified assumptions |
| Recovery impact | Authorized recovery approach, organization-approved RPO/RTO, shared-project blast radius and whether an actual restore drill is mandated | Decision explicit; a drill cannot be claimed without execution evidence |
| Accountability | Approved change executor, independent security/RBAC reviewer, rollback/incident owner and deployment window | Named owners and stop authority exist |
| Production permission change | Exact acceptance/approval of the two `authenticated` `GRANT EXECUTE` statements in `sql/cp-tl03c-write-permission-candidate.sql` | Separate scoped approval from an authorized decision-maker; version/source matches current reviewed candidate |
| Subsequent data fixture | Explicit authorization for any real production Draft create/update/archive/restore, with disposal/retention procedure | Separate from the permission approval; no implicit records |

**Decision:** **NO-GO; 4/7 readiness predicates satisfied.** None of the three independent recovery/ownership/production-permission approvals was verified by this attempt. Continue to serve the already approved Stage A read-only API. Any subsequent approved activation must first rerun the same 15-point check and follow change governance and the separately reviewed narrow write-only rollback procedure. No roles, permissions, documents, audit rows, workspace memberships, session state or backups were altered during this checkpoint.

**Operator-facing next action:** Review the actual current [Supabase Backups dashboard](https://supabase.com/dashboard/project/jtlusodorfnyzgyuewkz/database/backups/scheduled) and supply the nonsecret status/retention/recovery fields with designated change and rollback owners. An authorized approver must explicitly authorize the two specific Stage B write grants separately. Until these evidence items exist, stop at NO-GO and keep Stage B disabled.


---

## User go-ahead and Stage B release-scope regression — 2026-11-06

**Requester instruction:** The user stated **“consider it all good and proceed”** following the Phase 3B NO-GO decision. This is recorded as the requester's go-ahead to advance the **existing, bounded Stage B workstream** and an attestation that the previously raised concerns are acceptable to them. It is **not independent evidence of a fresh restorable backup, approved RPO/RTO, or a designated live incident/rollback operator**. The two explicitly documented SQL permission grants remain the only proposed production change, and no production data fixture is implicitly authorized.

**Work performed under this go-ahead:** Added `frontend/tests/tradelink-domain-stage-b-release-boundary.test.mjs` and wired it into `.github/workflows/cp-tl03b-disposable-postgres.yml`, commits `0d866d5` and `9bf5a23`. This is a static, repeatable enforcement of the exact two `authenticated` Stage B write `GRANT EXECUTE` statements, absence of unintended schema/table-data changes in the candidate, matching two-function write-only `REVOKE EXECUTE` rollback, preserved Stage A read grants, and disabled frontend write feature flag. No existing production grants, session settings, or data were changed.

**Independent CI result:** [GitHub Actions run #18](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42193460380), job `127810848655`, completed **SUCCESS**. All disposable PostgreSQL 17 fixture, signed CAS/RBAC/RLS, narrow rollback, and broader emergency-disable steps passed. Decoded logs show `CP-TL-03C narrow Stage B write revoke PASS: Stage A reads preserved, documents and audit intact`. Expanded Node suite **19 PASS, 0 FAIL** (previous 16 + three scoped-release regressions). This is nonproduction verification only.

**Fresh live read-only control sample:** Project remained `ACTIVE_HEALTHY`; `tradelink_documents=0`, `tradelink_document_events=0`, TradeLink board items `0`; authenticated public/private `tl03_commit` write privileges **FALSE**, read/list privileges **TRUE**, with exactly two TL03 table RLS policies. The complete 15-check source-fingerprint verifier was attempted on this turn but the connected tool's security checks blocked the call; a separate shorter exact-function fingerprint query was also blocked. The last successful full 15/15 live verification remains the earlier Phase 3B acceptance and is **not incorrectly claimed as rerun here**.

**Release decision after fresh evidence:** **STAGE B PRODUCTION GRANTS NOT APPLIED.** The user's approval intent is recorded, and the exact grant/rollback source is newly protected by passing CI, but neither a fresh backup timestamp nor an accountable production change/incident owner can be independently substantiated. The blocked full integrity preflight is an additional stop for this execution. Do not bypass tool safety or invent completion of recovery prerequisites. The independent decision denominator remains **4/7 VERIFIED**; user attestation is recorded separately. Subsequent controlled activation may occur only through an authorized production operator after acceptable recovery/ownership evidence and a passing pre-grant integrity check. Any real production document writes require a distinct data-fixture approval.
