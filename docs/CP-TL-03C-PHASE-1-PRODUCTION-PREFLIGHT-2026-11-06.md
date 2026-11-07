# CP-TL-03C / Phase 1 — Controlled Production Activation Preflight & Contract Verification

**Date:** 2026-11-06 (Asia/Manila)  
**Target:** existing APSYNTRA CRM GitHub repository `wass-psti/APSYNTRACRM`; existing Supabase project `jtlusodorfnyzgyuewkz`; existing TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`.  
**Classification:** **VERIFIED — 15/15 structural prerequisite checks; Stage A deployed and stable; Stage B production write activation NOT AUTHORIZED and NOT EXECUTED.** Genuine signed-user production runtime and backup-restoration acceptance remain separate.

## Decision / production boundary

This checkpoint is **read-only**. The production TradeLink Stage A schema and read/list RPCs were *already installed* on November 5, 2026. The actual migration ledger contains version `20261105011611`, `cp_tl03c_stage_a_readonly_domain_activation`. Phase 1 does **not** rerun the historical preactivation migration, create a new Supabase project, activate Stage B, grant roles, generate transactions, create QA users, import records, change RLS, or modify operational data.

The existing signed-authority contract remains the only acceptable access boundary. Stage B would explicitly grant `authenticated` EXECUTE on the private and public `tl03_commit` entry points, exposing narrowly guarded draft create/update/archive/restore; this remains a separate production permission change requiring separate authorization and complete acceptance prerequisites. Neither a frontend flag nor a passing test grants production authorization.

## Fresh authoritative database evidence

A new reusable **SQL SELECT-only** verifier was committed at `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` (commit `b008311`). Fetched the exact committed source, ran it on project `jtlusodorfnyzgyuewkz`, and received:

`STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED` — **15 checks passed / 15 total; failed_checks=[]**.

The independently verified predicates were:

1. Recorded Stage A migration `20261105011611` and expected migration name.
2. TradeLink board identity, workspace, active/not archived/not trashed, module marker.
3. One group, eight existing columns and zero board items (unchanged).
4. Installed `public.tradelink_documents` and `public.tradelink_document_events`, both with zero rows.
5. RLS enabled on both domain tables.
6. Exactly the expected two scoped authenticated SELECT policies using `private.tl03_can_manage(board_id)`; no writable policies.
7. Authenticated SELECT on the tables and EXECUTE on read/list RPCs.
8. No anonymous table SELECT or domain read/list/commit RPC EXECUTE.
9. No authenticated EXECUTE on **either** `public.tl03_document_commit` or `private.tl03_commit`.
10. No direct authenticated INSERT/UPDATE/DELETE on document or event tables.
11. Live enabled `tl03_events_append_only` audit trigger.
12. `auth.sessions` and required id/user_id/not_after columns present.
13. All **eight** central workspace, session, role, board mutation and event-function source/definer fingerprints equal the separately reviewed baseline.
14. All **five** installed TL03 function fingerprints and definer/invoker modes equal the Stage A production baseline.
15. Authenticated private-schema usage prerequisite intact.

Additional live queries independently confirmed one active board with one group/eight columns/no items; both domain tables/audit empty; RLS enabled; read/list granted only to authenticated; write RPC EXECUTE for both private/public functions denied; and no anonymous read/write access. The `frontend/tradelink-domain-client.js` source currently retains `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`; these frontend flags are defense in depth, *not* substitutes for SQL permissions.

**Post-activation drift caveat:** The previously committed `sql/tests/cp-tl03c-production-readiness.sql` is a **pre-Stage-A** script that expects the domain tables and RPCs to be absent. It must not be used to assess production readiness after Stage A; a false BLOCKED result there would merely reflect the approved schema activation. The new Phase 1 script is the correct post-Stage-A contract preflight.

## Disposable PostgreSQL evidence independently recovered

Read actual GitHub Actions workflow-run metadata, job steps and decoded job logs. Latest matching workflow **run #13**, ID `41950802327`, started November 5, 2026 01:46 UTC, completed **success** against head `9c8e8071a1c315d73728317150a65035d4e2fa57`. Job ID `126994002587`, **Signed-fixture transactions, RBAC and RLS (PostgreSQL 17)**, completed success; all relevant steps, including schema application, Stage A deny-write, Stage B disposable-only grant, synthetic signed transitions, stale revision, foreign workspace, revoked/expired session, audit, postactivation schema, emergency-disable and preserved rows, completed successfully.

Decoded job logs explicitly report:

- `CP-TL-03C Stage A tables and read RPCs present; all document writes denied PASS`.
- `CP-TL-03A General Manager draft create/retry/CAS/archive/restore/audit PASS`.
- `CP-TL-03A role ceilings, foreign scope, expired/revoked session, immutable audit PASS`.
- `CP-TL-03A absent module role with board owner denied`.
- `CP-TL-03A RLS/grant/board/audit structural checks PASS`.
- `CP-TL-03C disposable emergency disable PASS: access revoked, audit and board retained`.
- Node test summary: **16 pass, 0 fail**.

Source: https://github.com/wass-psti/APSYNTRACRM/actions/runs/41950802327. Previously cited run #12 `41883536962` independently also concluded success. This proves **synthetic disposable PostgreSQL integration and static/Node contract acceptance**, not live production GoTrue signed writes or the current repository head's full CI status. Stage B granting occurred **only on the disposable runner**, never production.

## Security and unresolved evidence

The current Supabase security advisor has project-wide warnings, including legacy TradeLink asset/reconciliation public SECURITY DEFINER APIs callable by `authenticated`, and some old TradeLink tables with RLS but no policies. The inspected Stage A TL03 public wrappers are SECURITY INVOKER, and the new TL03 tables have the two expected read-only policies; no advisor warning was identified for the **new** `tl03_*` public RPCs in the inspected response. Legacy findings remain a separate security-review responsibility: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy. **No global grants were changed** to silence warnings.

The earlier CP-TL-03C record includes user-submitted genuine signed reports for an authorized manager and HR `BOARD_MANAGER_DENIED` (6/6 each). They establish those reported read-only scenarios only. The original signed foreign-workspace check was **BLOCKED** because the foreign workspace had zero active member profiles; no new eligible identity was created. No fresh browser-signed session, service-provider backup-restoration rehearsal, live production data/CAS writes, revoked/expired real bearer checks, cross-account isolation on actual persisted TradeLink records, or deployed UI regression was executed during this Phase 1.

**Do not infer `production_ready=true` from structural PASS.** The live database has zero TradeLink documents and no actual production write grants. The proposed first-write capability remains Draft-only, not the source's full workflow approvals, PDF or attachments.

## Gate disposition and next actions

| Gate | Classification |
| --- | --- |
| Stage A migration provenance and installed live schema | **VERIFIED** |
| Stage A RLS, restricted read grants, default-denied writes | **VERIFIED** |
| Source fingerprints and immutable audit contract | **VERIFIED** |
| Disposable PostgreSQL 17 signed synthetic CRUD/RBAC/RLS/rollback | **VERIFIED** (run #13/job logs) |
| Frontend Stage A/Stage B default-off flags | **VERIFIED from committed source** |
| Live Stage A existing-role reports | **USER-REPORTED, historically accepted; no new live session test** |
| Live cross-workspace/revoked/expired production session acceptance | **PENDING / foreign identity BLOCKED** |
| Current production backup-restoration rehearsal and separate Stage B change authorization | **PENDING** |
| Stage B production write grant | **NOT ACTIVATED / NOT AUTHORIZED** |
| Stage B genuine signed create/CAS/denial/audit/rollback acceptance | **PENDING** |

**Next gate:** `CP-TL-03C / Phase 2 — Genuine Signed Stage A Read Acceptance Refresh and Stage B Approval Packet`. Verify an existing real TradeLink manager and lower-role signed session under deployed HTTPS; preserve current read-only state. Before proposing Stage B, review the exact permission delta, safe rollback, backup recoverability, and source role mapping; seek fresh, separately scoped production permission-change approval. Production data writes require their own approval. Do not repeat the already completed Stage A migration or apply either candidate grant/disable script automatically.
