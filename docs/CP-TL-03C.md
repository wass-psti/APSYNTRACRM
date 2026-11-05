# CP-TL-03C — Controlled TradeLink production activation

**Status:** STAGE A ACTIVATED IN PRODUCTION — READ-ONLY; STAGE B NOT APPROVED/NOT ACTIVATED; SIGNED-USER ACCEPTANCE PENDING.  
**Project:** existing Supabase `jtlusodorfnyzgyuewkz` ONLY. No new project, backend, login, or independent user-role store.  
**Board:** existing TradeLink `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`, workspace `00000000-0000-4000-8000-000000000001`.

## Verified pre-activation baseline — read-only, 2026-11-05 Asia/Manila (historical)

- PostgreSQL `17.6`; exact v1 TradeLink board active, one group, eight legacy columns, zero board items.
- Before Stage A, `public.tradelink_documents`, `public.tradelink_document_events` and the new document RPCs were **absent**. See the deployment evidence below for their current installed state.
- `sql/tests/cp-tl03c-production-readiness.sql` was committed and executed against the actual existing project. All **10/10 readiness fields passed**, including exact scope, private schema access, current `auth.sessions` columns and eight previously reviewed backend function definitions (MD5 fingerprints), with `changed_dependencies=[]`.
- The existing security advisor reports project-wide warnings for exposed security-definer functions and other tables. These were **not** amended or bypassed in CP-TL-03C. Evaluate them separately in their respective module authorization scope, using the Supabase dashboard security advisor. Do not weaken permissions to silence advisories.

## Security decision: two-stage activation, separate production approval

The original 03A script granted `authenticated` permission to invoke the write RPC immediately. An off-by-default frontend feature flag **does not** protect a directly callable server RPC. This has been corrected *in the staged repository source*; **no production permissions were changed**.

### Stage A — guarded schema + read-only API, write EXECUTE withheld

Source: `sql/cp-tl03-staged-domain.sql`.

- One atomic, additive transaction creates authoritative Draft-only document and append-only audit tables, RLS policies, indexes, a signed/role-guarded implementation, read/list RPCs and a linked-board projection.
- It **revokes** access to both `private.tl03_commit` and `public.tl03_document_commit`. `authenticated` cannot call either until Stage B is *separately* authorized.
- `authenticated` read/list and RLS SELECT are granted only for live sessions with board `manage`, effective `General Manager` module role and matching centralized workspace. The original eight workflow states remain authoritative; this stage commits drafts only.
- `frontend/tradelink-domain-client.js` keeps `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`.
- **Before applying**: rerun `sql/tests/cp-tl03c-production-readiness.sql`; require every field to match and `readiness='PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_STILL_REQUIRED'`. Reconfirm production recovery/snapshot policy and existing migration history. Any drift is a BLOCKER.
- **Approval**: obtain separately documented explicit production DDL/RLS/read-grant approval. Do not infer this from standing development authorization.
- **After applying (read-only)**: run `sql/tests/cp-tl03c-stage-a-readonly.sql`. Confirm RLS is enabled on both new tables, read grants are constrained, and *both write RPC function grants remain absent*. Verify the documented board/group/column/item counts have not changed.

### Stage B — separately authorized write permission

Source: `sql/cp-tl03c-write-permission-candidate.sql`.

- Only after Stage A acceptance and **new explicit permission-change approval**, this transaction checks the installed document schema, exact board/workspace, no existing document/board data, current session guard, and that write grants are currently absent.
- It grants `authenticated` EXECUTE on both the private and public draft-only commit functions. It does not alter any document records, role assignments, or RLS policies. The server rechecks active signed session, effective module role, board manager access and workspace on every request.
- After Stage B, run `sql/tests/cp-tl03-postactivation-readonly.sql` to verify grants/RLS/audit and board reconciliation.
- Require a **genuine signed user** for positive manager tests, negative User/editor/foreign-workspace tests, invalid/revoked/expired session tests, stale CAS, no duplicates, and refresh/audit evidence. Production test-record writes need separate production-data approval and controlled cleanup/retention.
- Do **not** enable the frontend read/write flags until the authorized endpoint and signed-user acceptance independently pass; passing CI alone is insufficient.

### Reversible emergency disable without data deletion

Source: `sql/cp-tl03c-emergency-disable-candidate.sql`.

- Requires its own scoped emergency production-permission-change approval and preflight.
- Atomically revokes authenticated/anonymous access to all new read/write RPCs and domain-table SELECT grants; preserves the tables, board rows, revisions and immutable audit history. No DROP/TRUNCATE/DELETE/UPDATE.
- The rollback action is itself separately testable, not automatically launched.
- Revoking permissions changes API reachability. Do not deploy automatic destructive rollback or delete document/audit tables after data exists.

## Disposable acceptance chain (not production)

`.github/workflows/cp-tl03b-disposable-postgres.yml` runs in a dedicated GitHub Actions PostgreSQL 17 container with synthetic users, sessions, roles and one board; no production connection or Supabase secrets.

