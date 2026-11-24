# CP-OI-NATIVE-02D — Legacy compatibility and exception reconciliation

## Evidence and implementation

2026-11-24. Candidate baseline 66061537; origin/main babed993. Existing private source envelope and destination snapshot SHA-256 match prior report. Original workbook hash independently rechecked: c1d5ee520451242a7aabfa8ce5b10df65307c20655eee3a50387ca3b9433dce3. Existing destination snapshot is historical evidence from CP02C, not a fresh database query.

Read authenticated Monday board 3670228015 rendered row element identifiers and matching PO labels. 24 distinct live rows observed. 17 newly corroborated item IDs, seven already corroborated by historical backup. Attempted bounded scroll capture and restored original scroll position; no additional IDs confirmed. Six remaining unconfirmed IDs are all FY 2026, with nonempty distinct confirmation IDs (not promoted to item IDs without corroboration).

Added a deterministic local compatibility manifest generator. Each record preserves all original worksheet cells, sheet locator, source group/year, source status, exact decimal text, nullable unknown fields, historical client evidence, and raw attachment reference strings. It does not parse or download referenced documents. Source identity is based on corroborated board/item ID; otherwise a snapshot-local key based on original workbook hash and worksheet locator. Snapshot keys must not be used for cross-export upsert. Original new-order validation issues retained independently from updated reconciliation issues. No database write interface. No changes to frontend, RPCs, policies, or existing new-order validation.

## Results

909/909 represented, 909 unique keys, 909/909 exact raw cell readback and PO labels, zero lost rows. Counts: FY2026 165, FY2025 181, FY2024 295, FY2023 268, Hold 0. Item identity evidence: 879 historical only, 7 historical and live, 17 live only, 6 snapshot-only. 903 confirmed source IDs. Historical client names present for 778 records, not asserted as current. No current client values filled. Archive state remains unknown for all 909.

Duplicate groups WO2206-M0257 (2) and WALK-IN (6) have eight distinct confirmed item IDs; preserved independently. This establishes distinct source identities, not business legitimacy or permission to relax the existing unique PO constraint. No collisions with the prior destination identity snapshot.

Status: 902 rows map directly to known workflow states; seven "Please select" rows retain raw source status with null canonical workflow status. 37 source fiscal group/date mismatches preserved, not reclassified. 728 unknown currencies retained, no default PHP. 778 missing or invalid procurement expense inputs, 909 missing VAT rates, 909 missing PO dates. Current gross profit semantics remain unverified: prior checkpoint found source amount minus expenses equals source gross profit for 131/131 complete samples. Preserve original reported gross profit and do not compute CRM VAT-derived profit for these rows.

Raw source amount coverage: PHP 163/163 = 42495406.27; USD 18/18 = 185352.889; unknown currency 725/728 numeric values = 261637176.0106 (not a monetary total). Source expense coverage PHP 11/163 = 1143414.52, USD 0/18 = null, unknown 120/728 = 27101078.41 raw numeric sum. Source reported profit coverage and raw decimals preserved in manifest; no VAT inference, rounding or currency conversion. 892 PO file-reference rows and 162 confirmation-reference rows retained, no file transfer. All 909 are local representations, not accepted new-order payloads or production-ready records.

## Reproduction

From repository root:
```sh
E="$HOME/.apsyntra-work/order-intake-evidence-20261124"
python3 scripts/order-intake-import/legacy-compatibility.py "$E/source-enriched.json" "$E/report-final.json" "$E/destination.json" "$E/live-item-identities.json" "$E/live-item-identities-extra.ndjson" > "$E/legacy-compatibility.json"
python3 scripts/order-intake-import/test_legacy_compatibility.py
```

Manifest SHA-256: 8883e5770f030016a2bc5bd2ddd7177273ad6415756700c6e1852759eef800ca. Private evidence remains outside git. Original input files unchanged. Tests: 5 new compatibility, 4 workbook/backup, 11 JS dry-run; genuine 909 row raw/identity readback and workbook hash PASS.

## Next checkpoint

CP-OI-NATIVE-02E — Legacy persistence contract and native read integration (local, nonproduction design/implementation). Recommend one logical order registry with a legacy representation that can hold null/unknowns and precise raw financial values, distinct source identity, immutable source provenance, original group/status, document references and reconciliation state. Evaluate a separate legacy staging/history table in the same existing database versus extending the existing domain contract; do not change production schema, uniqueness, roles or RPCs without separately scoped approval. Preserve current new-order contract. Implement/test local migration or representation and combined read projections, excluding unknown currencies and incompatible profit bases from ordinary financial KPIs; do not present partial totals as complete. Continue verification of six IDs, current client/source archive scope, source VAT and other missing data. Fresh destination snapshot, complete import/recovery plan and separately authorized production operation required. No production writes, migration application, model training, new dependency, authorization change or deployment in CP02D.
