# CP-TT-OJT-MANUAL-01 — Missing-clock-in records

This adds a **System Admin-only** signed, administrator-attested creation path for shared-login OJT interns in **TimeTracker → Logs**. Interns continue to clock in with their own selected name and browser GPS. The manual form is not available to OJT Employee, HR, Supervisor or IT Administrator roles.

The form requires an active, authorized OJT roster name, verified work location, actual Clock-In timestamp in Philippine Time, mandatory 10–500 character incident reason and an optional Clock-Out timestamp. The note is mandatory for Offsite (Home) and optional elsewhere. Blank Clock-Out means active session, subject to the existing server-side nine-hour OJT automatic clock-out.

Migration `20261124120000_cp_tt_ojt_manual_attendance_create.sql` introduces `entry_source` with default `app` for historical records, an admin-only RPC, and allowlisted `manualEntry` in signed OJT reads. Manual records explicitly mark GPS as `not_captured` and attribute creation to the administrator, not to the intern. Inserts and append-only before/after audit happen atomically. An identical UUID request is idempotent for network retries; conflicting UUID reuse or overlapping shifts is rejected. Neither the standard employee attendance source nor database permissions are broadened.

The existing Log entry correction and delete actions can manage these new OJT records. No historical attendance row is rewritten.

## Verification and production readiness

This PR **does not deploy to production**. Run the frontend test and TimeTracker integration suite. In a disposable Supabase environment test authorized and denied roles, concurrent records under one shared login, idempotent retry, overlapping shifts, manual/auto clock-out, admin edits, audit immutability, and readback to Logs. Before production deployment take normal backups and preview the exact pending migrations with `npx supabase db push --include-all --dry-run --remote`. Do not push if unrelated or unexpected migrations are listed.

**Scope note:** Standard employee records are stored in the separate TimeTracker module-state/board-projection contract. This first migration intentionally handles **shared-login OJT records only**; do not write fake standard employee GPS records to simulate an app clock-in.
