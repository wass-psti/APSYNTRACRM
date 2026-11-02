# CP-TT-MAP-02 — Default signed street map and resilient recorded GPS

## Scope and evidence

The Attendance Log and GPS tab use the existing `timetracker_gps_snapshot` RPC. The user's browser evidence shows recorded coordinates load correctly, while the OpenFreeMap layer sometimes remains a loading/error label with MapLibre controls visible. The source registers GPS overlay layers only on the full `load` event, and a remote resource error keeps an opaque loading overlay over the map. This explains the visible failure mode. Which external request failed (style/tile/glyph, HTTP status, browser policy, provider outage) cannot be established without live browser network/console evidence.

## Changes

- Street map initializes automatically on authorized map views, including navigation back and refresh. An authorized browser session is required; bootstrap or TimeTracker Supervisor status remains mandatory, and signed GPS snapshots must match actor, workspace and board.
- Map style defaults to Street, with Dark selectable. Preference lives only in the current runtime session and resets on fresh application state, not in localStorage or production records.
- GPS layers are created on MapLibre `style.load`, not `load` after all remote resources finish. MapLibre errors before overlays are ready activate a local interactive coordinate-only style, retaining signed markers and straight-line comparison rather than masking the canvas indefinitely. Fallback is explicitly labeled; it is not a real street basemap and must not be advertised as satellite imagery. A direct retry reattempts the remote style without collapsing or rerendering the audit section.
- Style changes update live map instances instead of rebuilding the entire app. Library loading remains lazy until an authorized map has valid fixes; MapLibre and map tiles never load on the Clock access-screen initialization.
- Recent signed GPS snapshots are reused in memory for up to 15 seconds if actor, workspace, board, range and record match. In-flight duplicate requests remain suppressed, explicit Refresh bypasses cache, and no persisted coordinate cache is created. The server still enforces signed-session and role authorization on every actual RPC.
- No production attendance, audit or GPS table was changed.

## Privacy

Automatic OpenFreeMap basemap requests may disclose the approximate viewed geographic area and ordinary connection metadata to the map provider. This behavior was specifically requested. The client still does not transmit employee names, IDs, raw GeoJSON marker payloads or authentication tokens to OpenFreeMap. The signed precision and authorization gates remain authoritative at Supabase; the frontend is only defense-in-depth.

For stronger privacy, serve regional PMTiles from APSYNTRA-controlled infrastructure instead of a public tile provider.

## Verification and limitations

Run frontend, type/build checks, disposable PostgreSQL security and Pages checks. Test a genuine authorized bootstrap and Supervisor signed session in a browser: open the Log expanded audit, observe automatic map, verify markers, toggle Dark/Street, retry on unavailable external tiles, and confirm the panel remains expanded. Repeat with a denied account to ensure no coordinate leakage. Confirm the GPS tab opens with Street by default. Review the browser's Network and Console to determine any remaining provider-specific error. Compare measured cold/warm GPS latencies using representative conditions, distinguishing local cached display from end-to-end RPC.

Performance targets (<100 ms cached, <500 ms uncached where possible) are goals, not demonstrated SLAs. CI passing is not proof of real WebGL basemap availability. A fallback map shows geographic positions but does not substitute for street tiles when the provider is inaccessible.
