-- CP-WS-02B controlled transaction: explicit user production authorization and recovery risk exception.
-- Do not restore original unsafe Auth triggers while direct signup remains accessible.
-- Installation keeps private WS02 signup admission disabled until a separate verified activation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
DO $ws02b_baseline$
BEGIN
 IF md5(pg_get_functiondef('public.handle_new_user()'::regprocedure))
      <> '89efd34397c75bb0a823d19c2dbeed75'
    OR md5(pg_get_functiondef('public.ensure_default_workspace_membership()'::regprocedure))
      <> 'a8b4fff0e5bd27acbb16e3aab3768a25'
    OR md5(pg_get_functiondef('public.sync_profile_email_verification()'::regprocedure))
      <> '51a5b28aa039e72a1485726071d465fe'
    OR to_regclass('private.ws02_activation_flags') IS NOT NULL
    OR to_regclass('private.ws02_personal_workspaces') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02B preflight: unexpected production Auth baseline'
   USING ERRCODE='42501'; END IF;
END $ws02b_baseline$;
-- BEGIN SOURCE: sql/cp-ws02b-main-provisioning-candidate.sql
-- CP-WS-02B: private, dormant Main Workspace provisioning contract.
-- DISPOSABLE TEST / REVIEW CANDIDATE ONLY.
-- DO NOT run against production before replacing legacy signup/role/membership
-- triggers, approved onboarding-policy migration and signed-user validation.
-- This candidate does NOT install an auth.users trigger or grant client EXECUTE.
DO $pre$
BEGIN
 IF to_regclass('private.ws01_workspace_policy') IS NULL
  OR to_regclass('private.ws01_member_roles') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regclass('auth.users') IS NULL
  OR to_regclass('private.ws02_new_account_admissions') IS NOT NULL
  OR to_regclass('private.ws02_personal_workspaces') IS NOT NULL
  OR to_regclass('private.ws02_provision_events') IS NOT NULL
  OR to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02B unavailable dependencies or migration collision'
  USING ERRCODE='42501';
 END IF;
END $pre$;

-- Only a hardened future signup trigger may mark genuinely new identities.
-- No historical users are inserted or retroactively marked eligible.
CREATE TABLE private.ws02_new_account_admissions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.ws02_personal_workspaces (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE RESTRICT,
 provisioned_at timestamptz NOT NULL DEFAULT now()
);
-- Signup verification may run before an authenticated GoTrue browser session
-- exists; never forge a session_id in the older ws01_events ledger.
CREATE TABLE private.ws02_provision_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action='workspace.main.provisioned'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,action)
);
CREATE INDEX ws02_provision_events_user_time ON
 private.ws02_provision_events(user_id,occurred_at DESC);

ALTER TABLE private.ws02_new_account_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02_personal_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02_provision_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.ws02_new_account_admissions,
 private.ws02_personal_workspaces,private.ws02_provision_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws02_provision_events_id_seq
 FROM PUBLIC,anon,authenticated;

-- Trusted trigger/backend-only helper: no API client may call it.
-- An admission entry is created ONLY for new signup under the future
-- hardened registration trigger. Existing user accounts have no such entry.
CREATE FUNCTION private.ws02_provision_main_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $provision$
DECLARE
 v_existing uuid;
 v_workspace uuid;
 v_profile text;
 v_active boolean;
