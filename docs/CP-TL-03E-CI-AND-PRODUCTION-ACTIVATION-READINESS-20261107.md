# CP-TL-03E — CI Verification and Controlled Production Activation Readiness

**Date:** 2026-11-07 (Asia/Manila)  
**Repository baseline:** `wass-psti/APSYNTRACRM` `main` at `e48862f96b6477c8c4ba2fd88c1bb3411924e6c6`  
**Existing Supabase project:** WatchdogWorkspace `jtlusodorfnyzgyuewkz`  
**TradeLink board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`  
**Disposition:** **Source CI VERIFIED; live Stage A structural preflight VERIFIED; Stage B production write activation NO-GO.** No production mutations, grants, roles, RLS, credentials, or frontend feature flags changed.

## 1. Exact CI evidence — verified from current GitHub run metadata, jobs and frontend log

- The save/reopen/Board-link implementation landed at `b243840c`, followed by syntax repair `4bca0114`, saved-total repair `fbc0f3d7` and regression correction `64fe0abf`. Historical failed jobs are **superseded**, not reclassified as passed.
- [Frontend validation run 42328048303](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42328048303), at `64fe0abfeab1f190ee437b583546144587c35d91`: **SUCCESS**. The decoded `frontend` job log reports **1,156 tests / 1,156 passed / 0 failed / 0 skipped**. Its JavaScript syntax, source/entrypoint, existing auth/contract regression and exact-SHA live-Pages steps passed.
- The same run's **five jobs** completed successfully: `frontend`, `disposable-postgres`, `disposable-collaboration-postgres`, `disposable-ot-postgres` and `live-pages`. These are source, disposable or deployed-asset checks; none confirms a live signed production document write.
- [Pages deployment run 42328048083](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42328048083) for `64fe0abf`: **SUCCESS**. [Pages deployment run 42328281562](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42328281562) at the current docs-only `main` commit `e48862f96b6477c8c4ba2fd88c1bb3411924e6c6`: **SUCCESS**. The docs-only commit changed `docs/TRADELINK-PERSISTENT-DOCUMENT-OPERATIONS-INTEGRATION-20261107.md`, not the application JS.
- [Disposable TradeLink transaction/RBAC/RLS run 41950802327](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41950802327): **SUCCESS**, historical nonproduction synthetic acceptance. Do not equate synthetic signed actors with live GoTrue acceptance.

## 2. Live production contract preflight — fresh SELECT-only execution

The exact committed `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` (blob `5d96e2f27e49fc84fe0c8e68758646842bc9b294`) was reviewed and executed **read-only** against the existing WatchdogWorkspace database on 2026-11-07. Actual response:

- Status: `STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED`
- Checks: **15 passed / 15 total / no failed checks**
- Present: Stage A migration, expected TradeLink board/workspace, Stage A read/list RPCs, current dependency/domain function fingerprints, scoped RLS/SELECT policies, append-only audit trigger and verified active-session catalog.
- Not exposed: anonymous document read/list/commit; direct authenticated document/audit table writes; authenticated EXECUTE on `public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)` or `private.tl03_commit(uuid,uuid,bigint,text,jsonb)`.
- Baseline: **0** `tradelink_documents`, **0** `tradelink_document_events`, **0** TradeLink Board items.
- Result is **structural only**. It cannot attest actual signed-user create/reopen/foreign-workspace denial on persisted rows or backup restoration. The script explicitly reports these operational acceptance conditions as not verified.

## 3. Scope of proposed activation, with NO application

- `frontend/tradelink-domain-client.js` retains `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`.
- The existing candidate `sql/cp-tl03c-write-permission-candidate.sql` would, **only after separate authorization**, grant authenticated EXECUTE on the private/public TradeLink draft commit RPCs. It is fail-closed against unexpected board shape, existing documents/items or an already-active commit grant.
- The existing narrow rollback `sql/cp-tl03c-stage-b-write-revoke-candidate.sql` would revoke **those two grants only** and preserve Stage A reads, persisted documents, audit records and Board relationships. Neither grant nor rollback candidate was executed.
- A frontend flag change is an independent production release step, not authorization to change server permissions; a flag rollback alone does not revoke server EXECUTE.
- The existing Stage B contract permits Draft create/update/archive/restore only, **not** submission, approval, PDF, attachments or the full six-module workflow lifecycle.

## 4. Security advisor scope

A fresh Supabase security advisor read returned project-wide categories: `rls_enabled_no_policy` **81 INFO**, `function_search_path_mutable` **9 WARN**, `anon_security_definer_function_executable` **3 WARN**, `authenticated_security_definer_function_executable` **271 WARN**, and `auth_leaked_password_protection` **1 WARN**. These counts are **project-wide**, not counts for new TL03 APIs. Advisor entries include legacy TradeLink asset/reconciliation/cleanup functions and tables. A scoped risk decision is required; no broad privilege changes should be inferred from these generic warnings.

References: [RLS policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [RLS no-policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [authenticated SECURITY DEFINER advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## 5. Production Stage B go/no-go

| Gate | Classification | Evidence / outstanding requirement |
| --- | --- | --- |
| Current `main` source and syntax regression | **VERIFIED** | `64fe0abf` frontend log: 1,156/1,156 |
| Five-job frontend/regression/asset CI | **VERIFIED** | Run 42328048303; docs-only head deployment also success |
| Live Stage A permissions/RLS/fingerprints | **VERIFIED** | SELECT-only 15/15, 2026-11-07 |
| Production Stage B write disabled | **VERIFIED** | Both RPC EXECUTEs denied; frontend flags false |
| Prior synthetic transaction, idempotency and RBAC | **VERIFIED — DISPOSABLE ONLY** | Run 41950802327 |
| Provider physical-backup inventory | **VERIFIED — 7 completed backups** | Existing CLI `supabase backups list`, latest `2026-11-06T17:17:11.138Z` UTC; PITR disabled |
| Successful restoration/rehearsal, recovery owner, RPO/RTO | **PENDING** | Backup list status alone is not a verified restoration |
| Named production executor, independent reviewer and rollback owner | **PENDING** | Responsible persons and change window not established in evidence |
| Fresh signed Stage A authorized-manager acceptance | **VERIFIED — 6/6 PASS** | User-supplied sanitized report corroborated by the read-only connected Security page on 2026-11-07; zero writes/disclosures |
| Fresh signed Stage A nonmanager denial | **USER-SUPPLIED PASS — 6/6** | Sanitized employee-session report provided on 2026-11-07; the connected browser still displays a manager result, so no independent employee-page corroboration was available |
| Genuine TradeLink revoked-session read denial | **USER-SUPPLIED PASS — 403** | Sanitized `CP-TL-03E-LOCAL-SESSION-REVOCATION` signed manager report, 2026-11-08 PHT; prior manager read and local sign-out acknowledged; no raw HTTP replay captured by this review |
| Genuine foreign-workspace signed denial / persisted-row isolation | **PENDING / BLOCKED** | No eligible existing foreign-workspace actor/approved persisted QA record evidence; wrong-board probe is not a substitute |
| Legacy TradeLink SECURITY DEFINER/RLS risk disposition | **PENDING** | Scoped security review / risk acceptance needed |
| Exact two-function Stage B privilege change approval | **BLOCKED — SEPARATE APPROVAL REQUIRED** | Production permission change |
| Production QA record/cleanup authorization, if needed | **BLOCKED — SEPARATE APPROVAL REQUIRED** | Creating/cleaning production documents and Board items changes live data |
| Genuine signed create → Board item → All Documents → reopen → refresh, and denied actions | **PENDING POST-ACTIVATION** | Must use approved signed actors and authorized fixture; never manufacture success |

**Decision: NO-GO for production Stage B write activation.** The technical source/structural checks are complete for this review, but critical recovery, ownership, signed-user and approval gates remain unresolved. Do not compute an overall completion percentage from the 15/15 structural count.

## 6. Smallest next authorized step

Use the newly verified provider backup inventory to establish an accountable restore/rollback plan, explicit RPO/RTO, and named production execution, security-review and rollback owners; retain the signed manager 6/6 evidence and newly submitted employee nonmanager 6/6 sanitized report (independent employee-browser corroboration still pending); prioritize only remaining genuinely distinct denial/recovery scenarios. Record a scoped disposition for legacy TradeLink security warnings. Then request **separate, exact-scope production permission and QA-fixture approval** before applying either Stage B grant, changing frontend flags or writing any real document. On authorized activation, execute the existing signed create/deny/revision/Board/list/refresh acceptance plan and be prepared to revoke the two grants if stop conditions occur.

**Operational change in this CP-TL-03E review:** Documentation only, no app code edit, no CI rerun, no backend DDL/DML, and no production activation.



## 7. Controlled recovery evidence — new verification (2026-11-07)

**Connected project health:** The WatchdogWorkspace Supabase project metadata confirms the existing PostgreSQL 17 project is `ACTIVE_HEALTHY`. This metadata response alone does not expose backup inventory, restoration results, plan-specific entitlement or agreed RPO/RTO. A separate read-only authenticated CLI inventory now provides the actual provider backup status below.

**Local artifact classification:** Through the authorized Desktop Commander Remote connection, inspected `~/WatchdogWorkspace/WATCHDOG-TRADELINK-AUTHORITATIVE-BACKUP-EXPORT-20261022.md`. It describes an older embedded TradeLink vendor-logo/QR and attachment-metadata JSON export, with separate binary-object handling, not a PostgreSQL backup of the current APSYNTRA CRM production database. Its own authenticated export acceptance was pending. It **does not satisfy this recovery gate**. A bounded local filename inventory was not valid provider backup evidence; the separately obtained authenticated provider backup list below establishes the available physical snapshots. No local source tree, backup file, or database record was modified.

**Provider recovery contract:** [Supabase database backups](https://supabase.com/docs/guides/platform/backups) indicates paid-plan daily backups and optional PITR; free-tier projects require deliberate manual/off-site export. The CLI independently verifies physical backup availability for this specific project, although the project billing plan was not inspected. **Do not assume a completed backup was successfully restored** based on its existence or project health.

**Fresh physical-backup inventory (Desktop Commander Remote, authenticated Supabase CLI 2.121.0, read-only `supabase backups list --project-ref jtlusodorfnyzgyuewkz --output-format json`):**

| Provider-reported completed physical backup (UTC) | Status |
| --- | --- |
| 2026-11-06 17:17:11.138 | COMPLETED — latest |
| 2026-11-05 17:18:46.103 | COMPLETED |
| 2026-11-04 17:17:14.372 | COMPLETED |
| 2026-11-03 17:17:28.785 | COMPLETED |
| 2026-11-02 17:18:56.610 | COMPLETED |
| 2026-11-01 17:17:17.399 | COMPLETED |
| 2026-10-31 17:18:53.474 | COMPLETED |

The provider response indicates `region: ap-southeast-2`, `walg_enabled: true`, **`pitr_enabled: false`**. This validates backup *inventory and completion metadata*, **not an actual restored database**. No backup was downloaded, restored, modified, or used to alter the live project. The project's whole-database physical restore may affect unrelated WatchdogWorkspace modules; no rehearsal was undertaken. The latest reported completed backup corresponds to **2026-11-07 01:17:11 PHT**. RPO and RTO remain to be explicitly agreed for the shared project.

**Owner/recovery authority evidence still required (sanitized, no secrets):**
1. Dashboard **Database → Backups**: independently cross-check the verified backup entries, retention, restore procedure, availability at the actual release window, and any changes since this snapshot. Document the selected point and scope before change.
2. Identify a named recovery/rollback owner, incident contact, and acceptable **RPO (maximum potential data loss)** and **RTO (maximum outage)** for the *whole shared WatchdogWorkspace project*, not only the TradeLink module.
3. Evidence that the selected backup can actually be restored, preferably by a controlled nonproduction rehearsal within an already authorized environment. **No new Supabase project, production overwrite, data export, or new cost commitment was attempted or authorized in this gate.** If a rehearsal is not feasible, document the risk and keep Stage B NO-GO rather than claiming recovery verified.
4. Identify recovery interactions with Auth/Board/Audit/other modules. A whole-project restore would affect more than TradeLink. The existing **two-function narrow revoke** is a forward containment step, **not** a substitute for restoring lost/corrupted data.

## 8. Genuine HTTP boundary evidence and signed acceptance collection

**Fresh independent live denial:** One anonymous HTTPS `POST /rest/v1/rpc/tl03_documents_list` with the public **publishable** key and an existing TradeLink board ID, `p_limit=1`, returned **HTTP 401**. No signed bearer, production data content, SQL mutation, Board write, or retry loop was used. This supports **anonymous runtime denial for that one list endpoint**. It does **not** prove signed actor RLS, revoked access, foreign-workspace isolation or generic API security. No commit RPC was invoked.

**Connected browser evidence:** The user already has a genuine signed APSYNTRA CRM TradeLink Draft route open; the page shows a signed workspace and **Save Draft disabled** because domain writes are not activated. Browser Chat access is **read-only**, so no click/keyboard/network/session acceptance can legitimately be claimed from that page inspection.

**Existing approved non-mutating signed acceptance action:** In the same signed APSYNTRA session navigate to `#/security` and open **TradeLink · Stage A signed read acceptance** → **Run Stage A signed read checks** → **Copy nonsecret result**. The committed implementation is `frontend/tradelink-stage-a-signed-acceptance.js`. It performs six read-only checks: `signed-identity`, `effective-access`, `document-list`, `missing-document-read`, `wrong-board-denial`, `stable-session`. The sanitization function outputs only checkpoint/scenario/status/check names and statuses and records `writesAttempted:0` and `documentsDisclosed:0`.

