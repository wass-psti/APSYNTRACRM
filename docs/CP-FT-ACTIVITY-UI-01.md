# CP-FT-ACTIVITY-UI-01 — FuelTrack+ Activity Command Center

## Objective
Redesign FuelTrack+ > Activity as a clearer operational audit workspace while preserving the existing signed audit stream, filters, event details, refresh and CSV export.

## Delivered
- Activity Center header with audit export and refresh actions.
- Today’s Pulse metric cards.
- Searchable, status-filtered event timeline with actor identity, event type, summary, timestamp and expandable audit details.
- Dedicated 24-hour activity insight panel.
- Explicit audit-source integrity and loaded-page scope disclosure.
- Responsive tablet/mobile layouts, dark appearance, keyboard focus and reduced-motion support.

## Styling integration
- Activity styles are scoped to FuelTrack+ and integrated into the existing `fueltrack-v3-application.css` source.
- The shared stylesheet manifest and established global cascade order remain unchanged.
- The deterministic bundle contains the Activity rules once, with no standalone duplicate stylesheet.

## Preserved
- Existing signed module audit read and native FuelTrack scope.
- Manila-time grouping and event categorization.
- Existing filter state, delegated action names, event IDs, expansion, refresh and CSV export.
- HTML escaping and spreadsheet formula-injection protection.
- Existing role, permission, RLS, RPC, database and business workflow contracts.
- No production data writes, migrations, new dependencies or model-training code.

## Acceptance
- Focused Activity model/render/export tests pass.
- Search and filters preserve event identities and loaded-page scope.
- Expanded details expose actor, type, message, request reference, timestamp and event ID.
- CSS bundle is generated from the ordered style manifest.
- Production build and repository CI pass.
- Desktop, tablet, mobile, light and dark layouts remain readable and keyboard-operable.

## Known data boundary
The Activity RPC requests a bounded event page (limit: 200). The client validates a maximum of 250 rows. Totals, hourly summaries, filters and CSV export are scoped to the returned page; older audit events may exist. No complete-history claim is made.
