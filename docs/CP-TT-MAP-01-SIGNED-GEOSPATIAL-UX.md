# CP-TT-MAP-01 — Signed geographic attendance maps

## Implementation
Both the TimeTracker Attendance Log's expanded audit details and TimeTracker's dedicated GPS tab use the same opt-in mapping engine in frontend/time-tracker-map.js. The engine loads MapLibre GL JS 6.16.0 on demand from a version-pinned ESM endpoint, then fetches public OpenFreeMap vector styles only after an authorized user clicks **Enable street map**. OpenFreeMap uses OpenStreetMap-derived data. No API key, payment, background tracking, or database migration is required.

The initial TimeTracker access/loading path does NOT download the library or request map tiles. For better latency, the signed native TimeTracker read overlaps the independent OT and Clock capability reads after the existing signed board/role authorization gate. Existing authorization and final identity rechecks remain intact.

## Security and privacy boundary
- The signed privileged timetracker_gps_snapshot RPC remains the *only* source of precise attendance locations. The default attendance module-state response does not include raw coordinates.
- Only bootstrap administrators and authorized TimeTracker Supervisors receive the GPS map tab and GPS overlays; the client checks actor, workspace, board, record owner, and evidence date-window matches before plotting. Backend authorization remains authoritative.
- Ordinary signed users do not receive map data or map-enable controls. Public tiles are fetched only after an explicit opt-in per signed session/board; opt-in is not stored across logins. The mapping provider may infer the approximate area shown and receive ordinary request metadata. GeoJSON features and employee names are not sent to the tile server; they are held in the browser.
- MapLibre source uses exact version-pinned URLs; CSP permits unpkg.com only for map library CSS/ESM and tiles.openfreemap.org only for basemap resources. Existing block on inline scripts, inline style attributes, frames, forms and privileged keys remains.
- Native map popups are built with setText, not untrusted HTML. Map markers are created only from validated coordinates. The connecting dashed line compares two recorded fixes geographically; it is NOT a tracked route or proof of travel.
- Satellite imagery is not supplied by OpenFreeMap and is not enabled. Streets/light/dark map styles are the supported free public basemap options. Provider availability is best-effort, not a production SLA.
- The mapping engine disposes GPU/WebGL resources on app rerender, hides inactive audit maps, and lazy-loads maps when the disclosure expands. When the map cannot load, signed records and coordinate links remain available.

## Verification criteria
1. Bootstrap or Supervisor: expand an Attendance Log record containing two signed fixes. Choose **Enable street map**. Expect a basemap with green Clock In and orange Clock Out dots and a dashed straight-line connector. Popups are text-only, and map attribution is visible.
2. Collapse and expand the audit. Verify the section's normal behavior and the map is initialized only while visible.
3. GPS tab: load an authorized date range, click **Enable street map**, and inspect recorded event markers, navigation/zoom, fullscreen, scale, and dark style. Date and member filters remain effective.
4. Ordinary member or revoked/expired session: no privileged GPS maps, no coordinates, no tile requests triggered by attendance UI.
5. Verify browser CSP console: only the exact approved MapLibre/OpenFreeMap domains should be contacted when the map is explicitly enabled. No service-role credentials or coordinate-bearing API calls to the tile provider.
6. Verify 2D map behavior on macOS WebGL2; map fallback text should appear when unavailable. Test smaller screens, keyboard controls, and reduced-motion preferences.
7. CI must pass frontend tests, disposable PostgreSQL authorization tests, and deployed Pages source verification. These automated checks do not replace real signed-user interaction evidence.

## Follow-up
For stronger workforce-location privacy, self-host a regional PMTiles vector archive under infrastructure you control; this removes third-party basemap tile requests. Public OpenFreeMap is suitable for approved opt-in browsing but should not be treated as a private employee-data service. Source is deployed through GitHub Pages only, with no standalone TimeTracker host.
