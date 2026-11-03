# CP-BOARD-BASE02 — removable optional virtual columns and one-click signed bulk actions

**Scope:** Contacts board annotations dated November 3, 2026. Preserve the primary Record/Title column; make Status, Owner, Due Date and Actions individually removable from the ordinary-board display. Restore Bulk status and Bulk archive interactions without bypassing authenticated backend checks.

## Verified production baseline (read-only)

- Contacts has three existing items and zero physical custom columns at this checkpoint. Status, Owner, Due Date and Actions shown in the existing table are frontend-generated virtual columns, not PostgreSQL columns to drop.
- Existing `wm_board_ui_save` accepts arbitrary extra JSON keys on approved `items` tab objects, enforces current GoTrue session, effective board `manage`, workspace checks and expected settings revision, and writes a board display-configuration audit entry.
- Existing `wm_board_bulk_mutate(uuid,text,jsonb)` and `wm_board_group_cas` are already present in production with `authenticated` grants only (not `anon`), and the current verified frontend signed read-only probe remains in use.
- A new ordinary board already defaults to Item-only with an explicit Add Column command. No example items or physical default columns are created.

## Implementation

1. **Per-board optional virtual column settings:** The existing signed board UI settings `items` tab stores an allowlisted array `hidden_virtual_columns` containing only `status`, `owner`, `due`, `actions`. These are display choices and do not delete `work_board_items.status`, assignment/date fields, audits, files or custom columns. The primary `record` key is never accepted for removal. Custom columns remain server-managed under the existing schema CAS RPC.
2. **Manager controls:** Manage columns displays a Remove/Restore button for each of the four virtual columns on an active ordinary board still using its legacy display. Every click verifies the current signed user and workspace, re-reads the board and settings, checks effective `manage`, and uses `wm_board_ui_save` with the current expected revision. Other users and browser sessions read the same authoritative display state. Application-managed and reserved boards cannot use this feature.
3. **Rendering:** The ordinary-board table and per-group column schema derive from the normalized verified settings. Removed columns do not render, but the frozen, inline-editable primary Title column remains. A manager can also use the existing **Use Item-only layout** command to omit all four virtual fields in one non-destructive action. Column widths and private user presentation choices remain local; server-saved schema metadata controls the shared display.
4. **Bulk status and archive:** On an ordinary signed editable board with 1–50 selected items, those two controls now accept clicks without a separate prerequisite button. A click first runs the **same existing** nonmutating signed GoTrue, RBAC/workspace, negative-RPC and protected-board checks. Only an exact PASS for the current user, workspace and board enables the in-memory bulk client; failure remains fail-closed. After passing, the requested modal/confirmation leads to the existing single atomic, stale-revision checked `wm_board_bulk_mutate` operation. No client mutation loops, direct SQL, credential copying, or elevated permissions. The existing dedicated Verify signed bulk access control remains available for inspection.
5. **Security:** Neither the UI control nor a local preference grants server access. The backend independently authenticates and authorizes each write, protects application-specific boards, validates up to 50 selected records, locks items deterministically, rejects stale revisions, and audits successful actions. The current read-only probe is not a substitute for a genuine authorized disposable-board write test.

## Acceptance gates

- Source and regression tests: built-in virtual column preservation, per-field removal/restore, signed manager denial, module protection, invalid primary column denial, server revision persistence, and on-demand bulk activation.
- Real signed browser: ordinary manager removes and restores each virtual column, refreshes and reauthenticates, verifies primary title edits and custom columns unchanged. Viewer/foreign workspace attempts must be denied.
- Real signed bulk writes: on **approved disposable ordinary-board items only**, verify status update, stale denial, archive, audit and persistence, and ensure an application-managed board remains denied. Production business items must never be used for automated acceptance writes.
- Full 120 FPS target, horizontal group scrolling, and mobile accessibility require independent browser measurements.

**Production database migrations, grants, records, user roles and permissions are not changed by this frontend update.**
