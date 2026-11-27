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
- No new roles or module permissions were introduced. The snapshot RPC is executable by the existing `authenticated` role and reuses the existing TradeLink document-view capability; anonymous execution is not granted.
- No document is approved, issued, or persisted by the print renderer.
- No gradient descent, backpropagation, model training, retraining, fine-tuning, or model-parameter update mechanism is introduced.

## Final acceptance and closeout — 2026-11-27

**Status: CLOSED**

All CP-TL-OPT-04B acceptance gates are verified.

### Production database read-only verification

- Migration `20261127120000` is present in `supabase_migrations.schema_migrations`.
- The production database contains 63 immutable document revision snapshots and 63 matching render snapshots.
- Source classification is 47 legacy-derived and 16 legacy-defaulted.
- Missing snapshots: 0. Orphan render snapshots: 0.
- All 63 company/template/profile-version pairings match.
- The automatic capture trigger and immutable update/delete and truncate guards are enabled.
- The signed snapshot RPC is executable by `authenticated`; `anon` cannot execute it.
- These closeout queries were read-only; no production business document was created or revised for testing.

### CI and deployment evidence

| Gate | Result | Evidence |
|---|---|---|
| Disposable PostgreSQL 17 migration and backfill | **PASS** | Run [46007800969](https://github.com/wass-psti/APSYNTRACRM/actions/runs/46007800969), main commit `6a355918` |
| 63-row backfill, new revision capture, RPC and immutable guards | **PASS** | PostgreSQL acceptance log |
| 18 Chromium PDFs across 3 companies × 6 modules | **PASS** | Run [46011117027](https://github.com/wass-psti/APSYNTRACRM/actions/runs/46011117027), main commit `28e386d6` |
| PDFKit validation of all 18 PDFs | **PASS** | Same render-matrix run |
| Historical revision 4 before/after revision 5 reproduction | **PASS** | Same render-matrix run; Chromium and PDFKit |
| Production frontend build | **PASS** | Same render-matrix run |
| GitHub Pages build and deployment | **PASS** | Run [46014087521](https://github.com/wass-psti/APSYNTRACRM/actions/runs/46014087521), current main commit `0e383a59` |

The successful render-matrix run includes the snapshot, saved-output and print-flow tests. It generated all 18 PDFs, verified company identity, module, document number, page dimensions, terms, remarks and approval state, and confirmed that historical revision 4 rendered identically before and after revision 5. No TradeLink source files changed between the successful render-matrix commit and the current main commit.

The first render-matrix attempt exposed a quotation-renderer syntax error. That defect was corrected in the subsequent renderer repair; the later full render-matrix run passed every step.

### Closeout

CP-TL-OPT-04B is **CLOSED**. The immutable database foundation, historical backfill, exact-revision read path, saved-document PDF integration, 18 rendering combinations, historical reproduction checks, production build and deployment verification have passed. No separate TradeLink implementation is currently required to complete this initiative.
