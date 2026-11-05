# CP-BOARD-COL-DELETE — Root Cause, Recoverable Deletion and Activity Restoration

**Date:** 2026-11-05  
**Status:** Source diagnosis VERIFIED; four-row recoverable deletion/restoration VERIFIED in disposable PG17; frontend error handling VERIFIED; signed production deletion/restoration PENDING.  
**Environment:** APSYNTRA CRM GitHub Pages, existing Supabase project `jtlusodorfnyzgyuewkz`. No production DDL, grants, columns, values, roles or event rows modified during this checkpoint.

## Reproduced incident and authoritative evidence

- User-selected board URL: `#/boards/b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d`. The modal selected **Status I** and showed **4 stored values**. The submitted action generated `Column contains values. Remove or migrate those values before deleting.`
- A **read-only** live PostgreSQL query independently confirmed exactly one **Contacts** board column named **Status I** with `system_key IS NULL`, `required=false`, a custom column key, and **4 persisted cell rows**. The board is active. No cell values or personal data were retrieved.
- Existing `public.wm_board_schema_mutate` fingerprint `7e5ae389363acffa093ad3291314cf2a` is still the live **empty-only** deletion contract. It intentionally protects against deleting nonempty columns because the `work_board_item_values.column_id` foreign key uses **ON DELETE CASCADE**.
- `public.work_board_log` / Board Activity is an **audit event feed, not a materialized cell/column backup**. No reliable restore is possible from an Activity event alone.
- Live recoverable snapshot tables and `wm_delete_board_column_recoverable` / `wm_restore_board_column_recoverable` RPCs are **absent**. The frontend flag `BOARD_COLUMN_RECOVERY_ENABLED` remains **false**. The current UI must fail closed for populated columns instead of retrying an unsupported empty-only mutation.
- Read-only production preflight committed as `sql/tests/cp-board-col-delete-production-readonly-preflight.sql`; actually executed on the existing project, returning `CP_BOARD_COL_DELETE_LIVE_4_ROWS_INTACT_RECOVERY_NOT_INSTALLED`.

## Implementation and validation

1. `sql/cp-board-col-delete-recoverable-candidate.sql` stages **separate** new recoverable deletion/restoration and manager-only list RPCs; the existing empty-only RPC is untouched. The deletion locks the board/column/cell rows, checks GoTrue signed session, original board-manager ACL and board revision, validates the exact typed confirmation and authoritative cell count, writes private RLS-protected snapshots of original column metadata and all cells, removes the column, updates UI labels, writes an Activity event, and returns an exact receipt — **in one PostgreSQL transaction**. Any failure rolls back. Restoration verifies the original column's identity, board scope, snapshot count, existing item relationships and no conflicting current column, writes the original column and cells, restores the UI label and logs `column.restored`. Snapshots never return cell content to clients.
2. `frontend/board-column-recovery.js` and `frontend/app.js` contain signed manager-only delete/list/restore integration. The populated-column deletion is **disabled** until its server capability is activated; users receive a truthful explanation and can hide the column without removing data. Existing empty-only deletion remains available for genuinely empty custom columns, while Item and system-owned columns stay protected. Board Activity can show a recovery action after activation.
3. Error handling distinguishes protected/system column, unauthorized actor, invalid confirmation, stale revision/cell count, missing/previously restored snapshot, foreign item relationships, schema conflicts, and a newly populated legacy empty-only column. Network/ambiguous server outcomes do **not** auto-retry a potentially destructive request.
4. `sql/tests/cp-board-col-delete-recoverable-acceptance.sql` now reproduces **4** stored rows (including JSON NULL and SQL NULL) rather than a single sample cell. The acceptance checks accurate snapshot contents, FK cascade, audit event with signed actor and deletion metadata, manager-only recovery list, editor/viewer/foreign user/expired-session denial, CAS/stale-count rejection, restoration exactness, missing-item failure recovery, replay denial and rollback. The PostgreSQL candidate and fixture are run and then fully removed in isolated PostgreSQL 17.
5. `frontend/tests/board-column-recovery.test.mjs` includes manager-only request validation, disabled-by-default, exact receipt, uncertain failure/no retry, XSS-safe Activity rendering, and accurate SQLSTATE/domain error mapping.

## Evidence

- [Four-row disposable Postgres run #42003310660](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42003310660) — **SUCCESS**.
- [Retested board config PG17 run #42004134405](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42004134405) — **SUCCESS**.
- [Frontend Validation #42004031719](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42004031719) — **SUCCESS**.
- [Pages deployment #42004031222](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42004031222) — **SUCCESS**.
- [Post-read-only SQL Pages deployment #42004134377](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42004134377) — **SUCCESS**.
- No live signed-browser edit/restore was claimed: the connected browser integration did not provide control of the existing signed tab.

## Acceptance classification

| Criterion | Status |
| --- | --- |
| Identify exact root cause and confirm stored values from the authoritative database | **VERIFIED — live read only** |
| Protect `Item`, application-owned columns, user RBAC, signed session, workspace boundaries | **VERIFIED — isolated source and synthetic tests** |
| Snapshot/delete/Activity/restore 4 populated rows without losing JSON or SQL NULLs | **VERIFIED — disposable PG17** |
| Prevent stale concurrent counts/revisions, replay and unsupported recovery; rollback on failure | **VERIFIED — synthetic tests** |
| Explain empty/nonempty/protected/denied/stale/unknown outcomes in frontend | **VERIFIED — frontend unit/CI** |
| Refresh and reopen persistence for recoverably deleted production columns | **PENDING — no production activation** |
| Genuine signed manager/Viewer denial and true browser Activity restore | **PENDING — live signed-session acceptance** |
| Actual deletion of **Contacts / Status I** and its 4 production values | **NOT PERFORMED — intentionally preserved** |
| Install private backup tables and authenticated recovery RPC permissions | **BLOCKED — separately reviewed production migration / access policy approval** |

## Operational cutover requirements

Before any live populated-column deletion, complete an independently approved production migration and rollback plan for **private RLS-protected recovery snapshots and new authenticated SECURITY DEFINER RPCs**; check point-in-time restore availability; verify exact function source fingerprints; ensure server-only recovery data are never included in public API responses; perform a fresh signed manager/Viewer acceptance and a reversible QA fixture using the **same recovery mechanism**, verifying board refresh/reopen and Activity restoration. Do not enable `BOARD_COLUMN_RECOVERY_ENABLED` before backend installation and acceptance. For the target Contacts column, re-check current authoritative row count, board revision and actor permissions immediately before deletion; do not reuse the previously observed count of four if data have changed. Keep the user's one typed confirmation; never bypass the server authorization/transaction.

**Checkpoint:** `CP-BOARD-COL-DELETE` remains **IMPLEMENTED-STAGED / LIVE ACCEPTANCE PENDING**, not COMPLETE.  
**Next required gate:** **Controlled Production Migration Approval → Signed Manager Recovery Fixture → Contacts Status I Deletion, Refresh Persistence, Activity Restoration Acceptance**.
