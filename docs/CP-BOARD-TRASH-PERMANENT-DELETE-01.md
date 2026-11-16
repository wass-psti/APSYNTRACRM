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

## CP-BOARD-TRASH-PERMANENT-DELETE-02 — Signed production acceptance (2026-11-16)

- PR #410 merged into `main` as `93d435899017360ed858fcc35430fec5eddc551f`; all 20 reported main-commit checks succeeded.
- The existing Supabase production project registered migration `20261116005252`; 223 total migrations. `authenticated` can execute the guarded RPC, while `anon` and `PUBLIC` cannot. Signed-session, protected-board, and module-retention guards were confirmed in the deployed function.
- Three synthetic empty QA boards (`CP-TRASH02-SIGNED-QA-A/B/C-20261116`) were created and moved to Trash through the verified signed CRM browser. The Trash count increased from 50 to 53.
- Single deletion: A was removed using its menu action and exact `DELETE` confirmation. PostgreSQL confirmed its absence.
- Bulk deletion: only B and C were selected; the modal listed their names and required `DELETE 2 BOARDS`. Both were deleted, selection cleared, and the Trash count returned to 50.
- Independent PostgreSQL readback confirmed zero matching QA board IDs, zero matching QA names, and zero residual QA board items. No operational records were deleted during acceptance.
- A final UI copy discrepancy was found: the reversible Move to Trash confirmation still claimed permanent deletion was unavailable. This was corrected in the follow-up closeout change to reflect the now-activated workflow.
- Evidence classifications: production activation VERIFIED; signed single/bulk deletion VERIFIED; existing roles/RLS preserved VERIFIED; unauthorized-session and file/module denial behavior VERIFIED in disposable PostgreSQL, with actual production signed-denial account testing not separately performed.
