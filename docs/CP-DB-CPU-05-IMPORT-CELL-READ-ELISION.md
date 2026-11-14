# CP-DB-CPU-05 — Import Cell Read Elision

**Status:** Deployed to the existing production project; genuine import-workload acceptance pending.

**PR:** #385 (merged 2026-11-14 03:20 UTC; commit `e9b787953a87bbfe5d0b4b7acad939c49115feaf`).

**Supabase migration:** `20261114032119` (`cp_db_cpu_05_import_cell_read_elision`).

## Evidence

The existing `wm_import_board_wizard_extended_atomic` workload recorded 821 calls in cumulative `pg_stat_statements`, with 1,713,926 ms total execution time, 2,087.61 ms mean execution time, 7,774.3 ms maximum execution time, and 45,403,979 shared-buffer hits. The statistics were last reset on 2026-10-20, so these cumulative totals are not a current-period CPU measurement.

Supabase edge logs recorded 817 successful extended-import RPC requests in the inspected 24-hour window. Their observed upstream times varied by session, with session-level p50 values from approximately 0.97 s to 4.25 s and p95 values up to approximately 5.72 s.

## Change

The signed parent import RPC already validates the board, locks its current item/value state, resolves destination columns, and verifies the reviewed mapping. The prior per-cell helper redundantly selected the same item and column again for every mapped cell, then called the authoritative column validator (which performs its own column lookup).

The new private helper accepts metadata loaded from the locked board columns and removes those redundant per-cell item/column reads. It retains:

- `work_board_validate_column_value` as the authoritative type/value validator;
- existing system-column and custom-cell writes;
- item/board binding in system-column updates;
- extended-reference type checks, including rejection of system columns;
- per-cell `item.cell_updated` audit events;
- existing signed import RPC authorization, row locks, transaction boundary, and public RPC contract.

Column metadata is populated only from the parent RPC's database reads after its existing authorization and locking checks. The helper is private and execution is revoked from `PUBLIC`, `anon`, and `authenticated`.

## Verification

- Full frontend suite: 2,238 passed, 0 failed.
- Focused CP-DB-CPU-05 tests: 6 passed, 0 failed.
- PostgreSQL transactional migration/function-rewrite test on the disposable local Supabase database passed and rolled back.
- Production source-anchor preflight matched each expected function rewrite anchor exactly once.
- No production import was executed for this change; no CPU reduction percentage is claimed until a genuine post-deployment import workload and fresh CPU/statement deltas are observed.
