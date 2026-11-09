# APSYNTRA CRM — Priority 5F: JavaScript Module Loading and Application Entry

## Grounded starting point

The user's latest signed Priority 5E report measured **2542.6 ms from browser navigation to JavaScript application entry**, followed by **1197.3 ms signed startup** (454 ms session restoration, 738.3 ms workspace authorization and 5 ms route). Navigation-to-entry includes HTML, styles, the static dependency tree, network, parsing, execution, and scheduling; it is **not** equivalent to JavaScript download time or a server/backend timing. A single user run cannot prove which subcomponent accounts for the 2542.6 ms.

Repository inspection identified a large eagerly fetched ES-module graph in `frontend/app.js`. FuelTrans's standalone feature, interactive board-import wizard/Excel parser and the privileged twelve-board QA tool were all statically imported during every startup, including unauthenticated login and unrelated boards. None is required for authentication, context authorization, ordinary navigation, or initial application rendering.

## Minimal implementation

- Keep `index.html`, `frontend/startup-guard.js`, CSP and `frontend/app.js` as the same browser startup entry. No new bundler or dependency and no auth or RBAC/RLS alteration.
- `frontend/fueltrans-lazy.js` keeps the synchronous `syncFuelTrans({container:null})` teardown contract and imports `fueltrans-native.js` only when the user visits its signed board feature. One in-flight import is coalesced. Generation/connection guards prevent a stale route or workspace from mounting after an async import. After loading, the original FuelTrans renderer and session/DB checks are used without modification. Import failure shows a sanitized error, not private code paths or access details.
- `board-import-ui.js` is dynamically loaded only after the original editor gate and a second state/access gate after import. The authoritative import RPC validations and board access remain unchanged.
- The destructive nonproduction twelve-board QA helper is dynamically loaded only after the existing admin gate and typed `RUN 12 BOARD CHECKS` acknowledgment. All existing server checks, safeguards and auditing remain in force.
- Public Pages exact-source smoke includes the new lazy module, and CI tests the module graph, feature mount/teardown races, denied/broken loads and actual Chromium startup. No local storage, background agent, telemetry, private data capture or production write fixture is involved.

## Reproducible local evidence

The deterministic static import graph compares equivalent source with legacy static imports to optimized source. **167 modules / 1,779,110 source bytes** becomes **133 modules / 1,505,180 source bytes**, deferring **34 modules / 273,930 bytes** from static startup. This is source/module-tree work removed, not a transferred-byte or production speed measurement.

In a disposable **anonymous loopback Chromium** profile with cache disabled, the source-equivalent baseline fetched **169 JavaScript resources / ~1.83 MB decoded** and optimized startup fetched **135 resources / ~1.56 MB decoded**. Both reached `UNAUTHENTICATED` and displayed the login form. An initial local load-event comparison was approximately 172 ms vs 62 ms, but is **not** a production speed claim: it excludes remote latency, real signed backend traffic, caching and user browser conditions. The only reliable browser-gate expectation is fewer JavaScript requests and unchanged startup outcome, not a timing threshold.

## Acceptance boundary and next evidence

Passing the tested module-tree, feature integration and authorized UI gate regressions can close this **specific 5F module delivery improvement**. It does not verify user-signed page-load reduction or the 120 FPS target. After deployment, compare at least three signed full reloads under comparable network/cache conditions. If navigation-to-entry remains high, the next solid implementation is **Priority 5G — Navigation-to-Entry Resource Waterfall and Remaining Critical Dependency Analysis**, inspecting CSS/main module transfer, cache and long-tail modules without deferring signed authorization or risking functionality.
