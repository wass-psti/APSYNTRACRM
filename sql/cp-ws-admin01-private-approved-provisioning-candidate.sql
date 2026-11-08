-- CP-WS-ADMIN-01 — review candidate only. DO NOT APPLY TO PRODUCTION WITHOUT
-- SEPARATE AUTHORIZATION OF AUTH TRIGGER/PERMISSION CHANGES.
-- Replaces self-service admission with one-use, service_role-staged approval.
-- Former public signup stays denied even if GoTrue "allow signup" is enabled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
BEGIN
 IF to_regclass('private.ws02_activation_flags') IS NULL
  OR (SELECT signup_enabled FROM private.ws02_activation_flags WHERE id IS TRUE) IS DISTINCT FROM false
  OR to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NULL
  OR to_regprocedure('extensions.digest(text,text)') IS NULL
  OR to_regclass('private.ws02_admin_creation_approvals') IS NOT NULL
  OR md5(pg_get_functiondef('public.handle_new_user()'::regprocedure))<> '9ffa9f9f8c95ce67fa2331f27fd0a203'
  OR md5(pg_get_functiondef('public.sync_profile_email_verification()'::regprocedure))<> '9a89ea2fdeedc14c3aee191a5865bc6e'
 THEN RAISE EXCEPTION 'Admin provisioning preconditions not met' USING ERRCODE='42501';
 END IF;
END $guard$;

CREATE TABLE private.ws02_admin_creation_approvals(
 email text PRIMARY KEY,
 ticket_sha256 text NOT NULL CHECK(ticket_sha256 ~ '^[a-f0-9]{64}$'),
 staged_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
 CHECK(email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
 CHECK(consumed_at IS NULL OR user_id IS NOT NULL)
);
ALTER TABLE private.ws02_admin_creation_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02_admin_creation_approvals FROM PUBLIC,anon,authenticated;

-- Only the local trusted Admin SDK (service_role) may stage a single use ticket.
-- A public caller cannot execute this RPC or inspect the private approval ledger.
CREATE FUNCTION public.ws02_admin_stage_creation(p_email text,p_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $stage$
DECLARE v_email text:=lower(btrim(coalesce(p_email,'')));
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
  OR (SELECT signup_enabled FROM private.ws02_activation_flags WHERE id) IS DISTINCT FROM false
  OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR p_sha256 !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Admin provisioning request denied' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=v_email)
 THEN RAISE EXCEPTION 'Approved account already exists' USING ERRCODE='23505';
 END IF;
 INSERT INTO private.ws02_admin_creation_approvals(email,ticket_sha256,expires_at)
 VALUES(v_email,p_sha256,now()+interval '10 minutes')
 ON CONFLICT(email) DO UPDATE
 SET ticket_sha256=EXCLUDED.ticket_sha256,
     staged_at=now(),expires_at=EXCLUDED.expires_at
 WHERE private.ws02_admin_creation_approvals.consumed_at IS NULL
   AND private.ws02_admin_creation_approvals.expires_at<now();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Approval already staged or consumed' USING ERRCODE='23505';
 END IF;
END $stage$;
REVOKE ALL ON FUNCTION public.ws02_admin_stage_creation(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ws02_admin_stage_creation(text,text)
 TO service_role;

CREATE FUNCTION public.ws02_admin_cancel_creation(p_email text,p_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $cancel$
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'Admin cancellation denied' USING ERRCODE='42501'; END IF;
 UPDATE private.ws02_admin_creation_approvals
 SET expires_at=now()
 WHERE email=lower(btrim(p_email)) AND ticket_sha256=p_sha256
  AND consumed_at IS NULL;
END $cancel$;
REVOKE ALL ON FUNCTION public.ws02_admin_cancel_creation(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ws02_admin_cancel_creation(text,text)
 TO service_role;

-- This function is triggered by GoTrue for BOTH public and Admin API inserts.
-- It can NEVER trust a client-supplied role, name, or email alone.
-- Admin API creates signed app_metadata containing an unguessable, one-use
-- proof; public signup cannot set app_metadata or know the approved secret.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE
 v_email text:=lower(btrim(coalesce(NEW.email,'')));
 v_name text:=pg_catalog.left(coalesce(
  nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'display_name'),''),
  pg_catalog.split_part(v_email,'@',1)),120);
 v_ticket text:=NEW.raw_app_meta_data->>'apsyntra_approval_ticket';
BEGIN
 IF (SELECT signup_enabled FROM private.ws02_activation_flags WHERE id) IS DISTINCT FROM false
  OR NEW.email_confirmed_at IS NULL OR NEW.is_anonymous IS NOT FALSE
  OR v_ticket IS NULL OR v_ticket !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Administrator-approved, confirmed identity required'
  USING ERRCODE='42501';
 END IF;
 UPDATE private.ws02_admin_creation_approvals a
 SET consumed_at=now(),user_id=NEW.id
 WHERE a.email=v_email
   AND a.ticket_sha256=pg_catalog.encode(extensions.digest(v_ticket,'sha256'),'hex')
   AND a.expires_at>now() AND a.consumed_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'No matching unused administrator approval' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.profiles(id,email,display_name,platform_role,status,email_verified_at)
 VALUES(NEW.id,v_email,v_name,'employee','active',NEW.email_confirmed_at);
 INSERT INTO private.ws02_new_account_admissions(user_id) VALUES(NEW.id);
 PERFORM private.ws02_provision_main_workspace(NEW.id);
 RETURN NEW;
END $create$;
REVOKE ALL ON FUNCTION public.handle_new_user()
 FROM PUBLIC,anon,authenticated;

-- Preserve disabled profiles. Re-verification is allowed for independently
-- approved identities even while the self-service signup flag remains OFF.
CREATE OR REPLACE FUNCTION public.sync_profile_email_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $verify$
DECLARE
 v_admin boolean:=EXISTS(
  SELECT 1 FROM private.ws02_admin_creation_approvals a
  WHERE a.user_id=NEW.id AND a.consumed_at IS NOT NULL);
 v_admitted boolean:=EXISTS(
  SELECT 1 FROM private.ws02_new_account_admissions WHERE user_id=NEW.id);
 v_verified boolean:=NEW.email_confirmed_at IS NOT NULL AND NEW.is_anonymous IS FALSE;
BEGIN
 UPDATE public.profiles p
 SET email=lower(coalesce(NEW.email,p.email)),
  email_verified_at=NEW.email_confirmed_at,
  status=CASE
   WHEN v_admitted AND p.status='disabled' THEN 'disabled'
   WHEN v_admitted AND v_admin AND v_verified AND p.status='pending' THEN 'active'
   WHEN v_admitted AND NOT v_verified AND p.status='active' THEN 'pending'
   ELSE p.status END,
  updated_at=now()
 WHERE p.id=NEW.id;
 IF v_admin AND v_verified
  AND EXISTS(SELECT 1 FROM public.profiles
   WHERE id=NEW.id AND status='active')
 THEN PERFORM private.ws02_provision_main_workspace(NEW.id);
 END IF;
 RETURN NEW;
END $verify$;
REVOKE ALL ON FUNCTION public.sync_profile_email_verification()
 FROM PUBLIC,anon,authenticated;

-- Do not enable signup_enabled, alter existing identities or issue app grants.
COMMIT;
