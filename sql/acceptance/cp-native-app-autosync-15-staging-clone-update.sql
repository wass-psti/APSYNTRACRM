-- Distinct database connection from the setup. Clone-only.
DO $guard$
BEGIN
 IF current_database()<>'cp_native15_staging_clone' OR
   (SELECT count(*) FROM auth.users)<>3 OR
   (SELECT count(*) FROM public.workspace_members)<>3 THEN
  RAISE EXCEPTION 'CP15 independent readback baseline mismatch';
 END IF;
END $guard$;

UPDATE private.ws02d_member_access SET role='member'
WHERE user_id='a1500000-0000-4000-8000-000000000002';
UPDATE private.ws01_member_roles SET relation='collaborator'
WHERE user_id='a1500000-0000-4000-8000-000000000003';
DO $tests$
BEGIN
 BEGIN
  UPDATE private.ws02d_member_access SET role='crm_admin'
  WHERE user_id='a1500000-0000-4000-8000-000000000003';
  RAISE EXCEPTION 'Unsupported invitation role unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE private.ws01_member_roles SET relation='crm_admin'
  WHERE user_id='a1500000-0000-4000-8000-000000000003';
  RAISE EXCEPTION 'Unsupported workspace relation unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_member_access
   WHERE user_id='a1500000-0000-4000-8000-000000000002' AND role='member') OR
   NOT EXISTS(SELECT 1 FROM private.ws01_member_roles
   WHERE user_id='a1500000-0000-4000-8000-000000000003' AND relation='collaborator') THEN
  RAISE EXCEPTION 'Clone-only persisted role update failed';
 END IF;
END $tests$;
SELECT 'PASS: separate SQL connection updated genuine staging membership tables' AS acceptance;
