# Material Request Hub — Production Task Activation Readiness

2026-11-10. Decision: **NO-GO for live DDL and genuine task-write acceptance** pending recovery proof and a legitimate persisted sourcing item.

## Production baseline (read-only verified)
- Existing Supabase project jtlusodorfnyzgyuewkz. Do not create any replacement project.
- Material Request Hub board 617c4c0f-e343-4b3b-8456-50d47dcbaf99; active; workspace 00000000-0000-4000-8000-000000000001.
- Original Main group, ID 21566a87-b287-4a61-b521-bb233956e09e, position 0. Keep exact name, ID and position.
- Eight original columns, zero persisted board items and zero protected sourcing records.
- New private task table and read/write RPCs ABSENT; signed sourcing scope and guarded audit function present; PostgreSQL 17.6.

## Production read-only structural result
The committed script sql/tests/mrh-board-item-tasks-production-readiness-readonly.sql ran against production and returned STRUCTURAL_PREFLIGHT_PASS__BACKUP_RESTORE_AND_SIGNED_ITEM_ACCEPTANCE_STILL_REQUIRED. It checked board identity, group invariants, columns, task schema absence, existing signed scope and audit, PostgreSQL version, RLS execution roles and absence of conflicting RPCs. No DDL, DML or grants executed.
The connected signed APSYNTRA browser showed an actual signed board session and zero materials. This is signed UI **read** evidence, not an authenticated task write.

## Recovery gate (BLOCKED)
- Supabase Dashboard reported last scheduled backup approximately 10 hours ago; this is an indicator, **not** verified restore success.
- Project recovery requirements: RPO <=24 hours; RTO <=24 hours; independent restore rehearsal required for WatchdogWorkspace including Storage.
- Before activation: independently verify a current usable backup and completed rehearsal within RTO, recovery/storage scope, accountable executor, rollback owner and release window.
- Do not restore the shared production project simply to test backup; no production schema or data changes were authorized by this preflight.

## Candidate activation (NOT EXECUTED)
Candidate SQL: sql/mrh-board-item-tasks-CANDIDATE-NOT-APPLIED.sql. It creates a private, row-secured, board-item UUID foreign-keyed task table with signed scoped read/write RPCs, revision CAS and audit. Existing legacy material_tracker_tasks is untouched.
Once recovery proof and operational change authorization are documented: rerun read-only preflight; review exact SQL/permissions/rollback; apply through approved migration once; postcheck signatures, grants, forced RLS, FK, audit and unchanged original board.
Then, using real signed module ADMIN and a legitimate existing operational item, verify task create/reload/update/CAS/audit. Test genuine non-ADMIN, revoked-session and foreign-workspace denials using actual authorized test actors. Never fabricate a production item or fake a signed JWT to claim acceptance.

## Evidence and statuses
- Frontend and candidate SQL: IMPLEMENTED. Full frontend 1,581/1,581 PASS before this preflight patch; disposable PG17 CAS/RLS/denial tests PASS.
- Production read-only structural preflight: VERIFIED.
- Recovery rehearsal and proof: BLOCKED (no independent restore evidence available).
- Live task schema activation: PENDING; no new production task schema, grants, or data.
- Signed production task transaction and negative-role acceptance: PENDING (no persisted board items).
- Completion decision: **NO-GO** for live activation until evidence closes the recovery gate.

Next concrete action: recovery-proof handoff, then controlled additive task schema activation and signed task acceptance. No unrelated implementation checkpoints.
