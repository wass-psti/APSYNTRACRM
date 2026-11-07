# CP-TL-03E — Legacy Session Hardening and Recovery Sign-off Packet

**Date:** 2026-11-08 (Asia/Manila)
**Project:** APSYNTRA CRM / WatchdogWorkspace / TradeLink
**Status:** **SOURCE IMPLEMENTED, NONPRODUCTION TESTS IN PROGRESS; RECOVERY SIGN-OFF PENDING; STAGE B NO-GO.**

This is a controlled **source-only** hardening proposal, not approval to execute any of its SQL on the shared production database. Do not merge or deploy the candidate as a live database migration until independent review and separately authorized change control are satisfied.

## 1. Scope and threat model

The 11 existing `public.tradelink_*` `SECURITY DEFINER` RPCs currently grant EXECUTE to `authenticated` and not to `anon`. Their existing checks use `auth.uid()`, module access and workspace/role predicates, but do not independently require an active `auth.sessions` row. Because JWT access tokens can remain cryptographically valid until expiration after local sign-out, this represents a **potential** stale-token authorization gap. The successful `CP-TL-03E-LOCAL-SESSION-REVOCATION` HTTP 403 test covered `tl03_documents_list` **only**, not these legacy endpoints.

**Candidate:** `sql/cp-tl03e-legacy-session-hardening-candidate.sql`. The new check at the beginning of each original PL/pgSQL body is:

```sql
IF private.wm_board_config_session_active() IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'TRADELINK_SESSION_REVOKED' USING ERRCODE='42501';
END IF;
```

The pre-existing `private.wm_board_config_session_active()` checks the actor and JWT `session_id` against `auth.sessions`, including `not_after`. The candidate changes **none** of the original roles, function signatures, results, positive authorization, workspace ownership checks, CAS, audit, revision rules, storage scope or entrypoint grants. The schema preflight requires the **exact live source fingerprints of all 11 functions** and the session helper; both count and ACL drift fail closed before changing any functions, within a single transaction. The postflight checks that all 11 now contain the session guard and retain their authenticated/anonymous EXECUTE boundaries.

**Affected functions:**

- `tradelink_asset_read`, `tradelink_asset_write`
- `tradelink_cleanup_fence_activate`, `tradelink_cleanup_fence_release`
- `tradelink_reconciliation_assess`, `tradelink_reconciliation_cleanup_audit_list`, `tradelink_reconciliation_cleanup_preflight`
- `tradelink_reconciliation_list`, `tradelink_reconciliation_report`, `tradelink_reconciliation_request_cleanup`, `tradelink_reconciliation_verify_revision`

## 2. Verification and limitations

The new `cp-tl03e-legacy-session-disposable.yml` workflow runs only against its own PostgreSQL 17 CI service `cp_tl03e_disposable`, with synthetic JWT claims, session rows, workspaces and asset records. It first installs the original live-referenced function bodies and tests that the old synthetic JWT still accesses one legacy read after session deletion, then applies the fingerprint-locked candidate **inside disposable PostgreSQL only**.

Acceptance cases: valid manager read/CAS asset update; 11/11 revoked-session legacy RPC denials; expired session denial; signed employee denied asset access; foreign-workspace actor not receiving the manager workspace's asset; unchanged ACL/function count and no unwanted mutations on denial. A separate Node source-contract test protects exact function coverage, fail-closed guard placement and unchanged frontend domain flags.

**Important:** Disposable synthetic PostgreSQL tests do not prove actual signed end-user behavior after a production SQL release. Before any production activation, obtain reviewed authority and run proportionate genuine signed actor negative and positive tests in the existing permitted environment. No new user accounts or Supabase projects are required.

## 3. Current recovery evidence

The existing authorized Supabase CLI `supabase backups list --project-ref jtlusodorfnyzgyuewkz --output-format json` returned **seven completed physical backups**, latest at `2026-11-06T17:17:11.138Z` (**2026-11-07 01:17:11 PHT**), `walg_enabled=true`, `pitr_enabled=false`. These are provider inventory entries, not verified restorations.

