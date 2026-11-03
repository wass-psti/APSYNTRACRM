# CP-BOARD-CONFIG01 — Protected Column Management and Board View Configuration

## Scope

First implementation target: TimeTracker Attendance. Shared frontend modules also support the remaining APSYNTRA CRM boards without copying domain-specific CRUD logic. The current deployed backend is **unchanged**.

**Implementation state:** frontend administration and centralized PostgreSQL candidate are **staged**, not production-activated. The shipped frontend source keeps `BOARD_STRUCTURE_ADMIN_ENABLED=false`. This is intentional: existing column mutation RPCs currently allow board EDIT, including deletion of domain columns whose `system_key` is NULL. Merely hiding Delete in the UI would not enforce a safe policy.

## Verified existing design

- The primary **Record** field is generated from `work_board_items.id/title`, not from `work_board_columns`. Its display label is configurable in the staged `wm_board_ui_settings` table; its identifier, type, primary designation and item relationships remain immutable.
- Seeded 12-board domain columns use stable `column_key=col_*` and are dependent on module schemas. Their display labels may be overridden without changing the persisted `name`, `column_key` or `id`. Their physical deletion/type mutation is rejected until a separately approved dependency-migration design exists.
- Custom columns minted by the new manager-only mutation RPC have `column_key=custom:<uuid>`; custom columns may be created, renamed/retyped only when value-safe, or removed only when empty and explicitly confirmed. Existing item-row operations retain their separate EDIT permission.
- Existing `wm_get_board` remains the authorized source of board columns and items. A future `wm_board_ui_read` provides centrally persisted labels/tab preferences, with `wm_board_ui_save` guarded by board MANAGE and optimistic `revision`.
- The staged `wm_board_schema_mutate` requires board MANAGE and compares the caller's expected `work_boards.updated_at` under a row lock before any write. It writes through the existing PostgreSQL column tables and `work_board_log`.
- Physical `wm_delete_board_column` and six other legacy column-writing RPCs currently remain accessible to authenticated editor roles. A **breaking** candidate GRANT transition revokes their authenticated EXECUTE permissions; independent downstream-client compatibility review is required prior to deployment.
- Existing per-group horizontal scrolling, vertical layout, column resizing, optional column order and per-user layout preferences remain unchanged. Board view settings do not grant authorization to hidden views and do not replace item access policy.

## Staged source

- `sql/cp-board-config01-staged-authorization.sql`: proposed table, server-authorized read/write RPCs, input validation, constrained management and legacy writer grant retirement. **Do not run on production yet.**
- `sql/cp-board-config01-guarded-rollback.sql`: reverts new functions and restores old grants **only when no persisted settings rows exist**. Warns that restoring legacy grants reopens the old EDIT vs MANAGE permission boundary. Persisted user settings require a separately reviewed, data-preserving rollback.
- `sql/tests/cp-board-config01-disposable-*.sql`: synthetic PostgreSQL 17 fixtures and positive/denied/rollback checks. The dedicated GitHub Actions workflow uses **disposable PostgreSQL**, not a new Supabase project.
- `frontend/board-structure-admin.js`: reusable admin settings UI, guarded API adapter, primary-column policy, typed column controls and view ordering.
- `frontend/board-grid.js`: maintains the existing domain-field allowlist and only permits custom-column projection after an authorized server configuration is verified and the feature gate is deliberately enabled.
- `frontend/tests/board-structure-admin.test.mjs`: client behavior, RBAC denial, same-board payload validation, primary/domain immutability, HTML escaping, preserved item actions and no disabled RPC calls.

## Remaining release gates

1. Independently assess legacy endpoint retirement, module integrations, dependent formulas/filters/sorts/reports, security-definer functions, concurrent schema writers, original grants and exact rollback behavior.
2. Obtain **separate explicit production permission and schema change approval**; creating/updating columns and changing grants in the sole WatchdogWorkspace Supabase project is not covered by frontend implementation authorization.
3. Execute genuine signed manager/editor/viewer and cross-workspace HTTPS acceptance on the actually deployed functions, including save-and-refresh, revoked/expired sessions, concurrency CAS and denied direct RPC calls.
4. Confirm item creation/edit/delete and 12-board domain workflows remain functional; only then intentionally enable the frontend flags, followed by full GitHub Pages signed-session regression.
5. Implement validated **default values for newly created items** and a separately approved domain-dependent migration pathway before claiming support for all column types and all application-owned column changes. Current staged mutation is deliberately conservative about potentially destructive type changes and populated columns.

Do not interpret successful mock tests or disposable SQL fixture results as production authorization acceptance.

## Final privacy hardening

The configuration dialog does **not enumerate** underlying column names to users when the feature is locked or they lack board MANAGE authority. On activation, the signed settings-read RPC may be used by board viewers for primary display and tab labels, but **redacts the complete column-label override map** for nonmanagers. Managers can edit only module-approved and safe custom column metadata in the frontend; application-restricted fields do not appear in the structure-management listing. This intentionally limits per-column display-label propagation to managers until an independently reviewed field-level authorization contract is available.

The activation SQL also verifies the actual PostgreSQL EXECUTE grants for all seven legacy column writers and aborts the transaction if any editor-accessible bypass remains. The separate production permission-change approval must explicitly include retiring these legacy RPC grants and an integration compatibility plan.