- Execute with **existing** manager and existing lower-privilege signed sessions, individually and legitimately, without creating temporary users, impersonating identities, extracting tokens, or altering membership.
- Expected manager report: `status: PASS`, `scenario: AUTHORIZED_MANAGER`, six `PASS` checks, zero writes/disclosure.
- Expected lower-privilege report: `status: PASS`, `scenario: BOARD_MANAGER_DENIED` or `MODULE_ROLE_DENIED`, six `PASS` checks, zero writes/disclosure.
- A genuine foreign-workspace report remains **BLOCKED** until an independently eligible existing workspace actor is available; a wrong-board-ID probe is not a replacement.
- A genuine expired/revoked bearer test remains **PENDING** and cannot be achieved by the UI's normal auto-refresh path; requires a separately controlled test with an authorized session authority.
- **Fresh authorized-manager signed report collected on 2026-11-07, 6/6 PASS; corroborated by the signed Security page.** A separate fresh employee nonmanager report was subsequently supplied on 2026-11-07, `BOARD_MANAGER_DENIED` 6/6 PASS, zero writes/disclosures; the accessible signed page at inspection time still displayed the earlier manager result and did not independently corroborate the employee-session report. Foreign/revoked real-session checks remain outstanding.

**Data security:** Capture only sanitized reports. Do not copy browser tokens, session IDs, raw HTTP headers, user IDs, private documents, database connection strings or account credentials into this repository.

