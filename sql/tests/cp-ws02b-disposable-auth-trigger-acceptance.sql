-- CP-WS-02B — synthetic signup/verification trigger replacement acceptance.
-- Executes only in disposable PostgreSQL 17; all new user writes rolled back.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NULL
  OR (SELECT count(*) FROM public.workspaces)<>2
  OR (SELECT count(*) FROM private.ws02_new_account_admissions)<>0
  OR (SELECT count(*) FROM private.ws02_personal_workspaces)<>0
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
  OR pg_get_functiondef(to_regprocedure('public.handle_new_user()'))
      LIKE '%admin_general_manager%'
  OR pg_get_functiondef(to_regprocedure('public.ensure_default_workspace_membership()'))
      LIKE '%INSERT INTO public.workspace_members%'
 THEN RAISE EXCEPTION 'WS02B replacement trigger preflight failed'
   USING ERRCODE='42501'; END IF;
END $pre$;

BEGIN;
-- Unverified new account: PENDING profile and no automatically joined workspace.
INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
 VALUES('77777777-7777-4777-8777-777777777777',
  'new-account@example.invalid',NULL,false,'{"display_name":"New Account"}'::jsonb);
DO $unverified$
BEGIN
 IF (SELECT status FROM public.profiles
  WHERE id='77777777-7777-4777-8777-777777777777')<>'pending'
 OR NOT EXISTS(SELECT 1 FROM private.ws02_new_account_admissions
  WHERE user_id='77777777-7777-4777-8777-777777777777')
 OR EXISTS(SELECT 1 FROM public.workspace_members
  WHERE user_id='77777777-7777-4777-8777-777777777777')
 OR EXISTS(SELECT 1 FROM private.ws02_personal_workspaces
  WHERE user_id='77777777-7777-4777-8777-777777777777')
 THEN RAISE EXCEPTION 'Unverified signup was admitted or joined shared legacy workspace'; END IF;
END $unverified$;

-- Confirmation creates one independent Main Workspace with an Owner role.
UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='77777777-7777-4777-8777-777777777777';
DO $confirmed$
DECLARE ws uuid;
BEGIN
 SELECT workspace_id INTO STRICT ws
 FROM private.ws02_personal_workspaces
 WHERE user_id='77777777-7777-4777-8777-777777777777';
 IF (SELECT status FROM public.profiles
     WHERE id='77777777-7777-4777-8777-777777777777')<>'active'
 OR (SELECT platform_role FROM public.profiles
     WHERE id='77777777-7777-4777-8777-777777777777')<>'employee'
 OR (SELECT name FROM public.workspaces WHERE id=ws)<>'Main Workspace'
 OR (SELECT count(*) FROM public.workspace_members
     WHERE user_id='77777777-7777-4777-8777-777777777777')<>1
 OR (SELECT count(*) FROM public.workspace_members
     WHERE user_id='77777777-7777-4777-8777-777777777777'
      AND workspace_id=ws AND active)<>1
 OR (SELECT count(*) FROM private.ws01_member_roles
     WHERE user_id='77777777-7777-4777-8777-777777777777'
      AND workspace_id=ws AND relation='owner')<>1
 OR (SELECT count(*) FROM private.ws02_provision_events
     WHERE user_id='77777777-7777-4777-8777-777777777777'
      AND workspace_id=ws)<>1
 THEN RAISE EXCEPTION 'New account Main Workspace not created correctly'; END IF;
END $confirmed$;

-- A redundant verified callback is idempotent, never creates another workspace.
UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='77777777-7777-4777-8777-777777777777';
DO $replayed_confirmation$
BEGIN
 IF (SELECT count(*) FROM private.ws02_personal_workspaces
     WHERE user_id='77777777-7777-4777-8777-777777777777')<>1
 OR (SELECT count(*) FROM private.ws02_provision_events
     WHERE user_id='77777777-7777-4777-8777-777777777777')<>1
 THEN RAISE EXCEPTION 'Repeated verification duplicated personal workspace'; END IF;
END $replayed_confirmation$;

-- A once-verified newly admitted account must lose server-side B2 workspace
-- access when its email becomes unverified. The membership stays intact
-- for an idempotent restoration after verification.
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('77777777-0000-4000-8000-000000000001',
  '77777777-7777-4777-8777-777777777777',NULL);
UPDATE auth.users SET email_confirmed_at=NULL
 WHERE id='77777777-7777-4777-8777-777777777777';
DO $unverified_again$
BEGIN
 IF (SELECT status FROM public.profiles
  WHERE id='77777777-7777-4777-8777-777777777777')<>'pending'
  OR (SELECT count(*) FROM private.ws02_personal_workspaces
      WHERE user_id='77777777-7777-4777-8777-777777777777')<>1
 THEN RAISE EXCEPTION 'Revoked verification did not fail closed'; END IF;
END $unverified_again$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '77777777-7777-4777-8777-777777777777',false);
SELECT set_config('request.jwt.claim.session_id',
 '77777777-0000-4000-8000-000000000001',false);
