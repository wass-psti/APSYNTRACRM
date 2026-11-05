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
  OR to_regclass('private.ws02_activation_flags') IS NOT NULL
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

-- Staged migration is fail-closed. Changing the existing auth.users trigger
-- while a client signup API is reachable must NEVER open signup by accident.
-- Separate production enablement requires explicit approval and a verified
-- activation step; neither UI toggles nor installation enables this flag.
CREATE TABLE private.ws02_activation_flags (
 id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
 signup_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.ws02_activation_flags(id,signup_enabled) VALUES(true,false);
ALTER TABLE private.ws02_activation_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02_activation_flags FROM PUBLIC,anon,authenticated;

-- The current production profiles_status_check only accepts active/disabled.
-- Add an explicit PENDING state; never reuse DISABLED for unverified signup,
-- because a later verification callback must not reenable suspended accounts.
DO $status_preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.profiles'::regclass
   AND c.conname='profiles_status_check'
   AND c.contype='c')
 THEN RAISE EXCEPTION 'Expected profile status constraint missing'
  USING ERRCODE='42501'; END IF;
END $status_preflight$;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
 CHECK(status IN ('active','disabled','pending'));

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
  nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'display_name'),''),
  pg_catalog.split_part(v_email,'@',1)
 ),120);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.ws02_activation_flags
   WHERE id IS TRUE AND signup_enabled IS TRUE)
 THEN RAISE EXCEPTION 'Self-service registration not activated'
  USING ERRCODE='42501'; END IF;

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
 v_signup_enabled boolean;
BEGIN
 SELECT signup_enabled INTO v_signup_enabled
 FROM private.ws02_activation_flags WHERE id IS TRUE;
 SELECT EXISTS(SELECT 1 FROM private.ws02_new_account_admissions
  WHERE user_id=NEW.id) INTO v_admitted;
 UPDATE public.profiles p
 SET email=pg_catalog.lower(coalesce(NEW.email,p.email)),
  email_verified_at=NEW.email_confirmed_at,
  status=CASE
   WHEN v_admitted AND p.status='disabled' THEN 'disabled'
   WHEN v_admitted AND v_verified AND v_signup_enabled AND p.status='pending' THEN 'active'
   WHEN v_admitted AND NOT v_verified AND p.status='active' THEN 'pending'
   ELSE p.status END,
  updated_at=now()
 WHERE p.id=NEW.id;

 -- Re-verification restores only a legitimate pending account. A disabled
 -- account must not be provisioned or accidentally reactivated.
 IF v_admitted AND v_verified AND v_signup_enabled AND EXISTS(
  SELECT 1 FROM public.profiles p
  WHERE p.id=NEW.id AND p.status='active'
 ) THEN
  PERFORM private.ws02_provision_main_workspace(NEW.id);
 END IF;
 RETURN NEW;
END $verified$;
REVOKE ALL ON FUNCTION public.sync_profile_email_verification()
 FROM PUBLIC,anon,authenticated;

-- No sign-up provider setting, webhook, user insertion, migration backfill,
-- membership grant or client RPC enablement is changed by this candidate.
COMMIT;
