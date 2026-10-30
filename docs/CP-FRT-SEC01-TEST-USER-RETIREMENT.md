# CP-FRT-SEC01 — Test-User Retirement and Central Role Authority

**Scope:** APSYNTRA CRM centralized authorization + separate legacy Fund Released Tracker code repository.
**Date:** October 30, 2026.

## Verified inventory

- The [legacy FRT repository](https://github.com/wass-psti/Fund-Released-Tracker) still had four hardcoded `@aps.local` demonstration logins with a common example password, `db:seed` script, and a duplicate `/admin/users` role editor. It is a standalone historical reference, **not** the approved APSYNTRA CRM native runtime.
- Source removals are staged under [legacy FRT security branch](https://github.com/wass-psti/Fund-Released-Tracker/tree/security/frt-retire-demo-users-central-admin). The seed script, role-management editor, role-change endpoints and demo login defaults/UI were removed without editing finance workflow routes.
- **Important:** Legacy independent email/password/JWT authentication and its local `users` table still exist as compatibility code because eliminating them without a completed native FRT runtime would disable remaining legacy operational routes. That is a remaining blocker to claiming full single-auth compliance. The legacy service must not be deployed for new production activity.
- Four separate FRT QA-only Auth identities exist in the central Supabase project. They are not the four `@aps.local` demo accounts. They have four Auth sessions, one QA-workspace membership each, four FRT QA memberships, zero authoritative module roles, zero board memberships and zero finance requests/audit records. These Auth sessions and the QA workspace are still necessary to finish the **cross-workspace portion of Phase A CP-A12.2**, which has not yet been accepted. As a safety precondition, this checkpoint **did not delete the four Auth users or their dependent membership/session records**.
- Primary-workspace legitimate `frt_memberships`, `frt_companies`, and all FRT domain tables remain intact. Existing FRT requests, comments, liquidation and audit history were left unchanged.

## Server-side central governance changes

The script `sql/cp-frt-sec01-bootstrap-role-governance.sql` modifies only three existing functions, using their real original definitions:

- `frt_admin_set_role`: requires the existing signed bootstrap identity and authoritative active workspace, and forbids self-/platform-admin/other bootstrap targets.
- `frt_admin_users`: former FRT `GENERAL_MANAGER` access is insufficient; only the centrally verified bootstrap administrators can view administrative account-role lists.
- `wm_admin_set_application_role`: only the two centrally verified bootstrap administrators can perform any module-role change, including FRT changes through the new User Role Management UI.
- Original domain roles (`GENERAL_MANAGER`, `FINANCE_MANAGER`, `FINANCE_APPROVER`, `REQUESTOR`), finance operations, module assignment storage and audit writes are preserved.
- The functions have explicitly revoked anonymous/PUBLIC EXECUTE and require server validation on signed calls. No parallel authorization store or second login is introduced to APSYNTRA CRM.

## Outstanding acceptance and deletion gates

1. Independent signed nonbootstrap direct-RPC rejection and authorized bootstrap role-change acceptance, including persistence/revocation, protected accounts and audit correlation.
2. Finish CP-A12.2 secondary-workspace signed read/write-denial acceptance **before retiring the only verified QA identities available for those tests**.
3. Determine if the older Railway PostgreSQL instance still contains rows created by `db:seed` and whether any old user ID is referenced by operational requests, approvals, attachments or audit. There is no verified connected Railway database here; **no deletion of that database was performed**.
4. After genuine acceptance, remove only verified QA-owned Supabase memberships/sessions/identities using supported Auth-admin lifecycle tools and independent pre/post database and audit review. Do not directly delete from `auth.users` via raw SQL or cascade unrelated records.
5. Implement and certify native FRT request/approval/liquidation workflows inside APSYNTRA CRM and retire the legacy separate JWT/API/database runtime. Until then the one-backend final objective remains **PENDING**.

**Release restriction:** Both source branches are unmerged; do not merge into `main` without explicit approval.
