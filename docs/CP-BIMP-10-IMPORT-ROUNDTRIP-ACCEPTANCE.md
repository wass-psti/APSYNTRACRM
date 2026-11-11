# CP-BIMP-10 — Genuine Ordinary-Board Import Round-Trip and Refresh Integrity

## Implementation status

**Client implementation: IMPLEMENTED-UNVERIFIED.**

**Genuine signed CSV/XLSX browser round-trip and post-refresh acceptance: PENDING.**

## Changes in this checkpoint

- `buildImportPlan` now carries a local-only readback snapshot. It is not added to the RPC payload and does not change the `m143-v1` server contract.
- Immediately before the atomic write, the client compares the live signed board's group, column and destination-item baseline with the preview snapshot. A stale preview is rejected before the write.
- The client validates the complete atomic receipt against the reviewed plan: created, updated, skipped, columns created and groups created.
- After a valid write receipt, the client performs a fresh `wm_get_board` read through the existing signed API (not the in-memory board cache). It verifies the destination group, newly created columns, newly created items, mapped values, updated values, and unchanged skipped values.
- The existing application completion callback then reloads the selected board through the existing board-loading path. The import RPC invalidates the board cache on successful mutation, so the reload is not allowed to reuse the prior board snapshot.
- A missing/mismatched post-write readback is classified as an uncertain committed outcome. The UI must not offer a blind retry; it directs the user to refresh and reconcile the board.
- Added regression coverage for ordinary item creation, typed column/group creation, update mode, skip preservation, missing post-write data, and one-write/no-retry behavior.

## Scope boundaries

- No SQL, RPC, schema, database, Storage, role, permission, RLS, workspace, or authentication changes.
- No new credentials, identities, accounts, background jobs, monitoring, or external dependencies.
- No operational board records were written or modified during this checkpoint.
- Existing authorization behavior is unchanged. The added checks validate the reviewed preview and committed data; they do not grant or revoke import capability.

## Live target inventory

The currently open browser tab is on `CP-BOARD-COL-DELETE QA Signed Fixture` with a 504-record workbook at the mapping stage. The page reports that no records have yet been imported. This board is a dedicated recovery fixture; its persisted state currently contains nine active items and four `Recovery Status` cells, while its original recovery-fixture verifier expects four original items/cells. It is not a safe import target.

The reserved `APSYNTRA QA` board is protected from generic board editing/import by the existing application contract. Other ordinary boards are not explicitly designated as nonproduction import fixtures; some contain operational records. No suitable existing dedicated ordinary import QA board was verified.

## Synthetic upload fixtures prepared

- `CP-BIMP-10-roundtrip.csv`: two rows (`CP-BIMP-10 CSV Alpha`, `CP-BIMP-10 CSV Beta`) with numeric Amount, boolean Flag and ISO Date values.
- `CP-BIMP-10-roundtrip.xlsx`: two additional rows (`CP-BIMP-10 XLSX Gamma`, `CP-BIMP-10 XLSX Delta`) in a real OOXML workbook; Date cells are native Excel dates.
- Import both into one group named `CP-BIMP-10 Roundtrip`. The CSV import should create Amount (number), Flag (checkbox) and Date (date); the XLSX import should reuse those existing columns.
- Expected final result: four unique items and twelve mapped cell values.

## Remaining genuine browser acceptance

Use a dedicated, empty ordinary board in the existing `Work Management` workspace, created through the existing signed application UI. Then:

1. Import the synthetic CSV fixture and confirm the atomic receipt and server readback.
2. Import the synthetic XLSX fixture into the same group, reusing the columns created by the CSV import.
3. Confirm four unique imported items and all mapped Amount, Flag and Date values.
4. Refresh the browser page, reopen the board, and compare the same four items and twelve mapped cells against the fixture manifest.
5. Independently run a read-only SQL cross-check for the exact item titles, group, column types, cell values, and `items.imported.wizard` audit events.

The browser is in Chat mode and is read-only to the assistant. No UI clicks, file-picker operations or signed write actions were performed. A dedicated ordinary QA target must be supplied or created by the user before the live write acceptance can be run; do not substitute an operational board or another workstream's fixture.