## 9. Explicit Stage B activation change-control contract (not approved)

**Proposed permission delta:** After independently completed gates and a separate exact-scope production permission approval only, `sql/cp-tl03c-write-permission-candidate.sql` would grant authenticated EXECUTE on exactly these **two pre-existing** functions:
- `private.tl03_commit(uuid,uuid,bigint,text,jsonb)`
- `public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)`

Stage B is **Draft create/update/archive/restore only**. The frontend `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false` states are independent release controls. Neither an approved PR nor a successful CI run implies authorization to change SQL grants, enable flags, write QA records or expand submission/approval/PDF workflows.

**Release/reversal packet must identify:** exact Git SHA, approved permission diff, board/workspace target, release executor, independent security reviewer, rollback executor, maintenance window, change record, recoverable-backup evidence, acceptable RPO/RTO, canary test account(s), separately authorized QA record scope, incident contact, no-go stop signals, and post-change evidence retention.

**Gate sequence (future, conditional on independent approvals):**
1. Verify repository HEAD/CI, fresh 15/15 post-Stage-A catalog preflight, provider backup/recovery evidence, owner assignments and scoped review of legacy TradeLink security warnings. Halt if drift or unknown recovery.
2. Obtain **separate permission-change and production data-fixture approval**. In a controlled release window, grant only the approved two EXECUTEs; maintain default-off write UI until server authorization and verification are ready.
3. Under a distinct approved frontend release, enable authorized document reads and controlled Draft write UI only for the reviewed target/roles; run real signed manager and denied principal checks. Create one authorized QA Draft, verify the exact document and Board item, audit event, idempotent retry, revision conflict, saved All Documents listing, reopened preview and refresh persistence.
4. **Stop immediately** on unexpected authorization, workspace crossing, duplicate Board item, incomplete transaction/audit, stale-session acceptance or unrecoverable error. Disable frontend write UI for containment, execute the **approved narrow rollback** `sql/cp-tl03c-stage-b-write-revoke-candidate.sql` through the authorized executor, verify both EXECUTE privileges are denied while Stage A reads and persisted records remain intact; invoke a broader outage/restore only with separate emergency authority.
5. Preserve the actual signed evidence and operator sign-off. Operational activation is VERIFIED only upon all real acceptance checks, not from source or disposable tests.

