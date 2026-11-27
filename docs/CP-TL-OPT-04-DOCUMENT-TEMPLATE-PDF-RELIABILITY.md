# CP-TL-OPT-04 — Document Template and PDF Reliability

## Architecture
- Immutable company-profile versions preserve legal identity, TIN, contact details and content-addressed logo assets.
- Immutable template versions preserve template identity/version, renderer, stylesheet assets and all six module default-term sets.
- One immutable rendering snapshot is bound to every TradeLink document revision.
- Existing document payloads and the existing immutable revision ledger are not modified.
- Historical snapshots are classified as `legacy-derived` or `legacy-defaulted`; reconstructed legal identity is not represented as verified historical data.
- A signed read-only RPC returns the exact rendering snapshot for a requested revision and uses the existing TradeLink document-view capability and workspace scope.
- New revisions capture their rendering snapshot in the same transaction as the existing revision snapshot.

## Version update procedure
Do not update a profile or template version in place. Add a new version row and new content-addressed logo/stylesheet assets. Existing render snapshots continue referencing their original version rows and assets.

## Acceptance
A disposable PostgreSQL 17 harness checks the 63-row backfill (47 legacy-derived and 16 legacy-defaulted), new-revision capture, historical RPC readback and immutability guards. Chromium/PDFKit acceptance covers all six modules across three company profiles (18 PDFs), including page size, document identity, terms, creator, line-item text and multi-page fixtures.

Browser Print / Save as PDF remains the output path. Electronic PDF issuance remains outside this implementation.
