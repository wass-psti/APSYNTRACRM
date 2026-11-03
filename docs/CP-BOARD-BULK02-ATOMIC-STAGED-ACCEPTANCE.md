# CP-BOARD-BULK02 — Atomic bulk item writes, CAS group changes

Status: **STAGED, NOT DEPLOYED TO SUPABASE.** Production permission-change approval for **this new milestone** remains required. The previously approved CP-BOARD-MENU01 / CP-TT-GPS01 migrations are unrelated.

## Existing authoritative contract findings

- `work_board_items.group_id` has a PostgreSQL **ON DELETE CASCADE** foreign key to `work_board_groups(id)`. Legacy `wm_delete_board_group(uuid)` can therefore delete items (including archived items) and their item-value, file and update references. It is intentionally **not wired into the frontend**.
- `wm_update_board_group(uuid,text)` has no compare-and-swap argument; the current inline group editor performs preflight but cannot guarantee atomic revision protection against concurrent writers.
- Existing single-item archive/restore RPC coordinates positions and writes audit events under the established board-scoped advisory lock; the new bulk API reuses that implementation within **one PostgreSQL function transaction**.
- Protected application/QA boards must not accept generic bulk mutations or group removal; TimeTracker Attendance remains authoritative, and its existing item-data projection/GPS restrictions are unaffected.

## Candidate files

- `sql/cp-board-bulk02-staged-atomic-mutations.sql`: two authenticated-only SECURITY DEFINER RPCs with `search_path=''`, active GoTrue session validation, centralized board RBAC, workspace isolation, protected-board checks and audit.
  - `wm_board_bulk_mutate(uuid,text,jsonb)` — atomic up to **50** items, actions `status`, `archive`, `restore`. Per-item `expected_updated_at` timestamp, unique IDs, same-board scope, ordered locks, schema-valid status labels, all preconditions before any writes, whole-statement rollback on failure, exact result receipts.
  - `wm_board_group_cas(uuid,uuid,timestamptz,text,text)` — `rename` with exact group CAS and signed `edit` permission; `delete_empty` only with signed `manage`, strictly **zero active or archived group items**, at least two groups, and no protected application/QA board deletion.
  - **Revokes authenticated `wm_delete_board_group(uuid)`** to eliminate bypass of the new zero-record guard. This changes production permissions and requires its own separate owner authorization.
- `sql/cp-board-bulk02-fail-closed-rollback.sql`: revokes both new RPCs without deleting the functions or rows, and retains the deny on legacy cascading deletion.
- `sql/tests/cp-board-bulk02-*.sql` and `.github/workflows/apsyntra-board-bulk02.yml` — disposable PostgreSQL 17 acceptance including edit/manager/viewer/foreign/expired/revoked-session denial, stale/duplicate/mixed foreign batches, archived-group protection, audit and rollback.

## Operational release gate

The frontend integration is **default-disabled** (`BOARD_BULK02_ENABLED=false`) until the exact staged SQL and grants are separately authorized, applied, verified with production read-only checks, and real signed manager/editor/Supervisor HTTP regressions pass. In particular, generic bulk writes remain prohibited for TimeTracker Attendance and all application-managed boards. Ordinary board CSV export and individual group rename continue using their existing approved path.

**No production database changes, migrated records, or permissions are implied by passing disposable SQL tests.** Follow-up work includes review of legacy group writers and genuine browser read/write acceptance against disposable board records.