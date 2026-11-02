# CP-TT-LEAFLET-01 — TimeTracker mapping engine migration

## Scope
Replace the shared TimeTracker map renderer with Leaflet 1.9.4 and standard OpenStreetMap raster tiles. The same module renders restricted Attendance Log audit maps, GPS/Location Hub map, geofence comparison and attendance-event trail. The legacy MapLibre 6 and OpenFreeMap JavaScript, CSS, worker, font and tile configuration are removed from live frontend code and CSP.

## Architecture and privacy
- All GPS positions still come **only** from `timetracker_gps_snapshot` through the signed client. The existing bootstrap administrator / assigned TimeTracker Supervisor guards and workspace identity checks are unchanged.
- `signedMapPoints` continues to filter Log fixes by user, record and date window. Hub overlays use approved signed snapshot events only. Marker popups use `textContent` (no unsafe HTML).
- Leaflet is loaded on demand from a pinned URL with the Leaflet project's SHA-256 Subresource Integrity attributes. It is never imported during login or TimeTracker clock initialization when a GPS map is not visible.
- The default Street map is automatically shown when an authorized user enters a map view with recorded fixes. The Dark option uses a CSS-only inversion of those same raster tiles without another tile service. Satellite remains unavailable without an approved provider. Zoom, pan, metric scale, fullscreen, record-paired straight-line connector, accuracy popup, error banner and tile-only retry are preserved.
- Precise marker coordinates are processed only in the browser. **Any external basemap provider can infer the approximate map viewport and receive connection metadata from tile requests**. No employee identifier, attendance payload, Supabase token or GeoJSON is appended to tile URLs.
- Unrelated authentication, authorization, RPC, PostgreSQL data, attendance transactions and other boards are unchanged.

## Provider compliance and limitations
The OpenStreetMap Foundation's standard service at `https://tile.openstreetmap.org/{z}/{x}/{y}.png` is community-funded and best effort, **not an SLA-backed production tile CDN**. Use it only for modest, interactive map viewing, with visible © OpenStreetMap contributors attribution and proper Referer; preserve browser HTTP caching, do not prefetch/bulk-download/offline-cache tiles, or send no-cache headers. The existing `strict-origin-when-cross-origin` referrer policy sends the site origin on cross-origin requests. Tile errors show the signed markers over a neutral background with a controlled retry. If APSYNTRA expands to sustained operational/enterprise map usage, switch to a separately approved commercial/self-hosted tile provider; no unapproved payment or keys are introduced.

Provider policy: https://operations.osmfoundation.org/policies/tiles/
Leaflet stable API: https://leafletjs.com/reference.html

## Tests and acceptance
Automated: validate HTML/CSP host allowlist, pinned Leaflet/SRI references, map/owner/date scopes, marker/line rendering wiring, no MapLibre requests, lifecycle disposal, accessibility fallback, and regression suite. Live Pages smoke checks assets under existing origin.

Manual signed-browser acceptance (not implied by CI): under bootstrap or authorized Supervisor login, expand a Log audit with recorded fixes and verify markers, street tiles, Dark style, panning, zoom, fullscreen, tile failure fallback/retry and panel stability. Open GPS tab with a date range containing signed fixes and confirm same engine and marker accuracy; an empty range must show a genuine empty state, not a fabricated position. With ordinary/denied roles and stale/revoked sessions, verify no precise GPS leaks and no tile-triggered locations. Check actual network status/console for CDN/tile blocking and performance with a real browser. Do not use production employee attendance mutations as tests.