**As of this review:** the provider physical-backup inventory is **VERIFIED**, while successful restore/recovery evidence, executor/reviewer/rollback owner, independent employee-session corroboration where required and foreign/revoked signed denial acceptance, scoped production authorization, and QA document authorization remain **PENDING/BLOCKED**. **Production activation is NO-GO.** No grant/revoke SQL, DML, feature-flag edit, backup import/export, browser automation, or production deployment was performed.


## 10. Scoped live TradeLink security catalog inventory (2026-11-07, SELECT-only)

Fresh, production-connected **metadata-only** inspection of `pg_proc`, function EXECUTE ACLs, `pg_class`, RLS flags and `pg_policies` produced these precise boundaries:

- **11 legacy `public.tradelink_*` SECURITY DEFINER RPCs** are executable by `authenticated`, not by `anon`: asset read/write; cleanup fence activate/release; reconciliation assess, cleanup audit list/preflight/list/report, request cleanup, and verify revision. This is an **accessible elevated execution surface** that requires source-level authorization and input review, **not** proof that any caller can misuse it.
- **Four legacy `public.tradelink_*` tables** have RLS enabled, zero attached RLS policies, and **no direct SELECT privilege** for either `authenticated` or `anon`: attachment cleanup audit, attachment reconciliation, cleanup reference fences, and vendor assets. These are legacy guarded/private data surfaces; zero policies do **not**, by themselves, establish a read leak.
- **Two new TL03 tables**, `public.tradelink_documents` and `public.tradelink_document_events`, both have RLS enabled and one scoped SELECT policy each, authenticated SELECT granted and anonymous SELECT denied.
- **Three public TL03 functions** are SECURITY INVOKER; anonymous EXECUTE denied on all three. Authenticated EXECUTE is permitted only on `tl03_document_read` and `tl03_documents_list`; `tl03_document_commit` remains denied.

