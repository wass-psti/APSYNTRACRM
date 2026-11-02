# CP-BOARD-UX01 — Board workspace reference adaptation

## Reference selection and implementation scope

Reference: supplied screenshots of a TimeTracker board, tabs, grouped table, activity log, item detail and invitation interfaces. The adapted frontend retains APSYNTRA branding, independent boards and existing signed PostgreSQL contracts; it does not copy Monday.com logos, marketing, third-party item data or proprietary scripts.

### Delivered in this incremental change
- Board header retains original breadcrumb and navigation; adds an **Activity** action querying the existing `wm_list_board_events` read-only RPC (100 events maximum), with signed board/user/workspace revalidation after the response. No fabricated audit events, no new activity store.
- Board view tabs can be reordered using native drag/drop or accessible left/right buttons, with touch/pen pointer reordering.
- Tables use the same presentation renderer for generic and typed-module board groups, with a frozen Record column, bounded column widths, column visibility toggles, reorder drag handles, and keyboard-accessible alternative move controls. Record and Status cannot be hidden; item Actions cannot be hidden.
- Each board group has its **own horizontal scrolling**. Vertical scrolling remains managed by the existing workspace. No backend updates occur from presentation drag/resize.
- Layout preferences are small JSON values persisted to same-origin localStorage, keyed by signed user, workspace and board UUID. Valid tab/column IDs are whitelisted against current authorized board detail at every render; unknown/harmful stored identifiers are discarded. Reset removes only that board's scoped layout record. No employee data, row contents, tokens or location data is cached.
- Plain-text cells are escaped; server-side typed restricted-column filtering is preserved. No editable production data or permission tables are modified.

### Out of scope / not represented as complete
- A working Invite/board membership manager requires a verified server-side user directory, role ceiling rules, grant/revoke RPCs, RLS and audit. A client-only invitation UI would be unsafe, so none is presented as functional.
- Item Updates/replies, attachments, notifications, edit/delete, realtime sync need verified domain contracts, signed authorization, storage and audit. Not implemented by this frontend design milestone.
- Activity timeline currently reads existing board events; pagination and richer actor display depend on live RPC field shape and backend capability.
- Advanced multi-touch resize, touch DnD and performance at 120 FPS require real browser acceptance; CI source checks alone cannot establish these.
- No preview of restricted TimeTracker source records is imported into general board columns; no change to attendance, GPS, Supabase, role policies, or production data.

## Acceptance
Automated: schema allowed fields, store isolation, invalid saved layout, bounded widths, group presentation, drag event wiring, keyboard alternatives, RBAC guards and existing frontend/database regressions.

Manual: in two signed accounts, verify independent layout across account/workspace/board, refresh/logout persistence, drag and keyboard tab movement, column reorder/width/hide/reset, horizontal scroll per group, unified vertical scroll, responsive views, and read-only activity across authorized/denied board access. Verify authored operations against server audit independently. Record actual frame pacing before claiming 120 FPS.

The next development milestone should inspect **board invitation** backend/RLS contracts and **item Updates** persistence, then implement each as independent signed-service slices without granting production permissions by default.