1. Synthetic fixture + staged Stage A SQL.
2. `sql/tests/cp-tl03c-stage-a-readonly.sql`: both write entry points **denied**.
3. Stage B grant candidate **inside disposable PostgreSQL only**.
4. Existing signed draft CRUD/idempotency/CAS/role ceiling/foreign-workspace/revocation/audit negative suite.
5. Existing postactivation RLS/grant/board reconciliation checks.
6. Emergency disable candidate **inside disposable PostgreSQL only**.
7. `sql/tests/cp-tl03c-disposable-emergency-acceptance.sql`: grants denied; 1 document, 4 events and linked board item preserved.
8. Focused frontend contract unit tests.

The revised two-stage CI showed **SUCCESS** in the user-supplied GitHub Actions screenshot (CP-TL-03B run #12 on main), including the emergency-disable chain. Individual per-step logs were not independently re-read in this session. Production Stage A was separately authorized, applied and verified as recorded below; the prior run alone does not authorize Stage B.

## Stop and escalation conditions

- Board identity, group, column, item count, or any of the eight prerequisite function hashes changed.
- Missing `auth.sessions` prerequisites, role/module ceiling drift, missing RLS or unexpected EXECUTE grants.
- Current production backup/recovery policy cannot be confirmed.
- Any red or incomplete disposable PostgreSQL run, or mismatch in positive/negative case evidence.
- Any absent separately required permission/schema/data approval or repository protection requirement.

## Eight-checkpoint tracking (verification denominator)

1. Existing live board/schema and signed function baseline — **VERIFIED**.
2. Read-only dependency drift preflight — **VERIFIED** (10/10 checks).
3. Split Stage A/Stage B source implementation — **IMPLEMENTED** (6/6 isolated contract checks).
4. Nondestructive emergency-disable candidate and retention tests — **CI PASS evidenced by run #12**; actual production disable not executed.
5. Revised disposable PostgreSQL CI and regression — **CI PASS evidenced by run #12 screenshot** (individual steps not independently audited).
6. Stage A explicit production permission/schema approval and activation — **VERIFIED** (migration history and read-only grant/RLS verification).
7. Stage B explicit production write-grant approval and activation — **PENDING**.
8. Genuine signed-session production operational acceptance — **PENDING**.

**The initial CP-TL-03C preparation did not modify production. Following separate authorization and user confirmation of backup availability, Stage A was subsequently applied. Stage B, document mutations, and role changes were NOT performed.**

## Stage A production activation evidence — 2026-11-05 Asia/Manila

- **Authorization:** separate user approval of CP-TL-03C Stage A production schema/RLS/read permissions had already been obtained; the user subsequently confirmed backup availability in the existing Supabase Dashboard. Recoverability was **user-confirmed**, not independently demonstrated by a restored backup.
- **Immediately before migration:** reran the exact `sql/tests/cp-tl03c-production-readiness.sql` against the existing project. Result: `PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_STILL_REQUIRED`; all ten expected scope/dependency checks matched; `changed_dependencies=[]`. Previous migration ledger had 161 entries and no CP-TL-03C activation.
- **Migration operation:** used the connected Supabase `apply_migration` method with the exact committed SQL from `sql/cp-tl03-staged-domain.sql` (Git blob `57a37d7ecab183cd2f548b3b53b70bd44fce2ec3`), name `cp_tl03c_stage_a_readonly_domain_activation`. Returned `{"success":true}`.
- **Recorded migration:** `20261105011611`, `cp_tl03c_stage_a_readonly_domain_activation`, confirmed in Supabase migration history (162 entries).
- **Post-activation acceptance:** the approved read-only `sql/tests/cp-tl03c-stage-a-readonly.sql` check completed without exception. An independent SQL read then confirmed:
  - Two new tables exist, both with RLS enabled and policy `private.tl03_can_manage(board_id)` for authenticated SELECT.
  - `authenticated`: EXECUTE on read/list RPCs **true**; EXECUTE on both public and private commit RPCs **false**.
  - `anon`: EXECUTE on read and commit RPCs **false**.
  - `authenticated`: SELECT on documents **true** with RLS; direct INSERT, UPDATE and audit-event INSERT **false**.
  - Both document and audit-event counts **zero**.
  - Existing board remains active with eight legacy columns and zero records; no operational data imported.
- **Security advisor:** unchanged existing project-wide advisory classes were observed; no new CP-TL-03 function/table warnings singled out in the retrieved advisor summary.
- **Not verified:** authenticated browser request with genuine nonbootstrap/manager user, session revocation production test, backup restoration rehearsal. No test user/record created.

**Stage A = ACTIVATED AND STRUCTURALLY VERIFIED. Stage B = DISABLED, STILL REQUIRES A SEPARATE PRODUCTION WRITE-PERMISSION APPROVAL.**
