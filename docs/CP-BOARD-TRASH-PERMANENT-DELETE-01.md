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

The pending migration under supabase/migration-candidates/ replaces that body with the same function signature, adding:
- An active signed session (private.wm_board_config_session_active()).
- Existing work_board_access(..., 'manage') authorization.
- Row locking and a fresh trashed-state check.
- Server-side protected-board rejection (private.wm_board_is_protected).
- Existing database and Storage-file guards.
- EXECUTE only for the existing authenticated role; PUBLIC and anon remain denied.

No roles are created or modified. No Storage objects are deleted. Boards with attachments remain blocked until the existing file workflow resolves them. Boards with TradeLink, Huly, Material Sourcing, TimeTracker audit/projection, or recoverable-QA references are also blocked; these existing RESTRICT/NO ACTION foreign keys protect module-owned records and operational audit history. Ordinary child rows are removed only through existing board foreign-key cascade relationships.

## Approval boundary

Applying the pending migration to the existing production Supabase project enables a new irreversible operation for existing board managers. Do not move it into supabase/migrations/, merge it to main, or apply it until that narrowly scoped production capability change is approved.

## Verification

Frontend tests use disposable in-memory API fixtures. They verify manager denial, protected-board denial, stale/foreign board denial, concurrency, bounded batch size, stop-on-first-failure behavior, and exact confirmation. No production board is deleted by tests.
