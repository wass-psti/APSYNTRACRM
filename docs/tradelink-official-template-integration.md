# TradeLink official document templates — CP-TL-09B

## Source and recovered profiles

The official template reference was recovered from the user's local TradeLink v1.42.0 source and bundled company logo assets. The three original company/template identifiers are preserved:

| `vendorId` | `templateId` | Company |
| --- | --- | --- |
| `watchdog-sales` | `watchdog-sales-reference-v1` | Watchdog Automation Sales & Services |
| `watchdog-opc` | `watchdog-opc-reference-v1` | Watchdog Automation OPC |
| `plc-systems` | `plc-systems-reference-v1` | PLC Systems Technik, Inc. |

The original company names, registered TINs, contact details, logos, accent colors, table colors, rule colors, and terms-page modes are maintained in `frontend/tradelink-official-templates.js`. The three logos are published under `frontend/assets/tradelink/`.

## Persistence and compatibility

The document editor writes only the legacy TradeLink fields already accepted by the existing `private.tl03_validate_draft(jsonb)` contract:

- `vendorId`
- `templateId`
- `terms`

The existing validator bounds text fields at 5,000 characters. The editor enforces that same limit. No new JSON properties, database migrations, RPC changes, role grants, RLS changes, or production-data writes are part of CP-TL-09B.

New documents default to the original v1.42.0 selected company, `watchdog-sales`, and can select any of the three recovered profiles. Existing documents with an established `vendorId` or recognized `templateId` keep that company association during edits. Older records with neither identifier render using the historical default and show a non-blocking warning in the print preview; the renderer does not silently write an assignment to those records.

## Document content and print behavior

All six modules use the saved record's module-specific fields, line items, prices, discounts, VAT treatment, currency, and `terms` text. Original v1.42.0 default terms are prefilled and editable; the saved terms travel with the document revision. The quotation using the Sales & Services template preserves the historical three-page structure: company/client header, commercial details/items/approval, then terms and client acceptance. Other company profiles preserve their original `flow` or `new-page` terms mode.

The approval mark is derived from the signed `workflow_state` and identifies the approved revision. Assigned reviewers are labeled as assignments, not represented as actual approval actors. Browser Print / Save as PDF is a local print copy; it does not create an electronically issued PDF, store a PDF, change workflow state, or record approval.

## Reference asset handling

The three historical sample quotation PDFs were used as local layout references but are not copied into the public repository because they contain real customer names, contact information, and commercial values. The recovered `TradeLink QR Code.png` resolves to a monday.com form, not a document-verification endpoint, so it is intentionally excluded from official output.

## Non-production print acceptance

Synthetic records were rendered through Chromium headless using the actual print CSS and bundled logo assets, then inspected with PDFKit:

| Module | Pages | Result |
| --- | ---: | --- |
| Electronic SI | 2 | PASS — A4, no blank pages |
| Packing List | 2 | PASS — A4, no blank pages |
| Delivery Receipt | 2 | PASS — A4, no blank pages |
| Payment AR | 2 | PASS — A4, no blank pages |
| Quotation (Sales & Services) | 3 | PASS — A4, historical three-page layout |
| PO to Suppliers | 2 | PASS — A4, no blank pages |

All synthetic outputs included the signed-state approval marker and the explicit `PDF NOT ISSUED` distinction. No live customer document was printed or changed during this acceptance.
