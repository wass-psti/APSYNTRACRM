-- CP-WS-02B — idempotent personal Main Workspace provisioning.
-- Disposable PostgreSQL 17 ONLY, no real users or production accounts.
\set ON_ERROR_STOP on
DO $preflight$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NULL
  OR (SELECT count(*) FROM public.workspaces)<>2
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
  OR (SELECT count(*) FROM private.ws02_new_account_admissions)<>0
  OR (SELECT count(*) FROM private.ws02_personal_workspaces)<>0
  OR has_function_privilege('authenticated',
      'private.ws02_provision_main_workspace(uuid)','EXECUTE')
  OR has_function_privilege('anon',
      'private.ws02_provision_main_workspace(uuid)','EXECUTE')
  OR has_table_privilege('authenticated','private.ws02_personal_workspaces','SELECT')
  OR has_table_privilege('authenticated','private.ws02_new_account_admissions','INSERT')
 THEN RAISE EXCEPTION 'WS02B synthetic default-deny fixture unavailable'
  USING ERRCODE='42501'; END IF;
END $preflight$;

BEGIN;
-- Existing legacy profiles must never acquire a new workspace during migration.
DO $legacy$
BEGIN
 BEGIN
  PERFORM private.ws02_provision_main_workspace(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
  RAISE EXCEPTION 'Existing account was silently provisioned'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $legacy$;

-- Simulate the future hardened new-registration marker for an existing
-- synthetic fixture profile that currently has no memberships.
INSERT INTO private.ws02_new_account_admissions(user_id)
 VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

DO $first$
DECLARE first_result jsonb; replay jsonb; ws uuid;
BEGIN
 first_result:=private.ws02_provision_main_workspace(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 replay:=private.ws02_provision_main_workspace(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 ws:=(first_result->>'workspaceId')::uuid;
 IF first_result->>'idempotent'<>'false'
  OR first_result->>'membershipActive'<>'true'
  OR replay->>'idempotent'<>'true'
  OR replay->>'workspaceId'<>ws::text
 THEN RAISE EXCEPTION 'Idempotent personal workspace provisioning failed'; END IF;
 IF (SELECT count(*) FROM public.workspaces WHERE id=ws AND name='Main Workspace')<>1
  OR (SELECT count(*) FROM public.workspace_members
       WHERE workspace_id=ws AND user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        AND active IS TRUE)<>1
  OR (SELECT count(*) FROM private.ws01_workspace_policy
       WHERE workspace_id=ws AND privacy='closed')<>1
  OR (SELECT count(*) FROM private.ws01_member_roles
       WHERE workspace_id=ws AND user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
       AND relation='owner')<>1
  OR (SELECT count(*) FROM private.ws02_personal_workspaces
       WHERE workspace_id=ws)<>1
  OR (SELECT count(*) FROM private.ws02_provision_events
       WHERE workspace_id=ws AND action='workspace.main.provisioned')<>1
  OR (SELECT platform_role FROM public.profiles
      WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>'employee'
 THEN RAISE EXCEPTION 'Main workspace ownership, audit or role invariant failed'; END IF;
 -- Deliberately disable membership: replay must not silently restore access.
 UPDATE public.workspace_members SET active=false
 WHERE workspace_id=ws
   AND user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 replay:=private.ws02_provision_main_workspace(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 IF replay->>'idempotent'<>'true'
  OR replay->>'membershipActive'<>'false'
  OR EXISTS(SELECT 1 FROM public.workspace_members
     WHERE workspace_id=ws AND user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
       AND active IS TRUE)
 THEN RAISE EXCEPTION 'Provisioning retry revived revoked membership'; END IF;
END $first$;

-- Verification is mandatory. A later verified retry is recoverable.
INSERT INTO auth.users(id,email_confirmed_at,is_anonymous) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff',NULL,false),
 ('99999999-9999-4999-8999-999999999999',now(),true);
INSERT INTO public.profiles(id,status) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','active'),
 ('99999999-9999-4999-8999-999999999999','active');
INSERT INTO private.ws02_new_account_admissions(user_id) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff'),
 ('99999999-9999-4999-8999-999999999999');

DO $denied_before_verification$
BEGIN
 BEGIN
  PERFORM private.ws02_provision_main_workspace(
   'ffffffff-ffff-4fff-8fff-ffffffffffff');
  RAISE EXCEPTION 'Unverified account was provisioned' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM private.ws02_provision_main_workspace(
   '99999999-9999-4999-8999-999999999999');
  RAISE EXCEPTION 'Anonymous account was provisioned' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02_personal_workspaces)<>1
  OR (SELECT count(*) FROM private.ws02_provision_events)<>1
 THEN RAISE EXCEPTION 'Rejected registration created provisioning records'; END IF;
END $denied_before_verification$;

UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff';
DO $verified_recovery$
DECLARE result jsonb;
BEGIN
 result:=private.ws02_provision_main_workspace(
  'ffffffff-ffff-4fff-8fff-ffffffffffff');
 IF result->>'idempotent'<>'false'
  OR result->>'membershipActive'<>'true'
  OR (SELECT count(*) FROM private.ws02_personal_workspaces)<>2
  OR (SELECT count(*) FROM private.ws02_provision_events)<>2
  OR (SELECT count(*) FROM public.workspaces)<>4
 THEN RAISE EXCEPTION 'Verified-email recovery provisioning failed'; END IF;
END $verified_recovery$;

-- No changes to production equivalents, including legacy workspace scope.
ROLLBACK;

DO $rollback$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR (SELECT count(*) FROM public.workspaces)<>2
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
  OR (SELECT count(*) FROM private.ws02_new_account_admissions)<>0
  OR (SELECT count(*) FROM private.ws02_personal_workspaces)<>0
  OR (SELECT count(*) FROM private.ws02_provision_events)<>0
  OR (SELECT count(*) FROM private.ws01_events)<>0
  OR (SELECT count(*) FROM private.ws01_member_roles)<>0
  OR (SELECT count(*) FROM private.ws01_workspace_policy)<>0
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
  OR (SELECT creation_enabled OR selection_enabled
      FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
 THEN RAISE EXCEPTION 'WS02B fixture rollback/regression failed'; END IF;
 RAISE NOTICE 'CP-WS-02B isolated provisioning and rollback PASS';
END $rollback$;
