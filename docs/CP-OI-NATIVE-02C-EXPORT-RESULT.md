# CP-OI-NATIVE-02C — Export acquired and real-data dry-run result

2026-11-24. Previous candidate 1ad3211a, remote main babed993. The original export dialog was still available; the existing browser setting permitted execution, so the normal Export button was clicked with email off. Monday reported success. No browser settings changed. Original file: Downloads/Order_Intake_1795505971.xlsx, 144296 bytes, SHA-256 c1d5ee520451242a7aabfa8ce5b10df65307c20655eee3a50387ca3b9433dce3. Source board 3670228015.

## Source inventory

One worksheet "order intake", 931 rows: 909 order rows, 22 structural (1 title, 5 group labels, 5 headers, 4 subtotals, 5 blanks, 1 subitem header, 1 subitem). FY 2026 165 (independent UI count matched), FY 2025 181, FY 2024 295, FY 2023 268, Hold 0. All group raw amount sums match exported subtotals within 0.00000003 in source numeric representation; these mixed-currency subtotals are structural checks only, not monetary totals. Other groups and archived source scope not independently counted in live UI.

Raw classified amounts: PHP 163 rows 42495406.27; USD 18 rows 185352.889 (one value exceeds target precision); unknown currency 728 rows, raw numeric sum 261637176.0106 (not a currency total, do not treat as PHP). Dry-run valid positive two-decimal amount subset: PHP 163 42495406.27, USD 17 161562.46. 729 rows not included in those classified valid-amount totals. Source gross profit equals amount minus expenses on all 131 rows with all three fields present (tolerance 0.000001); VAT basis cannot be established. Source calculated expenses/profit unknown, not zero. 747 rows lack confirmation file values, 17 lack PO file values; files not downloaded.

## Historical evidence

Existing account backup Pictures/Monday.com/account_14357090_data_1792999016/boards/3670228015_Order Intake.xlsx, SHA-256 da12b672c10a6cfac41c0a2a26d9b15d5a054f16b930087473cab0314e797fee. 892 rows with unique explicit item IDs; Confirmation ID agrees with Item ID on all 892. Matched 886 current rows using unique confirmation ID plus normalized PO; preserved IDs, historical client names on 778 matched rows for review only. 23 unmatched IDs. No automatic historical client assignment or guessed values. Older updates workbook located but not ingested.

## Destination and final dry run

Read-only Supabase query in existing Work Management workspace returned complete identity snapshot: one archived QA record, zero active, no source PO collisions. No changes. Final result EXCEPTIONS_PENDING: 909/909 rows processed, 0 candidates, 909 held; 909 unique sheet locators. Exception counts overlap: client name, PO date, VAT rate and explicit archive state absent for 909 each; item ID 23; currency 728; expenses 778; delivery date 183; received date 66; industry 52; company 193; fiscal group mismatch 37; PO amount 13; unsupported status 7; duplicate PO 8 rows across 2 groups. Missing account manager warning 14. No production write authorization implied.

Local evidence directory ~/.apsyntra-work/order-intake-evidence-20261124 (0700), private JSON files: source.json, destination.json, report.json, source-enriched.json, report-final.json. Final source envelope SHA-256 6ddf149a04a94a11343d4425f848cc64e6ff226d23f7f0180e24f78e82af31ea, destination SHA-256 25b9772180ab7c450298b205104d75035c40df387cec295beff7dc840cb84e5f. Raw export and business records not committed.

## Implementation and reproduction

Python standard library parser recognizes the observed exact workbook layout, preserves text PO IDs and raw decimal/date values, excludes known structural rows, fails on unclassified row shape. Historical evidence adapter verifies identity without copying historical business fields into current canonical values. Existing JS dry-run handles explicit monday-workbook kind, retains worksheet locator and returns null for uncomputed totals. All operations deterministic, local, read-only with respect to original source and database. No training, new dependencies, permissions, migrations, or production deployment.

```sh
python3 scripts/order-intake-import/workbook-export.py /path/to/current.xlsx > source.json
python3 scripts/order-intake-import/backup-evidence.py source.json /path/to/historical.xlsx > source-enriched.json
node scripts/order-intake-import/dry-run.mjs source-enriched.json destination.json > report-final.json
python3 scripts/order-intake-import/test_workbook_export.py
node --test frontend/tests/order-intake-import-dry-run.test.mjs
```

Keep business data outside git and refresh destination identity snapshot before future import.

## Disposition

Export acquisition and real-data dry-run execution VERIFIED. Import readiness BLOCKED by actual historical data compatibility, not permissions. Recommend CP-OI-NATIVE-02D — Legacy data compatibility and exception reconciliation: recover original source identifiers and supplementary data where available; preserve original group and historical fields; distinguish unknown VAT/currency/expenses from zero; validate business meaning of legacy gross profit before conversion; resolve duplicates without dropping orders; design a legacy-compatible staging or domain representation for legitimately unavailable fields without weakening existing new-order requirements or authorization. No production schema or record changes until separately approved. Review exact mapping and rerun all 909 before import. Signed populated runtime acceptance still pending. Remote main divergence remains; integrate before release.

## Fresh verification

Full frontend regression 3613/3613 passed; focused dry-run suite 11/11 included; workbook/backup parser tests 4/4 passed.
