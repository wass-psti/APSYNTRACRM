# CP-MS-CRM-03 — Native frontend integration

This increment adapts the recovered reference frontend hierarchy (header, seven metric cards, rate bar, tabs and full 24-column order) to CRM's existing browser-native ESM list route. It is not a pixel-identical React port and does not replace the existing signed Add Material or Details/Tasks/Activity handlers. The original 56-file source snapshot remains unchanged.

- Current route: #/boards/617c4c0f-e343-4b3b-8456-50d47dcbaf99/sourcing; board shell, navigation, session and workspace are reused.
- Projection uses CP-MS-CRM-02 reconciliation and existing board filters. Explicit scope, real item UUIDs, Main group, zero vs missing fields, partial pages; no demo/local API fallback.
- Public sorting applies to currently displayed records and resets on a rerender. Existing public CSV remains public-only. Commercial cells are populated by explicit, one-item signed read using readProtectedSourcingItem, no N+1 automatic reads or persistent cache. Late responses are discarded on route or identity change; a failed reload clears old values.
- The old manually stored selling value is clearly labeled stored, not calculated; rate snapshot, derived costs and aggregate financial totals remain unavailable until authoritative backend integration. Existing per-material rates can be loaded. Bulk import is visibly pending rather than simulated. XLSX/PDF, bulk, persistent preferences and full 5,000-row virtualization are not yet integrated into this route.
- CSS scope is .ms-native-sourcing; uses CRM theme attribute without changing global theme. No local setup, new permissions, schema migration, data import, credentials or training.
- Tests use synthetic UUID fixtures and a disposable Chromium static server with the real native module and signed-reader logic, fake session/API responses. This does not certify actual signed production runtime or pixel parity; manual signed verification and backend integration remain required.

The native stylesheet is loaded once on entry to the signed sourcing route, matching CRM's existing lazy native style pattern. The startup HTML retains the single deterministic shared stylesheet and its existing source-order contract. Full CRM frontend regression runs in the dedicated CI workflow.
