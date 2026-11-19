# CP-TL-CREATE-NEW-02 — User Draft Board Projection Acceptance

**Date:** 2026-11-19

**Status:** IMPLEMENTED — effective production migration applied; six-module disposable acceptance PASS; genuine signed-user browser write acceptance pending.

**Repository:** wass-psti/APSYNTRACRM

**Supabase:** existing project jtlusodorfnyzgyuewkz only.

## Root cause

The production database has 36 active TradeLink `User` module-role assignments in the main workspace. All 36 have Board Viewer membership and none has Board Editor or Owner membership.

The CP-TL-CREATE-NEW-01 creator capability correctly recognizes the existing TradeLink `User` role, but the document save transaction still delegated linked Board item creation to `public.wm_add_board_item`. That generic function requires `public.work_board_access(board,'edit')`, so the document transaction rejected the exact Viewer-only accounts the new domain capability was intended to support.

The issue is a mismatched dependency between TradeLink's domain operation and generic Board editing. It is not a missing role assignment.

## Implemented correction

- Preserve the existing `private.tl03_can_create_draft` capability and all existing signed-session, workspace, profile, module-role and canonical-board checks.
- Preserve the existing Board Manager path and its call to `public.wm_add_board_item`.
- For the existing TradeLink User path only, create the linked Board item directly inside the already-authorized `private.tl03_save` SECURITY DEFINER transaction.
- Reproduce the generic Board insert's behavior: board-level advisory lock, group validation, default status selection, item position, creator/updater attribution, Board updated timestamp and Board event log.
- Keep document row, Board item, revision snapshot and document audit changes atomic in the same transaction.
- Do not grant Board edit/manage access, change any workspace membership or role assignment, or modify the shared Board insert function.

## Production migration history

The existing production project records two migration versions with the same migration name:

1. `20261119080635` is the initial attempt. Its exact-indentation text replacement did not match the production `pg_get_functiondef` output; the migration transaction rolled back without changing the function. The migration ledger nevertheless retained the version, so its original source is preserved in the repository for ledger parity.
2. `20261119085430` is the whitespace-independent follow-up. It applied successfully and is the effective production change. Its source is `supabase/migrations/20261119085430_cp_tl_create_new_02_user_board_projection_insert.sql`.

Read-only production catalog verification confirms the manager RPC remains present exactly once, the existing User domain capability is retained, and the User-specific Board insertion, advisory lock, Board event log and Board timestamp update are installed. The function remains postgres-owned SECURITY DEFINER with an empty search path.

## Production verification

- 36 active TradeLink `User` assignments exist in the main workspace; all 36 have Board Viewer membership and none has Board Editor/Owner membership.
- A real existing User session probe returns `tl03_can_create_draft = true`, while generic Board edit and manage access both remain false.
- The shared `public.wm_add_board_item` function and manager creation path remain unchanged.
- The effective migration is recorded in the existing Supabase project's migration ledger.

## Acceptance coverage

The disposable PostgreSQL 17 acceptance fixture uses an existing synthetic TradeLink User with Board Viewer membership only. It exercises all six source modules:

1. Electronic SI
2. Quotation
3. Packing List
4. Delivery Receipt
5. Payment AR
6. PO to Suppliers

For each module it verifies server-assigned numbering, revision-one creation, creator readback, Board item linkage, revision history, idempotent create replay, creator-owned Draft update, revision-two persistence, Board timestamp synchronization, idempotent update replay and stale-write conflict handling. It also verifies the signed All Documents list and page contain the creator-owned Drafts. All fixture records and sequence increments are rolled back.

## Files

- `supabase/migrations/20261119080635_cp_tl_create_new_02_user_board_projection_insert.sql` (historical ledger source)
- `supabase/migrations/20261119085430_cp_tl_create_new_02_user_board_projection_insert.sql` (effective production migration)
- `sql/tests/cp-tl-create-new-02-user-fixture.sql`
- `sql/tests/cp-tl-create-new-02-user-six-module-disposable.sql`
- `scripts/cp-tl-create-new-02-user-draft-disposable.sh`
- `frontend/tests/tradelink-user-board-projection-create.test.mjs`

## Not yet claimed

- No production TradeLink document or Board item has been created by this acceptance work.
- The currently open browser session is a TradeLink General Manager, not a TradeLink User. Genuine User browser create/refresh/reopen acceptance remains pending an existing User session and an explicitly approved set of production QA Draft records.
