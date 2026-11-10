# Material Request Hub — Secure Board-Item Tasks: Staged Production Handoff

2026-11-10. This is a candidate implementation, not a production database activation.

## Confirmed baseline
Material Request Hub board 617c4c0f-e343-4b3b-8456-50d47dcbaf99; original Main group 21566a87-b287-4a61-b521-bb233956e09e, title and position preserved; eight original columns, zero production items and zero private sourcing records at read-only preflight. Legacy material_tracker_tasks references a distinct material_tracker_materials model and cannot be associated with APSYNTRA work_board_items by guessing IDs.

## Scoped solution
- Candidate SQL: sql/mrh-board-item-tasks-CANDIDATE-NOT-APPLIED.sql creates a private task table with UUID foreign keys to the existing board, workspace and real work_board_items, immutable task identity, title/status allowlists, revision CAS, guarded item scope and audit events.
- Authoritative read/write RPCs use existing private.mrh_sourcing_scope and work_board_access; reject anonymous callers, non-ADMIN, missing/archived/wrong-group items, foreign workspace, denied edit, stale revision and cross-item task IDs. No direct table grants, no allow RLS policies.
- Frontend Tasks tab is enabled only after successful signed task read; edits require board edit access. No legacy task fallback, fake data or persistent client-side task storage. Uncertain writes lock the form pending manual fresh item open.
- No production data, schema, role, column or group mutation was performed in this increment. The six sourcing columns remain subject to the existing controlled activation.

## Isolated evidence
- Local Node syntax, CSS bundle verification, and full frontend regression suite: 1,581/1,581 PASS.
- Fresh disposable PostgreSQL 17 fixture: successful insert/reload/update/audit; CAS conflict and cross-item denial; invalid input, non-ADMIN, revoked-session, board denial, foreign workspace, wrong original group, and archived item denial; forced RLS and no anonymous/direct table grants. This is simulated signed-access security validation, not genuine production acceptance.
- CI acceptance workflow is separately defined and must pass before merging.

## Production activation gate
The new SQL candidate is NOT auto-applied. Activating a new production table/RPC/grants is a material security and production schema change requiring separate explicit approval. After approval: verify recovery/backup and schema baseline, review candidate, execute once via protected migration process, then verify real signed ADMIN task create/reload/revision and genuine non-ADMIN/revoked/foreign workspace denials using an actual legitimate board item. Confirm audit, UI and Main group integrity. Do not create synthetic production items.

## Closure criteria
Frontend staged/CI PASS is not production task persistence PASS. The milestone remains open for protected SQL activation and genuine signed production item acceptance. No additional architectural rewrite is warranted.