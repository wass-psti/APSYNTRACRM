# BIMP-03 — Exact XLSX date-regression investigation and acceptance

**Checkpoint:** BIMP-03-DATE01
**Date:** 2026-11-05
**Repository:** `wass-psti/APSYNTRACRM`
**Source commit validated:** `33f574d34e720597a5b2be4df160bfec163813d6`
**Status:** IMPLEMENTED — AUTOMATED VERIFICATION PASSED — ORIGINAL WORKBOOK LIVE BROWSER ACCEPTANCE PENDING

## Original uploaded fixture: factual inspection

The user's uploaded workbook is `Live_Identification_Status_1793847689.xlsx`.
Read-only inspection was performed with `artifact_tool` and the OOXML ZIP metadata.

- Excel worksheet: `live identification status`.
- Actual workbook uses the **1900** date system (`date1904` is absent).
- Defined custom format `numFmtId=164`: `yyyy-mm-dd`.
- **C20** is a `t="str"` text cell with `s="10"`; that style resolves to `numFmtId=164`.
- **C20 raw text:** `2026-07-09 to 2026-08-18`. It is a report summary date **range**, not an Excel numeric date.
- The old parser converted every nonblank cell with a date-formatted style using `Number(raw)` and threw `Invalid Excel date.` for this string. This was the reproducible root cause.
- The worksheet is a **status report**, not a TimeTracker attendance register. The selected browser screenshot is from the ordinary **Contacts** board. The shared XLSX parser is the affected component; protected TimeTracker domain data is unchanged.

The input workbook has two independent sections:

| Section | Excel header | Importable records | Non-record summaries |
| --- | --- | --- | --- |
| Running Monday Apps | Row 3, columns A–E | Rows 4–19 (16 rows) | Row 20, including C20/E20 |
| Running Starlink | Row 23, columns A–E | Rows 24–25 (2 rows) | Row 26, E26 |

The original numeric styled dates in this fixture include C4=`46233` (`2026-07-30`), C5=`46232` (`2026-07-29`), C7=`46252` (`2026-08-18`) and C12=`46212` (`2026-07-09`). These results use calendar arithmetic in UTC without local-time conversion.

## Correction

1. `frontend/excel-date-normalization.js`: shared deterministic normalization for Excel 1900/1904 calendar systems, 1900 leap-year serial-60 rejection, fractional date/time values, valid ISO text dates/timestamps, blank values, and strict type/range rules. Does not evaluate formulas or interpret ambiguous slash-formatted dates.
2. `frontend/board-import-parse.js`: date formatting is **not** a data type. Only numeric cells are converted as serial dates. Text cells with date formatting remain text; recognized native ISO date cells are validated. Cached formula results can be consumed as static values if supported; formulas without results and external-workbook references are rejected. The worksheet scanner distinguishes repeated table headers from report labels and summary/footer rows; it preserves original Excel row numbers and omitted-row metadata.
3. `frontend/board-import-core.js`: typed mapping errors report original worksheet, Excel row, column label, original value (truncated), and precise reason.
4. `frontend/board-import-ui.js`: original source rows and excluded report/summary rows are visible before the user authorizes import.
5. `scripts/pages-smoke.mjs`: explicitly validates shipped importer, parser, date utility and import CSS against the deployed GitHub Pages CDN.

## Automated regression evidence

- `frontend/tests/excel-date-normalization.test.mjs` covers the original numeric serial values, both calendar systems, leap-year boundaries, date-only vs. time-only, fractional timestamps, strict ISO validation, and the exact styled C20 date-range text.
- `frontend/tests/board-import-compat.test.mjs` constructs a **sanitized OOXML ZIP fixture structurally equivalent** to the actual workbook, including report labels, repeated headers, C20 text-style mismatch, native Excel row numbers, 1904 flag variants, invalid numeric date location, cached formulas and external-reference denial.
- `frontend/tests/board-import.test.mjs` checks mapping-time diagnostic details for a rejected date-range value.
- **GitHub Actions:** https://github.com/wass-psti/APSYNTRACRM/actions/runs/41970782486 — 970/970 frontend Node tests passed; all isolated PostgreSQL and live-Pages validation jobs passed.
- **GitHub Pages deployment:** https://github.com/wass-psti/APSYNTRACRM/actions/runs/41970782042 — successful deployment for the same source SHA.

**Important distinction:** A sanitized structural XLSX fixture passing CI is not evidence that the original uploaded XLSX file was loaded in a signed-in production browser. That manual/browser test remains pending.

## Operational boundaries

- A summary row like C20 is displayed as excluded metadata, **not** imported as a record and **not** guessed into a single date.
- Only populated report sections are selectable; the original header positions are tracked.
- Unsupported date formats, fake 1900-02-29, invalid numbers, uncached/external formulas and nonsensical calendar values cause an explicit rejection; no automatic replacement date is generated.
- Generic board imports remain limited to authorized ordinary boards. TimeTracker Attendance still requires a separate domain-specific import writer and permission acceptance; the shared parser fix does **not** authorize direct attendance mutations.
- No production SQL, credentials, users, roles, RLS policies, or existing board records were changed.

## Milestone gate tracker

1. Actual workbook inspection and failing-cell root cause — **VERIFIED**
2. Reusable Excel date normalizer — **VERIFIED by automated tests**
3. Section-aware XLSX parsing and mapping diagnostics — **VERIFIED by automated tests**
4. Sanitized report regression, Excel edge cases, and atomic-path regression — **VERIFIED**
5. Main-branch CI and GitHub Pages deployment/source verification — **VERIFIED**
6. Original workbook submitted on a genuine signed Pages browser, row preview confirmed, and a disposable-board import persisted with audit and security checks — **PENDING**

**Milestone score: 5/6 = 83.3%** against the explicit gates above. The final production acceptance gate remains pending. Do not declare permanent end-to-end resolution until gate 6 has real signed evidence and the protected TimeTracker domain import is separately authorized.
