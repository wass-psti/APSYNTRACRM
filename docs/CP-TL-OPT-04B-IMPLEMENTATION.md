# CP-TL-OPT-04B — Immutable Document Render Snapshots

## Delivered scope

- Corrected the PostgreSQL semantic-version check to accept the seeded `v1.42.0` version.
- Company profile versions and template versions are paired by the same `profile_version`; a mismatched pair cannot be selected.
- Published six versioned company logos and two versioned TradeLink stylesheets. The files are byte-for-byte copies of their existing sources and are addressed by Git blob hashes.
- Added immutable render snapshots keyed by `document_id` and `revision`.
- Added the signed `tl04_document_render_snapshot` read RPC for exact-revision retrieval.
- Added automatic render-snapshot capture after a document insert or revision change, after the corresponding immutable document revision snapshot exists.
- Connected the existing All Documents Print / Save as PDF action to the exact revision render snapshot.
- The renderer now uses the saved company identity, logo assets, template version, versioned stylesheets, and saved terms. It does not silently substitute current company or template settings when the selected revision has no render snapshot.
- The print preview waits for its versioned stylesheets before invoking browser print and removes those links when the preview closes.

## Production database verification

Migration `20261127120000` is applied.

| Check | Verified result |
|---|---:|
| Historical revision rows | 63 |
| Render snapshots | 63 |
| Legacy-derived snapshots | 47 |
| Legacy-defaulted snapshots | 16 |
| Missing render snapshots | 0 |
| Company/template profile-version mismatches | 0 |
| Correct semantic-version constraint | Present |
| Automatic render-capture trigger | Enabled |
| Signed snapshot RPC | Present |
| Authenticated RPC execute | Granted |
| Anonymous RPC execute | Not granted |

The automatic capture trigger is attached to `public.tradelink_documents` for inserts and revision changes. The existing revision-capture triggers execute first, so the render snapshot is created from the matching immutable revision content.

## Automated acceptance

- Disposable PostgreSQL 17 acceptance covers the 63-row historical backfill, legacy classification, exact historical terms, new revision 1 and revision 2 captures, signed RPC readback, profile/template version pairing, invalid semantic versions, and immutable snapshot guards.
- Asset acceptance verifies all eight published assets against their source Git blob hashes and checks the referenced paths in the migration.
- Node tests cover snapshot schema validation, revision identity, profile/template pairing, asset path and hash validation, exact terms, signed RPC arguments, and print-flow integration.
- The production frontend build is included in the render-matrix workflow.
- Chromium generates PDFs for all six TradeLink modules across all three company profiles (18 combinations).
- macOS PDFKit verifies the resulting PDFs, including page dimensions, company identity, module title, document number, revision-specific terms, remarks, approval state, and the disclosure that browser print is not an electronically issued PDF.

## Existing behavior preserved

- Existing TradeLink workflow approval and revision rules remain unchanged.
- The Print action continues to use the existing approved-revision and Board checks.
- No new roles, permissions, or authorization grants were introduced.
- No document is approved, issued, or persisted by the print renderer.
- No gradient descent, backpropagation, model training, retraining, fine-tuning, or model-parameter update mechanism is introduced.

## Acceptance boundary

The database foundation and frontend integration are implemented. Final closeout requires the current GitHub Actions disposable PostgreSQL and 18-case Chromium/PDFKit workflows to pass, followed by successful GitHub Pages deployment verification.