This read-only catalog review narrows the legacy security scope without changing any grants, functions, policies, or data. The **independent risk disposition remains PENDING**: review authorization clauses, identity/session/workspace checks, input validation and call graphs of the eleven existing elevated functions against applicable source; test valid and denied real principal behavior in an authorized environment. Do not infer they are safe merely because anonymous EXECUTE is denied, or try to fix general advisor warnings by broad grants/revocations.

**Current go/no-go unchanged: NO-GO.** A good RLS metadata result and HTTP 401 are necessary but insufficient evidence of complete signed-user authorization or recoverability.


## 11. Fresh genuine authorized-manager Stage A acceptance — 2026-11-07

**Classification: VERIFIED for one existing authorized-manager signed session, limited to the six read-only Stage A acceptance checks.**

The user submitted the sanitized output generated by the existing APSYNTRA CRM Security-page action. A separate read-only `Browser.get_tab_context` inspection of the currently selected signed `#/security` page independently displayed the matching **Result: PASS · AUTHORIZED MANAGER** with six PASS rows, `Writes attempted: 0`, and `Document contents disclosed: 0`. This confirms the application presented the same result; the browser inspection did **not** independently replay the underlying bearer-bound RPCs or inspect raw server logs.

**Nonsecret accepted report:**

```json
{
  "checkpoint": "CP-TL-03C-STAGE-A-SIGNED-READ",
  "status": "PASS",
  "scenario": "AUTHORIZED_MANAGER",
  "checks": [
    {"name": "signed-identity", "status": "PASS"},
    {"name": "effective-access", "status": "PASS"},
    {"name": "document-list", "status": "PASS"},
    {"name": "missing-document-read", "status": "PASS"},
    {"name": "wrong-board-denial", "status": "PASS"},
    {"name": "stable-session", "status": "PASS"}
  ],
  "writesAttempted": 0,
  "documentsDisclosed": 0
}
```

**Accepted scope:** current signed GoTrue user and active workspace reverified by the app's Stage A checks; manager-level effective access; bounded document list; negative read for a nonexisting document; wrong-board denial; stable current session. The report contains no JWT, session identifiers, private user details, document contents, or write operations. A result of `document-list: PASS` against zero current records **does not** validate persisted-document cross-workspace RLS.

**Still outstanding:** Independent employee-session browser corroboration if formal acceptance requires it; foreign-workspace actor denial where an eligible existing legitimate actor exists; revoked/expired bearer denial (separate controlled operation); restored-backup proof, release/review/rollback ownership, scoped legacy elevated-function risk disposition, separately approved two-function production EXECUTE grant and QA document fixture authorization. **No production permissions, flags, data, sessions, backups, or user roles were changed. Stage B NO-GO unchanged.**

**Next narrow acceptance:** The nonmanager report is already available; do not repeat it merely for process. Verify remaining independently applicable gates (recovery evidence, release ownership, elevated legacy-function risk disposition, foreign-workspace acceptance if an existing eligible actor is present, and a separately controlled revoked/expired bearer denial). No test-account creation or role changes.


## 12. Fresh employee nonmanager denial — 2026-11-07

**Evidence classification: USER-SUPPLIED SANITIZED SIGNED-SESSION REPORT, FORMAT/EXPECTED OUTCOME VALIDATED; independent browser corroboration NOT VERIFIED.**

