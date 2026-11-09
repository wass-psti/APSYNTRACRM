# Priority 1 — two-tab cache acceptance and performance evidence

## Executed browser acceptance (synthetic only)

`node scripts/board-cache-two-tab-browser.mjs` starts a temporary loopback-only HTTP fixture and a fresh, ephemeral headless Chromium profile. It uses **two actual same-origin browser tabs** and the application's real `DomainApi` and `BoardCacheChannel` modules. It does **not** connect to Supabase, reuse the user's signed session, transmit real credentials, touch production board data, or install a persistent agent. The temporary browser profile is discarded after the test.

The fixture checks:

- Five direct board reads cause five server reads. Five immediate cached navigations cause **one** board read; all five individually request server view permission.
- A signed synthetic mutation in tab A causes tab B's actual browser `BroadcastChannel` listener to invalidate its cache and re-fetch the changed board from the shared loopback server.
- An exact synthetic foreign workspace is denied, and explicitly revoked synthetic view permission cannot be overridden by a previously cached board.
- The foreign-workspace tab receives no same-workspace change event; no approval/permission data or board document body is broadcast.
- The browser's real CSP-free fixture, JS module loading, two tabs and event loop are exercised rather than only a mocked channel.

The reported **80% reduction** is for this 5-vs-1 synthetic request-count comparison only. It is **not** a measured reduction in production traffic, latency or Supabase charges. It is a deterministic functional benchmark, not a CPU or end-user performance measurement.

## Live signed HTTPS acceptance — PENDING

A live authenticated two-tab CRM acceptance requires permitted signed account/browser access. The ChatGPT browser connector was inaccessible from the current chat context, so the live session and production UI were **not** driven or inspected. Before classifying live behavior VERIFIED, use two legitimate signed APSYNTRA CRM browser tabs and an approved disposable/nonproduction board:

1. Verify both tabs refer to the same signed user and workspace. Record browser Network-filtered `wm_get_board` and `work_board_access` counts for the same board across five navigations. Do not include unrelated RPCs in the comparison.
2. Make one authorized reversible change to the disposable board in tab A; verify tab B receives the updated value after an authoritative signed read without a full page reload.
3. Independently verify Board view/access revocation, workspace changes and user logout do not display stale protected records; do not modify live roles/permissions without the separately required authorization.
4. Exercise idle cache expiry, stale optimistic revisions, failed network reads and concurrent edits; record actual end-to-end timings and RPC counts with the browser's Network/Performance panels.
5. Verify no board contents, token, personal data, or permission decisions are sent in BroadcastChannel events, and that server RBAC/RLS remains mandatory for each write.

Keep live signed acceptance PENDING until evidence exists. Unit tests and synthetic Chromium tests do not certify production runtime behavior.
