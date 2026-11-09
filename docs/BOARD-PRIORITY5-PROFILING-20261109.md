# APSYNTRA CRM — Priority 5: reproducible performance profiling and first bottleneck elimination

## Scope and measurement boundaries

The original Priority 1–4 changes remain in place. This increment uses **isolated real Chromium** to measure DOM mutations for the existing board-table filtering path and **unauthenticated read-only GitHub Pages** requests to measure public static asset delivery. No production data is read or written; no credentials, authorization state, employee data, documents, tracking, telemetry, persistent background monitoring, or application performance logs are introduced. All tests use invented records and disposable browser profiles.

**This is not full signed production performance certification.** Actual authenticated startup timings, RPC latency, frame-drop distribution, CPU/memory growth over a workday, and FPS still require a separately authorized read-only signed browser measurement. Do not extrapolate synthetic milliseconds to user devices.

## Evidence collected before the fix

- Real Chromium, isolated synthetic **600-row** board, repeated filter query: **1 tbody child-list replacement per identical query**. The original code always called `updateTable(...,{force:true})` even when the normalized filter was unchanged.
- Read-only GitHub Pages, one-request observations from the connected macOS development machine (2026-11-09):

| Public CDN asset | Transferred bytes | Time to first byte | Total time |
| --- | ---: | ---: | ---: |
| `index.html` | 5,222 | 0.330 s | 0.331 s |
| `frontend/app.js` | 372,470 | 0.356 s | 0.409 s |
| `frontend/styles.css` | 128,953 | 0.394 s | 0.423 s |
| `frontend/board-window.js` | 6,694 | 0.344 s | 0.345 s |
| `frontend/board-preferences-idb.js` | 6,899 | 0.335 s | 0.335 s |

The main application entry has **122 static import statements**. These timings include network variability and are not a browser's complete module waterfall. A single sample must not be treated as representative latency, nor as an SLA or 120 FPS measurement.

## Corrective implementation

`frontend/board-window.js` now normalizes search data once when a signed, fully loaded group model is constructed. It records the last normalized filter for each group, and does **not** replace DOM or recalculate results for identical filters. New filters still process all loaded authorized records and update the DOM, including empty states; existing server pagination for incomplete datasets remains untouched. No data persists across re-renders, accounts, workspaces, or reloads.

After the fix, real Chromium on the same 600-row fixture found **0 tbody replacements** on identical query and **1** on changed query. Thus it removes **100% of unnecessary DOM replacements for identical filter calls in this fixture**, not 100% of render work or network cost. Existing source-level unit tests and two-tab/virtualization regression coverage remain in CI.

## Remaining objective gates

- Signed production-navigation, auth/session initialization and RPC network timings: **PENDING**.
- Repeatable P50/P95 input latency and frame-time histograms on a representative large signed board: **PENDING**; 120 FPS implies ~8.33 ms per frame but is not established.
- Long-lived memory, GPU resource usage and event-handler retention under realistic sessions: **PENDING**.
- CDN asset loading beyond a single representative read-only sample: **PENDING**. Separate assessment of CSS/module splitting is warranted, but no broad refactor is authorized by these timings alone.

Closure for this **measured first correction** requires passing frontend tests, Chromium regressions, CI, deployment integrity checks and a precise record of remaining signed-performance acceptance. The broader Priority 5 goal must remain open if signed-production metrics have not been collected.