BEGIN
 IF p_user_id IS NULL
  OR NOT EXISTS (
   SELECT 1 FROM private.ws02_new_account_admissions a
   WHERE a.user_id=p_user_id
  )
  OR NOT EXISTS (
   SELECT 1 FROM auth.users u
   WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL
    AND u.is_anonymous IS FALSE
  )
 THEN RAISE EXCEPTION 'Main Workspace provisioning denied'
  USING ERRCODE='42501'; END IF;

 -- Row lock serializes concurrent verification/recovery for this one account.
 SELECT p.status INTO v_profile FROM public.profiles p
 WHERE p.id=p_user_id FOR UPDATE;
 IF v_profile IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Active verified profile required'
   USING ERRCODE='42501';
 END IF;

 SELECT l.workspace_id INTO v_existing
 FROM private.ws02_personal_workspaces l
 WHERE l.user_id=p_user_id;
 IF FOUND THEN
  -- Never reactivate an intentionally removed workspace membership.
  SELECT m.active INTO v_active FROM public.workspace_members m
  WHERE m.workspace_id=v_existing AND m.user_id=p_user_id;
  RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
   'workspaceId',v_existing,'idempotent',true,
   'membershipActive',coalesce(v_active,false));
 END IF;

 v_workspace:=gen_random_uuid();
 INSERT INTO public.workspaces(id,name)
 VALUES(v_workspace,'Main Workspace');
 INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES(v_workspace,p_user_id,true);
 INSERT INTO private.ws01_workspace_policy(workspace_id,privacy,created_by)
 VALUES(v_workspace,'closed',p_user_id);
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES(v_workspace,p_user_id,'owner');
 INSERT INTO private.ws02_personal_workspaces(user_id,workspace_id)
 VALUES(p_user_id,v_workspace);
 INSERT INTO private.ws02_provision_events(workspace_id,user_id,action)
 VALUES(v_workspace,p_user_id,'workspace.main.provisioned');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'workspaceId',v_workspace,'idempotent',false,'membershipActive',true);
END $provision$;
REVOKE ALL ON FUNCTION private.ws02_provision_main_workspace(uuid)
 FROM PUBLIC,anon,authenticated;
-- No trigger, authenticated function grant, or existing-account backfill.
-- END SOURCE: sql/cp-ws02b-main-provisioning-candidate.sql

-- BEGIN SOURCE: sql/cp-ws02b-self-service-auth-trigger-candidate.sql
-- CP-WS-02B — REVIEW-ONLY replacement for unsafe legacy account triggers.
-- Never apply to production without a separately approved security migration,
-- preserved rollback source, verified signup/invitation admission and backup.
-- Requires the dormant private ws02 Main Workspace provisioning contract.
-- No existing account, platform role, workspace, membership or board is altered.
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

-- Privileged recovery hook for a verified new account whose admission was
-- paused during a disabled/signup-off window or interrupted verification.
-- Default-deny, NEVER available through a signed browser or public API.
CREATE FUNCTION private.ws02_reconcile_verified_admission(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $repair$
DECLARE v_status text;
BEGIN
 IF p_user_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM private.ws02_activation_flags
    WHERE id IS TRUE AND signup_enabled IS TRUE)
  OR NOT EXISTS(SELECT 1 FROM private.ws02_new_account_admissions
    WHERE user_id=p_user_id)
  OR NOT EXISTS(SELECT 1 FROM auth.users
    WHERE id=p_user_id AND email_confirmed_at IS NOT NULL
     AND is_anonymous IS FALSE
     AND NULLIF(pg_catalog.btrim(email),'') IS NOT NULL)
 THEN RAISE EXCEPTION 'Verified account reconciliation denied'
   USING ERRCODE='42501'; END IF;

 SELECT status INTO v_status FROM public.profiles
 WHERE id=p_user_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'pending'
  AND v_status IS DISTINCT FROM 'active'
 THEN RAISE EXCEPTION 'Disabled or missing profile cannot be reconciled'
  USING ERRCODE='42501'; END IF;

 IF v_status='pending' THEN
  UPDATE public.profiles p SET status='active',
   email_verified_at=(SELECT email_confirmed_at FROM auth.users WHERE id=p_user_id),
   updated_at=now()
  WHERE p.id=p_user_id AND p.status='pending';
 END IF;
 -- Unique ledger and active-profile lock ensure exactly one workspace,
 -- without restoring a membership that was deliberately disabled.
 RETURN private.ws02_provision_main_workspace(p_user_id);
END $repair$;
REVOKE ALL ON FUNCTION private.ws02_reconcile_verified_admission(uuid)
 FROM PUBLIC,anon,authenticated;

-- No sign-up provider setting, webhook, user insertion, migration backfill,
-- membership grant or client RPC enablement is changed by this candidate.
-- END SOURCE: sql/cp-ws02b-self-service-auth-trigger-candidate.sql

-- End single atomic installation; admission flag defaults to false.
COMMIT;
