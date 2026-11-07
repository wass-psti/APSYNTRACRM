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
