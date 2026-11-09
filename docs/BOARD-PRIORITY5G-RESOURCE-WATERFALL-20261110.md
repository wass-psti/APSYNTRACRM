# Priority 5G — Navigation-to-Entry Resource Waterfall and Critical Dependency Analysis

## Input evidence and limits

The user previously reported signed navigation-to-JavaScript entry at **2,542.6 ms**, and signed startup after entry at **1,197.3 ms** (454 ms authentication restore, 738.3 ms workspace authorization, 5 ms authorized route). These distinct intervals include browser parsing, network and scheduling. No production module waterfall or causal URL-by-URL trace was provided. Priority 5F already reduced anonymous Chromium startup requests from 169 to 135 and decoded JavaScript by ~274 KB; that synthetic benchmark does **not** establish how much of the 2,542.6 ms signed interval was module waiting.

## What was implemented

- A pure, bounded `summarizeEntryWaterfall()` helper reads **existing browser Resource Timing entries only when the user clicks the already-established on-demand five-second profiler**. It makes no new requests and creates no background observer, storage, network recording or telemetry.
- It accepts the fixed numeric `performance.now()` application-entry timestamp from the existing signed startup report and selects only same-origin, public `frontend/` resources whose requests **completed before entry**. An explicit maximum of 300 entries protects bounded work. The report includes only **counts, total decoded bytes (when available), latest start and latest response-end timestamps** for JavaScript, stylesheet and other static resources, plus a numerical time interval from the last qualifying resource response until app entry. It does not expose resource names, raw URLs, queries, request/response data, tokens, RPCs, app records, or account/workspace identities.
- The new on-demand Settings summary clearly notes that **the residual interval is not a measured parse/execute or scheduler duration**. Browser Resource Timing omits CPU parse/evaluation and sometimes reports zero bytes or lacks all entries; the classification is evidence of *what was completed*, not a causal critical path trace. Existing trusted-auth and workspace checks are unchanged. No speculative new eager `modulepreload`, CSS duplication, server change, SDK rewrite or additional cache was introduced.

## Reproducible verification

- New pure unit tests cover real-looking first-party JS/CSS timings, overlapping resources, strict origin/public asset exclusion, late requests, invalid clocks, bounded 300-entry sampling, zero-byte browser limitations and URLs/secret non-disclosure.
- Isolated Chromium fixture tests numeric-only classification using synthetic public and private-like resource names, while preserving the existing Priority 5C/5E frame, signed-read and Long Tasks acceptance.
- The full frontend suite, static module graph, two-tab/revocation, browser stylesheet menu layering, selective IndexedDB and service-worker privacy tests are preserved as regression gates. The Pages source-integrity pipeline verifies the deployed exact merged JavaScript.

## Measured outcome and next decision

This changes diagnostic accuracy, **not** the JavaScript download path. It does not claim faster production navigation or an achieved 120 FPS objective. The narrow 5G implementation is complete only after tests/CI/deployment verification. Have the user perform a fresh signed reload and click **Measure 5 seconds** in the same tab, ideally on three comparable occasions. If the last JS/CSS response ends close to app entry, investigate the actual static critical resources, transfer/priority/cache and scheduling under reproducible conditions. If the residual is consistently large, follow **Priority 5H — Post-Resource JavaScript Parse/Evaluation and Main-Thread Entry Attribution** using disposable Chrome tracing or sampled startup markers; avoid adding permanent performance observers or private resource logging to production. Preserve signed authorization boundaries in either case.
