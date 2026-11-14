# CP-DB-CPU-13A — Genuine Signed-User RLS Acceptance, Post-Activation CPU Attribution, Sequential-Scan Verification, and Cross-Window Cache Consistency

**Date:** 2026-11-14
**Status:** VERIFIED WITH LIMITATION — production deployment, signed-user board allow/deny, focus-return reconciliation, and workload-level database/scan observation passed. Direct per-query CPU attribution remains BLOCKED by existing instrumentation; no CPU reduction is claimed. A live foreign-workspace negative test is unavailable because no existing board is present outside the active workspace.
**Repository:** `wass-psti/APSYNTRACRM`
**Supabase project:** `jtlusodorfnyzgyuewkz` (existing project only)
**Base commit:** `273d938c91537f574679c8119ccf5777ebfe318a`
**Merged PR:** [#398](https://github.com/wass-psti/APSYNTRACRM/pull/398)
**Merged commit:** `9fa302ee85c98ca919bb7f00b2df005baaaf5408`
**Pages validation run:** `43615082558` — all jobs PASS

## 1. Scope and guardrails

This increment completes the CP-DB-CPU-13 acceptance work and includes the reported defect where data can become stale or inconsistent when users switch between APSYNTRA CRM application windows.

- Preserve existing signed sessions, server-side RBAC/RLS, workspace isolation, board view checks, edit/manage checks, and module-specific permissions.
- Do not introduce additional authority, role restrictions, membership restrictions, or new approval gates.
- No production records, board contents, roles, grants, memberships, RLS policies, database settings, extensions, or statistics were changed.
- No persistent browser data cache, local/session storage cache, IndexedDB cache, background worker, recurring telemetry, or monitoring service was added.
- The service worker remains network-first for public static JS/CSS and continues to exclude authenticated API requests and navigations.
- No statistics reset, extension install, tracking configuration change, or database restart was performed.

## 2. Root-cause findings

### 2.1 Mutation classifier did not recognize full RPC names

`frontend/data.js` used an end-anchored regular expression containing partial mutation prefixes such as `wm_add_`, `wm_create_`, `wm_update_`, and `wm_import_`. Because the suffix was not matched, valid RPC names such as `wm_add_board_item`, `wm_create_board`, `wm_update_board_item`, and `wm_import_board_wizard_atomic` did not enter the successful-mutation branch.

For those calls, the conservative unknown-RPC path invalidated only the current tab before the request. It did not publish a post-commit `BroadcastChannel` invalidation. A second same-origin window could therefore keep its in-memory board snapshot until a later poll or navigation.

### 2.2 Window focus was not a synchronization trigger

The application listened for `document.visibilitychange`. Switching between two visible browser windows does not reliably change either document's visibility state, so the returning window could retain stale rendered state even though it was foregrounded again.

### 2.3 Cross-window invalidation did not reconcile every active view

The local `BoardCacheChannel` callback reconciled only when the current view was a board. Board-catalog, overview, and other signed views could invalidate a cache without refreshing their active rendered state.

### 2.4 Concurrent invalidations could be dropped

`PlatformSync.syncNow()` returned immediately when another reconciliation was in flight. A broadcast arriving during that interval could be removed from the pending event batch and not reconciled until a later polling cycle.

### 2.5 Realtime producer scope

The database-side `board-change` producer is limited to the existing batched-import broadcast path. The client-side same-origin `BroadcastChannel` is therefore the expected immediate propagation path for ordinary successful board/module RPC writes; it must classify those writes correctly.

## 3. Implemented changes

### 3.1 Exact successful-write classification

- Replaced the fragile partial-prefix regular expression with an explicit `Set` of reviewed mutation RPC names.
- Included current board structure/item/import writes and module writes rendered within board workspaces, including Material Request Hub, TimeTracker, TradeLink, Fund Release Tracker, FuelTrack, role configuration, and profile mutations.
- Preserved read-only RPC classification; `fueltrack_v3_receipt_prepare` remains read-only and does not publish a mutation event.
- Invalidation is published only after the signed RPC resolves successfully. Failed writes do not broadcast a commit hint.
- Board identifiers and optional revision metadata remain the only broadcast payload; no row contents, permissions, tokens, GPS, or personal data are sent.

### 3.2 Window focus and page restoration

- Added `PlatformSync.focusChanged()` and a 3-second focus cooldown.
- Added `window.focus` synchronization for visible-window switching.
- Added `pageshow` synchronization for BFCache-restored pages.
- Focus reconciliation uses the existing signed server reads and rechecks the current user/workspace before updating rendered state.
- Existing `visibilitychange`, network-online/offline, bounded polling, WebSocket lifecycle, and session-expiry behavior remain in place.

### 3.3 Reconciliation queue and active-view refresh

- Invalidations arriving during an active reconciliation are coalesced and replayed after the current reconciliation completes instead of being dropped.
- A full focus/cross-tab refresh takes precedence over a narrower board-only broadcast; multiple board IDs are coalesced when appropriate.
- The local cross-window invalidation callback now reconciles the active signed CRM view. The existing route/board checks filter unrelated board events before follow-up reads.
- All visible data continues to come from authoritative signed RPC reads. No BroadcastChannel or WebSocket payload is trusted as record data or as an authorization decision.
- Existing edit guards continue to protect unsaved fields; authorization checks still run before local edit state is preserved.

## 4. Verification completed on the implementation branch

| Check | Result | Evidence |
|---|---|---|
| Focus reconciliation unit tests | VERIFIED | Visible focus refreshes; hidden/offline focus does not read; 3-second cooldown enforced |
| In-flight invalidation handling | VERIFIED | Queued broadcast is replayed after current reconciliation; no lost event |
| Mutation classifier regression | VERIFIED | 59 reviewed board/module write RPC names publish only after successful completion |
| Read-only RPC exclusion | VERIFIED | `fueltrack_v3_receipt_prepare` emits no mutation broadcast |
| App wiring | VERIFIED | Focus, pageshow, signed reconciliation, and lifecycle tests pass |
| Full frontend Node suite | VERIFIED | 2,274/2,274 passed |
| Actual two-tab Chromium synthetic acceptance | VERIFIED | Real isolated Chromium tabs and real `BroadcastChannel`; second tab independently fetched updated fixture board |
| Synthetic view/foreign-scope denial | VERIFIED | Foreign workspace and revoked view denied; server view permission rechecked per navigation |
| Synthetic request reduction | VERIFIED | 5 direct reads vs 1 cached read (80% request-count reduction in the fixture only; not production CPU/latency) |
| 600-row virtual-list regression | VERIFIED | Bounded DOM, natural scroll, local search and empty state pass |
| `git diff --check` | VERIFIED | Clean |

## 5. Production performance baseline before CP-DB-CPU-13A deployment

### 5.1 PostgreSQL tracking limitations

Captured at `2026-11-14 16:14:51 UTC`:

| Setting | Value |
|---|---|
| `pg_stat_statements` reset | `2026-10-20 05:09:04 UTC` |
| `pg_stat_statements.track` | `top` |
| `track_functions` | `none` |
| `track_io_timing` | `off` |
| `pg_stat_kcache` | Not installed |

Direct per-query or per-function CPU attribution is **BLOCKED by the existing instrumentation**. `pg_stat_statements` supplies top-level execution elapsed time and buffer counters, not CPU time. Edge `origin_time` includes request processing outside PostgreSQL. No configuration change or instrumentation installation was made to force attribution.

### 5.2 Cumulative top-level statement baseline

These values are cumulative since the October 20 statistics reset, not a current-window CPU profile:

| RPC | Calls | Mean elapsed | Total elapsed | Shared-buffer hits |
|---|---:|---:|---:|---:|
| `wm_list_boards` | 17,134 | 388.05 ms | 6,648,928.85 ms | 296,286,985 |
| `apsyntra_crm_my_effective_access` | 2,544 | 674.05 ms | 1,714,795.61 ms | 22,475,574 |
| `wm_get_board` | 16,560 | 76.95 ms | 1,274,353.02 ms | 21,096,751 |
| `wm_get_board_items_page` | 1,178 | 45.71 ms | 53,843.01 ms | 5,267,035 |
| `wm_get_board_shell` | 478 | 10.88 ms | 5,202.14 ms | 156,909 |

The `wm_list_boards` and effective-access means are cumulative elapsed-time measurements; they are not CPU measurements and are not attributed to this increment.

### 5.3 Sequential-scan counters

Read-only baseline at `2026-11-14 16:14:51 UTC`:

| Table | Sequential scans | Sequential tuples read | Estimated live rows |
|---|---:|---:|---:|
| `profiles` | 141,434,207 | 4,024,982,241 | 1 |
| `workspace_members` | 45,678,798 | 2,000,240,515 | 4 |
| `private.ws01_lifecycle_flags` | 43,505,230 | 43,505,229 | 1 |
| `work_board_items` | 1,007,357 | 14,328,495,061 | 44,260 |
| `work_boards` | 235 | 42,714 | 357 |

A prior read-only snapshot at `16:10:50 UTC` showed `work_board_items.seq_scan=1,007,357`; the counter remained unchanged at `16:14:51 UTC`. This short interval is preliminary only and does not prove a durable scan-rate reduction. The profile, membership and lifecycle tables contain only 1–4 estimated live rows, so high cumulative scan counts alone do not justify index changes.

### 5.4 Database overview observation

The Supabase project overview showed approximately **3% CPU**, **49% RAM**, **58% disk**, and **16/60 connections**. This is a point-in-time dashboard observation, not a controlled before/after CPU result.

### 5.5 Signed production traffic observed before deployment

Between `15:45:00` and `16:00:00 UTC`, Edge logs recorded one signed actor with:

| RPC | Total requests | Signed requests | Signed actors | HTTP errors |
|---|---:|---:|---:|---:|
| `wm_list_boards` | 8 | 4 | 1 | 0 |
| `apsyntra_crm_my_effective_access` | 4 | 2 | 1 | 0 |

This confirms genuine signed traffic existed before the CP-DB-CPU-13A deployment. Post-deployment signed-user and focus acceptance are recorded below.

### 5.6 Post-deployment signed-user acceptance and observation

The main commit `9fa302ee85c98ca919bb7f00b2df005baaaf5408` passed the main-branch frontend validation workflow, including its `live-pages` asset verification job.

**Genuine signed-user RLS allow/deny:**

- Existing `admin_general_manager` session opened the existing nonproduction QA board `CP-BIMP-11 Import QA` (`e1071df3-1b0d-43c0-8aa0-732c09032df4`) in the current workspace.
- Signed `work_board_access`, `wm_get_board_shell`, and `wm_get_board_items_page` requests returned HTTP **200**.
- A separate existing `employee` session attempted to open the same board. Signed board-shell and paginated-item RPCs returned HTTP **403**, as expected for a nonmember without board-view access.
- Both sessions were already present; no test account was created. No board records or permissions were changed.
- The live `public.work_boards` inventory contains no rows outside the active workspace. A production foreign-workspace board denial was therefore **not attempted**; no foreign-workspace test board was created. Synthetic foreign-workspace denial remains verified by the disposable browser fixture.

**Production focus-return acceptance:**

- After the deployed code was loaded into the existing signed administrator session, the Chromium window was deactivated to Terminal and then reactivated without changing the CRM route or reloading the page.
- Edge logs recorded fresh signed `wm_list_boards`, `work_board_access`, `wm_get_board_shell`, and `wm_get_board_items_page` reads during the focus-return interval (`16:27:00–16:27:13 UTC`); all administrator reads returned HTTP **200**.
- The route remained on the same QA board throughout the focus-switch test.
- Existing tabs using different user identities remained isolated. Cross-window invalidation continues to require the same signed user and workspace; it does not broadcast data between administrator and employee sessions.

**Post-deployment database observation window:** `16:14:51.703 UTC` to `16:28:12.036 UTC` (13.339 minutes). No statistics were reset.

| Table | Seq-scan delta | Approx. scans/min | Interpretation |
|---|---:|---:|---|
| `profiles` (1 estimated row) | +767 | 57.5 | Tiny authorization table; no index change justified |
| `workspace_members` (4 estimated rows) | +302 | 22.6 | Tiny membership table; no index change justified |
| `private.ws01_lifecycle_flags` (1 estimated row) | +215 | 16.1 | Tiny lifecycle table; no index change justified |
| `work_board_items` (44,260 estimated rows) | **0** | **0** | No new sequential scans during the window; index scans increased by 2,805 |
| `work_boards` (357 estimated rows) | +1 | 0.075 | No material scan activity |

The large board-item table did not accumulate additional sequential scans during the observation window. The remaining scans are concentrated on authorization/lifecycle tables containing only 1–4 estimated rows. These counters do not justify adding indexes or changing RLS policy authority.

| Top-level RPC fingerprint | Calls in window | Added elapsed time | Mean for window calls |
|---|---:|---:|---:|
| `wm_list_boards` | 12 | 162.99 ms | 13.58 ms |
| `apsyntra_crm_my_effective_access` | 8 | 114.19 ms | 14.27 ms |
| `wm_get_board_items_page` | 8 | 95.59 ms | 11.95 ms |
| `wm_get_board_shell` | 8 | 88.71 ms | 11.09 ms |

These are global `pg_stat_statements` deltas, not actor-isolated CPU measurements. Edge logs independently confirm signed requests during the same test period. The current Supabase overview shows approximately **3% CPU**, **49% RAM**, **58% disk**, and **16/60 connections**. This is a point-in-time workload observation, not proof of a CPU reduction.

**Decision on attribution:** Workload-level statement elapsed-time and sequential-scan attribution is VERIFIED. Direct per-query/per-function CPU attribution remains BLOCKED because `pg_stat_statements.track=top`, `track_functions=none`, `track_io_timing=off`, and `pg_stat_kcache` is not installed. Those settings were deliberately left unchanged; no extension, instrumentation, database setting, or background monitoring was added.

## 6. Acceptance status

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| CP-DB-CPU-12 and CP-DB-CPU-13 migrations active | VERIFIED | Remote Supabase migration history versions `20261114151934` and `20261114154136` |
| Stable RLS initplan findings | VERIFIED | Performance Advisor remained at 0 after CP-13 |
| Cross-window root cause identified | VERIFIED | Mutation prefix classifier, missing focus trigger, limited active-view reconciliation, dropped in-flight events |
| Frontend synchronization fix | VERIFIED | Implemented and all 2,274 tests pass |
| Synthetic two-tab browser acceptance | VERIFIED | Real Chromium BroadcastChannel and signed-scope fixture pass |
| Production frontend deployment | VERIFIED | Main commit `9fa302ee85c98ca919bb7f00b2df005baaaf5408`; Pages validation run `43615082558` passed including live asset verification |
| Genuine signed-user board read allow | VERIFIED | Existing admin session: `work_board_access`, `wm_get_board_shell`, and `wm_get_board_items_page` all HTTP 200 |
| Genuine signed-user nonmember denial | VERIFIED | Existing employee session received HTTP 403 for board shell and paginated items on the same QA board |
| Live foreign-workspace negative | BLOCKED | No existing `public.work_boards` rows outside the active workspace; no fixture board was created |
| Post-deployment focus-switch acceptance | VERIFIED | Window deactivation/reactivation produced fresh signed workspace and board reads without changing route or reloading |
| Post-deployment workload/statement attribution | VERIFIED | 13.339-minute `pg_stat_statements` delta and current 3% CPU dashboard point captured; per-query CPU remains BLOCKED by existing settings |
| Post-deployment sequential-scan observation | VERIFIED | `work_board_items` had 0 new sequential scans and +2,805 index scans; remaining scans are on 1–4 row auth/lifecycle tables |

**Decision:** CP-DB-CPU-13A is deployed and verified for signed-user allow/deny, focus-return reconciliation, and workload-level database/scan observation. The reported cache/synchronization defect is addressed without weakening user/workspace isolation. No additional database optimization or index change is justified by this window. Do not claim a CPU reduction: direct per-query CPU attribution is blocked by existing instrumentation and the dashboard reading is only a point-in-time value. The live foreign-workspace negative remains blocked solely because no foreign-workspace board exists in the production inventory. No database DDL is required; CP-DB-CPU-13A can close.