The user supplied a fresh result from an existing employee account (no account name, email, user ID, token or session identifier retained in this repository). The `BOARD_MANAGER_DENIED` scenario is the expected nonmanager outcome for the Stage A signed read probe, and all six reported checks passed. This is evidence for the **nonmanager access-denial scenario only**; it is not a second authorized-manager result.

```json
{
  "checkpoint": "CP-TL-03C-STAGE-A-SIGNED-READ",
  "status": "PASS",
  "scenario": "BOARD_MANAGER_DENIED",
  "checks": [
    {"name": "signed-identity", "status": "PASS"},
    {"name": "effective-access", "status": "PASS"},
    {"name": "document-list", "status": "PASS"},
    {"name": "missing-document-read", "status": "PASS"},
    {"name": "wrong-board-denial", "status": "PASS"},
    {"name": "stable-session", "status": "PASS"}
  ],
  "writesAttempted": 0,
  "documentsDisclosed": 0
}
```

**Independent browser observation:** At the time this report was received, read-only inspection of the selected `#/security` tab still displayed **`PASS · AUTHORIZED MANAGER`**, not the employee `BOARD_MANAGER_DENIED` report. Therefore the user-supplied employee report cannot be described as independently browser-corroborated, and this checkpoint must not claim that the connector replayed employee RPCs. No need to rerun the same employee check by default; preserve the distinct evidentiary scopes.

**New acceptance ledger:** Manager read scenario: **VERIFIED 6/6** with same-page corroboration. Employee denial scenario: **USER-SUPPLIED PASS 6/6**, no new external corroboration. Anonymous HTTP list denial: **VERIFIED 401**, separate case. Foreign-workspace and revoked/expired bearer denial: **PENDING**, not implied by wrong-board denial. Stage A remains non-mutating with zero record contents. Stage B grants, frontend flags, QA document creation, backup recovery exercise and independent risk acceptance remain unchanged and **NO-GO**.


## 13. CP-TL-03E — controlled revoked-session implementation and final recovery/authorization decision (2026-11-07; historical pre-merge review, superseded for revocation status by §14)

**Scope / authoritative distinction:** The existing B3 Security-page revoked-token check probes the Workspace B3 Edge endpoint and is **not** evidence that a revoked bearer cannot read TradeLink. The TradeLink source checks `private.wm_board_config_session_active()` inside `private.tl03_can_manage`; the staged backend and live function fingerprints require a live signed session before TradeLink document reads. Supabase notes that revoked JWTs can remain cryptographically valid until expiry, so a local browser sign-out or unsigned HTTP 401 alone cannot prove the TradeLink server gate.

### New dedicated source-only acceptance path

