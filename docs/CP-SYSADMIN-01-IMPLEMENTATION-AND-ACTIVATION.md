# CP-SYSADMIN-01 — APSYNTRA System Admin role (review candidate)

**Status: UI and source contract implemented; production authorization NOT activated.**

The new role is a global, explicit administrative designation, not a department, job title, CRM admin tier, or TimeTracker application role. Candidate SQL: sql/cp-system-admin-role-CANDIDATE-NOT-APPLIED.sql. Do not apply this file to a live project before authorized testing.

## Design

1. Only an authenticated System Admin or one of the existing fixed bootstrap identities can explicitly grant/revoke System Admin. Designations: trusted_it or general_manager. A signed, actor-attributed audit record and substantive reason are mandatory. No initial assignments are seeded, including for the CEO or any new IT employee.
2. Session, active profile, exact signed workspace membership, revision, target, and permissions are checked by the PostgreSQL RPC. The user interface does not infer authority or make direct table writes. A same-account grant, last-System-Admin revoke, protected bootstrap revoke, stale update or foreign-workspace target is denied.
3. The User Role Management screen includes a System Admin tab with one selected-account view, disabled actions when the RPC has not been activated, and signed readback after any authorized change.
4. The role is global, but current cross-workspace restrictions and domain-specific permissions are preserved. The staged authorization update recognizes System Admin as a CRM administrator inside their active workspace, not as a blanket bypass of finance, HR, approvals, Storage RLS or every application's backend.
5. Board Invite now uses an editable text field rather than a native search input, removing its unnecessary built-in clear X while retaining the popup close X.

## Production activation gates

- Verify the existing signed session helper, function definitions, AUTH/RLS policy scopes, Security Definer ownership, grants, backup and rollback.
- Exercise the staged SQL in disposable PostgreSQL 17. Negative cases: ordinary new IT employee, inactive/foreign/self target, revoked session, expired bearer, concurrent grants/revokes, replay, stale revision and last administrator.
- Require genuine signed two-account tests and an independent high-risk security review. Require MFA or fresh high-assurance reauthentication before privileged grants and recovery.
- Inventory and adapt all relevant domain guards for the desired administrative powers: workspace provisioning, board admin, CRM platform configuration, TimeTracker, financial approvals, HR data, TradeLink, file access and any privileged integrations. No unreviewed service-role or RLS bypass.
- Only after a controlled rollout, explicitly appoint named trusted IT admins and the General Manager. Verify system-wide administrative actions and rapid revocation under real sessions.

**Not complete until activation:** broad full application authority, real role assignments, signed MFA, production database deployment and full cross-domain authorization evidence. This implementation is staged rather than making an unapproved production privilege change.

## Frontend acceptance

Run: node --test frontend/tests/system-admin-role.test.mjs frontend/tests/user-role-access-flow.test.mjs frontend/tests/board-invite-header.test.mjs
Run: npm run build
