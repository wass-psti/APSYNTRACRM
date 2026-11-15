BEGIN;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $trigger$
DECLARE
v_email text:=lower(btrim(coalesce(NEW.email,'')));
v_name text:=pg_catalog.left(coalesce(nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'display_name'),''),pg_catalog.split_part(v_email,'@',1)),120);
BEGIN
IF (SELECT signup_enabled FROM private.ws02_activation_flags WHERE id) IS DISTINCT FROM false
OR NEW.is_anonymous IS TRUE
THEN RAISE EXCEPTION 'Account admission policy denied' USING ERRCODE='42501'; END IF;
INSERT INTO public.profiles(id,email,display_name,platform_role,status,email_verified_at)
VALUES(NEW.id,v_email,v_name,'employee','active',NEW.email_confirmed_at);
INSERT INTO private.ws02_new_account_admissions(user_id) VALUES(NEW.id);
PERFORM private.ws02_provision_main_workspace(NEW.id);
RETURN NEW;
END $trigger$;
COMMIT;;