A separate **draft** [PR #68](https://github.com/wass-psti/APSYNTRACRM/pull/68), commit `a10b666a47655596cce9d59d2ad6bf2ef8265388`, adds:
- `frontend/tradelink-revoked-session-acceptance.js`, its focused nine-test suite and scoped Security-page wiring in `frontend/app.js`.
- Two deliberate operator clicks to prepare and confirm. Before sign-out it requires the existing six-check **`AUTHORIZED_MANAGER`** signed Stage A preflight, a matching current in-memory access token, and a JWT with sufficient unexpired time. A blocked/nonmanager preflight **never signs the user out**.
- `AuthClient.signOut({scope:'local'})` only for the confirmed current session. Replay only **one read-only** `POST /rest/v1/rpc/tl03_documents_list` using the previously accepted token and exact board ID. `401` or `403` plus prior-positive read and acknowledged logout => narrow **PASS**; `200` => **FAIL**; network/expiry/ambiguous states => **INCONCLUSIVE**.
- In-memory only old bearer; sanitized result available after sign-out on login screen; no JWT/user identifier/report secret or local draft written to storage. Other device sessions are not deliberately revoked.
- **Source-only** release status: no commit to `main` from this work and no production deployment/activation. The signed user has **not** been signed out by this review. Genuine revoked-session HTTP evidence remains **PENDING**.

**Verification:** Isolated local Node 22 source smoke, JavaScript syntax, and `node scripts/verify-pages-source.mjs` PASS. Full `node --test frontend/tests/*.test.mjs` **1,165/1,165 PASS** (1,156 baseline plus nine dedicated regression cases). Independent GitHub Actions [run 42388973797](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42388973797) at `a10b666a` **SUCCESS**: frontend, disposable PostgreSQL, collaboration PostgreSQL and OT PostgreSQL all succeeded; `live-pages` was correctly **SKIPPED** for this non-main branch. Do not use source CI PASS to certify genuine bearer revocation or production behavior.

### Final live structural and recovery recheck

Fresh **SELECT-only** live execution of the canonical `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql`, blob `5d96e2f27e49fc84fe0c8e68758646842bc9b294`, again returned **`STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED`**, **15/15** checks with `failed_checks: []`. It verifies unchanged exact function fingerprints, RLS, read grants, anonymous denial, no authenticated EXECUTE on either Stage B commit function, zero TradeLink documents/events/Board items and no production mutations.

Authenticated read-only `supabase backups list --project-ref jtlusodorfnyzgyuewkz --output-format json` again reported **seven COMPLETED physical backup entries**, latest at **`2026-11-06T17:17:11.138Z` (2026-11-07 01:17:11 Philippine time)**, `walg_enabled:true`, **`pitr_enabled:false`**. This proves provider-reported backup existence only. No actual restoration, database export, backup download, new Supabase project, other-instance rehearsal, or protected restore was attempted. CLI `supabase backups restore --help` documents a **PITR timestamp restore**, which cannot be treated as an available option with PITR disabled.

**Material shared-project recovery risk:** Physical database restoration can replace the whole shared WatchdogWorkspace database state, not just TradeLink. With PITR unavailable, changes after the chosen snapshot could be lost. A schema source check, populated backup list and the reversible **Stage B grant revoke** do not demonstrate complete data recovery. No one has provided accepted RPO/RTO, a successful independent restore rehearsal, an accountable backup/incident owner, a maintenance window, an approved whole-project recovery impact decision, or a confirmed production QA record budget. Therefore **recoverability remains PENDING and a strict Stage B NO-GO blocker**; do not silently infer recovery readiness or permit a destructive restore.

### Final authorization matrix

| Required gate | Decision as of this review |
| --- | --- |
| Baseline application regression and synthetic Postgres security | **VERIFIED** (historical main CI, plus new branch 1,165/1,165 CI; not live revoked actor) |
| Exact current Stage A production RLS/grants/fingerprints | **VERIFIED** (fresh read-only 15/15) |
| Existing manager signed read and employee signed denial | **VERIFIED user-reported scope** (manager 6/6 with same-page corroboration; employee 6/6 user-supplied, browser independently unconfirmed) |
| Actual revoked TradeLink manager bearer denied after local signout | **PENDING**, dedicated UI source implemented and tested in PR #68, not yet released/executed |
| Foreign-workspace signed actor denial / persisted row isolation | **PENDING/BLOCKED**, no new eligible account provisioned and no authorized production fixture |
| Seven completed physical backups | **VERIFIED METADATA**; restore and acceptable RPO/RTO **PENDING** |
| Production executor, independent security reviewer and rollback owner | **PENDING**, do not invent assignees |
| Review/risk disposition for eleven legacy elevated TradeLink functions | **PENDING**, scoped catalog inventory completed only |
| Exact Stage B two-function EXECUTE grant, controlled read/write flags, real QA document | **BLOCKED — separate production permission, release and data approvals** |
| Actual create → Board projection → All Documents → saved preview → refresh and deny cases | **PENDING AFTER AUTHORIZED ACTIVATION** |

**Production decision: NO-GO.** Do not merge draft PR #68 as implicit authorization for Stage B writes; any controlled frontend release of the optional sign-out test must follow the repository's normal review and deployment policy and be communicated to the operator beforehand. Even after a genuine signed revoked-session PASS, recovery evidence, independent security risk disposition, release owner/rollback assignments and **separate express permission/data approval** are still prerequisites before activating Stage B.

**No production data write, grant/revoke DDL, role/membership modification, credential access, session revocation, feature-flag change, database restore, or production deploy was made during this review.** Source-only work lives in draft PR #68. The existing evidence record continues in draft PR #66.


## 14. Signed revoked-session acceptance and CI stabilization — 2026-11-08 PHT

**Updated revocation disposition: USER-SUPPLIED SIGNED RUNTIME PASS for precisely one previously authorized manager token against `tl03_documents_list` after local sign-out.** The user supplied the sanitized result from the merged TradeLink Security-page acceptance path. Its structure, stage, and required fields match the source acceptance contract, and its `403` is the expected denied outcome. This is **not** a direct replay of HTTP authorization by the reviewing agent; no raw bearer, header, session or server log was accessed.

```json
{
  "checkpoint": "CP-TL-03E-LOCAL-SESSION-REVOCATION",
  "status": "PASS",
  "stage": "revoked-rpc-denied",
  "priorSignedManagerReadVerified": true,
  "localSignoutAcknowledged": true,
  "revokedTradeLinkReadDenied": true,
  "denialHttpStatus": 403,
  "logoutScope": "local",
  "domainWritesAttempted": 0,
  "identifiersDisclosed": 0,
  "persistedDocumentContentsDisclosed": 0,
  "acceptanceBoundary": "ONE_PREVIOUSLY_ALLOWED_MANAGER_TOKEN_DENIED_AFTER_LOCAL_LOGOUT"
}
```

**Runtime acceptance boundary:** Before local logout, the dedicated client helper required an active verified manager read preflight with six Stage A PASS checks and an unexpired JWT. After the server acknowledged a **local-scoped** sign-out, the app replayed the previous in-memory bearer once to the TradeLink list RPC; the submitted result reports denial **HTTP 403**. This does not certify global logout, refresh-token behavior on other devices, mutations, other RPCs, cross-workspace saved-row isolation, or universal revocation enforcement. The acceptance path reports **zero writes, identifiers or persisted contents disclosed**. The user's selected tab was reported at `#/login`, consistent with local logout, but the connector's page-text snapshot did not independently corroborate the entire signed-revocation report.

**Production deployment context:** Previously draft [PR #68](https://github.com/wass-psti/APSYNTRACRM/pull/68) was **merged** as `597e15f9`, and previous evidence [PR #66](https://github.com/wass-psti/APSYNTRACRM/pull/66) was **merged** at `573de53a`. GitHub Pages deployment [run 42389712371](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42389712371) for `573de53a` succeeded. The current `main` `frontend/tradelink-domain-client.js` still retains **`TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`**, so this security test release **did not activate TradeLink persistence**.

### Distinct frontend CI finding and corrective action

The post-merge frontend [run 42389686352](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42389686352) at `597e15f9` was **FAILED**: **1,164/1,165** tests passed, with a single pre-existing TimeTracker UI test failing. That fixture supplies an OT request dated `2026-11-02` but implicitly renders the **current PHT week**. At `2026-11-07 16:07Z` (Sunday `2026-11-08 00:07` PHT), the displayed week advanced and the dated row was filtered out. The failure does not establish a TradeLink security regression, but remains genuine red CI and must not be ignored.

In branch `fix/cp-tl03e-ci-date-and-revocation-evidence-20261108`, commit `533c5e3671d937ca195c845c2c0acf40ecdede1d`, a focused **test-only** correction passes the TimeTracker renderer an explicit fixed reference date `2026-11-04T04:00:00.000Z` while keeping the original OT request, expected row and production renderer unchanged. On the authorized Mac via Desktop Commander Remote, `node --test frontend/tests/*.test.mjs` returned **1,165/1,165 PASS, 0 FAIL**; `node scripts/verify-pages-source.mjs` and `git diff --check` passed. CI at the new PR's head must be checked independently; local tests are not a substitute for GitHub Actions.

### Revised production authorization decision

| Gate | Updated classification |
| --- | --- |
| Previously approved signed manager read (6/6) | VERIFIED — previously corroborated |
| Employee nonmanager access denial (6/6) | USER-SUPPLIED PASS — previous checkpoint; no rerun required |
| Actual revoked manager list RPC after local sign-out | **USER-SUPPLIED PASS — HTTP 403**; bounded live-scenario acceptance |
| Foreign-workspace signed principal / persisted cross-workspace row isolation | PENDING / BLOCKED until a legitimate existing actor/authorized record can be used |
| Structural Stage A read-only preflight, Stage B grants disabled | VERIFIED — latest 15/15 SELECT-only result; no new DDL |
| Seven completed physical backup snapshots; PITR disabled | VERIFIED metadata — restoration rehearsal, full-project impact and agreed RPO/RTO PENDING |
| Named release executor, independent security reviewer, rollback owner and maintenance window | PENDING |
| Eleven legacy TradeLink elevated function risk disposition | PENDING |
| Production Stage B two-function write grants and frontend activation | BLOCKED — separate production permission/release approval |
| Production QA document creation, Board projection, All Documents and refresh acceptance | BLOCKED — separate production-data approval and genuine acceptance required |

**Final conclusion: Revoked-session acceptance advanced to USER-SUPPLIED PASS within its precise read-only boundary. CP-TL-03E production activation remains NO-GO.** Do not repeat successful manager/employee/revocation checks merely to advance. Prioritize the independent legacy-security review, recoverability/whole-project restoration strategy, named accountable release owners and authorized foreign-workspace evidence where feasible. Only request distinct production-write and QA-data approval after the remaining preconditions are met.

**Change audit:** This update adds a nonsecret acceptance record and a test-only clock-stability correction for CI. No production database changes, TradeLink feature-flag changes, role modifications, session action by the agent, backup restore, or data writes were performed.
