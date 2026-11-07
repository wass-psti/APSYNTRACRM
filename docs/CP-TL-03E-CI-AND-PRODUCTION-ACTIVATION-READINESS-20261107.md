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
| Current verified recoverable backup, restoration exercise, RPO/RTO | **PENDING** | Historical backup assurance is not current recovery evidence |
| Named production executor, independent reviewer and rollback owner | **PENDING** | Responsible persons and change window not established in evidence |
| Fresh genuine positive/negative signed Stage A acceptance | **PENDING** | Historical manager/HR 6/6 reports exist; fresh reports and genuine revoked/foreign-workspace denials outstanding |
| Legacy TradeLink SECURITY DEFINER/RLS risk disposition | **PENDING** | Scoped security review / risk acceptance needed |
| Exact two-function Stage B privilege change approval | **BLOCKED — SEPARATE APPROVAL REQUIRED** | Production permission change |
| Production QA record/cleanup authorization, if needed | **BLOCKED — SEPARATE APPROVAL REQUIRED** | Creating/cleaning production documents and Board items changes live data |
| Genuine signed create → Board item → All Documents → reopen → refresh, and denied actions | **PENDING POST-ACTIVATION** | Must use approved signed actors and authorized fixture; never manufacture success |

**Decision: NO-GO for production Stage B write activation.** The technical source/structural checks are complete for this review, but critical recovery, ownership, signed-user and approval gates remain unresolved. Do not compute an overall completion percentage from the 15/15 structural count.

## 6. Smallest next authorized step

Obtain a current restore/rollback readiness statement and named production execution, security-review and rollback owners; collect refreshed genuine signed **read-only** manager and lower-privilege reports using the existing Security-page Stage A acceptance (do not share tokens). Record a scoped disposition for legacy TradeLink security warnings. Then request **separate, exact-scope production permission and QA-fixture approval** before applying either Stage B grant, changing frontend flags or writing any real document. On authorized activation, execute the existing signed create/deny/revision/Board/list/refresh acceptance plan and be prepared to revoke the two grants if stop conditions occur.

**Operational change in this CP-TL-03E review:** Documentation only, no app code edit, no CI rerun, no backend DDL/DML, and no production activation.



## 7. Controlled recovery evidence — new verification (2026-11-07)

**Connected project health:** The WatchdogWorkspace Supabase project metadata confirms the existing PostgreSQL 17 project is `ACTIVE_HEALTHY`; metadata does **not** expose backup inventory, restoration-point timestamp, successful restoration, plan-specific backup entitlement, or agreed RPO/RTO.

**Local artifact classification:** Through the authorized Desktop Commander Remote connection, inspected `~/WatchdogWorkspace/WATCHDOG-TRADELINK-AUTHORITATIVE-BACKUP-EXPORT-20261022.md`. It describes an older embedded TradeLink vendor-logo/QR and attachment-metadata JSON export, with separate binary-object handling, not a PostgreSQL backup of the current APSYNTRA CRM production database. Its own authenticated export acceptance was pending. It **does not satisfy this recovery gate**. A bounded local filename inventory did not establish any recent restorable project backup. No local source tree, backup file, or database record was modified.

**Provider recovery contract:** [Supabase database backups](https://supabase.com/docs/guides/platform/backups) indicates paid-plan daily backups and optional PITR; free-tier projects require deliberate manual/off-site export. Project plan and backup availability were not established for this specific project. **Do not assume a backup exists based on account age or healthy database status.**

**Owner/recovery authority evidence still required (sanitized, no secrets):**
1. Dashboard **Database → Backups**: current backup availability/type, latest completed backup timestamp and earliest/latest eligible restore point where applicable, as-of date/time, retention and backup scope.
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
- **No fresh signed report was collected in this checkpoint.** The November 6 user-supplied manager/nonmanager reports remain historic evidence, not newly rerun.

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

**As of this review:** the executor/reviewer/rollback owner, restore evidence, fresh signed role acceptance, scoped production authorization, and QA document authorization remain **PENDING/BLOCKED**. **Production activation is NO-GO.** No grant/revoke SQL, DML, feature-flag edit, backup import/export, browser automation, or production deployment was performed.
