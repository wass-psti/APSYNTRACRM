# CP-WS-01C/B1 — controlled production additive-schema readiness

**Status (2026-11-05): VERIFIED preflight + disposable CI, production DDL NOT AUTHORIZED / NOT EXECUTED.**

## Scope

Target the **existing** Supabase project `jtlusodorfnyzgyuewkz` only. This is an incremental, additive, **B1-only** schema preparation gate for the multi-workspace management model. It is not a production creation, discovery, or switching release.

B1's exact migration source is:

- `sql/cp-ws01b-lifecycle-contract-candidate.sql` — creates **only** six RLS-protected private tables (`ws01_workspace_policy`, `ws01_member_roles`, `ws01_create_requests`, `ws01_session_choices`, `ws01_lifecycle_flags`, `ws01_events`), their constraints and indexes, deny-by-default table/sequence grants, and one flags row with `creation_enabled=false`, `selection_enabled=false`. Existing `public.workspaces`, `public.workspace_members`, `public.profiles`, `auth.sessions`, and `public.current_workspace_id` are neither replaced nor populated/modified.
- No new public or private lifecycle function or RPC is created in B1.
- `sql/tests/cp-ws01c-b1-schema-acceptance.sql` — nonmutating postactivation invariant check. Verifies exactly six private RLS tables, no direct anon/authenticated access, no table policies, flags off, all B1 domain tables otherwise empty, **no** discovery/create/select RPC, and reports current-workspace authority fingerprint and row counts.
- `sql/tests/cp-ws01c-b1-production-preflight.sql` — nonmutating production readiness check *before any migration*.

Subsequent stages require **separate** approvals and acceptance: B2 = signed membership discovery `sql/cp-ws01-discovery-activation-candidate.sql` (new authenticated EXECUTE grant); B3 = creation helper/RPC `sql/cp-ws01c-b3-create-contract-candidate.sql` (no write grant yet, later separate grant/flag); B4 = `sql/cp-ws01b-session-cutover-candidate.sql` (central `current_workspace_id` replacement, membership-revocation trigger, session-switching activation; higher risk because 62 function definitions reference the current authority). The B1 deploy must **not** concatenate or run these later candidates.

## Evidence and invariants

**Source and disposable CI:**

