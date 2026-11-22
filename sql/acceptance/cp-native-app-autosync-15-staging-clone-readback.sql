-- Third independent database connection: persistent readback/cascade.
DO $tests$
BEGIN
 IF current_database()<>'cp_native15_staging_clone' THEN
  RAISE EXCEPTION 'CP15 only runs in its dedicated disposable clone';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ws02d_member_access
   WHERE user_id='a1500000-0000-4000-8000-000000000002' AND role='member') OR
    NOT EXISTS(SELECT 1 FROM private.ws01_member_roles
   WHERE user_id='a1500000-0000-4000-8000-000000000003' AND relation='collaborator') THEN
  RAISE EXCEPTION 'Independent readback failed after SQL connection closed';
 END IF;
END $tests$;
DELETE FROM public.workspace_members
WHERE user_id='a1500000-0000-4000-8000-000000000002';
DO $tests$
BEGIN
 IF (SELECT count(*) FROM public.workspace_members)<>2 OR
    (SELECT count(*) FROM private.ws02d_member_access)<>2 OR
    (SELECT count(*) FROM private.ws01_member_roles)<>2 OR
    EXISTS(SELECT 1 FROM private.ws02d_member_access
      WHERE user_id='a1500000-0000-4000-8000-000000000002') OR
    EXISTS(SELECT 1 FROM private.ws01_member_roles
      WHERE user_id='a1500000-0000-4000-8000-000000000002') THEN
   RAISE EXCEPTION 'Existing staging composite FK cascade did not persist';
 END IF;
END $tests$;
SELECT 'PASS: third SQL connection readback and actual staging FK cascades' AS acceptance;
