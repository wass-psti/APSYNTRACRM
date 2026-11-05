-- CP-WS-02B — REVIEW-ONLY replacement for unsafe legacy account triggers.
-- Never apply to production without a separately approved security migration,
-- preserved rollback source, verified signup/invitation admission and backup.
-- Requires the dormant private ws02 Main Workspace provisioning contract.
-- No existing account, platform role, workspace, membership or board is altered.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('private.ws02_new_account_admissions') IS NULL
  OR to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NULL
  OR to_regprocedure('public.handle_new_user()') IS NULL
  OR to_regprocedure('public.sync_profile_email_verification()') IS NULL
  OR to_regprocedure('public.ensure_default_workspace_membership()') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgname='on_auth_user_created' AND NOT tgisinternal
    AND tgrelid='auth.users'::regclass)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgname='zz_on_auth_user_verification_sync' AND NOT tgisinternal
    AND tgrelid='auth.users'::regclass)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgname='profiles_default_workspace_membership' AND NOT tgisinternal
    AND tgrelid='public.profiles'::regclass)
 THEN RAISE EXCEPTION 'WS02B expected legacy trigger architecture missing'
   USING ERRCODE='42501';
 END IF;
END $pre$;

-- Preserve the trigger name/contract while preventing any new signup from
-- being silently admitted to the existing shared primary workspace.
-- Intentionally no-op; a later separately approved cleanup may drop the
-- obsolete trigger when signed admission is independently accepted.
CREATE OR REPLACE FUNCTION public.ensure_default_workspace_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $noop$
BEGIN
 RETURN NEW;
END $noop$;
REVOKE ALL ON FUNCTION public.ensure_default_workspace_membership()
 FROM PUBLIC,anon,authenticated;

-- Hardened account-creation path. New users start with employee platform role
-- (never email-derived admin). Unverified/anonymous users remain pending and
-- receive no board/workspace membership or module roles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $new_user$
DECLARE
 v_email text:=pg_catalog.lower(coalesce(NEW.email,''));
 v_verified boolean:=NEW.email_confirmed_at IS NOT NULL AND NEW.is_anonymous IS FALSE;
 v_name text:=pg_catalog.left(coalesce(
  pg_catalog.nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'display_name'),''),
  pg_catalog.split_part(v_email,'@',1)
 ),120);
BEGIN
 INSERT INTO public.profiles(
  id,email,display_name,platform_role,status,email_verified_at
 ) VALUES(
  NEW.id,v_email,v_name,'employee',
  CASE WHEN v_verified THEN 'active' ELSE 'pending' END,
  NEW.email_confirmed_at
 )
 ON CONFLICT(id) DO NOTHING;

 -- Only genuinely new verified-email signup flow can mark an account for
 -- independent Main provisioning. Existing accounts are never backfilled.
 IF NEW.is_anonymous IS FALSE THEN
  INSERT INTO private.ws02_new_account_admissions(user_id)
  VALUES(NEW.id) ON CONFLICT(user_id) DO NOTHING;
  IF v_verified THEN
   PERFORM private.ws02_provision_main_workspace(NEW.id);
  END IF;
 END IF;
 RETURN NEW;
END $new_user$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;

-- Executed after initial signup or email-confirmation updates. Only the new
-- admission marker may transition a newly verified PENDING account to ACTIVE.
-- Do not override a suspended/disabled status or modify an existing user's
-- platform role, ownership, memberships or workspace data.
CREATE OR REPLACE FUNCTION public.sync_profile_email_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $verified$
DECLARE
 v_admitted boolean;
 v_verified boolean:=NEW.email_confirmed_at IS NOT NULL AND NEW.is_anonymous IS FALSE;
BEGIN
 SELECT EXISTS(SELECT 1 FROM private.ws02_new_account_admissions
  WHERE user_id=NEW.id) INTO v_admitted;
 UPDATE public.profiles p
 SET email=pg_catalog.lower(coalesce(NEW.email,p.email)),
  email_verified_at=NEW.email_confirmed_at,
  status=CASE WHEN v_admitted AND v_verified AND p.status='pending'
   THEN 'active' ELSE p.status END,
  updated_at=now()
 WHERE p.id=NEW.id;

 IF v_admitted AND v_verified THEN
  PERFORM private.ws02_provision_main_workspace(NEW.id);
 END IF;
 RETURN NEW;
END $verified$;
REVOKE ALL ON FUNCTION public.sync_profile_email_verification()
 FROM PUBLIC,anon,authenticated;

-- No sign-up provider setting, webhook, user insertion, migration backfill,
-- membership grant or client RPC enablement is changed by this candidate.
COMMIT;
