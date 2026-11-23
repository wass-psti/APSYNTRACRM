-- Third connection: verify existing domain protections, no new access policy.
BEGIN;
SELECT set_config('request.jwt.claim.sub','a1500000-0000-4000-8000-000000000003',true);
DO $tests$
BEGIN
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'a1500000-0000-4000-8000-000000000002','order-intake','Admin',true);
  RAISE EXCEPTION 'Member unexpectedly assigned another member role';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $tests$;
SELECT set_config('request.jwt.claim.sub','a1500000-0000-4000-8000-000000000001',true);
UPDATE public.workspace_members SET active=false
WHERE workspace_id='b1500000-0000-4000-8000-000000000001'
AND user_id='a1500000-0000-4000-8000-000000000002';
DO $tests$
BEGIN
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'a1500000-0000-4000-8000-000000000002','order-intake','Admin',true);
  RAISE EXCEPTION 'Inactive member unexpectedly assigned role';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $tests$;
ROLLBACK;
