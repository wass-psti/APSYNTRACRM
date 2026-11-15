BEGIN;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $trigger$
DECLARE
v_email text:=lower(btrim(coalesce(NEW.email,'')));
v_name text:=pg_catalog.left(coalesce(nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'display_name'),''),pg_catalog.split_part(v_email,'@',1)),120);
v_verified boolean:=NEW.email_confirmed_at IS NOT NULL AND NEW.is_anonymous IS FALSE;
BEGIN
IF (SELECT signup_enabled FROM private.ws02_activation_flags WHERE id) IS DISTINCT FROM false
OR NEW.is_anonymous IS TRUE
THEN RAISE EXCEPTION 'Account admission policy denied' USING ERRCODE='42501'; END IF;
INSERT INTO public.profiles(id,email,display_name,platform_role,status,email_verified_at)
VALUES(NEW.id,v_email,v_name,'employee',CASE WHEN v_verified THEN 'active' ELSE 'pending' END,NEW.email_confirmed_at);
INSERT INTO private.ws02_new_account_admissions(user_id) VALUES(NEW.id);
IF v_verified THEN PERFORM private.ws02_provision_main_workspace(NEW.id); END IF;
RETURN NEW;
END $trigger$;
CREATE OR REPLACE FUNCTION public.sync_profile_email_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $trigger$
DECLARE
v_admitted boolean:=EXISTS(SELECT 1 FROM private.ws02_new_account_admissions WHERE user_id=NEW.id);
v_verified boolean:=NEW.email_confirmed_at IS NOT NULL AND NEW.is_anonymous IS FALSE;
BEGIN
UPDATE public.profiles p
SET email=lower(coalesce(NEW.email,p.email)),
email_verified_at=NEW.email_confirmed_at,
status=CASE
WHEN v_admitted AND p.status='disabled' THEN 'disabled'
WHEN v_admitted AND v_verified AND p.status='pending' THEN 'active'
WHEN v_admitted AND NOT v_verified AND p.status='active' THEN 'pending'
ELSE p.status END,
updated_at=now()
WHERE p.id=NEW.id;
IF v_admitted AND v_verified AND EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.id AND status='active')
THEN PERFORM private.ws02_provision_main_workspace(NEW.id); END IF;
RETURN NEW;
END $trigger$;
COMMIT;;
