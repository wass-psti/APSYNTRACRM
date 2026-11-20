-- CP-CRM-WORKSPACE-INVITE-01D: pre-invitation staging-only account foundation.
-- Run ONLY against the existing isolated staging branch after TWO users have
-- genuinely verified and signed in with GoTrue. No Auth table inserts/updates.
-- Required psql -v inviter_email=... -v recipient_email=... .
-- This makes no invitations, provider calls or role/permission grants.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
SELECT pg_catalog.set_config('ws02d.staging_inviter_email', pg_catalog.lower(pg_catalog.btrim(:'inviter_email')), true);
SELECT pg_catalog.set_config('ws02d.staging_recipient_email', pg_catalog.lower(pg_catalog.btrim(:'recipient_email')), true);
DO $guard$
DECLARE
 inviter_email text:=current_setting('ws02d.staging_inviter_email');
 recipient_email text:=current_setting('ws02d.staging_recipient_email');
BEGIN
 IF current_database() NOT IN ('postgres','ws02d_onboarding_disposable')
  OR to_regclass('private.ws02d_invitations') IS NULL
  OR to_regclass('private.ws01_member_roles') IS NULL
  OR to_regclass('private.ws01_workspace_policy') IS NULL
  OR to_regclass('public.workspace_members') IS NULL
  OR to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
  OR inviter_email=recipient_email
  OR inviter_email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$'
  OR recipient_email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$'
  OR (SELECT count(*) FROM auth.users)<>2
  OR (SELECT count(*) FROM public.profiles)<>0
  OR (SELECT count(*) FROM public.workspaces)<>0
  OR (SELECT count(*) FROM public.workspace_members)<>0
  OR (SELECT count(*) FROM private.ws02d_invitations)<>0
  OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id) IS DISTINCT FROM false
  OR (SELECT creation_enabled=false AND selection_enabled=false FROM private.ws01_lifecycle_flags WHERE id) IS DISTINCT FROM true
 THEN RAISE EXCEPTION '01D onboarding denied: nonempty/unexpected stage or invalid identities' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM auth.users u
     WHERE pg_catalog.lower(u.email) IN(inviter_email,recipient_email)
      AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
                  AND (s.not_after IS NULL OR s.not_after>now())))<>2
 THEN RAISE EXCEPTION '01D onboarding denied: two distinct genuinely verified signed GoTrue users required' USING ERRCODE='42501'; END IF;
END $guard$;
DO $bootstrap$
DECLARE
 owner_id uuid;
 recipient_id uuid;
 owner_workspace uuid:=gen_random_uuid();
 recipient_workspace uuid:=gen_random_uuid();
BEGIN
 SELECT id INTO STRICT owner_id FROM auth.users
 WHERE pg_catalog.lower(email)=current_setting('ws02d.staging_inviter_email');
 SELECT id INTO STRICT recipient_id FROM auth.users
 WHERE pg_catalog.lower(email)=current_setting('ws02d.staging_recipient_email');
 INSERT INTO public.profiles(id,email,email_verified_at,status)
 SELECT u.id,u.email,u.email_confirmed_at,'active' FROM auth.users u
 WHERE u.id IN(owner_id,recipient_id);
 INSERT INTO public.workspaces(id,name) VALUES
  (owner_workspace,'Staging Inviter Workspace'),
  (recipient_workspace,'Staging Recipient Workspace');
 INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES(owner_workspace,owner_id,true),(recipient_workspace,recipient_id,true);
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES(owner_workspace,owner_id,'owner'),(recipient_workspace,recipient_id,'owner');
 INSERT INTO private.ws01_workspace_policy(workspace_id,privacy,created_by)
 VALUES(owner_workspace,'closed',owner_id),(recipient_workspace,'closed',recipient_id);
 IF public.current_workspace_id(owner_id) IS DISTINCT FROM owner_workspace
  OR public.current_workspace_id(recipient_id) IS DISTINCT FROM recipient_workspace
 THEN RAISE EXCEPTION '01D onboarding failed workspace isolation'; END IF;
 RAISE NOTICE '01D staging: two signed verified identities provisioned in separate personal workspaces';
END $bootstrap$;
COMMIT;
