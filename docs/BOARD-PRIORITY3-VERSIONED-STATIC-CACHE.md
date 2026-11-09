# Priority 3 — Versioned public static-asset cache

## Boundaries

APSYNTRA CRM registers `service-worker.js` only on the canonical `https://wass-psti.github.io/APSYNTRACRM/` HTTPS deployment. Its scope is `/APSYNTRACRM/`, with `updateViaCache: 'none'`. Registration and update failures do not block startup, authentication, or signed API requests. No registration is attempted on the canonical local Vite testing host.

The worker intercepts **only** same-origin, query-free GET requests for JavaScript and CSS under `/APSYNTRACRM/frontend/` and the exact public logo file. It excludes private/document/test/fixture paths, requests with Authorization/Cookie/Range headers, navigation and HTML, signed Supabase Auth/PostgREST/Storage calls, any other origin, approval documents, JSON, PDFs, images other than the public logo, opaque/redirected/error responses, private/no-store responses, responses with Set-Cookie or Content-Disposition, and mismatched MIME types. Assets larger than 2 MiB are not retained; at most 96 responses are retained. Cache API storage contains **public executable frontend assets only**; no user data or general API response is persisted.

The versioned cache name `apsyntra-crm-public-static-v1-20261109` isolates this policy generation. During activation, only obsolete caches under the `apsyntra-crm-public-static-` namespace are deleted; unrelated application caches are preserved. On future worker-policy changes, increment the version. On every asset request, **network-first** delivery returns the current deployment response and refreshes the cache when eligible, rather than serving a potentially stale JavaScript bundle. Cache fallback is used only when the network request fails. There is deliberately **no offline navigation shell**: authentication and board data must never be represented as valid while offline.

## Deployment and rollback

The service worker itself is a same-origin, versioned file served by Pages. A new worker can activate and delete prior namespaced caches. `registration.update()` runs on visits without a persistent timer. If the worker is rolled back, network-first requests still obtain current assets, and old-version caches are cleared by the activated worker. A rollback to a commit **without a worker** requires a separate unregistration/retirement release; merely removing registration code does not uninstall a previously active worker. Do not change caching to cache-first for JavaScript without independent versioned filenames or an immutable content-addressed asset manifest.

The cache name is versioned by **worker policy**, not automatically by each commit. This is safe for normal online upgrades because of network-first fetches, but mixed offline bundles are not a supported deployment state. Browser HTTP cache headers and service worker updates remain subject to hosting/browser behavior. If a future build introduces immutable hashed assets, per-deployment precache versioning can be considered separately.

## Verification

- `node --test frontend/tests/static-cache-service-worker.test.mjs` tests registration scope, rejected request types, network-first freshness, offline fallback, excluded private responses, versioned cleanup and no install prefetch.
- `node scripts/static-cache-browser.mjs` launches temporary-profile Chromium against a synthetic local HTTP server, registers a genuine service worker, confirms Cache API contents, observes version 1→2 network refresh, confirms offline fallback only for public scripts, and denies private API fallback. No live credentials or production requests.
- Full frontend regression and GitHub CI must pass independently before merge. Production Pages deployment and exact asset integrity must be verified after merge.
