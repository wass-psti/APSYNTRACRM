# CP-DB-CPU-10 — Genuine Signed Runtime Workload Isolation, Effective-Access Acceptance, and Bounded Importer Performance Verification

**Date:** 2026-11-14
**Status:** VERIFIED for signed effective-access runtime and bounded importer execution; direct per-query CPU attribution remains BLOCKED by the existing PostgreSQL tracking configuration.
**Repository:** `wass-psti/APSYNTRACRM`
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)
**Runtime:** Existing production CRM deployment and existing signed administrator browser session.

## 1. Scope and guardrails

CP-10 completed genuine signed runtime measurements and two bounded importer runs through the existing CRM application UI.

- The existing signed `admin_general_manager` session was used. Its actor was matched to the active CRM administrator profile; no credential or token was read, copied, or exposed.
- The importer target was only `CP-BIMP-11 Import QA` (`e1071df3-1b0d-43c0-8aa0-732c09032df4`), explicitly described by the application as a dedicated nonproduction board with no operational records.
- The writes went through the actual browser import wizard and existing signed atomic importer RPC. The CSV was supplied to the actual file input as a browser `File` object; the application parser, mapping, preview, duplicate review, signed import, and verification flow all executed.
- Exactly 28 synthetic QA items were added: a 3-row run and a 25-row run. The resulting records were intentionally retained as benchmark evidence; no destructive cleanup was performed.
- No operational board, user account, workspace membership, role, permission, RLS policy, grant, schema, index, database setting, extension, or credential was changed.
- No statistics were reset and no persistent monitoring was installed.
- The local Vite server was not used; the existing production CRM browser session and current deployed UI were used.

The existing QA board had 13 active items before CP-10. It now has 41 active items: the original 13 plus the 3-row and 25-row CP-10 synthetic batches.

## 2. Genuine signed effective-access acceptance

The browser displayed `Live synced`, `Access context verified`, and the existing administrator role. The matching database profile was active and had platform role `admin_general_manager`.

Actor-filtered Supabase Edge logs for `2026-11-14 09:30:00–09:40:00 UTC` recorded:

| Signed RPC | Requests | HTTP success | Errors | p50 origin | p95 origin | Max origin |
|---|---:|---:|---:|---:|---:|---:|
| `apsyntra_crm_my_effective_access` | 5 | 5 | 0 | 265 ms | 279.8 ms | 280 ms |
| `wm_list_boards` | 7 | 7 | 0 | 515 ms | 525.8 ms | 527 ms |

The five effective-access requests were observed at `09:30:19.308`, `09:32:20.650`, `09:34:22.520`, `09:36:22.591`, and `09:38:22.759 UTC`; all returned HTTP 200. The actor identifier was filtered to the signed administrator profile before aggregation. Other signed actors and empty-auth-context log rows were excluded from these actor-specific results.

This verifies that the existing signed session repeatedly resolves effective access successfully. Edge `origin_time` is request-origin elapsed time, not CPU time.

## 3. Bounded importer run A — 3 rows

**Window:** `09:38:29.327884–09:39:24.240878 UTC`
**Payload:** 3 new items, 3 existing mapped value columns (Amount, Flag, Date), one batch.
**UI result:** `3 created · 0 updated · 0 skipped · 0 columns created · 0 groups created`; `Verified 3 of 3 rows across 1 of 1 batches`.

The pre/post `pg_stat_statements` snapshots for query ID `5962890455400465064` (`wm_import_board_wizard_extended_atomic`) were:

| Counter | Before | After | Delta |
|---|---:|---:|---:|
| Calls | 925 | 926 | +1 |
| Total execution | 1,743,133.168 ms | 1,743,188.699 ms | **+55.531 ms** |
| Shared buffer hits | 48,660,806 | 48,663,217 | +2,411 |
| Shared buffer reads | 2,004 | 2,008 | +4 |
| Temp blocks written | 0 | 0 | 0 |

The matching signed Edge log contained one successful importer request for the administrator actor, with 305 ms origin time. The statement call delta was exactly one. The 55.531 ms figure is top-level PostgreSQL execution elapsed time, not CPU time.

Independent SQL readback confirmed all 3 item rows and all 9 mapped values. The board count increased from 13 to 16.

## 4. Bounded importer run B — 25 rows

**Window:** `09:43:52.041344–09:45:13.526790 UTC`
**Payload:** 25 new items, 3 existing mapped value columns (Amount, Flag, Date), one batch; 75 mapped cell values.
**UI result:** `25 created · 0 updated · 0 skipped · 0 columns created · 0 groups created`; `Verified 25 of 25 rows across 1 of 1 batches`.

The pre/post `pg_stat_statements` snapshots for query ID `5962890455400465064` were:

| Counter | Before | After | Delta |
|---|---:|---:|---:|
| Calls | 926 | 927 | +1 |
| Total execution | 1,743,188.699 ms | 1,743,303.798 ms | **+115.099 ms** |
| Shared buffer hits | 48,663,217 | 48,669,742 | +6,525 |
| Shared buffer reads | 2,008 | 2,011 | +3 |
| Temp blocks written | 0 | 0 | 0 |

