# CP-DB-CPU-17 — Production CPU and RPC Workload Acceptance

**Project:** APSYNTRA CRM
**Repository:** `wass-psti/APSYNTRACRM`
**Supabase project:** `jtlusodorfnyzgyuewkz`
**Date:** November 17, 2026
**Status:** CPU target observed; causality and comparable-window final acceptance **PENDING**.

## Resource state

The signed Supabase project overview displayed CPU **3%**, disk 58%, RAM 48%, and 16/60 connections. The project API separately returned `ACTIVE_HEALTHY`, PostgreSQL 17.6.1. A later direct PostgreSQL snapshot reported 23 database connections; these are distinct observation times, not contradictory synchronized readings.

This is a snapshot, not a measured CPU trend. Historical ~40% CPU was previously reported, but a matched before/after CPU time series and workload metadata have not been established. Neither `pg_stat_statements.total_exec_time` nor API origin latency is CPU time.

## Equal-duration API request windows

Collected from the existing production API gateway logs. POST requests only. Exactly seven minutes on each side of CP-DB-CPU-16 deployment. Each log window reported two distinct authenticated actors; **the actor/session and active-window composition have not been independently proven equivalent**.

| Signed RPC | Nov 17 07:18–07:25 UTC | Nov 17 07:35–07:42 UTC | Observation |
|---|---:|---:|---|
| `wm_auth_access_context` | 87 | 88 | Similar |
| `work_board_access` | 52 | 56 | Slightly higher |
| `wm_list_boards` | 29 | 27 | Slightly lower |
| `apsyntra_crm_my_effective_access` | 22 | 17 | Lower |
| All four combined | 190 | 188 | Approximately unchanged |

No non-200 responses were recorded in these four RPCs in the two inspected windows. This is **not** convincing evidence of an attributable reduction in total API demand or CPU: the observation windows are short, workload composition is unknown, and several RPCs have other consumers.

## Current cumulative database hotspots

`pg_stat_statements` reset at **2026-10-20 05:09:04 UTC**. These figures are cumulative over a long period, not recent CPU measurements:

| RPC | Cumulative calls | Execution milliseconds |
|---|---:|---:|
| `wm_list_boards` | 21,877 | 6,725,876 |
| `wm_import_board_wizard_extended_atomic` | 1,326 | 1,897,612 |
| `apsyntra_crm_my_effective_access` | 5,678 | 1,762,112 |
| Legacy `wm_get_board` | 16,770 | 1,352,798 |

Significant sequential-scan counters also remain cumulative; `work_board_items` sequential scans were unchanged at 1,007,368 between the recent inspected snapshots. This does not support adding an index to this table without contemporary plan evidence. Small tables (workspace identities/lifecycle flags) legitimately receive sequential scans; scan counts alone are not sufficient to justify schema changes.

The installed `wm_list_boards(text)` function remains a signed `STABLE SECURITY DEFINER` RPC and uses a materialized caller/visible-board set with index-backed active-board item counts. The previous examined candidate set-based replacement did not establish a plan improvement. No speculative rewrite is applied here.

Other development work may be occurring concurrently. **No live RPC, grants, policies, role rules, production data, or index definitions were changed in CP-DB-CPU-17**.

## Delivered acceptance tooling

- `scripts/cp-db-cpu17-acceptance.mjs` — offline CLI requiring two JSON workload snapshots, checking normalized RPC rates, CPU sampling, equivalent workload cohort/tab counts, signed regression acceptance, and integrity outcomes. Returns `INDETERMINATE` rather than claiming success when evidence is insufficient.
- `frontend/tests/cp-db-cpu17-cpu-acceptance.test.mjs` — synthetic fixtures for genuine success conditions and denied/inconclusive cases.
- No additional application runtime dependency or monitoring background agent.

Example read-only evidence JSON per file:

```json
{
  "window_start": "2026-11-17T06:00:00Z",
  "window_end": "2026-11-17T06:30:00Z",
  "cohort": "same-workspace-comparable-activity",
  "cpu_samples_pct": [3, 4, 3],
  "active_users": 2,
  "active_windows": 4,
  "workflow_events": 50,
  "rpc_requests": {
    "wm_list_boards": 30,
    "wm_auth_access_context": 60,
    "work_board_access": 60
  },
  "rpc_errors": 0,
  "signed_regression_passed": true,
  "integrity_verified": true
}
```

The numbers in this example are **illustrative, not production measurements**. CPU samples must be from the same Supabase CPU metric and comparable intervals; count actual user workloads, not scripted reads used to create the report.

Execute:

```bash
node scripts/cp-db-cpu17-acceptance.mjs baseline.json after.json
```

Exit 0 indicates evidence passes the comparison contract. Exit 1 means not enough evidence to certify an improvement. Exit 2 means malformed input. Passing the comparison contract does not alone certify production readiness: inspect underlying source and actual signed runtime.

## Decision and remaining acceptance

The reported project CPU target near 3% is **currently observed**, but sustained comparable load and causal CPU improvement are **unverified**. There is no demonstrated need to change authorization behavior, add indexes, disable background jobs, or rewrite hot RPCs at the current low-utilization snapshot.

Final acceptance requires at least two equal-duration 15-minute or longer CPU time series from the same metric source with documented signed-user/window counts, comparable workflow operations, and normal production error/latency rates. It also requires signed multi-window and integrity regression evidence, and a follow-up under a busier normal workload if the current load is unusually light.

**If CPU remains near 3% under representative load with intact functionality, stop optimizing.** Otherwise identify the newly dominant workload using interval deltas, EXPLAIN plans and application-source attribution before the next targeted change.
