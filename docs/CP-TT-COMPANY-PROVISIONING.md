# Single-company TimeTracker provisioning and scoped directory

## Deployment and security boundary

Migration 20261125120000 corrects the target employee's workspace resolution for the signed TimeTracker directory, department assignment, manual clock-in and automatic clock-out eligibility. It deliberately leaves signed caller authorization, existing sessions, GPS, audit and scheduler activation unchanged. Other module directories retain their prior logic.

The new provisioning policy is OFF by default. Before enabling it, verify in the actual Supabase Auth settings that public signup, anonymous sign-in and any public identity-provider self-provisioning are disabled, and that only authorized administrators create new users. The legacy database admission flag alone does not establish that external Auth policy. A confirmed email is not proof of admin creation. If that prerequisite cannot be guaranteed, do not activate this mode; a trusted app-metadata approval or admin-only provisioning endpoint is needed instead.

After a disposable integration test and production migration approval, an authorized database operator may enable the private configuration for the company workspace using the actual authorized platform administrator's ID and a new activation timestamp. Never set this for historical users. Verify the administrator is active in the configured company workspace. Do not change the public signup settings or scheduler automatically in this migration.

Example activation (replace the placeholder with the verified assigning administrator UUID; execute only after the prerequisites):
```sql
UPDATE private.ws02_company_provisioning_config
SET enabled=true, assigned_by='<verified-admin-uuid>'::uuid,
    activated_at=clock_timestamp()
WHERE id IS TRUE AND enabled=false;
```

Newly admitted, verified non-admin profiles created after activation receive an active company membership, member relation, CRM employee role and TimeTracker Employee role atomically. The existing personal workspace provisioning path remains for historical admissions or when the policy is disabled. No existing accounts or assignments are modified or backfilled. Reverification does not recreate a revoked membership. Existing multi-workspace users must select their company workspace using the signed workspace selector, if enabled; this migration does not alter session authority or choose a workspace for an existing user.

Rollback of future provisioning: set enabled=false in the private configuration. Existing successfully provisioned users retain their assignments and do not get a new personal workspace from later verification.

## Acceptance gates (disposable Supabase, never production test data)

1. Apply the full migration chain, including 882 and 883 migrations, then this migration. Confirm all function definitions compile, grants remain restricted, and the manifest hash is correct.
2. Create two workspace fixtures with a target whose oldest membership is personal. Assign company Employee permissions and confirm a signed System Admin in the company can list and assign their department; normal employee directory remains self-only. Confirm inactive, disabled, revoked, wrong-workspace, and role-ceiling-denied targets are excluded. Preserve unrelated modules.
3. With provisioning off, confirm the original new-user lifecycle; with it on in an isolated admin-only Auth project, create a new confirmed user, and separately verify an admitted pending account. Confirm exactly one company membership, correct default roles, no personal workspace, no overwrite, and repeat verification does not restore a revoked membership. Confirm existing users untouched and anonymous/public creation denied by the actual Auth configuration.
4. Sign in as the new Employee; verify company context, TimeTracker access, department assignment, employee clock-in, admin manual clock-out, employee Start Session after signed synchronization, employee second clock-in and ordinary clock-out. Validate manual clock-in and scheduler eligibility separately; do not activate production scheduler.
5. Leave the admin Directory visible; provision or deactivate a fixture user and observe signed refresh within the next eligible 30-second polling cycle or window focus. Verify no refresh during editing or hidden views, no stale response after route/account/workspace changes, no attendance mutation, and no GPS prompt.
6. Verify the previous Clock polling, OJT, RBAC and full frontend regression suite. No production deployment until all checks pass.

## Scope limitations

The directory uses signed polling, not Realtime table subscriptions. The new default grants TimeTracker only, not other applications. Departments remain admin-assigned. This change does not change login UI, existing personal workspaces, workspace selection feature flags or automatic clock-out activation. The existing test account has already been assigned its company role and is a good regression target, but still needs the correct signed workspace context when logging in.

Static source regression checks do not substitute for disposable PostgreSQL/Auth and browser acceptance tests.