DO $read_denial$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Unverified profile accessed signed workspace discovery'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $read_denial$;
RESET ROLE;

UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='77777777-7777-4777-8777-777777777777';
DO $restored_verification$
BEGIN
 IF (SELECT status FROM public.profiles
  WHERE id='77777777-7777-4777-8777-777777777777')<>'active'
 OR (SELECT count(*) FROM private.ws02_personal_workspaces
     WHERE user_id='77777777-7777-4777-8777-777777777777')<>1
 OR (SELECT count(*) FROM private.ws02_provision_events
     WHERE user_id='77777777-7777-4777-8777-777777777777')<>1
 THEN RAISE EXCEPTION 'Reverification created duplicates or was not restored'; END IF;
END $restored_verification$;

-- An intentionally disabled user cannot be revived by email verification
-- or provisioning retries. This must not make Auth updates fail.
UPDATE public.profiles SET status='disabled'
 WHERE id='77777777-7777-4777-8777-777777777777';
UPDATE auth.users SET email_confirmed_at=NULL
 WHERE id='77777777-7777-4777-8777-777777777777';
UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='77777777-7777-4777-8777-777777777777';
DO $disabled_stays_disabled$
BEGIN
 IF (SELECT status FROM public.profiles
  WHERE id='77777777-7777-4777-8777-777777777777')<>'disabled'
  OR (SELECT count(*) FROM private.ws02_provision_events
      WHERE user_id='77777777-7777-4777-8777-777777777777')<>1
 THEN RAISE EXCEPTION 'Disabled user reactivated by verification callback'; END IF;
END $disabled_stays_disabled$;

-- Even a newly verified signup with legacy bootstrap-style email
-- must be an employee, not a platform administrator.
INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous)
 VALUES('88888888-8888-4888-8888-888888888888',
  'legacy.bootstrap@example.invalid',now(),false);
DO $bootstrap_email_denial$
DECLARE ws uuid;
BEGIN
 SELECT workspace_id INTO STRICT ws
 FROM private.ws02_personal_workspaces
 WHERE user_id='88888888-8888-4888-8888-888888888888';
 IF (SELECT platform_role FROM public.profiles
     WHERE id='88888888-8888-4888-8888-888888888888')<>'employee'
 OR (SELECT count(*) FROM public.workspace_members
     WHERE user_id='88888888-8888-4888-8888-888888888888'
      AND workspace_id=ws AND active)<>1
 OR (SELECT count(*) FROM public.workspace_members
     WHERE user_id='88888888-8888-4888-8888-888888888888'
       AND workspace_id='00000000-0000-4000-8000-000000000001')<>0
 THEN RAISE EXCEPTION 'New signup gained global admin or shared legacy membership'; END IF;
END $bootstrap_email_denial$;

-- An anonymous Auth identity cannot receive a new admission marker/workspace.
INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous)
 VALUES('66666666-6666-4666-8666-666666666666',
  'anonymous@example.invalid',now(),true);
DO $anonymous$
BEGIN
 IF EXISTS(SELECT 1 FROM private.ws02_new_account_admissions
  WHERE user_id='66666666-6666-4666-8666-666666666666')
 OR EXISTS(SELECT 1 FROM public.workspace_members
  WHERE user_id='66666666-6666-4666-8666-666666666666')
 OR (SELECT status FROM public.profiles
  WHERE id='66666666-6666-4666-8666-666666666666')<>'pending'
 THEN RAISE EXCEPTION 'Anonymous signup acquired workspace admission'; END IF;
END $anonymous$;

-- Historical users are not backfilled or reclassified on email verification.
UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $legacy_unchanged$
BEGIN
 IF (SELECT platform_role FROM public.profiles
     WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
     <>'admin_general_manager'
 OR EXISTS(SELECT 1 FROM private.ws02_new_account_admissions
     WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 OR (SELECT count(*) FROM public.workspace_members
     WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
       AND workspace_id='00000000-0000-4000-8000-000000000001'
       AND active)<>1
 THEN RAISE EXCEPTION 'Legacy existing account was backfilled or role changed'; END IF;
 IF (SELECT count(*) FROM private.ws02_personal_workspaces)<>2
 OR (SELECT count(*) FROM private.ws02_provision_events)<>2
 OR (SELECT count(*) FROM public.workspaces)<>4
 THEN RAISE EXCEPTION 'Unexpected duplicate workspace creation'; END IF;
END $legacy_unchanged$;

ROLLBACK;
DO $rollback$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM private.ws02_new_account_admissions)<>0
 OR (SELECT count(*) FROM private.ws02_personal_workspaces)<>0
 OR (SELECT count(*) FROM private.ws02_provision_events)<>0
 OR (SELECT count(*) FROM public.profiles)<>5
 OR (SELECT count(*) FROM private.ws01_events)<>0
 THEN RAISE EXCEPTION 'WS02B signup fixture rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02B signup replacement, verification, role and rollback PASS';
END $rollback$;
