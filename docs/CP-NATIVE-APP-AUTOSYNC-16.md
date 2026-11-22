# CP-NATIVE-APP-AUTOSYNC-16 — Canonical writer compatibility in the staging clone

## Disposition

Existing-module canonical role-writer integration implemented and verified in an isolated database. Genuine signed three-profile QA, the full CRM staging backend and a newly registered module-specific writer remain blocked.

## Implementation

The CP15 runner exports the existing staging Auth/public/private schema and creates an isolated nonproduction PostgreSQL clone. With the CP16_LOCAL_WRITER_PROBE=1 opt-in, the clone imports the existing local canonical CRM tables public.wm_workspace_application_roles and public.wm_application_role_audit, plus the original is_platform_admin, wm_reject_application_audit_mutation and wm_admin_set_application_role functions. Source schemas, foreign keys, checks, RLS, indexes and immutable audit trigger are preserved. The absent platform_role field is added only to clone profiles using the existing CRM role vocabulary. None of these modifications touch the remote staging or production database.

This intentionally tests TimeTracker, an existing application with explicitly defined Employee and Supervisor roles. It does not claim an arbitrary registered module can be assigned. There are no new authorization restrictions or new Supabase projects.

## Executed local tests

Three synthetic non-login profile rows and one workspace originate from the CP15 fixture; separate PostgreSQL connections then execute the original canonical writer and verify:
- Assignment to TimeTracker Employee and independent authoritative role/audit readback.
- Update to Supervisor and denial of an arbitrary module ID and fake TimeTracker role.
- Unauthenticated-request denial and append-only audit rejection.
- Revocation and final independent readback of a disabled assignment with grant/change/revoke audit history.

The synthetic test injects a local request.jwt.claim.sub setting; it does not generate legitimate GoTrue sessions or prove signed browser acceptance. The CP15 teardown removes the whole clone, all synthetic identities, temporary table/function definitions and exported schema files. Source data is unchanged.

## Outstanding external acceptance

Existing staging remains a partial workspace/invitation backend: two real Auth users, two workspace memberships, no tracked migrations, no Boards/module assignment store, and no role snapshot/catalog RPCs. Three independent signed QA browser endpoints were unavailable. Therefore full staging backend installation, legitimate administrator-plus-two-member signed workflows, new-module-specific writer and independently signed bulk/individual persistence cannot be certified.

Keep existing draft PR #760 unmerged and production unchanged.

## Next milestone if blocked

CP-NATIVE-APP-AUTOSYNC-17 — Compatible CRM Baseline Recovery in the Existing Staging Clone, Genuine Three-Profile GoTrue QA Enrollment, and Explicit New-Module Writer Acceptance.
