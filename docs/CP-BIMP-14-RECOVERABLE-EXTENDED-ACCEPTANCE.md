# CP-BIMP-14 — Recoverable batch import and staged extended reference persistence

## Scope

Builds on CP-BIMP-13 PR #254, not yet deployed. No writes to existing production databases, operational records, credentials, roles, permissions or RLS policies. Keep ordinary-board-only existing import routing.

## Implemented — recoverable bounded imports

- Resume checkpoints are scoped to the *same in-memory reviewed file/plan*, signed user, workspace ID, board ID, batch size, committed prefix, and exact authoritative board state.
- Only after a **definite, non-uncertain error** is `Resume after N verified rows` offered. Prior batches are not re-executed. The coordinator fetches a fresh signed board snapshot and compares board/groups/columns/items/cells to the verified checkpoint before proceeding.
- No auto-retry after connection interruption, 5xx, JSON decoding error or uncertain commit. In those cases the wizard offers only close/reconcile. No newly persistent browser storage, private source data caches, telemetry or background tasks.
- Resume only while the original wizard and reviewed workbook remain open; **resume across browser reload is NOT implemented**. A changed board requires a new complete review rather than guessing which earlier transaction committed.

## Implemented — extended references, staged backend only

- `sql/bimp14-extended-references-DISPOSABLE-CANDIDATE.sql` stages **m143-v2** in an isolated database. The original m143-v1 RPC is left intact. References exceeding the normal text/long_text/URL cell limit (up to 65,536 characters) are stored in a separate board/item/column-associated table in the same atomic import transaction.
- A board-scoped signed read RPC returns the full original reference content. Existing board view access and signed-session checks are reused. There are no grants on the auxiliary table to clients; the writer and read RPC use existing board authorizations, no new roles.
- Ordinary cell edits clean up superseded long-reference rows through a DB trigger. One cell never has competing ordinary and extended values.
- Frontend capability-detects `wm_import_extended_refs_read` during authorized board loading; if unsupported, it retains m143-v1 behavior and performs existing preflight value rejection. When supported, it overlays full extended cell values for board rendering, including after refresh and reopen, and selects m143-v2 only for imports with capability present.
- Explicit mapping and full-sheet validation remain mandatory. No truncation, no auto-exclusion, no broad credentials, no per-item writes, no unrelated changes.

## Current verification and gate

- Existing frontend import/board tests, including synthetic 7,200-character reference persistence/readback, signed read rejection, compatibility with an unextended backend, definite-batch-resume, mismatched board-state denial and uncertain-response nonretry.
- PostgreSQL 17 disposable CI applies the m143-v2 candidate and performs a signed extended-reference write/read/denial. This is a staged *candidate* for acceptance, **not** a production migration authorization.
- Genuine signed-browser acceptance against the new build and a dedicated ordinary nonproduction board remains pending. The available signed tab runs the deployed `main` frontend against a recovery test fixture and cannot validate the unmerged branch. Do not write into operational boards or the unrelated fixture.
- Deployment of the new persistent storage table/function is a material production schema change and is not authorized by this checkpoint; separate explicit approval is required before applying it to production.
