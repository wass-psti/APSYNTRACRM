BEGIN;
SELECT set_config('request.jwt.claim.sub','a1500000-0000-4000-8000-000000000001',true);
SELECT public.wm_admin_set_application_role(
'a1500000-0000-4000-8000-000000000003',
'time-tracker','Supervisor',true);
DO $$
BEGIN
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'a1500000-0000-4000-8000-000000000003',
   'arbitrary-new-app','Admin',true);
  RAISE EXCEPTION 'Unsupported module accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'a1500000-0000-4000-8000-000000000003',
   'time-tracker','FAKE_ROLE',true);
  RAISE EXCEPTION 'Unsupported role accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
COMMIT;
