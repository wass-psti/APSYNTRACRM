# BIMP-03 — CSV/XLSX Import Compatibility and Hardening

Date: 2026-11-05
Project: APSYNTRA CRM, wass-psti/APSYNTRACRM
Scope: ordinary editable boards, existing m143-v1 atomic import contract
Status: IMPLEMENTED — AUTOMATED REGRESSION VERIFIED; NATIVE-BROWSER / SIGNED-LIVE ACCEPTANCE PENDING

## Changes

1. frontend/board-import-parse.js:
   - CSV rejects meaningful values beyond the header width; short data rows are padded with empty trailing cells.
   - XML rejects DOCTYPE and ENTITY declarations.
   - ZIP directory checks reject ZIP64 sentinel sizes and unsupported/encrypted methods.
   - Per-entry decompression allocates no more than the stated safe raw size (maximum 4 MiB), reads through a bounded stream, rejects overexpanded streams, and checks central-directory CRC32 after decompression. Total declared expansion remains capped at 24 MiB.
   - Worksheet targets are restricted to supported internal worksheet XML paths. Blank and header-only sheets no longer block importing populated sheets; chart sheets are skipped.
   - Repeated physical cell coordinates are rejected. Individual cell length remains capped.
   - Excel 1904-date mode accepts both "1" and "true" attribute variants.
2. frontend/board-import-core.js:
   - Database responses with missing/malformed receipts, transport interruption, HTTP 5xx, or post-commit identity-refresh failures are treated as *uncertain outcomes*, not clean retryable failures. The interface instructs users to refresh their board and audit before another import.
   - Known 4xx authorization, validation, and CAS denials still surface directly, subject to existing server atomicity.
3. frontend/board-import-ui.js:
   - The wizard locks "Import Now" after an uncertain outcome and exposes a Close-and-verify action.
   - Keyboard focus and scroll position are restored after in-step form redraws; navigation to a new step focuses the dialog body.
4. frontend/tests/board-import-compat.test.mjs:
   - Builds real ZIP byte buffers using both stored and raw-deflate ZIP members, with a *fixture-only simulated XML DOM*. Tests populated and empty/header-only worksheet handling; absolute/relative internal paths; CSV delimiter/quote, UTF-16LE BOM, row widths; encrypted archives; misleading uncompressed length; CRC tampering; formula cells; duplicate XLSX addresses; and XML DTD rejection.
   - This test does **not** claim native DOMParser or real browser compatibility.
5. frontend/tests/board-import.test.mjs:
   - Tests that ambiguous HTTP 5xx, network failures, receipt mismatches, and post-commit session failures are non-retryable, while an authoritative 409 denial remains clear.

## Verified scope

- Automated JavaScript syntax and frontend tests through the APSYNTRA CRM Frontend Validation workflow.
- Isolated PostgreSQL integration jobs remain part of the frontend validation workflow; this phase did not change SQL or run production writes.
- Existing BIMP-02 disposable PostgreSQL signed-claim acceptance remains separately documented in docs/BIMP-02-SIGNED-IMPORT-ACCEPTANCE.md.

## Remaining gates and limits

- Run genuine native browser tests on at least Chrome, Firefox and Safari with actual Excel-exported and CSV files, including formula rejection, dates, Unicode, multi-sheet selection, large supported files and accessible keyboard flow. MDN browser support for deflate-raw: https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream/DecompressionStream
- Verify mapping, Add/Skip/Update, refresh persistence and audit against a disposable ordinary board through genuine authenticated HTTPS. Do not use protected application-owned boards for generic writes.
- The existing live PostgreSQL import RPC still needs independent activation review of its unconditional active-session check. A frontend preflight cannot substitute for the server-side transaction guard, and no staged production SQL is activated by BIMP-03.
- No promise of support for legacy .xls, encrypted XLSX, formulas, external workbook links, very large archives or arbitrary Excel formatting. Such imports must fail safely or require user-controlled conversion.

No real production records, credentials, role grants or RLS policies were changed by this milestone. A successful Pages deployment or passing synthetic tests alone does not certify production readiness.
