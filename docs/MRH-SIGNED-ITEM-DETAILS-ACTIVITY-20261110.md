# Material Request Hub — Signed Item Details and Item-Scoped Activity

Date: 2026-11-10. Increment: authenticated Material Tracker item navigation, protected details, and read-only audit.

## Preserved production baseline
- Authoritative board: 617c4c0f-e343-4b3b-8456-50d47dcbaf99.
- Original Main group: 21566a87-b287-4a61-b521-bb233956e09e, exact title and position unchanged.
- Eight original columns preserved. No schema/permission changes, production items, or restricted values created.
- Reference screenshots are frontend requirements, not operational data.

## Delivered
1. New part number is available from either Board items or Material Tracker. The existing signed domain ADMIN create transaction verifies the persisted record and original Main group with a second authoritative board read; the UI invalidates stale board cache and reloads the active view.
2. The signed item drawer offers accessible Details, Tasks and Activity tabs for Material Request Hub only. Other board modules retain their previous item drawer.
3. Details continues to load restricted commercial fields through the existing authenticated item-scoped RPC and uses revision-checked field updates. Restricted values are not put into ordinary board cells.
4. Activity calls the existing signed board audit RPC on demand, revalidates current board-view access and filters only the exact selected item ID. Displays event type and timestamp; excludes event payload/message, actor identifiers and all other item records. Explicit recent-200-events limit.
5. Tasks is a real tab displaying an unactivated-contract explanation rather than fabricated or unsafe task operations. Existing material_tracker_tasks and task CRUD belong to separate material_tracker_materials, not APSYNTRA work_board_items. There is no validated cross-model key mapping. No task RPCs are issued.
6. Signed readiness control can now be used from either Material Tracker or Board items.

## Verification
- Node syntax checks for app and new module; CSS bundle generated and verified; full frontend suite 1,575/1,575 PASS in local isolated clone.
- Exact item-only audit filtering and HTML escaping, no sensitive messages or identity, no inferred task association; code regression tests.
- PR CI, protected deployment and live browser confirmation remain release gates, independently tracked.

## Outstanding acceptance
- Genuine signed production item create/reload, protected value save/revision conflict/reload, non-ADMIN/expired/foreign workspace denials (board currently empty).
- Signed activation of six ordinary sourcing columns (currently 0/6).
- Domain-approved Work Management board-item task association, transaction and RBAC contract before Tasks can persist.
- Full financial calculations, quotation/exports and other screenshot features remain separate scope.

Never rename Main group, alter its ID, add synthetic operational records, or bypass server authorization to satisfy test coverage.