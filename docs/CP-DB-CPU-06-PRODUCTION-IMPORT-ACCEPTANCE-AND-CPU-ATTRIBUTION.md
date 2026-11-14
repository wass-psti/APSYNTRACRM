# CP-DB-CPU-06 — Genuine Production Import Acceptance and CPU Attribution

**Status:** Production diagnostics verified; CP-05 import acceptance pending an explicitly approved production write. No production data was changed during this milestone.

**Production project:** `jtlusodorfnyzgyuewkz` (existing WatchdogWorkspace project)
**CP-05 migration:** `20261114032119` — `cp_db_cpu_05_import_cell_read_elision`
**CP-05 merge:** PR #385, commit `e9b787953a87bbfe5d0b4b7acad939c49115feaf`
**Diagnostic window:** 2026-11-14 01:38–03:42 UTC, with cumulative database statistics reset on 2026-10-20 05:09:04 UTC.

## Scope and invariants

- Read-only production inspection and authenticated application observation only.
- No `pg_stat_statements_reset`, persistent monitoring, extension installation, database setting changes, production import, item/column/group mutation, role change, RLS/policy/grant change, or credential access.
- Preserve the existing signed-session, workspace, board and import contracts.
- No new Supabase project or development branch.

## Production resource snapshot

At approximately 2026-11-14 03:36 UTC, the Supabase dashboard showed:

| Resource | Observed |
|---|---:|
| PostgreSQL CPU | 86% |
| RAM | 50% |
| Disk | 56% |
| Connections | 17 / 60 |

This is one dashboard sample, not a time series. It does not prove that a particular SQL statement consumed 86% CPU.

## Query-statistics limits

- `pg_stat_statements` v1.11 is installed in schema `extensions`.
- Statistics reset: 2026-10-20 05:09:04 UTC. The aggregates below are cumulative across roughly 25 days and must not be described as current-window measurements.
- `pg_stat_kcache` is not installed.
- `pg_stat_statements.track = top`, `track_io_timing = off`, and `track_functions = none`. Nested SQL inside PL/pgSQL functions and per-function CPU are therefore not attributed by these settings.
- `pg_stat_statements` reports elapsed execution time and buffer activity, not CPU time. Supabase's Metrics API documentation describes host CPU series, but its privileged endpoint requires a project secret key; no secret was retrieved or exposed. The dashboard CPU card was used instead.

## Highest cumulative application statements

All entries below were executed as `authenticated`. Values are cumulative since the statistics reset.

| Statement / RPC | Calls | Total execution | Mean | Max |
|---|---:|---:|---:|---:|
| `wm_list_boards` | 16,657 | 6,643,441 ms | 398.84 ms | 7,994.6 ms |
| `wm_import_board_wizard_extended_atomic` | 821 | 1,713,926 ms | 2,087.61 ms | 7,774.3 ms |
| `apsyntra_crm_my_effective_access` | 2,140 | 1,708,960 ms | 798.58 ms | 2,827.6 ms |
| `wm_get_board` (legacy full-board read) | 16,543 | 1,273,964 ms | 77.01 ms | 5,127.7 ms |
| `work_board_access` | 38,588 | 136,304 ms | 3.53 ms | 114.1 ms |
| `wm_auth_access_context` | 33,152 | 123,446 ms | 3.72 ms | 83.1 ms |

The importer has 45.4 million shared-buffer hits, 1,768 shared-buffer reads and approximately 1.65 GB cumulative WAL bytes. These totals include pre-CP-05 activity. There is no post-CP-05 import call from which to calculate a new mean or CPU delta.

Supabase dashboard/catalog activity is a separate source of work: examples include `supabase_migrations.schema_migrations` (1,711 calls, 1,173 ms mean as `postgres`), catalog introspection (203 calls, 1,212 ms mean as `postgres`, 231,217 temp blocks written), and `pg_timezone_names` (233 calls as `authenticator`). These should not be attributed to CRM application RPCs.

## Board-list recovery after CP-04

The 24-hour pre-fix log sample contained 145 HTTP 500 responses for `wm_list_boards`; PostgreSQL logs recorded 149 statement-timeout cancellations in the same earlier period (2026-11-13 06:51–10:00 UTC).

After CP-DB-CPU-04 was applied at 2026-11-14 01:38:49 UTC, the inspected window through 03:37 UTC showed:

- 72 `wm_list_boards` requests, all HTTP 200;
- zero HTTP 5xx responses;
- p50 513.5 ms, p95 607.8 ms, maximum 655 ms.

This is an observational before/after comparison across different traffic windows, not a controlled CPU benchmark. It verifies that the sampled board-list timeout/error pattern was absent after CP-04.

## Post-CP-05 signed board retrieval observation

The active authenticated CRM browser session displayed `Secure session` and `Live synced`. In the post-CP-05 log window (03:21:19–03:37 UTC):

- `wm_get_board_shell`: 14 successful requests, p50 263 ms, p95 299.8 ms;
- `wm_get_board_items_page`: 14 successful requests, p50 565 ms, p95 574.2 ms;
- no legacy `wm_get_board` request was observed in this short window;
- no `wm_import_board_wizard_extended_atomic` request was observed.

This confirms the signed shell/page path is active for the observed session. It does not establish complete migration of every user/session or quantify the overall CPU effect.

## Why the genuine import test was not executed

The production import UI has no non-mutating dry-run RPC. The wizard's `Import Now` action invokes the atomic production import RPC.

A proposed one-row duplicate-skip test is not actually read-only: inspection of the installed RPC shows that even when every row is skipped, the function unconditionally updates `work_boards.updated_at` / `updated_by` and appends an `items.imported.wizard` audit event. Therefore, it would mutate production board metadata and audit history. No such call was made.

A genuine post-CP-05 benchmark remains pending separate explicit approval for that narrowly scoped production write (or use of an approved non-production acceptance database). No production records, board revisions or audit rows were changed by CP-DB-CPU-06 diagnostics.

## Next compute hotspot

The strongest remaining application-level candidate is `apsyntra_crm_my_effective_access()` (2,140 cumulative calls; 798.58 ms mean; 2,827.6 ms max). Its implementation assembles a module-role projection and workspace board-access projection while invoking existing role/workspace helpers. The next implementation should profile and reduce repeated read work while preserving the exact JSON contract and every existing authorization result.

The next implementation must not change roles, role ranks, workspace-selection rules, session validation, RLS, policies, grants, or permissions. A separate import acceptance must still be completed before claiming CP-05's measured benefit.

## Verification

- 142 focused board-import and CP-05 tests passed; 0 failed.
- 10 CP-04 import-coalescing / Realtime batching regression tests passed; 0 failed.
- Production CP-05 migration and private helper had already been verified after deployment; this milestone made no database changes.
- No production import was executed; no CPU reduction percentage is claimed for CP-05.
