# Priority 5E — Signed Workspace Read-Latency Isolation

## Baseline and verified problem

User-reported signed browser sampling before Priority 5E: workspace authorization was **1008.5 ms** in one run, and **1273.7 ms** in a subsequent post-5D run. Other navigation timings also changed significantly, so neither run isolates a server-only regression or establishes 5D causality. The second sample put session restoration at 467.3 ms, authorized route at 12.2 ms, and JavaScript entry at 3038.5 ms since navigation.

The `workspace-authorization` diagnostic spans more than one operation. The actual code executes a fresh signed `wm_auth_access_context`, then two concurrent independently authorized reads: `wm_list_boards` and `apsyntra_role_is_bootstrap`. The time cannot be attributed to any one call from the previous aggregate report.

## Narrow implementation

- Reuse the existing fixed-phase in-memory startup timer. Within the **initial signed startup only**, measure three exact allowlisted operation names: `workspace-context`, `board-list`, and `bootstrap-role`. The three calls remain identical; no extra network requests, no duplicate retry, no caching, no RPC payload inspection and no permission shortcuts.
- Record only monotonic **network-inclusive** duration and **numeric start/end offsets relative to the app-entry clock**. Operation data are not server-execution timing, and overlapping board and role durations must **not** be summed. Failed startup, logout, expired/revoked session, or workspace switch prevent a stale report from being surfaced. No response values, identities, URLs, access tokens, dynamic RPC names or errors enter the report.
- In Account Settings the user-triggered five-second sample shows this already-completed signed startup timing, if present in the same reloaded tab. Collection starts on normal signed bootstrap and ends at startup completion; there is no persistent observer, telemetry, background service, persistent storage or export. The on-demand sample does not itself issue the RPCs.
- Priority 5D’s existing safe overlap is preserved. **No second optimization is justified until the new measurements pinpoint the expensive operation.** Independently authorized calls remain subject to server RBAC/RLS, and role verification remains fail-closed.

## Verification

- Focused tests cover the fixed allowlist, exact durations and overlapping numeric start/end offsets, no sensitive payloads, denial/unauthenticated discards, stale session epochs, no request deduplication, and Settings handling when no report exists.
- Disposable Chromium exercises the same timing contract using synthetic context, board and role waits in isolation; the fixture has no signed session or production data.
- Full frontend tests, signed-interface and two-tab browser regressions, IndexedDB isolation, static asset caching, CI, and exact deployed GitHub Pages source checks are release gates.

## Next live evidence

After deployment, perform a **full page reload while signed in**, then use **Account Settings → Measure 5 seconds**. Compare at least three similar runs. New operation names identify which interval dominates:

- `workspace-context`: investigate the authoritative context RPC only after showing it is slow; maintain fresh workspace access verification.
- `board-list`: investigate board-list query/serialization/pagination if repeatedly dominant; no cached permission shortcuts.
- `bootstrap-role`: investigate privileged role-check RPC only if repeatedly dominant; do not remove or defer security gates.
- If individual calls are fast but aggregate phase is slow, measure non-RPC main-thread work/scheduling before changing backend or permissions.

The milestone closes **diagnostic isolation implementation** once tested and deployed. A production startup-speed improvement remains **PENDING** until a bottleneck is measured and a separately verified optimization is deployed.
