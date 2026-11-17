# CP-DB-CPU-16 — Cross-Tab Synchronization Coordination

**Project:** APSYNTRA CRM
**Repository:** `wass-psti/APSYNTRACRM`
**Branch:** `perf/cp-db-cpu-16-cross-tab-sync`
**Scope:** Reduce duplicate periodic workspace reconciliation and private Realtime sockets across same-user, same-workspace browser tabs.

## Evidence and motivation

The production investigation observed six CRM tabs in one browser session and repeated workspace-context, board-catalog, role-verification, and board-access RPC traffic. The earlier 24-hour edge-log sample included 7,033 workspace-context calls, 2,730 board-list calls, 2,681 bootstrap checks, 2,643 CRM-admin checks, and 7,751 direct board-access calls. These are historical request counts, not a post-deployment reduction measurement.

The database statistics also identified `wm_list_boards` as a high cumulative-time workload. CP-DB-CPU-15 subsequently added targeted board-catalog reconciliation; CP-DB-CPU-16 preserves that behavior for targeted board and cross-tab invalidations.

## Implementation

- Use the browser Web Locks API to elect one visible tab per signed user/workspace scope as the private Realtime socket owner.
- All visible windows retain a lightweight 90-second audit timer. Healthy Realtime leaders and followers coordinate the periodic signed audit through a separate scoped Web Lock and a timestamp-only localStorage marker.
- Each window retains its own authoritative recovery audit within 270 seconds, even when a peer has recently audited. Followers therefore do not open duplicate sockets, but missed BroadcastChannel invalidations cannot suppress their bounded recovery.
- A leader release or hidden tab permits a visible follower to acquire the lease. Follower retry is bounded to five seconds.
- Both lock names are scoped by user ID and workspace ID. The storage marker contains only a successful-audit timestamp. No JWT, board content, role, or authorization result is shared.
- Existing `BroadcastChannel` messages remain invalidation hints only. Every tab re-reads through its own signed RPC calls.
- If Web Locks or storage is unavailable, each tab falls back to its own signed periodic audit. If BroadcastChannel is unavailable, each tab retains the original independent Realtime socket and polling path.
- Targeted cross-tab board invalidations skip the full board-catalog read on an open board. Broad invalidations and non-board views retain the existing catalog refresh. This preserves CP-DB-CPU-15.
- Session expiry, logout, workspace changes, and route-level invalidation dispose the lease, socket, and timers together.

## Verification

- Focused synchronization, lease, cooperative audit, board-cache, and CP-DB-CPU-15 tests: 54 PASS, 0 FAIL.
- Full repository test suite: 2,610 PASS, 0 FAIL.
- ESLint on all changed JavaScript files: PASS.
- JavaScript syntax checks: PASS.
- Chromium multi-tab acceptance: PASS — three same-scope tabs elected one leader; releasing it elected one successor; a second workspace elected an independent leader.
- Vite production build: PASS. Existing startup-script bundling notice and large-chunk advisory remain non-fatal.

## Production acceptance still required

The change has not been merged or deployed. After deployment, capture a new comparable edge-log window and verify the expected reduction in duplicate periodic `wm_auth_access_context`, `wm_list_boards`, role-verification, and `work_board_access` calls while confirming signed reads still occur on focus and scope changes. Do not claim a CPU percentage reduction from the historical counters or local browser fixture.
