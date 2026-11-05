# CP-BOARD-COL-DELETE — Production Root Cause, Controlled Recovery and Acceptance

**Date:** 2026-11-05  
**Classification:** ROOT CAUSE VERIFIED LIVE READ-ONLY; RECOVERABLE DELETE/RESTORE IMPLEMENTED AND VERIFIED IN DISPOSABLE PG17; LIVE PRODUCTION ACTIVITY/RESTORE AND DELIBERATE DATA REMOVAL PENDING.  
**Safety:** Existing Supabase project only. **No production SQL migration, deletion, data changes, grants or role modifications performed in this gate.**

## User-reported behavior and authoritative reproduction

On the ordinary Contacts board `b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d`, selecting **Delete Empty Column** for the **Status I** custom status column produced the correct legacy protection error: `Column contains item values; deletion blocked to prevent data loss` / `Column contains values. Remove or migrate those values before deleting.`

Production read-only inspection found:
- `work_board_columns.id=666d79e5-3df5-494c-90b7-19a7946b1348`, name **Status I**, type `status`, key begins `custom:`, `system_key IS NULL`.
- Exactly **4** rows stored in `public.work_board_item_values` for that column. This includes persisted rows, not just rendered non-empty labels.
- The legacy `public.wm_board_schema_mutate` function explicitly rejects `p_action='delete'` when `v_value_rows>0` with SQLSTATE `23503`. Its source fingerprint was `7e5ae389363acffa093ad3291314cf2a`.
- The existing Activity logger records event metadata, **not an independently restorable full column and cell snapshot**.
- The optional recovery delete RPC, private archives and restore RPC are **absent** in the live production catalog as of the read-only inspection.

This is a *deliberate safety policy mismatch with the new requested behavior*, not an authorization failure or an intermittent server bug. Do **not** remove the legacy guard or delete the original cell rows directly.

## Scoped replacement design (repository staged, not production active)

The existing `sql/cp-board-col-delete-recoverable-candidate.sql` stages **separate** RPCs:
- `public.wm_delete_board_column_recoverable`: signed-session and board-`manage` checks, locked authoritative board/column and cell rows, optimistic revision and expected row-count preconditions, exact typed confirmation, private immutable column/cell snapshots, atomic column cascade, UI-label cleanup, Activity event and updated revision receipt.
- `public.wm_restore_board_column_recoverable`: signed manager only, unconsumed snapshot and fresh board CAS, same workspace and original item integrity checks, column uniqueness/limits and atomic value restoration, Activity restoration event, snapshot marked restored.
- `public.wm_list_recoverable_board_columns`: metadata only; snapshots remain inaccessible to `anon` or `authenticated` via table grants/RLS.
- The original `public.wm_board_schema_mutate` empty-column RPC remains unchanged; the protected primary **Item** column and application-managed columns are never eligible for destructive custom-column recovery.

Frontend code at `frontend/board-column-recovery.js` and `frontend/app.js` routes nonempty custom columns through this recovery contract **only after backend activation**, and otherwise disables the destructive submit button with an accurate explanation. Recoveries are shown under Board Activity, but the Activity audit itself is not the stored data backup.

## Verification evidence

- [Disposable Board Config Acceptance #42003310660](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42003310660) **SUCCESS** following commit `5fd07ad6e537`, which upgraded the actual stored-column fixture to **4 rows**, including both JSON null and SQL NULL.
- The test verifies original column and cell snapshots byte-for-byte as JSONB, FK cascade removal, UI label removal, actor-linked Activity event, per-board and signed-session/role denial, stale CAS and count denial, replay rejection, complete restore, missing-item dependency denial, and transaction rollback.
- Earlier [Board Config Acceptance #41998641875](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41998641875) **SUCCESS** for the staged recovery RPCs and disposable reset.
- [Frontend Validation #41999630591](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41999630591) **SUCCESS** after the recovery UI client and its unit tests were merged. This is not a live signed-user delete/restore acceptance.
- Read-only inspection of `public.wm_get_board` found `values` returned by an unpaginated aggregation over all board columns and items, supporting frontend row-count comparison. The authoritative delete RPC independently re-counts and locks the actual persisted rows.
- No live sign-in write operation was performed, no production event was added, and no production record was deleted.

## Remaining acceptance and guarded production boundary

| Criterion | Classification |
| --- | --- |
| Reproduce server error and identify root cause | **VERIFIED — live read-only source and row-count** |
| Preserve original empty-only deletion and protected columns | **VERIFIED — staged contract / production unchanged** |
| Four-row delete → private backup → Activity audit → complete restore | **VERIFIED — disposable PG17 only** |
| RBAC, signed-session expiry, workspace isolation, stale revision and replay | **VERIFIED — disposable fixture** |
| Frontend delete/error/restore UX | **IMPLEMENTED; automated frontend tests PASS** |
| Real production recovery schema and RPC installation | **BLOCKED — separate scoped production schema/grant approval** |
| Genuine signed-user delete → refresh → Activity → restore → refresh | **PENDING — must use explicitly approved disposable/QA fixture first** |
| Delete the specific live Status I column and its four records | **NOT PERFORMED — production-data destructive approval / acceptance gate outstanding** |

**Next required gate:** `CP-BOARD-COL-DELETE — Controlled Production Activation, Genuine Signed-Session Persistence, Activity and Restoration Acceptance`. Separate approval is required for installing the recovery schema/functions/grants in production and for the eventual actual deletion of the targeted populated production column, after QA fixture acceptance. Do not claim the feature production-complete because its staged tests pass.

**Progress:** Staged backend and frontend implementation verified; specific live four-row deletion **0/1**; live recovery **0/1**. Overall gate completion **indeterminate** until signed acceptance and production activation.
