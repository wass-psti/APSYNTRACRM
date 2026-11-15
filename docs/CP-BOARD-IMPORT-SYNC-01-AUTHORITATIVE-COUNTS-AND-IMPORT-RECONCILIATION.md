# CP-BOARD-IMPORT-SYNC-01 — Authoritative Board Counts and Import Reconciliation

**Date:** 2026-11-15
**Implementation status:** IMPLEMENTED and deployed to GitHub Pages; production migration applied and verified. Signed-browser acceptance completed for pagination, refresh, import insertion, duplicate skip, update, and invalid-row exclusion. Sign-out/sign-in was not separately exercised.
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
- Two trashed boards named TimeTracker contain 320 and 4,000 records respectively; neither may be mixed into active TimeTracker board totals. The active TimeTracker System and TimeTracker Attendance boards contain 8 and 3 records respectively.
- The 320-record trashed board has eight committed wizard receipts: 320 created, zero updated, zero skipped. The other trashed board has 80 receipts: 4,000 created, zero updated, zero skipped.
- No board in the current database inventory has exactly 420 or 1,557 records. The legacy import event payloads retain created/updated/skipped counts but not source-row, validation, rejection, or worksheet-exclusion totals; the exact historical disposition of any 420-row source file cannot be reconstructed from those receipts. The regression test explicitly prevents 420 source rows from being reported as 420 persisted writes when only 320 are accounted for.
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
- PR #406 merged to `main` as `1be665b2d9d36cefa7fa7e7fae7fb5cb344cbd7a`; GitHub Pages build/deployment completed successfully.
- The disposable PostgreSQL 17 job passed on the merged PR, including first/continuation-page behavior, board and group reconciliation, foreign-board denial, `SECURITY DEFINER`, fixed `search_path`, and preservation of the authenticated-only execute grant.
- Production migration `cp_board_import_sync_01_authoritative_counts` was applied to the existing Supabase project. Supabase recorded migration version `20261115132051` (the repository migration filename and CI path must use this exact applied version).
- Read-only post-activation catalog verification confirms the original RPC signature, `SECURITY DEFINER`, `postgres` owner, `search_path=public`, and ACL `{postgres=X/postgres,authenticated=X/postgres}` remain unchanged. The first-page count branch and counts payload are present.
- The largest active board observed during read-only inspection contained 2,215 items. Its count-query plan uses `work_board_items_board_id_idx` and a bounded board-scoped bitmap heap scan; no new index or background process was added. The count aggregate runs only on the first page.
- Genuine signed-browser acceptance was performed on 2026-11-15 using the dedicated nonproduction CP-BIMP-11 Import QA board (e1071df3-1b0d-43c0-8aa0-732c09032df4) under the existing verified CRM admin session.
- Starting state: 41 persisted active records in one group. A synthetic 210-row CSV was imported into the existing Main group in two atomic batches (133 + 77); the UI reported 210 inserted, zero updated/skipped/rejected/failed, and 210 committed writes.
- Reimporting the same 210 stable Item titles in Skip mode matched all 210, skipped all 210, and committed zero writes. The two batch receipts independently recorded 133 and 77 skips.
- Update-mode acceptance matched one existing synthetic Item title and committed exactly one update; PostgreSQL readback confirmed its Amount value changed to 999.125.
- Invalid-row acceptance used two source rows: one valid row was inserted, one invalid date at worksheet row 3 was rejected after explicit exclusion acknowledgement, and no rejected record was persisted. The UI reported source=2, valid=1, inserted=1, rejected=1, failed=0.
- Final PostgreSQL readback confirmed 252 total/active records, zero archived records, and 252 records in the Main group. The 210 pagination-test titles were unique with zero duplicate-title groups; the invalid row was absent.
- After browser refresh, the signed board displayed 200 loaded / 52 remaining / 252 total (252 active, 0 archived). Loading the next page displayed 252 loaded / 0 remaining / 252 total. This confirms the first-page reset is a loaded-depth reset, not loss of persisted rows.
- Focused local Node test run: 106/106 board pagination, hydration, import summary, batch, and parsing tests passed. Main-branch GitHub Actions also passed frontend validation, PostgreSQL 17 authoritative-count acceptance, and live GitHub Pages asset verification. GitHub Pages deployment succeeded.
- The signed browser session was retained throughout; a separate sign-out/sign-in cycle was not performed.
- The Supabase Preview check remains failed because the production ledger contains 222 migration versions while this repository contains 28 migration files (206 remote versions are absent locally; 12 local versions are not in the remote ledger; 16 match). The board-count migration version 20261115132051 itself matches. Do not run migration repair, reset, or another production migration as a workaround; align the authoritative migration source/history in a separate, reviewed increment.

## Out of scope

No record moves, board restores, archive changes, bulk writes, new roles, grants, access policies, test users, additional Supabase projects, scheduled jobs, telemetry, or production data repair.

## Live acceptance interpretation

- The former 200/320 observation is now explained by progressive hydration: 200 is the initial loaded page, while the authoritative total and remaining count describe persisted records not yet loaded. Refresh correctly restores the first page without reducing the database total.
- The historical 420 figure is not verified as 420 committed writes. The relevant legacy board receipts substantiate 320 created records; the old event schema does not preserve enough source-row detail to allocate the remaining source rows retrospectively.
- The 1,557 figure is not present as an authoritative board total in the current database inventory. Current board and group totals are read from the selected board's authoritative page-count contract.
- CP-BOARD-IMPORT-SYNC-01 functional acceptance is verified for the tested signed-browser scenarios. Separate repository/production migration-history alignment and a sign-out/sign-in cycle remain outside this increment.
