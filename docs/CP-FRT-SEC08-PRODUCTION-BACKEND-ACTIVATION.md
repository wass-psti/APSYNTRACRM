# CP-FRT-SEC08 — Production Backend Activation and Authorization Evidence

**Date:** 2026-10-31 (Asia/Manila)  
**Project:** WatchdogWorkspace Supabase (`jtlusodorfnyzgyuewkz`) and `wass-psti/APSYNTRACRM`  
**Baseline frontend:** PR #12 merged to `main` at `4bd9cd6a5f94db1f88976a94e892ae65316f2034`  
**Scope:** Production CRM role-cap schema/function activation. No actual user platform-role assignments or changes were made.

## Production migrations: applied and independently read back

| Sequence | Supabase migration | Applied version | Result |
| --- | --- | --- | --- |
| 1 | `cp_frt_sec08_crm_platform_role_activation` | `20261031012212` | SUCCESS |
| 2 | `cp_frt_sec08_frt_domain_role_ceiling` | `20261031012226` | SUCCESS |

The first migration applies the exact repo file `sql/cp-frt-sec06-crm-platform-role-cap.sql`; the second applies `sql/cp-frt-sec06-domain-role-ceiling.sql`, both from the verified merged `main` SHA. The SQL files passed the prior isolated PostgreSQL 17 integration tests. No role-assignment seed, financial mutation, login change, or destructive table modification was included.

**Safety baseline captured before deployment:** the exact live `pg_get_functiondef` source for the four replaced authorization resolvers (`private.frt_current_role`, `public.has_module_access`, `public.module_role_for`, `public.work_board_access`) was committed as `sql/cp-frt-sec08-rollback-original-resolvers.sql` before either migration ran. That rollback SQL has **not** been executed; it now aborts automatically if any explicit CRM role override exists, preventing accidental removal of active permission ceilings. Use it only with separate change-control authorization if recovery is required.

## Verified production read-only database acceptance

| Invariant | Result |
| --- | --- |
| CRM role table | INSTALLED |
| Snapshot and setter RPCs | INSTALLED |
| CRM effective/explicit role helpers | INSTALLED |
| FRT role resolver integrates explicit CRM cap/rank | YES |
| Module resolver and board guard integrate CRM cap | YES |
| New explicit CRM override rows | **0** |
| Central module-role assignment rows | 121 |
| Board-member rows | 75 |
| FRT membership rows | 3 |
| Protected bootstrap identities | 2 |
| Central role-change audit rows | 0 |
| Boards | 74 |
| Board events | 15,469 |
| RLS enabled and forced on CRM role table | YES / YES |
| Direct `authenticated` CRM role-table SELECT / UPDATE | DENIED / DENIED |
| Direct `anon` CRM role-table SELECT | DENIED |
| Authenticated EXECUTE on CRM snapshot/setter RPC | GRANTED (bootstrap guard required) |
| Authenticated EXECUTE on internal effective/explicit role helpers | DENIED |
| Unexpected effective tier among 39 active workspace memberships | 0 |
| Effective roles changed among 118 active-profile module assignments | **0** |
| Unexpected module denial in those 118 assignments | **0** |

Inherited role tiers resolved to 3 Admin, 2 Supervisor and 34 Employee across 39 active workspace memberships. The 59 pre-existing employee-owned boards remain grandfathered because no explicit CRM overrides were added.

The counts above are **observations**, not a claim that all application workflows or every browser session has been certified. An additional three central assignments belong to profiles outside the active-profile role comparison and were not modified.

## Security advisories and deliberate RPC boundary

Supabase security advisors flagged the new table as RLS-without-policy (informational) and the CRM snapshot/setter as privileged `SECURITY DEFINER` functions executable by `authenticated` (warning). This is the current **intentional** RPC-only design: the table is not directly granted to clients; functions execute with the database owner and begin with the existing `apsyntra_role_require_scope(p_workspace_id)` guard, which checks the actual signed `auth.uid()`, current workspace, and protected bootstrap identity.

This static review is **not equivalent to a genuine nonbootstrap HTTP 403 test**; that must be completed from actual signed user sessions. See Supabase linter reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Completion/verification matrix

| Acceptance requirement | Evidence classification |
| --- | --- |
| Pre-deployment live inventory and function rollback capture | VERIFIED |
| Two production migrations in correct order | VERIFIED |
| PostgreSQL schema and API-function existence | VERIFIED |
| Direct table security, row security, function grants | VERIFIED |
| FRT/module/board resolver installation | VERIFIED |
| No existing module-role changes in active comparison; no seeded overrides | VERIFIED |
| Existing SEC03 bootstrap (7/7) and nonbootstrap (5/5) | VERIFIED only from prior operator-submitted pre-activation sessions |
| NEW SEC07 bootstrap signed read-only run | PENDING |
| NEW SEC07 nonbootstrap signed read-only run | PENDING |
| CRM role assign/edit/revoke, CAS audit correlation and new session effect | PENDING; explicitly approved nonproduction workflow required |
| Real FRT finance CRUD, approval, liquidation and attachment regression | PENDING |
| Canonical Mac localhost 5173 `/api/v1/boards` and 12-board native integration | BLOCKED by lack of host access |
| True second-workspace authorization isolation | BLOCKED by only one workspace with active memberships |
| Production-ready final acceptance | PENDING |

## Minimal remaining genuine signed-user acceptance

The deployed `https://wass-psti.github.io/APSYNTRACRM/#/security` page includes **Verify signed CRM platform-role backend** from CP-FRT-SEC07:

1. Existing bootstrap administrator signs in and runs the CP07 read-only check. Copy the built-in **nonsecret SEC07 result**; require `scenario: BOOTSTRAP`, `status: PASS`, all checks PASS and `writesAttempted: 0`.
2. Sign out, then an existing nonbootstrap user signs in and repeats. Require `scenario: NONBOOTSTRAP`, `status: PASS`; both central administrative RPC snapshots must report genuine server denial. HTTP 404 or missing RPC never counts as a pass.
3. Confirm original CP03 signed FRT read-only check still passes for both sessions to detect regression.
4. Do not paste tokens, user UUIDs, emails or personal finance data. Only the provided sanitized result should be shared.
5. Only then plan specific nonproduction permitted role mutation/fresh-session/audit evidence. Do **not** mutate live legitimate employee roles just to demonstrate acceptance.

**Rollback trigger:** any unexpected denial, cross-workspace read, stale-audit inconsistency, unauthorized role edit, user-access regression or source-domain authorization bypass should block acceptance; investigate and use controlled recovery if justified. The rollback artifact is not automatically deployed.

**Final:** Production **backend schema activation** is verified, but signed-user and operational **acceptance is not complete**. No merge of this evidence branch into `main` was performed.
