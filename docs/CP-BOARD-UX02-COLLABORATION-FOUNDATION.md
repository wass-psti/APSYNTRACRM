# CP-BOARD-UX02 — Board activity and item detail foundation

## Implemented
- Board options: existing signed Activity, authorized Members & access (read only), Reset layout, Refresh.
- Item titles in generic and typed grids open a read-only responsive detail drawer. Ordinary board items show already-authorized group/status/assignee/due/notes. Restricted module boards show title/status/group only.
- Activity Search/Action/Person filters, pagination (25 records per page), Refresh and Load More (up to the existing RPC limit of 200 events). Original signed board-event RPC remains authoritative. All external text is HTML-escaped.
- Members listing is from signed board detail only. It does not expose the full profile directory or unverified invitation writes.
- No production attendance, roles, records, RLS, or SQL mutations.

## Read-only connected Supabase investigation on 2026-11-03
Existing RLS-enabled tables: work_board_members, work_board_item_updates, work_board_item_files, work_board_events.
Existing signed functions: wm_add_board_member, wm_remove_board_member, wm_add_board_item_update, wm_delete_board_item_update, wm_register_board_item_file, wm_delete_board_item_file, wm_list_board_events, wm_get_board, work_board_access.

Security and activation gaps:
1. Invitation target eligibility: wm_add_board_member checks caller manage permission and active target profile, but does not explicitly confirm the recipient is a member of the board workspace. Server-side same-workspace eligibility, role ceilings and immediate revocation need disposable-test evidence before enabling the frontend invitation writer. Do not use a client-only directory or broad profile list.
2. Updates: add/delete write RPCs exist but no item-scoped signed list/read contract, reply model, or edit contract was found. The authenticated role has no SELECT grant on work_board_item_updates; direct REST access is not an approved workaround.
3. Attachments: work-board-files is a private bucket with item/board path-scoped Storage RLS, and registration validates owner. A signed per-item metadata read contract is missing; preserve maximum 20 MB, MIME validation, signed download and orphan cleanup requirements.
4. Realtime: work_board_item_updates is absent from pg_publication_tables. Investigate secure channel ACL and event-refresh design before enabling client subscriptions.
5. Audit pagination: wm_list_board_events caps at 200 and has no cursor. Current UI intentionally limits to the recent authorized window; older history requires server-side keyset cursor paging.
6. Production approval: no new production role or RLS policies were applied; permission or production-data mutations require the prescribed separate approval.

## Acceptance
Automated: pure event normalization, bounded pagination, actor/action/text filtering, HTML encoding, item redaction and existing auth guards. Signed-browser interaction, responsive drawer appearance and actual 120 FPS measurement remain unverified because browser-control capabilities are not available in this Chat context.

Next: add audited same-workspace invitation contracts, authorized Updates read/reply ownership, authorized attachment-metadata read, and signed activity cursor pagination as separately verified backend increments. Respect the existing central SDK, transactions, RBAC and database.
