# CP-TT-BOARD-UX02 — TimeTracker board organization

## Implemented frontend behavior

1. Empty nonprimary TimeTracker groups may be removed from the **current browser's view**, with a restore control. The reversible preference is scoped to signed user, workspace, and board. Neither group nor records are deleted from PostgreSQL.
2. Permanent deletion of a protected TimeTracker group **remains disabled**, pending independent approval and server-side activation of the staged `wm_managed_board_delete_empty_group` RPC. A disabled, explicit label explains the boundary. Never relabel view hiding as permanent deletion.
3. TimeTracker board views can be reordered by verified board managers using drag-and-drop or arrow controls. The authoritative order is saved via `wm_board_ui_save`, using the current signed identity, manager permission, and expected configuration revision. Updates are reflected for board viewers after reload/re-authentication. The implementation handles newly provisioned boards that have no stored tab settings.
4. Ordinary users can still navigate all views but have no TimeTracker reordering controls. Other board types retain their existing presentation layout behavior.
5. Technical `[APSYNTRA:MODULE:...]` board descriptions are replaced by concise end-user copy **at render time only**, including board catalog cards and the board heading. Stored descriptions and contract detection remain unchanged. Developer/backend explanatory text is removed from projected board grids and protected empty-row footers. User-created ordinary-board descriptions and database values are not modified.

## Engineering boundaries

- No migration, backend function change, production delete, role change, credential change, or permission grant.
- Application-managed attendance records, typed schema fields, audit history and restricted GPS remain unchanged.
- Existing dedicated signed and authorized attendance workflows remain unchanged.
- Destructive group deletion is not represented as working until the separately approved backend RPC is activated and signed-user delete acceptance passes.
- View order is a shared, auditable board setting; it is not a localStorage preference on managed TimeTracker boards.

## Verification gates

- Run frontend regression suite and targeted CP-TT-BOARD-UX02 tests.
- Run disposable PostgreSQL suites and Pages deployment smoke for all newly introduced frontend modules.
- Check live authenticated manager reorder with revision conflict and unauthorized denial; verify persistence across sessions and view switching.
- Verify group hide/restore with empty/nonempty, primary/nonprimary, and cross-workspace contexts.
- Obtain separate approval before any permanent production deletion. No production delete test is executed in this release.

## Progress classification

Code is committed independently from claims of live signed-user runtime acceptance. Automated CI and deployment results should be linked to an exact commit. Target 120 FPS remains unverified until measured on a capable display.
