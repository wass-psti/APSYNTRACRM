-- CP16: emulate a local QA request claim; not a genuine GoTrue signed session.
BEGIN;
DO $$
BEGIN
 IF current_database()<>'cp_native15_staging_clone' THEN
  RAISE EXCEPTION 'Disallowed database';
 END IF;
 IF (SELECT count(*) FROM auth.users)<>3 THEN
  RAISE EXCEPTION 'Synthetic QA identities absent';
 END IF;
END $$;
UPDATE public.profiles SET platform_role='admin_general_manager'
WHERE id='a1500000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','a1500000-0000-4000-8000-000000000001',true);
SELECT public.wm_admin_set_application_role(
'a1500000-0000-4000-8000-000000000003',
'time-tracker','Employee',true);
COMMIT;
