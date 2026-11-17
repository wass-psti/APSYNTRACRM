# CP-URM-FUELTRANS-ACTIVATE-01 — Production RPC activation and signed runtime

## Activation evidence — 2026-11-17 UTC / 2026-11-18 Asia/Manila

Target: existing Supabase project `jtlusodorfnyzgyuewkz`. No new project.

Authorized production migration `20261117160134_cp_urm_fueltrans_activate01_workspace_role_rpcs`
was successfully applied through the existing Supabase connection, using the
reviewed, isolated-PostgreSQL-tested SQL from PR #520
(`sql/cp-urm-fueltrans-workspace-role-candidate.sql`).

The migration creates ONLY:

- `public.apsyntra_role_fueltrans_workspace_snapshot(uuid)`
- `public.apsyntra_role_fueltrans_workspace_set(uuid,uuid,text,boolean,timestamptz)`

Both reuse the existing CRM workspace scope guard. Execution is granted to
`authenticated` and not `anon` or `PUBLIC`. No new schema, tables, RLS
policies, project, identities, or global application-role assignments were
created. The corresponding SQL is now recorded in the canonical migrations
directory under the **exact version applied**.

## Production readback

Immediately after activation, PostgreSQL catalog readback verified both RPC
signatures, `SECURITY DEFINER` and pinned search paths, and the intended
execute privileges. The membership and audit counts did not change:

- `fueltrans_memberships`: 2 before and after activation
- global FuelTrans `module_role_assignments`: 0 before and after
- FuelTrans application role-change request/audit: 0 before and after

## Genuine signed browser readback

The user's existing authenticated Chromium APSYNTRA CRM session was opened at
`#/user-role-management`. A cache-busted reload confirmed:

- The platform panel now displays `Assigned workspace role` and
  `WatchdogWorkspace identity (not an assignment)` distinctly
- The selected eligible target's FuelTrans Assign/Change button is enabled
  with no missing-RPC warning or error banner
- Clicking Assign/Change opens the existing role editor, offering the seven
  supported source roles: `admin`, `fueltrans`,
  `watchdog_employee`, `global_l1_support`, `local_l2_support`,
  `call_center_specialist`, and `viewer`
- The dialog was **cancelled**, without submitting any role change

This verifies signed source availability and working UI interaction, NOT a
real production write or persistent production reassignment.

## Pending final mutation acceptance

Real production assignment/reassignment/revoke and audit readback requires
an **explicitly designated disposable test member in the selected workspace**.
Do not change an ordinary employee's operational FuelTrans membership just to
fulfill an acceptance test, and do not create or elevate production identities.
No such identity was designated during this milestone.

The SQL lifecycle previously passed in an isolated PostgreSQL 17 environment
(including source persistence, cross-workspace isolation, CAS and audit).
Real production writes remain **PENDING**, not falsely marked complete.

## Follow-up

CP-URM-FUELTRANS-ACCEPT-02 — Designated signed test-account assignment,
reassignment, revocation, persisted workspace readback and audited final
acceptance, with no unrelated module/permission changes.
