-- CP17 existing-module multi-member assignment, in the isolated clone only.
-- Original canonical writer is used unchanged. Claims are synthetic, NOT GoTrue.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'cp_native15_staging_clone' OR
    (SELECT count(*) FROM auth.users)<>3 THEN
  RAISE EXCEPTION 'Not an isolated CP17 fixture';
 END IF;
END $guard$;
-- CP15's membership cascade test removed the second user's membership.
-- Re-enroll only this synthetic member in the disposable database.
INSERT INTO public.workspace_members(workspace_id,user_id,active)
VALUES ('b1500000-0000-4000-8000-000000000001',
        'a1500000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.sub','a1500000-0000-4000-8000-000000000001',true);
SELECT public.wm_admin_set_application_role(
 'a1500000-0000-4000-8000-000000000002','order-intake','User',true);
SELECT public.wm_admin_set_application_role(
 'a1500000-0000-4000-8000-000000000003','time-tracker','Employee',true);
COMMIT;
