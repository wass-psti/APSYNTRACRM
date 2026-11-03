# CP-BOARD-BULK01 — Search, board-row selection, and inline group controls

**Release boundary:** Frontend-only and existing signed backend RPCs. **No database migration, permission grants, production records or roles changed.**

## 1. Board search

The original `#board-search` event handler set the `hidden` attribute on each `.board-card`, but the author rule `.board-card{display:block}` could override the user-agent `[hidden]` rule. Corrected scoped CSS `.board-card[hidden]{display:none!important}`. The search now matches board names or descriptions, ignoring case and surrounding whitespace, displays a live match counter and no-result message, and carries its filter across Active/Archived/Trash switches. Search never retrieves another workspace's boards.

## 2. Multi-select and safe bulk export

- `frontend/board-bulk-selection.js`: reusable, **session-memory-only**, user/workspace/board-bound selection with reconciliation after reads, individual checkboxes, Shift-range, visible group select-all, deselection and selected counter. No client storage, worker or monitoring.
- `frontend/board-presentation.js` and `frontend/board-grid.js`: checkboxes are embedded in the protected primary column rather than creating or moving schema columns. Each group retains its independent horizontal scroll and shared vertical page scroll. Archived rows are not eligible.
- Selection state remains while filtering/reordering within the same board and resets on board/identity changes. Page refresh intentionally clears selection; no private row IDs are persisted.
- Contextual bulk toolbar: **Export selected CSV** and **Clear selection**. Export re-requests the board with the actual signed session, rechecks role/board/workspace and verifies each selected record remains within the authoritative board scope. CSV contains only existing board-record fields (ID, title, status, group ID, updated date), not GPS/private cell values; formula-injection values are escaped. Up to 2,000 selected rows per export.
- **Not active:** bulk status edit, assignment, archive, delete, and restore. Existing per-record writers do not provide an appropriate all-record CAS/transactional contract for 12 distinct domain boards. No RPC batch write, direct table mutation or best-effort destructive loop was added.

## 3. Group contextual menu, inline rename and deletion limitation

- Added a three-dot menu next to authorized group headings. **Edit name inline** replaces the heading with input, Save and Cancel in the same location. Focus, Escape and outside-click menu dismissal use existing UI handling.
- Saves use existing `public.wm_update_board_group(uuid,text)`, with input validation, genuine GoTrue identity verification, current signed `edit` capability, fresh board/workspace and group `updated_at` comparison, and existing server RBAC/audit. No new authentication or independent database.
- **Concurrency limitation:** the existing group-update RPC has no atomic `expected_updated_at` argument. The frontend preflight detects stale reads but cannot guarantee last-writer-wins races are excluded *after* the preflight. Do not certify full CAS acceptance for group renaming.
- **Delete group is visibly unavailable** until an atomic server-side empty-group, protected-board, dependency, session and CAS guard is reviewed and deployed. The existing `wm_delete_board_group` may cascade to operational records; it was intentionally not wired. The protected TimeTracker board receives no group deletion capability.
- Group menu also provides **Select visible records**, reusing the row selection engine.

## 4. Acceptance boundary

Tests include search relevance, selected-row reconciliation, Shift-range and filtered select-all, identity/workspace isolation, authorized board CSV containment, CSV injection protection, frozen primary column, no GPS exposure, group inline save controls and safe deletion denial. Standard frontend and Pages CI must pass before release claims.

**Operational acceptance still pending:** real authenticated browser mouse/touch/keyboard interactions, all-12-board role matrices, 120 FPS measurement, and separately authorized atomic bulk writes/group deletion. Existing TimeTracker attendance projection remains the only source of operational attendance records; the board does not synthesize entries.

