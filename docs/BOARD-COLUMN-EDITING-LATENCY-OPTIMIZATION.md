# APSYNTRA CRM — Column Editing Latency Optimization

## Investigation

The existing column editor was responsive while typing; the dominant delay occurred when saving. The save path performed an extra `work_board_access` read and `wm_board_ui_read` preflight even though the subsequent writer already checks board management and the active signed session. After a successful mutation, it called `loadBoard()`, which resets board-scoped state, re-runs the board/detail and access reads, hydrates preferences, and reconstructs the full application shell and board tables.

## Implemented

- Removed only the duplicate client-side MANAGE preflight and redundant `wm_board_ui_read` preflight from `verifyInlineColumnBoard`. The fresh signed user, active workspace context, fresh board snapshot, and board revision comparison remain. `BoardStructureClient.save/mutate` still performs `work_board_access(..., 'manage')`; the authoritative SQL writer still checks the active signed session and MANAGE permission. Recovery writes retain their own server-side checks.
- Added `board-column-dom.js` to patch the changed column header, its cells, summary label, and column menu in place. Unaffected rows, columns, inputs, scroll containers and shell remain mounted.
- After a column update, the app performs one authoritative `wm_get_board` readback, checks board/workspace identity and that the current revision is at least the mutation receipt revision, updates the existing board snapshot, then patches only the affected column.
- Primary and custom display-label changes update existing headers and the column menu. Board view changes still use a local render when necessary.
- Column creation uses one authoritative board readback followed by a local board render; it no longer invokes the route loader or resets unrelated state.
- Schema visibility changes use a local render because the table's column structure changes. A hidden-column patch is deferred while an inline cell editor is active, preserving the unsaved cell draft; it is applied when that editor closes.
- Existing optimistic concurrency, mutation receipts, type/config validation, data-loss checks, uncertain-outcome handling, and writer-side authorization remain unchanged.

## Browser verification

Disposable headless Chromium fixture:

- 12 tables, 1,200 target cells.
- Targeted rename/type cell patch: 1,200 cells patched; unaffected record and adjacent-column nodes retain identity.
- Column hide: 1,200 cells removed in place; column width updated from 500 to 300; unaffected nodes retained.
- Patch measured 3.7 ms; hide measured 1.4 ms in the latest recorded run. Synthetic DOM benchmark only; not a signed production timing.
- Active inline editor: hide request reports pending and retains the form; after editor close the pending hide is applied.
- Existing 1,200-row interaction-search, frame coalescing, resource waterfall, startup, and workspace read fixtures continue to pass.

## Regression and scope

- Focused board-column DOM, contextual editor, board structure, mutation receipt, and authorization-contract tests.
- Full frontend suite: `node --test frontend/tests/*.test.mjs`.
- All frontend JavaScript syntax, CSS bundle consistency, Pages source validation, and SEC14 source guard.
- No SQL, database schema, RPC, RLS, role, permission, workspace, credential, or deployment policy changes. No production data mutation. No new background work or telemetry.
- Live signed production browser acceptance remains separate; the currently open browser session was reconnecting during investigation.
