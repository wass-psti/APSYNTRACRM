# CP-BOARD-COL-DELETE — Controlled Production Approval and Signed Recovery Acceptance

**Date:** 2026-11-05.  
**Decision:** **PRE-MIGRATION READINESS VERIFIED; PRODUCTION CHANGE NOT AUTHORIZED OR EXECUTED.**  
**Target:** Existing Supabase project `jtlusodorfnyzgyuewkz`; board `b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d` (Contacts); custom Status I column with four persisted cell rows at the latest read-only inspection.

## 1. Material approval boundary

Three separable authorizations are necessary; none is inferred from the phrase *begin the next gate*.

| Approval | Scope | Explicitly not included |
| --- | --- | --- |
| **A — Schema dark launch** | Apply the reviewed `sql/cp-board-col-delete-recoverable-candidate.sql` to the existing production database, creating a **private, RLS-enabled, unexposed** two-flag activation record, column/cell snapshot tables, and three purpose-specific `SECURITY DEFINER` RPCs. Revoke `PUBLIC/anon` function execution; allow `authenticated` to invoke RPCs only through **original signed-session, board-manager and server activation checks**. Both delete and restore activation flags start **false**. | No enablement, deletion, restoration, membership/role change, new Supabase project or real record mutation. Do not modify the existing empty-only schema-mutation RPC. |
| **B — Signed reversible QA acceptance** | After A is independently verified and current backup recovery is confirmed, separately authorize narrowly scoped server activation and **genuine GoTrue-signed manager** operations on a designated QA board using only the existing project and real authorized account. Verify four-row snapshot/delete/reload/reopen/Activity/restore, denied Viewer or foreign workspace, expired/revoked session, CAS, no leak, no unintended writes and rollback. | No deletion of Contacts / Status I. No fake production identities. |
| **C — Actual Contacts Status I deletion** | Once B passes, separately approve deleting the specifically named Contacts custom Status I column even if populated. Recheck signed manager, board state/protection, authoritative revision and current row count; type the current `DELETE Status I` confirmation; perform one transactional archive/delete. Refresh and reopen board, inspect Activity and its private restoration option, and confirm unrelated data unchanged. | Do not assume the count remains four; do not purge snapshots or affect other columns. Any real restoration is another deliberate signed transaction. |

**Do not conflate schema installation with feature activation.** A frontend flag alone is not a security control. The migration candidate now creates `private.wm_recoverable_column_activation` with `delete_enabled=false` and `restore_enabled=false`; each new RPC is server-gated. A separate approved activation is needed for B/C. The backend checks `private.wm_board_config_session_active()`, `public.work_board_access(board_id,'manage')`, `private.wm_board_is_protected`, active board status, and authoritative CAS/value count.

## 2. Evidence verified without production writes

