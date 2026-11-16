# CP-BOARD-TRASH-PERMANENT-DELETE-01

## Scope

Add permanent deletion to My boards > Trash only:
- A per-board Delete permanently dropdown action.
- Trash-only board selection and a bulk action, capped at 50 boards per batch.
- Explicit confirmation (DELETE for one board; DELETE N BOARDS for a batch).
- Sequential per-board RPC execution. Stop on the first failure or uncertain result; do not blindly retry.
- Refresh the authoritative Trash list after success or partial failure and clear only confirmed deletions from the selection.
- Every deletion rechecks signed identity, workspace, manager capability and latest board metadata.

## Existing backend contract

The existing public.wm_delete_board_permanently(uuid) function was deliberately revoked from authenticated in CP-BOARD-MENU01. Its legacy body already required manager access, trashed state, and no board-file/Storage references, but it did not validate the current signed board-config session or protected-board registry.

The approved migration under supabase/migrations/ replaces that body with the same function signature, adding:
- An active signed session (private.wm_board_config_session_active()).
- Existing work_board_access(..., 'manage') authorization.
- Row locking and a fresh trashed-state check.
- Server-side protected-board rejection (private.wm_board_is_protected).
- Existing database and Storage-file guards.
- EXECUTE only for the existing authenticated role; PUBLIC and anon remain denied.

No roles are created or modified. No Storage objects are deleted. Boards with attachments remain blocked until the existing file workflow resolves them. Boards with TradeLink, Huly, Material Sourcing, TimeTracker audit/projection, or recoverable-QA references are also blocked; these existing RESTRICT/NO ACTION foreign keys protect module-owned records and operational audit history. Ordinary child rows are removed only through existing board foreign-key cascade relationships.

## Activation authorization

The user explicitly authorized CP-BOARD-TRASH-PERMANENT-DELETE-02, including controlled production activation. The approved migration is staged as a normal versioned migration and must be deployed by the existing main-branch Supabase GitHub integration. No manual production ledger edits or data deletions are needed for activation.

## Verification

Frontend tests use disposable in-memory API fixtures. They verify manager denial, protected-board denial, stale/foreign board denial, concurrency, bounded batch size, stop-on-first-failure behavior, and exact confirmation. No production board is deleted by tests.

## CP-BOARD-TRASH-PERMANENT-DELETE-02 — Disposable database verification

On 2026-11-16, the exact candidate SQL applied successfully in an isolated `postgres:17` Docker container. A controlled synthetic schema exercised unsigned, inactive, manager-denied, foreign-workspace, active, protected, attached-file, orphan Storage object, and module-retention denials. An ordinary trashed board deleted successfully with dependent-item cascade; unrelated boards remained intact. No production board data was read or changed by this disposable test.

The production signed-user UI acceptance and the final integration deployment are tracked separately from this disposable SQL validation.
