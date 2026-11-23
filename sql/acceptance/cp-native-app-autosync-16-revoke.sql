BEGIN;
SELECT set_config('request.jwt.claim.sub','a1500000-0000-4000-8000-000000000001',true);
SELECT public.wm_admin_set_application_role(
'a1500000-0000-4000-8000-000000000003',
'time-tracker','Supervisor',false);
COMMIT;
