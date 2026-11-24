# CP-OI-NATIVE-02B — Legacy source discovery and dry run

## Source evidence (2026-11-24)

The supplied Order Intake reconstruction blueprint identifies Monday board 3670228015, APSGroup of Companies, and fiscal groups FY 2026, FY 2025, FY 2024, FY 2023, Hold. Opened https://wa-psti.monday.com/boards/3670228015 in the existing Chromium session; browser title and heading confirmed Order Intake and the original Order Traceability view. The tab ceased to be available before a complete main-table export was acquired. The currently visible Monday tab was TimeTracker, not Order Intake. Scoped local filenames and project/Library searches did not identify an authoritative complete Order Intake export. The 100-order legacy seed generator in WatchdogWorkspace apps/order-intake/src/data/seedOrders.js has 17 predefined entries and generates the remainder; client and delivery data are placeholders or calculated. It is not a migration source. The blueprint and screenshots establish source identity and functional requirements, not the complete record population.

CP-OI-NATIVE-02A previously verified zero active domain orders, one archived order, and zero board items. This checkpoint did not re-query the live database; obtain a fresh complete destination identity snapshot before real dry run. No production writes.

## Mapping

| Source | Canonical |
|---|---|
| item.id | sourceItemId (lineage in review report) |
| item.name | poNumber (text, preserve leading zeroes) |
| group.title | sourceGroup; compare FY to dateReceived |
| item.state | archived |
| client_po_amount | poAmount |
| delivery_to_client | status |
| dropdown | company |
| sales_representative | accountManager |
| numeric_mkkavwa7 | procurementExpenses |
| formula_mkkazns6 | grossProfit (compare to calculated) |
| industry_type | industry |
| client_po_date_received | dateReceived |
| date_required_by_client | deliveryDate |

Client name, PO date, currency, VAT rate and other undocumented fields require explicit source evidence; do not default them from screenshots or the current RPC. Confirm source column IDs and text formats against the actual export. The original app supports additional currencies beyond PHP/USD/EUR; report unsupported values, do not silently convert. Preserve actual status; "Please select" is not a supported target state. Hold groups and archived rows require a history/mapping plan. Attachments (files_mkkagefc, client_po_file), activity and confirmation metadata are outside the order-row dry run and must be inventoried before migration closure. Existing board is not a substitute for domain data.

## Running the dry run

From repository root:
```sh
node scripts/order-intake-import/dry-run.mjs /path/to/source.json /path/to/destination.json
```

The input is a reviewable JSON envelope, not a direct CSV/XLSX parser. Preserve the original export separately and transform it explicitly after inspecting the actual headers/column IDs. A Monday envelope contains kind="monday-export", boardId="3670228015", reference (export identifier), exportedAt (ISO date-time), expectedCount (independently checked item count), and rows: [{item:{id,name,state,group:{title},column_values:[{id,text}]},supplemental:{clientName,poDate,currency,vatRate,...}}]. Decimal values must be exact plain decimal strings; dates YYYY-MM-DD. A normalized legacy-backup envelope uses kind="legacy-backup" and rows with canonical fields plus sourceItemId/sourceGroup/archived. Use kind="fixture" for synthetic data. Do not relabel generated seeds. Supplementary data must be traceable to the original source; the engine cannot prove provenance from a declared envelope alone.

Destination envelope: {workspaceId:"00000000-0000-4000-8000-000000000001",complete:true,expectedCount:<independent count>,rows:[{workspace_id,po_number,archived}]} including ALL active and archived order identities. Keep actual exports and reports outside git. Never supply an invented empty target snapshot.

The CLI reads two local files and emits JSON on stdout; it has no network client, credential handling or write path. It emits SHA-256 checksums of both inputs, row counts, source and candidate per-currency totals, row exceptions and warnings. Source totals cover rows with a valid amount and identifiable currency, including held rows; financialCount identifies the subset with calculable financial values. Computed profit is not an independently verified historical value. Missing derived source values are warnings. REVIEW_REQUIRED is not proof of authority, completeness, or permission to import; FIXTURE_ONLY is never import evidence.

## Tests and limits

- 10 new dry-run tests; 25/25 combined focused tests pass.
- 100 synthetic rows: 96 candidates, four held (missing client, unsupported currency, missing delivery date, profit mismatch); all rows accounted for. Synthetic archive and duplicate collision tests pass.
- Full branch regression 3612/3612 passes; new scripts syntax checks pass.
- No production files/data, authorization, schema, dependencies, training or inference paths changed.
- origin/main advanced to 0c2b47c9 during work; no upstream merge was performed. Reconcile upstream before eventual integration/deployment.

## Disposition

Source identity VERIFIED; dry-run implementation VERIFIED on fixtures; genuine full export, inventory and financial reconciliation BLOCKED. Complete real-data dry run after obtaining the authorized board export or connecting Monday.com. Resolve source-field, fiscal, currency and historical exceptions without fabricating values. Fresh complete destination snapshot and reviewed import manifest required before separately authorized production writes. Next checkpoint CP-OI-NATIVE-02C — Authoritative Export Acquisition and Real-Data Dry-Run Closure. No deployment or import performed.
