# CP-TL-03E — Final Recovery Assurance and Production Authorization Decision

**Review date:** 2026-11-08 (Asia/Manila)  
**Disposition:** **NO-GO for CP-TL-03C Stage B production document-write activation.**  
**Project:** `WatchdogWorkspace` (Supabase `jtlusodorfnyzgyuewkz`), APSYNTRA CRM `wass-psti/APSYNTRACRM`.  
**Target board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` (`TradeLink`, Work Management).  
**Repository baseline reviewed:** `main` commit `7ba679f1ab5f017532c8a96cc51c095215ede187`.  
**Execution scope:** Read-only Supabase SQL metadata/function definitions, authenticated CLI backup inventory, GitHub source/CI, and non-mutating authorization review. No production permissions, data, sessions, roles, feature flags, or backups were modified.

> This report is a decision packet, not a production change authorization. Existing signed manager, employee, and revoked-session tests are accepted within their documented boundaries and must not be repeated solely to advance a process milestone.

## 1. Reconciled technical baseline

| Evidence | Verified result | Boundary |
| --- | --- | --- |
| CI at `7ba679f1` | GitHub Actions APSYNTRA CRM Frontend Validation **SUCCESS** (`42390918990`); Pages deployment **SUCCESS** (`42390918147`) | CI/deployment success is not production data acceptance |
| Previous exact main-branch integration `6ec4590e` | **1,165/1,165** frontend tests and four applicable database/frontend CI jobs successful; prior time-dependent OT fixture repaired in PR #70 | Tests are synthetic/local except separately submitted signed browser evidence |
| Live Stage A structural preflight | Canonical `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql`, blob `5d96e2f2`: **15/15 PASS**, `STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED`, `failed_checks=[]` | Non-mutating catalog/contract checks only |
| Stage B commit permissions | Authenticated `EXECUTE` denied for both `private.tl03_commit(uuid,uuid,bigint,text,jsonb)` and `public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)` | Exactly the proposed Stage B draft write functions; legacy asset/reconciliation API remains a distinct scope |
| Frontend release flags | `TL03_DOMAIN_READS_ENABLED=false`, `TL03_DOMAIN_WRITES_ENABLED=false` in `frontend/tradelink-domain-client.js` | No TradeLink domain read/write activation |
| Signed manager Stage A | User report **6/6 PASS**; corroborated by signed Security-page display in prior checkpoint | One currently authenticated manager session |
| Employee nonmanager Stage A | User-supplied **6/6 PASS**, `BOARD_MANAGER_DENIED`, zero writes/disclosures | Nonmanager route; independent employee-browser replay not obtained |
| Revoked manager token | User-supplied genuine `CP-TL-03E-LOCAL-SESSION-REVOCATION`: **PASS**, prior read verified, local sign-out acknowledged, old bearer TradeLink list RPC **HTTP 403** | One previously authorized token and `tl03_documents_list` only; not all RPCs |
| Genuine foreign-workspace / saved-row isolation | **PENDING**; no eligible independent signed foreign actor/authorized persisted QA document | Wrong-board denial does not certify foreign workspace persisted records |

## 2. Actual provider backup inventory and limits

An authenticated, read-only `supabase backups list --project-ref jtlusodorfnyzgyuewkz --output-format json` on the user's authorized Mac (Supabase CLI **2.121.0**) again returned **seven completed physical backups** in region `ap-southeast-2`, with `walg_enabled=true` and **`pitr_enabled=false`**.

| Completed UTC snapshot | Philippine time |
| --- | --- |
| 2026-11-06 17:17:11.138 | 2026-11-07 01:17:11.138 |
| 2026-11-05 17:18:46.103 | 2026-11-06 01:18:46.103 |
| 2026-11-04 17:17:14.372 | 2026-11-05 01:17:14.372 |
| 2026-11-03 17:17:28.785 | 2026-11-04 01:17:28.785 |
| 2026-11-02 17:18:56.610 | 2026-11-03 01:18:56.610 |
| 2026-11-01 17:17:17.399 | 2026-11-02 01:17:17.399 |
| 2026-10-31 17:18:53.474 | 2026-11-01 01:18:53.474 |

**Evidence quality:** Verified provider-reported *completion and inventory*, **not** a successful restore or proof of recoverable data integrity. No off-site export, physical download, rehearsal, restore, or billing-plan change was performed. The available CLI `supabase backups restore` command is PITR timestamp based and cannot be presented as a viable test when PITR is disabled. Supabase documentation describes restoration of scheduled daily snapshots through the dashboard under separate operator approval.

**Shared-project blast radius:** A database restore can make the shared project temporarily unavailable and replace data written after the selected snapshot in unrelated APSYNTRA CRM modules. Database backups do not restore Supabase Storage object bodies; restoration of the database's Storage metadata alone is not file recovery. Current metadata-only counts show **zero** `public.tradelink_documents`, **zero** document audit events, **zero** target board items, **zero** `storage.objects`, and **no** `tradelink-attachments` bucket. These current empty-state counts do not make future attachments recoverable or reduce risk to other PostgreSQL modules.

**Unresolved operational decisions:** Named release/restore owner and independent approver, documented backup selection procedure, organization-accepted **RPO** (maximum tolerable data loss), **RTO** (maximum outage), maintenance window and incident contact, restoration scope/other-module impact, and actual restore rehearsal or explicit documented risk acceptance if a rehearsal is not possible. A backup listing must not be substituted for restore evidence. Do **not** create another Supabase project or restore production without separate authorization.

## 3. Legacy TradeLink `SECURITY DEFINER` review — newly identified prerequisite

A metadata-only query of `pg_proc` plus source inspection found **13** `public.tradelink_*` functions: **11** `SECURITY DEFINER` functions callable by `authenticated`; **zero** callable by `anon`; two trigger/helper functions are not directly callable by authenticated users. `authenticated` and `anon` do not have `CREATE` privilege on the `public` schema.

All 11 signed-callable legacy functions have `auth.uid()` and `public.has_module_access('tradelink', actor)` checks, with additional workspace scoping; mutation-heavy/admin flows additionally check platform/module role and generally revision or other input constraints. These are genuine useful guards, and this inspection did not establish an exploit or unauthorized row disclosure.

**Critical assurance gap:** All **11/11** lack a direct `private.wm_board_config_session_active()` / `auth.sessions` live-session check. The shared `has_module_access`, `current_workspace_id`, `module_role_for`, and `is_platform_admin` definitions do not establish that active-session predicate either. The newer TL03 authorization path **does** check session existence, consistent with the submitted revoked-token HTTP 403. Because Supabase JWTs may remain cryptographically valid until expiry after logout, a previously signed actor with still-valid JWT claims and unchanged module/workspace membership **may** retain some legacy function access until token expiry. This is an evidence-based **potential stale-token authorization exposure**, not yet a tested exploit.

**Affected directly callable functions:**

- `tradelink_asset_read`, `tradelink_asset_write`
- `tradelink_cleanup_fence_activate`, `tradelink_cleanup_fence_release`
- `tradelink_reconciliation_assess`, `tradelink_reconciliation_cleanup_audit_list`, `tradelink_reconciliation_cleanup_preflight`
- `tradelink_reconciliation_list`, `tradelink_reconciliation_report`, `tradelink_reconciliation_request_cleanup`, `tradelink_reconciliation_verify_revision`

**Required security disposition:** Independent reviewer must inspect call graph and effective rights, especially the lower-privilege reporting RPC and mutating asset/cleanup RPCs. Decide whether strict post-revocation denial is required across all legacy TradeLink operations. The recommended narrow, source-reviewed remediation is to add the existing authoritative live-session predicate to each relevant legacy RPC entry path **without changing roles, module authorization, workspace isolation, or public EXECUTE grants**. Introduce negative tests with an authorized, locally revoked old token against representative legacy reads and mutations; include valid manager, nonmanager, wrong-workspace, input limits and CAS/error cases. Staging such a patch is permissible, but **applying it to production functions is a separate security-sensitive SQL change requiring approval and migration review**.

**Project-wide advisors are not the same as TradeLink findings:** The project currently reports `authenticated_security_definer_function_executable` and `rls_enabled_no_policy` warnings across many other applications. The known legacy TradeLink RLS/no-policy tables deny ordinary direct SELECT; no blanket grants/revocations or global policy changes should be made to silence the advisors. See [Supabase function security lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [RLS policy lint](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## 4. Controlled Stage B grant and rollback contract

**Unexecuted candidate:** `sql/cp-tl03c-write-permission-candidate.sql` (blob `b5c8edff`) grants authenticated EXECUTE on exactly two existing functions: `private.tl03_commit(uuid,uuid,bigint,text,jsonb)` and `public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)`. It requires an empty domain and correct board, functions and prior-denied grants. **Neither statement was authorized or executed.**

**Unexecuted narrow rollback:** `sql/cp-tl03c-stage-b-write-revoke-candidate.sql` (blob `48f49723`) revokes exactly those two authenticated EXECUTEs, verifies Stage A reads remain permitted, and does not delete records. It cannot reconstruct corrupted/lost document data and is not a substitute for database restoration. No production rollback command was run.

**Controlled future sequencing, only after all prerequisites and separate approvals:**

1. Appoint named release executor, independent security reviewer, rollback executor, restore owner and incident contact. Record recovery RPO/RTO, acceptable cross-module data-loss/downtime and whether restore rehearsal is required or an exception is explicitly accepted.
2. Resolve or formally risk-dispose the legacy stale-session gap. Close the genuine foreign-workspace acceptance gap using existing eligible actors and a separately authorized nonproduction/production QA fixture; do not create test identities or cross workspace boundaries.
3. Obtain explicit, independently reviewable approval for the **exact two Stage B EXECUTE grants**, approved commit SHA, target board/workspace, change window, feature-flag release, stop conditions, canary actors and retention. **Separately** authorize any actual production QA Draft and its cleanup.
4. Immediately before any approved change, rerun the unchanged 15/15 Stage A preflight, select and record the latest usable backup timestamp, check deployment SHA and independent sign-off; abort on schema/grant drift, outage, missing backup or security exception.
5. An approved executor may apply only the two-function grant transaction, then separately enable precisely reviewed TL03 read/write UI for authorized General Manager Draft operations (create/update/archive/restore). Full submission/approval/PDF/attachments are **not** covered.
6. Verify genuine manager commit, idempotent retry, duplicate prevention, stale revision denial, audit, exact Board item projection, All Documents list, reopen/preview, refresh persistence and employee/foreign/revoked denial. On any unexpected grant, cross-workspace exposure, duplicate or inconsistent audit, stop and initiate approved containment/revoke; decide on a restore only with separate emergency authority.
7. Preserve the signed nonsecret evidence and record a final independent operational acceptance. Never infer production readiness from a successful build, source tests or backup inventory alone.

## 5. Final binary authorization gate

| Required decision/evidence | Classification |
| --- | --- |
| Exact current Stage A structural/API/RLS contract | **VERIFIED — 15/15** |
| CI and GitHub Pages for current checked `main` | **VERIFIED — success** |
| Manager signed read, employee denial, revoked TL03 list read | **VERIFIED / USER-SUPPLIED PASS within documented individual scopes** |
| Current physical backup inventory | **VERIFIED — seven COMPLETED, PITR disabled** |
| Successful physical restore rehearsal or explicit approved exception | **PENDING** |
| Accepted project-wide RPO, RTO, backup selection and cross-module impact | **PENDING** |
| Named release executor, independent security reviewer, rollback/restore owner and change window | **PENDING** |
| Legacy callable definer stale-session risk remediation or independent risk disposition | **PENDING — SECURITY REVIEW REQUIRED** |
| Genuine foreign-workspace / persisted row isolation evidence | **PENDING** |
| Separate SQL privilege-change and production QA data authorizations | **BLOCKED — APPROVAL REQUIRED** |
| Real signed Draft → Board → All Documents → reopened saved data acceptance | **PENDING POST-ACTIVATION** |

**Production GO/NO-GO: NO-GO.** Structural/security read checks pass, but backup recoverability, release ownership, legacy session boundary, foreign-workspace acceptance and expressly approved Stage B grants/fixtures remain unresolved. The completion percentage is **indeterminate** because the remaining gates are qualitative and vary in required scope.

## 6. Evidence/authorization register (no identities fabricated)

| Required accountable field | Recorded evidence |
| --- | --- |
| Production release executor | **UNASSIGNED / NOT EVIDENCED** |
| Independent security reviewer | **UNASSIGNED / NOT EVIDENCED** |
| Rollback and restore owner | **UNASSIGNED / NOT EVIDENCED** |
| Organizational change sponsor / incident contact | **UNASSIGNED / NOT EVIDENCED** |
| Approved RPO | **NOT SPECIFIED** |
| Approved RTO | **NOT SPECIFIED** |
| Backup rehearsal or risk-exception sign-off | **NOT VERIFIED** |
| Legacy stale-session mitigation/risk acceptance | **NOT APPROVED** |
| Exact Stage B two-function permission change | **NOT AUTHORIZED** |
| Production QA record creation/retention | **NOT AUTHORIZED** |

**Source links:** [CI main `42390918990`](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42390918990), [Pages `42390918147`](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42390918147), [accepted revocation and CI evidence PR #70](https://github.com/wass-psti/APSYNTRACRM/pull/70), [earlier CP-TL-03E packet PR #66](https://github.com/wass-psti/APSYNTRACRM/pull/66), [Supabase backup/restore guidance](https://supabase.com/docs/guides/platform/backups).

**Audit record:** All database operations performed for this decision were SELECT-only. Backup CLI invoked listing and help only. No real session or permission change, production QA record, SQL migration, backup restore/export or production feature flag activation was performed.
