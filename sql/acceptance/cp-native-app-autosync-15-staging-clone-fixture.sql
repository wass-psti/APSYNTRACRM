-- CP15: runs ONLY in a freshly created disposable database containing the
-- actual nonproduction staging schema. These are synthetic IDs, NOT sessions.
-- The surrounding runner drops the entire database on exit.
DO $guard$
BEGIN
 IF current_database()<>'cp_native15_staging_clone' THEN
  RAISE EXCEPTION 'CP15 fixture can run only in approved disposable clone';
 END IF;
 IF EXISTS (SELECT 1 FROM auth.users) OR
    EXISTS (SELECT 1 FROM public.workspace_members) THEN
  RAISE EXCEPTION 'CP15 clone must start with no real Auth or membership data';
 END IF;
END $guard$;

INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
VALUES
 ('a1500000-0000-4000-8000-000000000001','qa15-admin@example.invalid','authenticated','authenticated',now(),now()),
 ('a1500000-0000-4000-8000-000000000002','qa15-member1@example.invalid','authenticated','authenticated',now(),now()),
 ('a1500000-0000-4000-8000-000000000003','qa15-member2@example.invalid','authenticated','authenticated',now(),now());
INSERT INTO public.profiles(id,email,status)
SELECT id,email,'active' FROM auth.users;
INSERT INTO public.workspaces(id,name)
VALUES ('b1500000-0000-4000-8000-000000000001','CP15 isolated staging clone QA');
INSERT INTO public.workspace_members(workspace_id,user_id)
SELECT 'b1500000-0000-4000-8000-000000000001',id FROM auth.users;
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
SELECT workspace_id,user_id,
 CASE WHEN user_id='a1500000-0000-4000-8000-000000000001' THEN 'owner' ELSE 'member' END
FROM public.workspace_members;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role)
SELECT workspace_id,user_id,
 CASE WHEN user_id='a1500000-0000-4000-8000-000000000001' THEN 'admin' ELSE 'viewer' END
FROM public.workspace_members;

DO $verify$
BEGIN
 IF (SELECT count(*) FROM auth.users)<>3 OR
    (SELECT count(*) FROM public.workspace_members)<>3 OR
    (SELECT count(*) FROM private.ws01_member_roles)<>3 OR
    (SELECT count(*) FROM private.ws02d_member_access)<>3 THEN
  RAISE EXCEPTION 'Three-synthetic-profile setup incomplete';
 END IF;
 IF to_regclass('public.module_role_assignments') IS NOT NULL THEN
  RAISE EXCEPTION 'Unexpected native module role store in existing staging schema';
 END IF;
END $verify$;
SELECT 'PASS: actual staging-schema synthetic three-profile membership fixture' AS acceptance;