- [Disposable PG17 role / default-off acceptance #42007494382](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42007494382) — **SUCCESS**. Invokes the published RPCs as PostgreSQL `authenticated` with a synthetic signed-session fixture; asserts exact default-off denial, private table denial and no mutation. **This is not genuine browser acceptance.**
- [Post-preflight Board Config PG17 #42007637174](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42007637174) — **SUCCESS**. Covers transactionally reversible four-row snapshots (including JSON null and SQL NULL), FK cascade, RBAC, archive/protected board denial, stale count/revision, Activity logging, restore exactness, replay, missing parent row, private metadata and rollback.
- [Frontend Validation #42006686666](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42006686666) — **SUCCESS**. Disabled-by-default UI and error classification remain intact.
- The read-only query `sql/tests/cp-board-col-delete-production-readonly-preflight.sql` was re-executed against live Supabase and returned **`CP_BOARD_COL_DELETE_LIVE_4_ROWS_INTACT_RECOVERY_NOT_INSTALLED`**. One active, nonprotected Contacts custom column, four stored cell rows, current original empty-only function and original protected-board/session guards. All recovery tables, activation flags and RPCs remain uninstalled in production.
- Browser signed-session access could not be obtained from the chat connector (requires originating browser context). No signed Contacts write, QA fixture, production DDL, permission grant or live deletion is represented as verified.

## 3. Deployment sequence and fail-closed postchecks

**A preflight (no writes)**

1. Independently verify latest source fingerprints for `wm_board_schema_mutate`, `wm_board_config_session_active`, `wm_board_is_protected`; original signed board ACL and Board Activity. Run the named read-only production preflight, requiring exactly one unprotected Contacts Status I custom column; fail on changes.
2. Confirm current PostgreSQL backup/PITR policy, retention and tested restoration route. **A backup dashboard assumption is not fresh recovery evidence.**
3. Confirm permission scope, DDL review, current migration history, no conflicting function/table names, private schema isolation and RLS posture. Preserve existing audit and user permissions.
4. Obtain **separate express approval A** for production DDL and `authenticated` RPC execute grants.

**A implementation (only after approval)**

- Apply the reviewed candidate as a managed atomic migration. Its preflight rejects source drift or existing-object collision; no live board data are modified. Verify audit and function fingerprints immediately after installation.
- Query `pg_proc`/ACL and `pg_class` to confirm all three new functions, **no `anon` or `PUBLIC` EXECUTE**, only the intended `authenticated` execute grants, private table RLS and **no direct client table access**. Confirm the single activation row has both flags false and both snapshot tables contain zero rows. Verify existing four Contacts values are still present.
- Test the default-off RPC denial under a **genuine signed user** only through an allowed nonmutating call; do not fabricate a JWT or turn a privileged SQL impersonation into signed acceptance.
- Keep `BOARD_COLUMN_RECOVERY_ENABLED=false` in the shipped frontend until B completes.

**B and C operations (only after their distinct approvals)**

- Activate `restore_enabled` and `delete_enabled` under separately authorized, least-privilege administrative change after recording who approved them and the gate timestamp. Restrict acceptance to an isolated QA board or approved production fixture; do not create test accounts or an additional Supabase project.
- Use the current signed user and `BoardColumnRecoveryClient` to observe a fresh server-authoritative board revision and manager access, confirm count and current column name, then perform delete and restore in separate audited transactions.
- Compare exact column metadata and values before/after; verify page reload/reopen, Activity actor/time and recovery index, denied role/session cases, and zero changes to unrelated items, columns, groups and workspaces. Stop on uncertainty; never blindly retry a delete.
- Only then request **C** for the actual Contacts Status I column. Do not invoke a production delete from privileged SQL; use the signed, audited API boundary.

## 4. Emergency controls, rollback and preservation

- **Before migration COMMIT:** candidate installation is wrapped in a PostgreSQL transaction; any failure rolls back its schema and grants automatically.
- **After installation / before activation:** keep server flags false and frontend flag false; no populated-column delete is available. Do not run `sql/tests/cp-board-col-delete-recoverable-reset.sql` in production — it is deliberately restricted to disposable PostgreSQL.
- **After activation:** on unexpected behavior, **disable server `delete_enabled` first** under authorized administrator control and keep frontend deletion disabled. Preserve the `private.wm_recoverable_deleted_columns` and `private.wm_recoverable_deleted_cells` snapshot tables, audit events and restore capability until all affected values are recovered or independently retained. Never drop tables holding outstanding snapshots or erase Activity to simplify rollback.
- **Uncertain HTTP outcome:** inspect authoritative board state and the manager-only recovery index before any further action. No automatic retry.
- **Schema reversal** requires a separately approved, proven zero-pending-snapshot inventory and database-level point-in-time recovery route. The safe default is to retain the dormant schema.

## 5. Acceptance classification and next decision

| Milestone | Classification |
| --- | --- |
| Root cause, live read-only target inventory, SQL source fingerprints | **VERIFIED** |
| Private archival/restore transaction, supported grants and isolation in PG17 | **VERIFIED — disposable** |
| Server default-off activation and archived/application-protected board denial | **VERIFIED — disposable** |
| Actual production migration / permission changes | **BLOCKED — explicit approval A needed** |
| Genuine GoTrue-signed manager QA fixture / signed browser evidence | **PENDING — approval B and browser context** |
| Contacts Status I deletion, refresh persistence and restoration availability | **PENDING — approval C and preceding acceptance** |

**Progress:** Preproduction recovery design and test coverage **VERIFIED**, production activation **0%**; overall checkpoint **IN PROGRESS** (no defensible aggregate denominator).

**Next required gate:** **Approval A (dark-launch production recovery schema and RPC grants)** → separate **B (genuine signed QA fixture / server activation)** → separate **C (Contacts Status I deletion / Activity recovery acceptance)**. Treat neither a passing CI build nor a read-only catalog query as production acceptance.

## Phase A approval recorded — 2026-11-05

The project owner explicitly authorized **Phase A** (production additive recovery schema plus `authenticated` EXECUTE grants, with **both** server activation flags remaining `false`). This authorization **does not** authorize activation, a signed write fixture on the live database, deleting Contacts / Status I, or changing real member roles. Do not request Phase A approval again; continue once its prerequisite gates pass.

**Execution state:** `APPROVED — INSTALLATION BLOCKED ON CURRENT BACKUP EVIDENCE`. The connected Supabase tools return project health, database source, migrations and advisors, but do not expose the Management API's `GET /v1/projects/{ref}/database/backups` or the current completed backup timestamp/PITR window. Earlier operator acceptance of backups was acknowledged; however a fresh independently verified recovery point and retention window have not been established for this production change. The source-locked migration is not applied until that release prerequisite is satisfied.

**Verified preparation:** The candidate `sql/cp-board-col-delete-recoverable-candidate.sql` now has a pre-COMMIT `$phase_a_integrity$` assertion of default-off activation, private RLS, zero archive rows, exact RPC grants, and anonymous denial. [Disposable PostgreSQL 17 run #42009553295](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42009553295) concluded `SUCCESS`. Production read-only preflight again returned `CP_BOARD_COL_DELETE_LIVE_4_ROWS_INTACT_RECOVERY_NOT_INSTALLED`. No production schema, role/permission, board, event or cell changes were made by this preparation.

**Next required action:** Verify a completed, current backup and restore route in the existing project's Supabase **Database → Backups** page (or the read-only `database/backups` Management API), then invoke the already approved additive migration through the migration tool. Immediately verify RLS, ACLs, server flags, snapshot emptiness, existing 4 values and source fingerprints. Do not use a destructive restore as a backup verification test. Approval B/C remain separate.
