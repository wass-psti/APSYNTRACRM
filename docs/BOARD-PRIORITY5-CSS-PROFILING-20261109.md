# Priority 5 — Public CSS-delivery bottleneck and bounded remediation

## Evidence — 2026-11-09

1. **Production-public, signed-out network sample:** `index.html` requests 41 same-origin stylesheets totaling approximately 800 KiB uncompressed. Concurrent fetches observed individual public responses of about 0.5 s in the remote review machine. Per-response durations overlap and must **not** be summed to infer page-load time.
2. **Isolated real Chromium baseline and change:** The same static CSS cascade was served with 41 links versus one combined link from a loopback fixture. Three cold, browser-cache-disabled trials gave baseline local `loadEventEnd` of **35, 20, 25 ms** versus bundle **10, 15, 11 ms**; request counts **41 versus 1**. The local fixture and its timing distribution do not establish the network or signed-workspace improvement in production.
3. **Presentation correctness:** Representative synthetic DOM compared 28 elements across desktop/board/overview/settings/sidebar/TradeLink-related CSS classes; the chosen computed-style properties matched exactly across the three trials. Exact byte concatenation in the original order provides stronger cascade preservation without selector edits. This does not replace signed-user visual regression or an exhaustive screenshot comparison of every application view.

## Implementation and rollback

- 41 original CSS files are retained as editable first-party sources. `scripts/priority5-style-manifest.mjs` declares their original cascade order; `node scripts/build-priority5-styles.mjs` emits the deterministic `frontend/apsyntra-styles.bundle.css` without minification, imports, URL rewrites, dependencies or changes to selector definitions. All CSS sources have been checked to contain no `@import`, `@charset` or `url(...)` paths requiring separate resolution. `index.html` loads **only the bundle** and maintains a provenance comment listing sources in the original order for source-level audits.
- CI `node scripts/build-priority5-styles.mjs --check` fails whenever a source CSS edit is not regenerated and committed. An isolated Chromium CI job verifies actual stylesheet request count and representative computed-style equivalence. The same CSP, same-origin hosting and the Priority 3 network-first static worker remain intact. The bundled file is below the existing 2 MiB service-worker per-entry size limit.
- The deployment smoke test verifies the exact SHA-256 of the deployed bundle. To roll back, restore the original 41 `<link>` references from the manifest and remove the bundle link; leave original CSS source files unchanged. The network-first service worker will fetch current HTML/CSS rather than pin removed assets.

## Scope boundaries

This change optimizes the **unauthenticated public resource delivery path**, not Supabase RPC latency, account/session authorization, server pagination, WebGL frame rate, or signed-user board rendering. Production-navigation timing, long tasks, memory growth and 120 FPS acceptance **remain pending** until signed-user browser measurements are available. No production data, role configuration, authorization decisions, token handling or persistent telemetry were modified.
