# CP-BOARD-TRASH-PERMANENT-DELETE-02 — Partial-Batch Recovery UI Fix

**Scope:** Frontend modal recovery for board Trash permanent-deletion outcomes. No database schema, permissions, roles, grants, or production board records are changed by this implementation.

## Production diagnosis

The initial Trash snapshot contained 50 boards. A later authoritative read showed 26 boards remaining. Supabase edge logs show exactly 24 successful `wm_delete_board_permanently` POST requests, each returning HTTP 204, and no failed or 25th delete RPC. The 26 remaining boards currently show no retained Storage or module-reference blockers under the existing deletion function's checks.

The exact client-side preflight condition that stopped the next request is not present in server logs; the gateway recorded no failed delete RPC. The observable failure is a partial batch, not a database request left running indefinitely.

## Root cause

`BoardTrashPermanentDeleteClient.deleteMany()` intentionally stops at the first failure and wraps the outcome as HTTP 409 / `BOARD_DELETE_PARTIAL_OR_UNCERTAIN`, including the confirmed deleted IDs and the original cause.

The shared `openModal()` handler treated every HTTP 409 as a board-revision conflict. It disabled the submit button and changed its label to `Close and refresh board`, but left it as a disabled submit control and attached no recovery click handler. Consequently, the visible recovery label could never perform its advertised action. The modal stayed open, displaying the original 50-board snapshot while the authoritative Trash list had already reconciled to 26.

## Implemented correction

- Classify `BOARD_DELETE_PARTIAL_OR_UNCERTAIN` separately from ordinary revision conflicts.
- Preserve the original partial-result message in a persistent modal alert.
- Convert the submit control into an enabled `type="button"` recovery action labelled `Close and refresh Trash`.
- Refresh the signed active/archived/Trash board lists before closing the modal.
- Keep destructive submission disabled after a partial batch; recovery never replays or retries deletion.
- Guard recovery against duplicate clicks. If refresh fails, restore the enabled recovery action so it can be retried safely.
- Apply the same functional close-and-refresh behavior to the existing board-card revision-conflict recovery actions.
- Leave schema-outcome-uncertain flows and existing backend authorization, CAS, protected-board, Storage, and module-record checks unchanged.

## Verification

- `node --test frontend/tests/modal-recovery.test.mjs frontend/tests/board-trash-permanent-delete.test.mjs frontend/tests/board-card-lifecycle.test.mjs frontend/tests/board-inline-context.test.mjs`
- `node --check` for every `frontend/*.js` file.
- Full frontend test suite and repository source guards are recorded in the implementation run.

## Production status

This change is a frontend-only candidate. Production deployment and genuine browser acceptance remain pending until the branch passes repository CI and is merged through the established repository process. No additional permanent deletions are initiated by this fix.
