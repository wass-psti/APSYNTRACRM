# CP-BOARD-ROW01 — Native inline Add Item, typed cell editor and column summaries

**Reference:** The user provided monday.com TimeTracker board screenshots showing a footer `+ Add type of log` row, input inside that row, and column summaries. APSYNTRA CRM preserves its own design system.

## Implemented frontend using existing central backend

- The existing `wm_add_board_item(uuid,uuid,text)` RPC creates ordinary-board rows directly from an always-visible **+ Add item** footer beneath each group. Enter or the Add item button submits. The top-level Add item action focuses the first visible footer instead of opening a modal.
- `wm_set_board_cell_if_current(uuid,uuid,jsonb,jsonb)` persists individual inline edits. The **first primary column remains immutable as a schema identifier** but its display value can be edited using the existing CAS title path (NULL column ID). Existing editable physical system/custom column definitions use type-specific inputs (text, long text, number, date, status, dropdown, people, checkbox, URL, email, timeline) with client validation mirrored by PostgreSQL's authoritative `work_board_validate_column_value`.
- Custom typed columns render on generic boards; existing row selections, original primary record/detail link, frozen primary column and independent per-group horizontal scrolling are preserved.
- Column summary footer displays record counts, status distributions, distinct assigned counts, next due date, numeric totals and checkbox counts **only for ordinary authorized board values**. Domain/TimeTracker footers contain a read-only notice rather than exposing direct record writes; protected fields and GPS coordinates are not summarized.
- Before a write, the client rechecks current GoTrue user, active workspace, board-scoped `edit` role, board type, group membership and current row/column schema. The server's existing RPC also validates role, column values, and auditable board changes. Cell edits reject stale value comparisons rather than silently overwriting another session.
- The add button is disabled while submitting; no automatic retry is performed because the existing `wm_add_board_item` API does **not** accept an idempotency key. If a network response is lost, refresh/reconcile before manual retry to avoid accidental duplicates.

## Scope and limitations

Application-managed boards such as **TimeTracker Attendance** do not receive a generic board-record writer. Their authoritative clocks, GPS and attendance projection must continue through the authorized domain module and its own persistence contract. An unrelated generic item must never masquerade as a clock-in/clock-out. To provide equivalent manual operations across all 12 applications, the domain SDK and server must expose and approve specific typed create/update commands and permissions. Those have not been invented or bypassed in this checkpoint.

Ordinary boards without a physical `status`, `assignee` or `due_date` system column can display those base fields but do not use the title-only CAS pathway to write them. Such columns need a separate reviewed atomic field writer or suitable configured server schema. Physical custom typed columns are editable.

The existing create-item RPC has no server-issued idempotency nonce and legacy cell-RPC session revocation behavior still needs genuine signed-session negative verification. **Do not certify full production operational acceptance, duplicate-free replay, or immediate revoked-session denial from frontend tests alone.** No production schema, policies, roles, privileged credentials, GPS rows or attendance records were changed by this implementation.

## Acceptance gates

- Frontend HTML/keyboard/rendering/escape/typed parsing, stale-field-CAS client path, authorization guard, and group summary tests.
- Existing complete frontend, isolated PostgreSQL contract, deployment and live Pages smoke checks.
- Pending: genuine signed operator creates an approved noncritical ordinary item; verifies database value and audit; tests stale conflict, denied role, duplicate uncertainty, refresh; approves individual domain-specific manual write workflow contracts where applicable; verifies mobile scrolling/accessibility and measured responsiveness.

**Deployment status:** determined by GitHub checks after commit. Frontend enhancement alone is not proof of real signed write acceptance.
