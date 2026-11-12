# CP-FRT-BOARD-03E — Board synchronization and production-browser acceptance

Date: 2026-11-12. Repository: `wass-psti/APSYNTRACRM`.

## Verified production preflight (read-only)

- Fund Released Tracker authoritative domain: **zero** `frt_requests` and **zero** registered `frt_attachments`.
- Separate FRT board mirror (`f36da8fe-8d9d-4629-9938-12533cb3ca39`): **zero** `work_board_items`.
- The installed `frt_update_request_date_cas` and `frt_assign_request_person` RPCs remain present.
- No financial records, production session roles, permissions, RLS policies, or storage objects were modified by this increment.

## Board synchronization behavior implemented

The board's **Board items** route now shows an explicit signed FRT domain request summary before the separate board mirror grid. It reads the same `frt_board_list_safe` / `frt_board_dashboard_safe` API through `loadFRTFinanceReadOnly` already used by the FRT Finance tab. Both initial navigation and routine board refresh update the domain snapshot, scoped to the verified user/workspace and protected against stale route results. The summary displays request title, voucher, status, date and count only; no banking, amount or private identity data. It never synthesizes `work_board_items` rows, does not write requests and does not grant access to any unavailable workflow. Detailed edits remain in the signed FRT Finance view.

The signed company and field mappings are not guessed. A denied/expired or incomplete FRT domain read is visibly unavailable rather than silently falling back to invented finance data. Existing board mirror values and source-lineage columns are unchanged.

## Genuine signed-user acceptance boundary

The `CP-FRT-BOARD-03D` isolated native Supabase test already verified genuine GoTrue sign-in, signed request creation, atomic date/person editing, a fresh session readback, denied stale/foreign operations, restoration, exact fixture cleanup and native stack teardown (GitHub Actions `43175945439`). This is valid **signed API integration** evidence, not production GUI evidence.

The live browser integration reports `Browser access requires the originating browser context` from the current chat. Production contains no FRT business or disposable requests; creating one would consume a financial voucher and create production audit/counter side effects that an archive operation does not fully reverse. Therefore the production **UI click/edit/reload/reopen** acceptance is `BLOCKED` on interactive browser access and an approved disposable request with a safe recovery/cleanup procedure. No fake browser evidence was created.

## Final acceptance classification

| Criterion | Status |
|---|---|
| Existing real-GoTrue isolated signed API lifecycle | VERIFIED |
| Signed FRT board-domain summary rendering and refresh wiring | IMPLEMENTED, AUTOMATED TESTS VERIFIED |
| Current production zero-row state and installed atomic RPCs | VERIFIED (read-only) |
| Build, regression and Chromium anonymous startup | VERIFIED |
| Production Pages deployment | Verify independently after merge |
| Signed production browser user interaction with a real disposable request | BLOCKED |

Do not add new roles, workspace grants, test accounts, or a new Supabase project to force final browser acceptance. Require a separately designated reversible QA route if production data mutation becomes necessary.
