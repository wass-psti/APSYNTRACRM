# CP-BOARD-IMPORT-SYNC-01 — Authoritative Board Counts and Import Reconciliation

**Date:** 2026-11-15
**Implementation status:** Frontend and migration source implemented; disposable PostgreSQL CI acceptance added; production migration not applied.
**Scope:** Board item count accuracy, progressive page reconciliation, group totals, and import outcome reporting.

## Objectives

1. Distinguish records loaded into the browser from records remaining to be loaded and the total persisted on the selected board.
2. Return authoritative board and per-group totals from the first signed page read without repeating the aggregate scan on continuation pages.
3. Keep active and archived record counts distinct.
4. Reconcile import source rows to validated, rejected, excluded, inserted, updated, skipped, and duplicate-matched rows.
5. Preserve the existing board access check, function signature, SECURITY DEFINER model, fixed public search path, owner, and execute grants. No new role, permission, workspace, or board restriction is introduced.

## Production discovery snapshot

- The existing wm_get_board_items_page(uuid, integer, uuid, integer) function uses keyset pagination and returns a maximum of 500 records per page.
- The active board-list RPC counts non-archived records. The board item-page RPC previously returned no authoritative persisted count.
- The two TimeTracker boards previously mistaken for active inventory are marked trashed; their record totals must not be mixed with active-board totals.
- The audited import history examined for the relevant trashed board contains eight committed wizard receipts: 320 created, zero updated, zero skipped. This is historical evidence for that board, not proof of a separate 420-row import.
- The database inventory did not corroborate a board total of 1,557 for the TimeTracker boards examined.
- Existing indexes include board-scoped item indexes, an active-board count index, and group-position/archive indexes. This increment adds no index and no background process.

## Backend response contract

The first page response adds:

- counts.total_count
- counts.active_count
- counts.archived_count
- counts.groups[] with group_id, total_count, active_count, and archived_count

Continuation pages return counts: null. Counts are calculated only in the first-page branch. The STABLE RPC reads share the caller statement snapshot, and continuation pages do not execute the aggregate query. The existing keyset cursor and item/value payload remain unchanged.

## Frontend behavior

- Validates non-negative integer totals and exact active-plus-archived reconciliation.
- Validates that group totals reconcile to board totals and that returned group IDs belong to the board shell.
- Rejects a terminal page if loaded rows cannot reconcile to the first-page total.
- Exposes loaded, remaining, and total records; active and archived totals are shown separately.
- Retains backward compatibility when the older RPC response does not yet contain counts.

## Import behavior

The successful result distinguishes:

- Source rows, valid rows, rejected rows, and explicitly excluded worksheet rows.
- Inserted rows, updated rows, skipped rows, and duplicate matches.
- Committed database writes (inserted + updated) from rows merely present in the source.
- Failed/unreconciled row counts.

A mismatched receipt is not presented as a fully reconciled import. The UI instructs the user to refresh and inspect the destination before repeating an import. Existing atomic import RPCs, batch sizing, durable recovery, and server authorization are unchanged.

## Verification

- Added unit coverage for first-page totals, multi-page hydration, archived records, group reconciliation, inconsistent counts, terminal-page mismatch, and import receipt reconciliation.
- Added a disposable PostgreSQL 17 workflow job. It seeds synthetic rows and an existing function ACL, applies the migration inside a transaction, and verifies page boundaries, counts, group totals, fixed search path, SECURITY DEFINER, authenticated execute access, and denial for an ungranted role.
- The production Supabase project was queried read-only for schema, existing function definition, index inventory, board statuses, and import audit evidence.
- The production migration has NOT been applied by this increment. Production activation follows after the disposable PostgreSQL job passes and the migration is reviewed against the deployed function contract.

## Out of scope

No record moves, board restores, archive changes, bulk writes, new roles, grants, access policies, test users, additional Supabase projects, scheduled jobs, telemetry, or production data repair.
