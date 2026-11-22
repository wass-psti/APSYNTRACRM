# CP-TT-OJT — Shared OJT login with dropdown-selected intern attendance

## Objective
Keep the existing Supabase Auth account ojt@watchdogautomation.com.ph and
let IT/Admin manage individual intern names inside TimeTracker → Employees.
The shared account remains the only Auth identity; each intern is a
TimeTracker-only attendance subidentity, not a separate APSYNTRA user.

## Workflow
1. A signed TimeTracker System Admin or IT Administrator enables the
   existing OJT shared login from TimeTracker → Employees → OJT Interns.
2. IT/Admin adds each intern's name, edits names when needed, and activates or
   deactivates profiles. No PIN or password is created for an intern.
3. An intern signs in with the existing company OJT email and opens TimeTracker.
4. Before starting attendance, the intern selects their name from the active
   intern dropdown. The selection is required; no name is inferred from the
   shared email.
5. The server validates the selected intern belongs to the designated shared
   account, workspace and TimeTracker board. Clock-in and clock-out records
   store that intern ID, while the signed OJT account remains the actor.
6. An active session must be ended before its intern profile or the shared
   login can be deactivated. Historical attendance is retained. The intern name is captured on each clock-in record, so later roster renames do not rewrite historical attendance.

## Database deployment
Apply these migrations in order:
1. 20261123100000_cp_tt_ojt_shared_identities.sql
2. 20261123130000_cp_tt_ojt_employee_department_identity.sql
3. 20261123140000_cp_tt_ojt_dropdown_identity.sql

The third forward migration removes the initial PIN hashes, lockout columns,
bearer-session table and PIN/session RPCs. It replaces them with signed
server-side RPCs that accept an intern ID and validate its ownership and
active status. GitHub merging does not deploy SQL. Review and validate the
migration sequence before production deployment; do not run an unrestricted
migration repair or database reset.

## Security and data rules
- The backend validates the exact designated user ID, company email,
  confirmed email, active profile and workspace membership, Employee
  TimeTracker role, and OJT department.
- Only TimeTracker System Admin / IT Administrator (or the existing bootstrap
  administrator) can manage the OJT roster.
- The roster and attendance tables remain private. Clients cannot directly
  insert or update intern or attendance rows; signed RPCs enforce scope.
- Clock-in/clock-out use server timestamps, fresh GPS evidence, the existing
  location rules, and the Offsite (Home) work-note requirement.
- A unique partial index permits only one active session per intern. Advisory
  locks serialize attendance writes against profile deactivation and shared
  login disable.
- An append-only audit records the signed actor, intern and attendance action.
- Legacy shared-account writes to the ordinary TimeTracker attendance JSON
  state remain blocked. Other employees and other APSYNTRA applications are
  unchanged.

## Important identity limitation
Dropdown selection is self-identification, not proof of who is physically
using the shared account. Anyone who can sign in with the shared OJT email
can select any active intern name. This is the deliberate trade-off for the
requested no-PIN workflow. If intern-level identity assurance is later
required for payroll or compliance, use individual Auth accounts or add a
separate verification factor.

## Existing integration limits
- OJT attendance remains in dedicated private TimeTracker tables. It is shown
  in the OJT administrator attendance table and the selected intern's Clock
  history; it is not automatically included in the legacy Overview, Reports,
  My Hours or automatic nine-hour clock-out/overtime processing.
- OJT sessions must be ended manually. Administrators should review active
  sessions before deactivating an intern or disabling the shared login.
- The administrator attendance table currently displays the latest 100 rows;
  older rows remain stored.

## Review checks
- Admin-only add/edit/activate/deactivate and group enable/disable.
- Dropdown exposes active names only and rejects unknown, inactive,
  cross-workspace, cross-board or cross-account intern IDs.
- Clock-in cannot run without a selected intern; clock-out is bound to the
  same intern's active record.
- Deactivation and shared-login disable fail while an active session exists.
- No PIN prompt, PIN column, lockout field, bearer token or intern Auth account.
- Existing non-OJT TimeTracker and other APSYNTRA applications remain unchanged.
- Review mobile layout, keyboard use and screen-reader labels.
