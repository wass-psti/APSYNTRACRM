# CP-BIMP-SOURCE-CELL-CHAR-LIMIT-03 — TradeLink B28 source-cell capacity

## Incident evidence

The original local Monday.com TradeLink board export (`18384049540_TradeLink.xlsx`) was recovered and parsed in Chromium using the application parser.

- Worksheet: `tradelink`
- Source file size: `326,796` bytes.
- Source SHA-256: `657cf5726f91b5a318c0258b9a64f42e6a0e7812ff3f81388ff094f80d6ece53`. The workbook remains a local evidence input and is not added to the repository.
- Source cell: `B28` (`Subitems`)
- Displayed text: 69,668 characters / 69,752 UTF-8 bytes
- Worksheet dimension: `A1:H6781`
- Total populated source cells: 41,578
- A full worksheet XML audit found exactly one populated cell above the previous 65,536-character application limit: `B28`.
- B28 contains genuine displayed text; its XML contains no phonetic `<rPh>` annotations.
- Normalized B28 text begins with the reported SIMATIC S7 Memory Card value.

The failure was not an XLSX ZIP, shared-string, formula-cache, worksheet-width, or database `text` type limitation. It was the matching application-defined 65,536-character cap in source validation and the m143-v2 extended-reference storage contract.

## Corrective implementation

- Introduce the shared `MAX_IMPORT_CELL_CHARACTERS` constant at 131,072.
- Apply it consistently to CSV extraction, XLSX extraction, normalized sheet validation, and m143-v2 extended-reference mapping.
- Keep the 8 MiB source-file, 20,000-row, 256-column, and 24 MiB uncompressed workbook bounds unchanged.
- Raise `work_board_import_extended_refs.content` to 131,072 characters.
- Raise the matching guard in `wm_import_board_wizard_extended_atomic` to 131,072.
- Preserve the existing RPC signature, atomic transaction, board revision check, duplicate handling, table RLS, grants, and readback behavior.
- Do not truncate or split a source cell.

## Original workbook parse and plan evidence

The production parser now reads the original workbook in Chromium without the B28 error:

- 598 parent/item rows extracted.
- 6,179 rows are reported as omitted by the existing grouped/subitem worksheet parser. These include repeated subitem headers and child rows; the parent `Subitems` cell contains the aggregated text. The import wizard continues to require explicit confirmation of omitted rows.
- B28 remains exactly 69,668 characters in the parsed source row.
- A reviewed m143-v2 plan using `Name` as the Item title and `Subitems` as an extended-reference destination accepts all 598 parent rows with zero rejected rows; preview: 598 new, 0 updated, 0 skipped, 0 duplicate rows. The seven other source columns were explicitly skipped in this synthetic plan.
- The plan check set `omittedRowsConfirmed` only to exercise plan generation. This is not user approval to exclude the 6,179 rows and does not authorize a production import.
- Existing bounded batching estimates 3 rows per batch for this source, 200 batches total; the largest serialized row is 70,445 UTF-8 bytes and the estimated maximum batch is 211,335 bytes, below the existing 262,144-byte payload budget.

## Production database migration

Migration `20261118105649_cp_bimp_source_cell_capacity_131072` was applied to the existing APSYNTRA CRM Supabase project.

Live verification confirms:

- The extended-reference content constraint now permits 1–131,072 characters.
- The extended atomic writer permits 131,072 and no longer contains the old 65,536 guard.
- The existing RPC signature and `SECURITY DEFINER` property remain unchanged; authenticated execution is present, anonymous and PUBLIC execution are absent. The table's existing RLS remains enabled and is not forced. No roles or grants were added.
- Existing extended-reference data remains unchanged (5 rows; maximum existing content 14,701 characters).

## Verification

- Import compatibility and batch tests: included in the full frontend suite; PASS.
- Full frontend suite after syncing the current `main` baseline: 2,739/2,739 PASS.
- `npm run check`: PASS.
- `npm run build`: PASS (existing startup-guard and large-bundle warnings only).
- Migration source manifest: PASS (222 recovered baseline + 28 forward migrations).
- Disposable PostgreSQL migration dry-run: PASS; accepted 69,668 characters and rejected 131,073.
- Original workbook Chromium parser run: PASS; 598 parent rows parsed, 6,179 rows surfaced for omission review, B28 retained at 69,668 characters.
- Full worksheet XML audit: PASS; B28 is the only populated cell above 65,536 characters.
- Synthetic m143-v2 plan: PASS; all 598 rows accepted and the B28 value is byte-for-byte identical in source, payload and expected readback.

## Pending genuine production import

No production board records were written. The currently selected browser board is `TimeTracker`, whose schema is not a match for the TradeLink export; the canonical TradeLink board also has a different application schema. Destination-board selection and explicit confirmation of the 6,179 omitted worksheet rows remain necessary before committing the 598 parent records.
