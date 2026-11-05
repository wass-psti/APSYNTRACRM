-- Synthetic legacy auth/profile triggers used solely to test WS02B replacement.
-- Never execute against production or import real identities.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NULL
 OR to_regprocedure('public.handle_new_user()') IS NOT NULL
 OR to_regprocedure('public.sync_profile_email_verification()') IS NOT NULL
 OR to_regprocedure('public.ensure_default_workspace_membership()') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02B legacy fixture only supports isolated blank triggers'
 USING ERRCODE='42501'; END IF;
END $guard$;

CREATE FUNCTION public.ensure_default_workspace_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $legacy_member$
BEGIN
 INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES('00000000-0000-4000-8000-000000000001',NEW.id,true)
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET active=true;
 RETURN NEW;
END $legacy_member$;
CREATE TRIGGER profiles_default_workspace_membership AFTER INSERT
 ON public.profiles FOR EACH ROW
 EXECUTE FUNCTION public.ensure_default_workspace_membership();

CREATE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $legacy_signup$
BEGIN
 INSERT INTO public.profiles(
  id,email,platform_role,status
 ) VALUES(
  NEW.id,lower(coalesce(NEW.email,'')),
  CASE WHEN NEW.email='legacy.bootstrap@example.invalid'
   THEN 'admin_general_manager' ELSE 'employee' END,
  'active'
 );
 RETURN NEW;
END $legacy_signup$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.sync_profile_email_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $legacy_verify$
BEGIN
 UPDATE public.profiles SET email_verified_at=NEW.email_confirmed_at
 WHERE id=NEW.id;
 RETURN NEW;
END $legacy_verify$;
CREATE TRIGGER zz_on_auth_user_verification_sync
 AFTER INSERT OR UPDATE OF email_confirmed_at,email ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email_verification();