The matching signed Edge log contained one successful importer request for the administrator actor, with 381 ms origin time. The statement call delta was exactly one. A separate empty-auth-context log row had zero origin time; it is not counted as the signed administrator request.

Independent SQL readback confirmed:

- 25 newly created items, all created by the signed administrator actor;
- 75 stored mapped values across the 25 items and 3 existing columns;
- 75 `item.cell_updated` audit events;
- 1 `items.imported.wizard` summary event with payload `{created:25, updated:0, skipped:0, columns_created:0, groups_created:0}`;
- no new columns or groups.

The board count increased from 16 to 41. The 25-row import used one atomic batch and did not create temporary blocks.

## 5. Importer cost comparison

| Run | Rows | Mapped cells | PostgreSQL top-level elapsed | Edge origin |
|---|---:|---:|---:|---:|
| A | 3 | 9 | 55.531 ms | 305 ms |
| B | 25 | 75 | 115.099 ms | 381 ms |

The 25-row batch processed 8.33× as many rows as the 3-row batch while total top-level PostgreSQL elapsed increased by about 2.07×. Average top-level elapsed per row fell from about 18.51 ms to 4.60 ms. This is consistent with a meaningful fixed per-request cost and amortization across a batch; it is not a CPU-utilization measurement and does not establish 5,000-row performance.

No importer lock narrowing or index changes are justified by these two bounded runs. The existing board-wide lock sequence remains a candidate for a future contention-specific test, not a proven CPU defect.

## 6. CPU and measurement limits

The refreshed Supabase Database Observability page showed **1.29% average CPU** and **808.24 MB memory usage** for the rolling `Last 60 minutes` window `16:47–17:47 GMT+8` on November 14.

This is a database-wide rolling metric. It cannot be assigned to the CP-10 operator or either importer request. The prior CP-09 CPU observation used a different, overlapping rolling window and is not a controlled before/after comparison.

The existing PostgreSQL configuration remains:

| Setting / capability | Value |
|---|---|
| PostgreSQL | 17.6 |
| `pg_stat_statements` | 1.11 |
| `pg_stat_statements.track` | `top` |
| `track_functions` | `none` |
| `track_io_timing` | `off` |
| `pg_stat_kcache` | Not installed |

Therefore:

- `pg_stat_statements` provides top-level statement execution elapsed time and block counters, not direct per-query CPU time.
- Nested PL/pgSQL statements and per-function CPU are not separately attributable under the current tracking configuration.
- Edge `origin_time` includes request processing outside the database and is not a substitute for PostgreSQL CPU time.
- The CPU chart is database-wide, not actor- or query-specific.

Direct per-query CPU attribution is **BLOCKED by available instrumentation**, not by a signed-session or authorization failure. No global tracking change, extension installation, database restart, or monitoring service was introduced to force attribution.

## 7. Acceptance matrix

| Requirement | Status | Evidence |
|---|---|---|
| Genuine signed administrator session | VERIFIED | Live synced UI, active profile, actor-matched signed Edge logs |
| Effective-access runtime | VERIFIED | 5/5 HTTP 200; p50 265 ms; p95 279.8 ms |
| Signed board-list runtime | VERIFIED | 7/7 HTTP 200; p50 515 ms; p95 525.8 ms |
| 3-row importer execution | VERIFIED | 3/3 created and verified; one statement call; +55.531 ms |
| 25-row importer execution | VERIFIED | 25/25 created and verified; one statement call; +115.099 ms |
| Authoritative item/value persistence | VERIFIED | 28 item rows and 84 mapped values read back from PostgreSQL |
| Importer audit trail | VERIFIED | 84 cell events and 2 import-summary events across both runs |
| Refresh persistence | VERIFIED | Reloaded CRM board displays 41 items and both CP-10 batches |
| CPU dashboard observation | VERIFIED | 1.29% rolling average for 16:47–17:47 GMT+8 |
| Per-query / per-function CPU attribution | BLOCKED | Existing `track=top`, `track_functions=none`, no `pg_stat_kcache` |
| Schema, role, permission, RLS, and configuration changes | NOT APPLICABLE | None made |

## 8. Decision and next step

**CP-DB-CPU-10 runtime acceptance is complete.** The existing importer correctly processes bounded 3-row and 25-row payloads, persists typed values, emits the expected audit trail, and survives a full browser refresh. The measured top-level elapsed time does not justify changing importer locks or indexes.

The only remaining limitation is direct query-level CPU attribution. If that level of attribution is required, the next scoped increment is:

**CP-DB-CPU-11 — Low-Overhead Query-Level CPU Attribution Feasibility, Instrumentation Cost Review, and Importer Contention Decision.**

CP-11 should first determine what the existing Supabase platform can expose without changing configuration. Any extension installation, global tracking change, restart, or added monitoring must be evaluated separately for overhead and operational impact before execution. No such change is part of CP-10.