The database is shared across WatchdogWorkspace applications. **A full database restore can overwrite newer data in unrelated modules and interrupt service.** Supabase database backups do not include the actual Supabase Storage objects; storage and database recovery require separate treatment. The previous SELECT-only inventory found zero TradeLink document rows, zero target Board items, zero document audit rows and no existing `tradelink-attachments` bucket; do not assume this remains true at release time.

**Recovery sign-off requirements** (currently unverified):

| Field | Required evidence / decision | Current status |
| --- | --- | --- |
| Accountable production release executor | Person/team with approved access, release window and stop authority | PENDING |
| Independent security reviewer | Approved assessment of 11 legacy RPCs, central helper and authorization invariants | PENDING |
| Rollback/incident/restore owner | Person/team, escalation path and communication channel | PENDING |
| Backup source and restore method | Exact eligible snapshot, backup retention, documented dashboard restoration process, storage-object recovery impact | PARTIAL — inventory verified only |
| Recovery Point Objective (RPO) | Organization-approved tolerable loss across **all** WatchdogWorkspace modules | PENDING |
| Recovery Time Objective (RTO) | Organization-approved tolerated service outage and recovery-time plan | PENDING |
| Recovery rehearsal | Successful isolated restore evidence, or explicit written risk exception if no viable rehearsal; never claim restoration without proof | PENDING |
| Cross-module and Storage impact | Explicit whole-project recovery blast radius acceptance | PENDING |
| Controlled production SQL authority | Separate approval for exactly the 11-function hardening and its exact pinned SHA; no ambient authorization | NOT AUTHORIZED |
| Stage B drafts | Separate authorization for two draft-write grants, frontend activation and any persisted QA fixture | NOT AUTHORIZED |

## 4. Change/recovery control sequence — not yet authorized

1. Keep the existing production functions and Stage B disabled until the review confirms production hashes, live session-helper semantics and correct role/workspace isolation. Protect all accepted current data.
2. Obtain the recovery and security sign-offs listed above, including RPO/RTO and shared-project restoration choice. Do not start a restore merely to satisfy an evidence checkbox.
3. Seek **separate explicit approval** for the precise source-hardened SQL candidate. On approved change day, rerun the same read-only production preflight and confirm fresh backup inventory and operator identities; stop on drift.
4. In a controlled release window only, execute the candidate as one transaction; confirm all 11 guards are installed and the original ACLs and role restrictions remain unchanged.
5. Run authorized manager allowed / nonmanager denied / revoked-token and foreign-workspace checks, including an independent legacy asset or reconciliation RPC. Do not export bearer values or private documents.
6. **Containment/rollback strategy:** If any hardened function causes a security or operational failure, freeze affected workflows. For unexpected access, obtain emergency approval for a **narrow EXECUTE revoke** of the affected legacy entrypoints or a corrected guard; avoid silently restoring the unguarded originals, which would re-open the stale-token gap. Any database restore is a separate whole-project decision and **must not** be conflated with a function-grant rollback.
7. Preserve evidence, incident contacts, owner sign-offs, backup timestamp, audit results and authorized QA disposal. Only after success may the independent reviewer mark this gate verified.

**Source candidates are not database migrations to be auto-applied.** Existing SQL conventions keep controlled activation candidates under `sql/`. The Supabase CLI migration generator was inspected; no project migration was applied to production.

## 5. Final decision

**Legacy hardening:** IMPLEMENTED as a dormant candidate; application is unchanged until an approved SQL release.
**Recovery assurance:** PROVIDER BACKUP INVENTORY VERIFIED; restore/risk acceptance, RPO/RTO and ownership PENDING.
**TradeLink Stage B document creation:** **NO-GO**. Authenticated EXECUTE on both Stage B document commit functions and both frontend domain feature flags remain disabled.

This work does **not** repeat the previously accepted authorized manager, employee and revoked TL03 read checks. The next actionable work after isolated CI is an independent candidate review and recovery sign-off; production database mutation requires a separate authorization decision.
