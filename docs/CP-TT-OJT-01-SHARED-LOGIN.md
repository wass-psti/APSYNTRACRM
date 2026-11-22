# CP-TT-OJT-01 — Shared OJT login, distinct intern identities

## Objective
Use **one existing Supabase OJT user / email address** for OJT interns,
but give each intern their own *PIN-verified* TimeTracker identity and
attendance history. This lowers the number of Supabase Auth accounts and
auth-generated verification/password-reset emails. It does **not** itself
reduce all SMTP service traffic or replace staff email addresses.

## Activation (staging before production)
1. Apply \`20261123100000_cp_tt_ojt_shared_identities.sql\` in a reviewed
   Supabase staging environment (pgcrypto and existing TimeTracker migrations
   required). This PR does **not** automatically deploy the migration.
2. Confirm the existing shared email account is an **active workspace member**
   with the centralized TimeTracker module role **OJT**. Do not give it
   System Admin or IT Administrator roles.
3. As a signed TimeTracker System Admin or IT Administrator, open
   **TimeTracker → Employees → OJT shared login & intern profiles**.
   Choose the existing OJT account and enable shared login.
4. Add one profile per real intern. Enter a full name and an **8–12 digit,
   individual, nonrepeating PIN**. Never share the PIN; give it privately.
5. Sign in with the company's existing OJT email using the normal APSYNTRA
   login, choose a name, verify the PIN, and clock in/out. GPS is requested
   only after clicking Start or End. Offsite (Home) requires a work note.
6. Review each profile's record in the **Recent intern attendance** table.
   Disable departed interns; rotate a PIN when necessary.

## Security and data rules
- One Supabase auth identity is shared; intern profiles are *subidentities*,
  not new \`auth.users\`, \`profiles\` or full APSYNTRA accounts.
- Selecting a name does not authorize attendance. The backend verifies a
  slow-hashed individual PIN, rate-limits failed attempts, issues an 8-hour
  high-entropy opaque bearer, binds it to the signed auth user / workspace /
  board / intern, and revokes earlier sessions on re-verification, PIN rotation
  and group disable.
- No PIN, PIN hash, bearer, or GPS coordinate is returned by administrative
  list endpoints. The browser holds the bearer **in memory only**; browser
  restart and sign-out require selection and PIN entry again.
- Clock-in and clock-out transactions verify the bearer again on the server.
  A unique partial index prohibits overlapping active sessions per intern.
  Server time is authoritative. An append-only audit records the signed
  account and verified intern identity.
- Existing legacy personal TimeTracker attendance writes from designated
  shared accounts are blocked by a trigger. Ordinary employees and their
  existing TimeTracker attendance data are unchanged.
- Shared-email access is inherently weaker than individual Auth accounts,
  even with PINs: physical device access or shared email compromise affects
  the entire OJT cohort. **For higher-assurance payroll use, give each person
  an individual login or SSO identity.**

## Limits of this initial integration
- OJT attendance uses **separate, workspace-scoped private tables**, with
  a read-only administrator view in Employees. It does not represent an
  intern as an ordinary \`auth.users\` account or add OJT records into the
  legacy \`module_state_entries\` aggregate used by all other TimeTracker
  reports. That integration would require scoped projection changes.
- Existing automatic nine-hour clockout and ordinary employee overtime
  processing do not apply to these dedicated OJT records. Interns must
  clock out manually; administrators should monitor incomplete sessions.
- Current administrative OJT report shows the latest 100 records. Older
  data remains in PostgreSQL. Dedicated export/pagination can be added later.
- Security, operational and cross-workspace/identity tests against a real
  disposable Supabase environment are required before production deployment.

## Review checks
- Confirm unauthorized normal users cannot manage groups, intern profiles,
  or read any intern's records.
- Confirm the OJT login cannot use normal TimeTracker Clock to impersonate
  the shared Auth account once configured.
- Verify wrong PIN / 5-attempt lockout, token revocation, logout, cross-user,
  cross-workspace, cross-board, disabled intern, active duplicate, stale GPS,
  invalid location, and server-authoritative timestamps.
- Review mobile layout, navigation, keyboard use and screen-reader labels.
- Do not merge before green CI and manual staging checks.