- CP-WS-01B original contract/full lifecycle disposable acceptance completed green in [Actions run #21](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41964302674) (19/19 Node).
- Refactored **B1-only** CI stages passed in [Actions run #24](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41965512158) and [run #25](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41965646257). The workflow installs B1 alone, **executes the standalone B1 postcheck before B2/B3**, then stages B2 discovery, dormant B3 creation, inactive B4 cutover, default-deny acceptance, and full synthetic signed-session lifecycle checks. The testing project is a disposable PostgreSQL 17 service, **not** production Supabase.
- B1 source was split from the previously broad lifecycle candidate so that no future creation function can be installed as an unintended part of B1. CI and source regression assert that six private tables and six RLS enables exist while no lifecycle RPCs are present at the isolated B1 stage.

**Read-only live production preflight**, on 2026-11-05:

`sql/tests/cp-ws01c-b1-production-preflight.sql` returned
`B1_SCHEMA_READY__SEPARATE_PRODUCTION_APPROVAL_AND_BACKUP_EVIDENCE_REQUIRED`.

| Verified production datum | Value |
| --- | --- |
| Private schema + existing workspaces/memberships/profiles/auth.sessions | Present |
| Existing signed session guard and `current_workspace_id(uuid)` | Present |
| Six B1 tables and all staged WS01 lifecycle functions | Absent as expected |
| Switching membership trigger | Absent as expected |
| Existing workspaces | 2 |
| Active membership records | 40 |
| Existing function definitions referencing `current_workspace_id` | 62 |
| Authority function fingerprint `md5(pg_get_functiondef(...))` | `ceb6a14da8c7c8ed46187bae4833d575` |
| Direct authenticated workspace/membership INSERT | Denied |
| B1 readiness | **SCHEMA READY; APPROVAL/BACKUP EVIDENCE PENDING** |

No new production SQL DDL/DML, grants, role changes, session modifications, membership assignments, or test data was executed during this readiness gate. Existing Table/Function security advisor findings were surveyed, not altered.

## B1 production activation procedure — NOT EXECUTED

All prerequisites must be fulfilled **before** production migration invocation:

1. **Separate explicit production schema-change approval scoped to B1 only**. General standing engineering authorization is not sufficient for new production tables/functions/permissions. This approval does not cover B2, B3, or B4.
2. **Current usable backup/restore point** for the existing Supabase project, with a recorded confirmation of restorable scope/retention. Prior Stage A backup confirmation is not assumed sufficient for B1, and independent restore capability was not established here.
3. Rerun the committed B1 read-only preflight immediately before execution; it must report `B1_SCHEMA_READY__SEPARATE_PRODUCTION_APPROVAL_AND_BACKUP_EVIDENCE_REQUIRED`, with no drift/collisions. Confirm the exact reviewed migration content and Git commit/sha.
4. Only then apply **exactly** the B1 SQL as a named, ledger-recorded production migration (using the approved Supabase migration action), retaining its atomic `BEGIN/COMMIT`. Never run B2 discovery, B3 creation, or B4 switching during this step.
5. Run `sql/tests/cp-ws01c-b1-schema-acceptance.sql` read-only. Verify all checks succeed, flags are both false, original workspaces and membership counts match the immediately preceding preflight, and authority fingerprint remains `ceb6a14da8c7c8ed46187bae4833d575` (or whichever fingerprint was independently recorded on the fresh preflight). Confirm only B1 appeared in the migration ledger.
6. Recheck that board loading and existing GoTrue authorization remain unchanged. Any failure stops progression and preserves the disabled state. A B1 schema-only pass is **not** signed-production acceptance of B2/B3/B4.

**Recovery boundary:** Migration application is one PostgreSQL transaction, so a failed migration rolls back its own uncommitted DDL. If successfully committed but later found defective, **do not automatically drop tables** or destroy evidence. Keep the zero-grant, disabled flags posture; investigate and obtain separate authorization before any destructive rollback. Later-stage activations must not proceed until B1 is verified.

## Current disposition

- B1 migration candidate: **IMPLEMENTED and isolated**.
- Production prerequisite inspection: **VERIFIED PASS**.
- Disposable B1 schema and full lifecycle runtime: **VERIFIED PASS** in independent Actions runs.
- Backup/restore readiness for this new production change: **PENDING independent confirmation**.
- Separate B1 production schema-change approval: **PENDING**.
- Production B1 migration/postactivation acceptance: **NOT EXECUTED / PENDING**.
- B2/B3/B4 activation: **DISABLED / OUT OF B1 SCOPE**.

## Final disposable run and production safety boundary — 2026-11-05

**Verified latest B1-isolated CI:** [CP-WS-01B/01C run #26](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41965781675), head commit `ac32683995fa3837e6512b0317eab8298524553e`, **completed / success**. GitHub run metadata, job steps and log output were independently read:

- Native `node --test`: **20 passed / 0 failed**.
- B1-only SQL postcheck: `CP-WS-01C/B1 six private RLS tables, no direct grants, disabled flags, zero new RPCs PASS`.
- Read-only B1 postcheck report: `B1_ONLY_POSTCHECK_PASS__NO_PUBLIC_LIFECYCLE_RPC`, with the disposable fixture's two workspaces and five memberships unchanged and both lifecycle flags false.
- Subsequent B2/B3/B4 disposable-only contract installation, preactivation denial, full signed-user workspace isolation/revocation acceptance: **PASS**.
- Workflow stages and job result: **all success**. No production Supabase writes.

**B1 production go/no-go:** **NO-GO for execution until separate approval and current backup/restore evidence are secured.** Preflight/readiness/isolated CI are **GO**. The existing project has no installed B1 objects, no newly granted lifecycle RPCs, and no session-authority cutover. Never interpret the green disposable workflow as signed production acceptance or production permission to apply schema changes.
