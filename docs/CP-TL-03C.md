# CP-TL-03C — Controlled TradeLink production activation

**Status:** STAGE A PRODUCTION INSTALLED / STRUCTURAL PREFLIGHT 15/15 VERIFIED; DISPOSABLE POSTGRES 17 CI VERIFIED (RUN #16); PHASE 2 FRESH AUTHORIZED_MANAGER SIGNED READ 6/6 USER-REPORTED PASS, HR REFRESH PENDING; STAGE B WRITE EXECUTE NOT APPROVED / NOT ACTIVATED; LIVE SIGNED-WRITE ACCEPTANCE PENDING.  
**Project:** existing Supabase `jtlusodorfnyzgyuewkz` ONLY. No new project, backend, login, or independent user-role store.  
**Board:** existing TradeLink `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`, workspace `00000000-0000-4000-8000-000000000001`.

## Verified pre-activation baseline — read-only, 2026-11-05 Asia/Manila (historical)

- PostgreSQL `17.6`; exact v1 TradeLink board active, one group, eight legacy columns, zero board items.
- Before Stage A, `public.tradelink_documents`, `public.tradelink_document_events` and the new document RPCs were **absent**. See the deployment evidence below for their current installed state.
- `sql/tests/cp-tl03c-production-readiness.sql` was committed and executed against the actual existing project. All **10/10 readiness fields passed**, including exact scope, private schema access, current `auth.sessions` columns and eight previously reviewed backend function definitions (MD5 fingerprints), with `changed_dependencies=[]`.
- The existing security advisor reports project-wide warnings for exposed security-definer functions and other tables. These were **not** amended or bypassed in CP-TL-03C. Evaluate them separately in their respective module authorization scope, using the Supabase dashboard security advisor. Do not weaken permissions to silence advisories.

## Security decision: two-stage activation, separate production approval

The original 03A script granted `authenticated` permission to invoke the write RPC immediately. An off-by-default frontend feature flag **does not** protect a directly callable server RPC. This has been corrected *in the staged repository source*; **no production permissions were changed**.

### Stage A — guarded schema + read-only API, write EXECUTE withheld

Source: `sql/cp-tl03-staged-domain.sql`.

- One atomic, additive transaction creates authoritative Draft-only document and append-only audit tables, RLS policies, indexes, a signed/role-guarded implementation, read/list RPCs and a linked-board projection.
- It **revokes** access to both `private.tl03_commit` and `public.tl03_document_commit`. `authenticated` cannot call either until Stage B is *separately* authorized.
- `authenticated` read/list and RLS SELECT are granted only for live sessions with board `manage`, effective `General Manager` module role and matching centralized workspace. The original eight workflow states remain authoritative; this stage commits drafts only.
- `frontend/tradelink-domain-client.js` keeps `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`.
- **Before applying**: rerun `sql/tests/cp-tl03c-production-readiness.sql`; require every field to match and `readiness='PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_STILL_REQUIRED'`. Reconfirm production recovery/snapshot policy and existing migration history. Any drift is a BLOCKER.
- **Approval**: obtain separately documented explicit production DDL/RLS/read-grant approval. Do not infer this from standing development authorization.
- **After applying (read-only)**: run `sql/tests/cp-tl03c-stage-a-readonly.sql`. Confirm RLS is enabled on both new tables, read grants are constrained, and *both write RPC function grants remain absent*. Verify the documented board/group/column/item counts have not changed.

### Stage B — separately authorized write permission

Source: `sql/cp-tl03c-write-permission-candidate.sql`.

- Only after Stage A acceptance and **new explicit permission-change approval**, this transaction checks the installed document schema, exact board/workspace, no existing document/board data, current session guard, and that write grants are currently absent.
- It grants `authenticated` EXECUTE on both the private and public draft-only commit functions. It does not alter any document records, role assignments, or RLS policies. The server rechecks active signed session, effective module role, board manager access and workspace on every request.
- After Stage B, run `sql/tests/cp-tl03-postactivation-readonly.sql` to verify grants/RLS/audit and board reconciliation.
- Require a **genuine signed user** for positive manager tests, negative User/editor/foreign-workspace tests, invalid/revoked/expired session tests, stale CAS, no duplicates, and refresh/audit evidence. Production test-record writes need separate production-data approval and controlled cleanup/retention.
- Do **not** enable the frontend read/write flags until the authorized endpoint and signed-user acceptance independently pass; passing CI alone is insufficient.

### Reversible emergency disable without data deletion

Source: `sql/cp-tl03c-emergency-disable-candidate.sql`.

- Requires its own scoped emergency production-permission-change approval and preflight.
- Atomically revokes authenticated/anonymous access to all new read/write RPCs and domain-table SELECT grants; preserves the tables, board rows, revisions and immutable audit history. No DROP/TRUNCATE/DELETE/UPDATE.
- The rollback action is itself separately testable, not automatically launched.
- Revoking permissions changes API reachability. Do not deploy automatic destructive rollback or delete document/audit tables after data exists.

## Disposable acceptance chain (not production)

`.github/workflows/cp-tl03b-disposable-postgres.yml` runs in a dedicated GitHub Actions PostgreSQL 17 container with synthetic users, sessions, roles and one board; no production connection or Supabase secrets.

1. Synthetic fixture + staged Stage A SQL.
2. `sql/tests/cp-tl03c-stage-a-readonly.sql`: both write entry points **denied**.
3. Stage B grant candidate **inside disposable PostgreSQL only**.
4. Existing signed draft CRUD/idempotency/CAS/role ceiling/foreign-workspace/revocation/audit negative suite.
5. Existing postactivation RLS/grant/board reconciliation checks.
6. Emergency disable candidate **inside disposable PostgreSQL only**.
7. `sql/tests/cp-tl03c-disposable-emergency-acceptance.sql`: grants denied; 1 document, 4 events and linked board item preserved.
8. Focused frontend contract unit tests.

The revised two-stage CI showed **SUCCESS** in the user-supplied GitHub Actions screenshot (CP-TL-03B run #12 on main), including the emergency-disable chain. Individual per-step logs were not independently re-read in this session. Production Stage A was separately authorized, applied and verified as recorded below; the prior run alone does not authorize Stage B.

## Stop and escalation conditions

- Board identity, group, column, item count, or any of the eight prerequisite function hashes changed.
- Missing `auth.sessions` prerequisites, role/module ceiling drift, missing RLS or unexpected EXECUTE grants.
- Current production backup/recovery policy cannot be confirmed.
- Any red or incomplete disposable PostgreSQL run, or mismatch in positive/negative case evidence.
- Any absent separately required permission/schema/data approval or repository protection requirement.

## Eight-checkpoint tracking (verification denominator)

1. Existing live board/schema and signed function baseline — **VERIFIED**.
2. Read-only dependency drift preflight — **VERIFIED** (10/10 checks).
3. Split Stage A/Stage B source implementation — **IMPLEMENTED** (6/6 isolated contract checks).
4. Nondestructive emergency-disable candidate and retention tests — **CI PASS evidenced by run #12**; actual production disable not executed.
5. Revised disposable PostgreSQL CI and regression — **CI PASS evidenced by run #12 screenshot** (individual steps not independently audited).
6. Stage A explicit production permission/schema approval and activation — **VERIFIED** (migration history and read-only grant/RLS verification).
7. Stage B explicit production write-grant approval and activation — **PENDING**.
8. Genuine signed-session production operational acceptance — **PENDING**.

**The initial CP-TL-03C preparation did not modify production. Following separate authorization and user confirmation of backup availability, Stage A was subsequently applied. Stage B, document mutations, and role changes were NOT performed.**

## Stage A production activation evidence — 2026-11-05 Asia/Manila

- **Authorization:** separate user approval of CP-TL-03C Stage A production schema/RLS/read permissions had already been obtained; the user subsequently confirmed backup availability in the existing Supabase Dashboard. Recoverability was **user-confirmed**, not independently demonstrated by a restored backup.
- **Immediately before migration:** reran the exact `sql/tests/cp-tl03c-production-readiness.sql` against the existing project. Result: `PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_STILL_REQUIRED`; all ten expected scope/dependency checks matched; `changed_dependencies=[]`. Previous migration ledger had 161 entries and no CP-TL-03C activation.
- **Migration operation:** used the connected Supabase `apply_migration` method with the exact committed SQL from `sql/cp-tl03-staged-domain.sql` (Git blob `57a37d7ecab183cd2f548b3b53b70bd44fce2ec3`), name `cp_tl03c_stage_a_readonly_domain_activation`. Returned `{"success":true}`.
- **Recorded migration:** `20261105011611`, `cp_tl03c_stage_a_readonly_domain_activation`, confirmed in Supabase migration history (162 entries).
- **Post-activation acceptance:** the approved read-only `sql/tests/cp-tl03c-stage-a-readonly.sql` check completed without exception. An independent SQL read then confirmed:
  - Two new tables exist, both with RLS enabled and policy `private.tl03_can_manage(board_id)` for authenticated SELECT.
  - `authenticated`: EXECUTE on read/list RPCs **true**; EXECUTE on both public and private commit RPCs **false**.
  - `anon`: EXECUTE on read and commit RPCs **false**.
  - `authenticated`: SELECT on documents **true** with RLS; direct INSERT, UPDATE and audit-event INSERT **false**.
  - Both document and audit-event counts **zero**.
  - Existing board remains active with eight legacy columns and zero records; no operational data imported.
- **Security advisor:** unchanged existing project-wide advisory classes were observed; no new CP-TL-03 function/table warnings singled out in the retrieved advisor summary.
- **Not verified:** authenticated browser request with genuine nonbootstrap/manager user, session revocation production test, backup restoration rehearsal. No test user/record created.

**Stage A = ACTIVATED AND STRUCTURALLY VERIFIED. Stage B = DISABLED, STILL REQUIRES A SEPARATE PRODUCTION WRITE-PERMISSION APPROVAL.**

## Stage A genuine signed-session read acceptance harness — 2026-11-05

**Implementation:** `frontend/tradelink-stage-a-signed-acceptance.js` is now wired into the existing `#/security` **Access acceptance** page through `frontend/app.js`. The UI exposes **Run Stage A signed read checks** and **Copy nonsecret result**. The page's normal signed GoTrue bearer is used through the existing `AuthClient` and `DomainApi`; it does not accept manual tokens, fabricate JWTs, store test identities, or call document mutations.

**Runtime authorization checks:** reverify `/auth/v1/user`, read current workspace context, verify `apsyntra_crm_my_effective_access` (including platform ceiling, TradeLink module role and target board-manager permission), call only `tl03_documents_list` and `tl03_document_read`, verify wrong-board-ID denial, then reverify the identity/workspace. A manager is expected to receive an empty authorized list and `null` for an unpredictable nonexistent UUID at the current zero-document baseline; module-role nonmanager, board editor and a **genuinely signed** foreign-workspace user must receive explicit denial. A foreign-workspace self-permission snapshot containing the TradeLink board is an immediate **FAIL**. Transient network/session errors are **BLOCKED**, never PASS. The unrelated-board-ID probe is not mislabeled a true foreign-workspace test.

**Scope:** zero INSERT/UPDATE/DELETE, zero document payloads in the UI/report, no token exports or browser persistence, no production role changes or account provisioning. A sanitized report contains only check names, PASS/FAIL/BLOCKED statuses and an expected authorization scenario.

**Automated evidence:** `frontend/tests/tradelink-stage-a-signed-acceptance.test.mjs` provides 9 isolated mock regression scenarios for manager, module nonmanager, board manager ceiling, synthetic foreign workspace, foreign-workspace self-snapshot leakage, malformed responses, expired/mismatched identities, nonsecret reporting, and route/event/logout integration. Direct source-replay checks passed **9/9**; full Node/CI and live Pages asset smoke are separate evidence gates.

**Actual genuine-user acceptance:** **PENDING.** The connected browser tool returned `Browser access requires the originating browser context`; the agent could not obtain or invoke the signed APSYNTRA CRM session in this chat. Do not elevate mock tests or structural RLS verification to genuine signed acceptance. For live acceptance, open the deployed `https://wass-psti.github.io/APSYNTRACRM/#/security`, run the button as an existing authorized TradeLink General Manager, then a legitimate nonmanager and an existing foreign-workspace user where available. Copy each sanitized result separately and preserve screenshots showing the signed user category without exposing credentials. The report is deliberately reset on logout. Nonexistent-document reads on the current empty table cannot prove row-level separation for an existing real document; that requires separately authorized later document fixtures.

**Not covered by this probe:** truly revoked/expired production sessions, cross-user role transitions, concurrent document writes and real document-data RLS isolation. These remain pending separate controlled signed-session procedures and Stage B where needed. **Stage B document-write permissions remain disabled.**

## Genuine foreign-workspace signed denial — checkpoint blocked (2026-11-05)

**Requested:** CP-TL-03C genuine foreign-workspace authorization denial using an already-existing signed account, without provisioning, impersonation, or production role/membership mutations.

**Verified production inventory:** Ran read-only, aggregate-only `sql/tests/cp-tl03c-foreign-workspace-eligibility.sql` on the existing Supabase project.

| Verified condition | Value |
| --- | ---: |
| Total existing workspaces | 2 |
| Non-TradeLink (foreign) workspaces | 1 |
| Foreign workspaces with active memberships | 0 |
| Foreign workspaces with active profiles | 0 |
| Foreign workspaces with nonexpired session candidates | 0 |
| Active foreign memberships | 0 |

Query returned **`BLOCKED_NO_ACTIVE_FOREIGN_MEMBERS`**. The foreign workspace exists but currently has no eligible active member or session to submit a genuinely signed GoTrue request. This is a prerequisite blocker, **not an authorization bypass or denial failure**. Synthetic JWTs, SQL role impersonation and altering an existing primary-workspace account cannot be substituted for a real signed user.

**Security unchanged:** `public.tradelink_documents` and `public.tradelink_document_events` remain deployed with both scoped SELECT RLS policies. Read/list RPC grants for `authenticated` remain enabled, document-write RPC grant remains disabled, and the production document count remains zero. No test records, accounts, memberships, roles, or permissions were changed in this gate.

**Prior accepted actual signed-user reports:** `AUTHORIZED_MANAGER` 6/6 PASS and an existing HR user `BOARD_MANAGER_DENIED` 6/6 PASS were supplied by the user. They establish those two specific signed scenarios only. They do not establish foreign-workspace denial or revoked/expired-token behavior.

**Repeatable evidence and safety guard:** The new SQL inventory reports only aggregate counts; `frontend/tests/tradelink-stage-a-signed-acceptance.test.mjs` adds a read-only/no-PII static contract test. Isolated source-replayed assertions **10/10 PASS**. Full Node/GitHub CI must be assessed separately.

**To unblock genuine foreign-workspace acceptance:** a real user must already hold a legitimately authorized *active* membership in the foreign workspace, have an active profile and authenticate with their own session. Any new production membership, account, role, permission, or session changes require **separate scoped authorization** and must preserve workspace isolation; they were not performed. Once a qualifying account legitimately exists, rerun the signed Stage A read acceptance from `#/security`. Expected result: `FOREIGN_WORKSPACE_DENIED` with 6/6 signed checks PASS and zero writes; then separately cover controlled revoked/expired sessions. Until then, **genuine foreign-workspace acceptance status = BLOCKED**.

**CP-TL-03C overall:** Stage A production activation and current-manager/nonmanager signed checks verified; Stage B remains disabled/unapproved and final multi-role acceptance is incomplete.


## Phase 1 restart — 2026-11-06 read-only contract verification

**Verified continuation:** Stage A production installation and its restricted read-only grants are still intact. The previously approved migration `20261105011611` remains recorded; **do not repeat** the additive Stage A schema DDL. A newly committed repeatable post-Stage-A verifier `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` returned `STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED` with **15/15 PASS**. Live TradeLink board shape is one group, eight columns, zero items; both authoritative domain tables and their audit ledger have zero rows; both have enabled RLS with exactly the two signed role-scoped SELECT policies. Authenticated read/list execute grants are present; both authenticated/private/public document commit execute grants remain **disabled**; no anonymous document access or direct authenticated table mutations are granted. All eight central dependencies and five TL03 function source fingerprints/definer modes remain unchanged, and the append-only audit trigger is enabled.

**Improved CI provenance:** GitHub Actions run #13, `41950802327`, PostgreSQL 17 job `126994002587`, was independently retrieved as **SUCCESS** with all acceptance steps green. The decoded job log includes PASS notices for signed draft create/retry/CAS/archive/restore, foreign scope and role ceilings, expired/revoked synthetic sessions, immutable audit and emergency-disable-with-data-retention; Node summary **16 passed/0 failed**. This closes the old *disposable CI unverified* documentation gap only; it does not certify live production signed CRUD or authorize Stage B.

**Current security review:** The Supabase security advisor still exposes unrelated legacy TradeLink asset/reconciliation `SECURITY DEFINER` callable RPC notices and other project-wide warnings. They were not modified. The new installed TL03 public API facades are `SECURITY INVOKER`, their private implementations require signed/manager/module authorization, and signed write EXECUTE remains withheld. Findings affecting other legacy features need a separate ownership review before broad activation; see the full Phase 1 certificate.

**Outstanding:** Genuine fresh signed Stage A read acceptance under deployed HTTPS, cross-workspace where a legitimate active foreign user becomes available, current backup-restoration evidence, separate explicit Stage B permission approval, and Stage B controlled real-session mutation/CAS/audit acceptance remain PENDING. No production data, roles, RLS, flags, or permissions were changed during this restart. The previous pre-Stage-A readiness query intentionally expects absent schema and is **not** suitable for post-Stage-A monitoring; use the new Phase 1 verifier.

**Canonical detailed checkpoint:** `docs/CP-TL-03C-PHASE-1-PRODUCTION-PREFLIGHT-2026-11-06.md`.

**Next:** `CP-TL-03C / Phase 2 — Genuine Signed Stage A Read Acceptance Refresh and Stage B Approval Packet`. Do not activate `sql/cp-tl03c-write-permission-candidate.sql` without new separately scoped production permission approval and a maintained rollback decision.


## Phase 2 — Genuine signed Stage A refresh and Stage B approval packet (2026-11-06)

**Classification:** Phase 2 implementation and risk/approval preparation **VERIFIED**; new live signed read refresh **PENDING**; Stage B production permission change **NOT AUTHORIZED / NOT EXECUTED**.

The existing `frontend/tradelink-stage-a-signed-acceptance.js` is already wired to the real Security page under `Run Stage A signed read checks` and `Copy nonsecret result`. It performs six signed GoTrue/self-effective-access/authorized-list/nonexistent-read/wrong-board/stable-session checks without any write RPC. Historical signed user-submitted `AUTHORIZED_MANAGER` 6/6 and HR `BOARD_MANAGER_DENIED` 6/6 evidence is preserved; **no new live signed report was generated or intercepted by the assistant** because the originating browser context is unavailable. The existing foreign-workspace user prerequisite remains blocked, and controlled revoked/expired production bearer tests remain pending.

The new approval dossier `docs/CP-TL-03C-PHASE-2-SIGNED-READ-AND-STAGE-B-APPROVAL-PACKET-2026-11-06.md` records the proposed **exact two EXECUTE grants** for `authenticated`, Stage A integrity, existing SHA/source guards, technical authority boundaries, production rollout sequence, nonproduction acceptance, outstanding backup/recovery and explicit approval requirements. No Stage B grants, role changes, records, or schema alterations were made during Phase 2.

**Stage B-only rollback gap closed in staged code:** `sql/cp-tl03c-stage-b-write-revoke-candidate.sql` reverses only the two authenticated draft-command EXECUTE permissions, **preserving approved Stage A read/list access and existing documents, board items, immutable audit events, and RLS**. It is distinct from the existing broader `sql/cp-tl03c-emergency-disable-candidate.sql`, which also disables Stage A reads. The new `sql/tests/cp-tl03c-disposable-write-revoke-acceptance.sql` tests data retention and restricted grants in disposable PostgreSQL. Neither candidate was executed against production.

**Independent CI proof:** GitHub Actions [run #16](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42177877866), PostgreSQL 17 job `127760532389`, completed **SUCCESS**. All workflow steps, including narrow Stage B-only write revoke, post-revoke read continuity and retention checks, and final emergency-disable fixture, passed. Actual decoded PostgreSQL log: `CP-TL-03C narrow Stage B write revoke PASS: Stage A reads preserved, documents and audit intact`. Node suite **16 pass / 0 fail**. This is disposable-only integration evidence, not production role/session validation.

**Remaining before a Stage B production approval decision:** fresh authorized manager and genuine HR signed read reports under deployed HTTPS, current production backup/recovery readiness and change owner, explicit separate approval of production EXECUTE grants and any production test-record writes, and continued security review of the privileged mutation boundary. **Do not automatically execute** either `GRANT` or `REVOKE` candidate. A new production permission scope requires an explicit approval and followed-by genuine signed operations; synthetic CI alone is insufficient.

**Next required acceptance:** collect and verify both current-session nonsecret signed Stage A reports, then revisit Stage B approval decision with the already prepared packet and separately authorized production-data test plan. Stage A stays live and read-only.


## Phase 2 fresh signed manager read — accepted (2026-11-06)

The user supplied a new sanitized result with `checkpoint: CP-TL-03C-STAGE-A-SIGNED-READ`, `status: PASS`, `scenario: AUTHORIZED_MANAGER`, and PASS on all six checks: signed identity, effective access, document list, missing-document read, wrong-board denial and stable session. `writesAttempted=0` and `documentsDisclosed=0`. This is **fresh genuine signed application evidence supplied by the user**, not a browser session independently controlled in the assistant tools.

A separate read-only live SQL query again observed zero TradeLink document rows, zero domain audit events, `authenticated` document-list EXECUTE enabled and document-commit EXECUTE disabled. The prior 15-point Phase 1 structural PASS remains accepted; no new full 15/15 result is claimed in this turn. Stage B production write grants remain disabled and unapproved. This closes only the fresh `AUTHORIZED_MANAGER` signed **read** acceptance case.

Next required signed report: an existing HR/nonmanager's fresh `BOARD_MANAGER_DENIED` or `MODULE_ROLE_DENIED` report with six PASS checks, zero writes and zero document disclosures. Genuine foreign-workspace, revoked/expired session and later production draft mutation acceptance stay blocked or pending on their own prerequisites. See `docs/CP-TL-03C-PHASE-2-SIGNED-READ-AND-STAGE-B-APPROVAL-PACKET-2026-11-06.md` for detailed evidence and approval boundaries.
