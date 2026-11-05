-- CP-WS-02D/B3 two administrative role-mutation contracts, synthetic only.
-- IMPORTANT: never run against production or use real membership/role records.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('public.apsyntra_role_is_bootstrap()') IS NULL
  OR (SELECT count(*) FROM public.module_role_assignments)<>0
  OR (SELECT count(*) FROM private.ws02d_member_access)<>0
  OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
  OR has_function_privilege('authenticated',
   'public.wm_admin_set_application_role(uuid,text,text,boolean)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.charter_admin_set_role(uuid,text,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'B3 administrative test prerequisite or EXECUTE drift'
 USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE b3_admin_baseline ON COMMIT PRESERVE ROWS AS SELECT
 (SELECT count(*) FROM public.module_role_assignments) AS assignments,
 (SELECT count(*) FROM private.ws02d_member_access) AS scoped_roles,
 (SELECT count(*) FROM public.apsyntra_role_bootstrap_identities) AS bootstrap;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $original_bootstrap$
BEGIN
 IF NOT public.apsyntra_role_is_bootstrap()
 OR NOT public.is_platform_admin(auth.uid())
 OR NOT private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',auth.uid(),'manage')
 THEN RAISE EXCEPTION 'Original bootstrap/admin and workspace owner fixture not aligned'; END IF;
END $original_bootstrap$;
DO $charter_positive$
DECLARE result jsonb;
BEGIN
 result:=public.charter_admin_set_role(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','user',true);
 IF result->>'role'<>'user' OR result->>'enabled'<>'true'
 OR (SELECT assigned_by FROM public.module_role_assignments
    WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      AND module_id='charter-navigator') IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Charter initial grant and accountable actor incorrect'; END IF;
 result:=public.charter_admin_set_role(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin',true);
 IF result->>'role'<>'admin' OR result->>'enabled'<>'true'
 OR (SELECT count(*) FROM public.module_role_assignments
     WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
       AND module_id='charter-navigator')<>1
 THEN RAISE EXCEPTION 'Charter role change created duplicate or failed'; END IF;
 result:=public.charter_admin_set_role(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin',false);
 IF result->>'enabled'<>'false'
 OR (SELECT enabled FROM public.module_role_assignments
     WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
       AND module_id='charter-navigator') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Charter role revocation did not persist'; END IF;
 BEGIN
  PERFORM public.charter_admin_set_role(auth.uid(),'admin',true);
  RAISE EXCEPTION 'Charter administrator self-edit accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.charter_admin_set_role(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user',true);
  RAISE EXCEPTION 'Charter foreign-workspace grant accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $charter_positive$;
DO $application_positive$
DECLARE r jsonb;
BEGIN
 r:=public.wm_admin_set_application_role(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','order-intake','User',true);
 IF r->>'role'<>'User' OR r->>'enabled'<>'true'
 OR r->>'backendSynchronized'<>'false'
 OR (SELECT assigned_by FROM public.module_role_assignments
    WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
     AND module_id='order-intake') IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Bootstrap-only application grant/actor not recorded'; END IF;
 r:=public.wm_admin_set_application_role(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','order-intake','Viewer',true);
 IF r->>'role'<>'Viewer' OR r->>'enabled'<>'true'
 OR (SELECT count(*) FROM public.module_role_assignments
   WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND module_id='order-intake')<>1
 THEN RAISE EXCEPTION 'Application role transition duplicated record'; END IF;
 r:=public.wm_admin_set_application_role(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','order-intake','Viewer',false);
 IF r->>'enabled'<>'false'
 OR (SELECT enabled FROM public.module_role_assignments
    WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND module_id='order-intake') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Application role revoke failed'; END IF;
 BEGIN
  PERFORM public.wm_admin_set_application_role(auth.uid(),'order-intake','Admin',true);
  RAISE EXCEPTION 'Application self-role promotion accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','order-intake','User',true);
  RAISE EXCEPTION 'Foreign-workspace application role granted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','unknown-module','Admin',true);
  RAISE EXCEPTION 'Unregistered application role granted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $application_positive$;
-- An additional workspace Admin role alone never establishes bootstrap identity,
-- and an ordinary Member must not gain either manage permission.
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member_manage$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd','user',true);
  RAISE EXCEPTION 'Workspace Member granted Charter role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd','order-intake','User',true);
  RAISE EXCEPTION 'Workspace Member granted application role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
END $member_manage$;
-- Even with maximum workspace Admin and platform Admin, original bootstrap
-- identity verification is a separate mandatory AND check.
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
UPDATE private.ws02d_member_access SET role='admin'
 WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $not_bootstrap$
BEGIN
 IF public.apsyntra_role_is_bootstrap() THEN
  RAISE EXCEPTION 'Non-bootstrap elevated platform Admin became bootstrap'; END IF;
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd','order-intake','User',true);
  RAISE EXCEPTION 'Non-bootstrap elevated Admin bypassed bootstrap guard' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'Administrator access required' THEN RAISE; END IF; END;
END $not_bootstrap$;
-- Platform Admin in scoped Viewer must not manage Charter role.
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_denied$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','user',true);
  RAISE EXCEPTION 'Workspace Viewer platform Admin granted role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
END $viewer_denied$;
-- A genuine expired original bootstrap session cannot change roles.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd','user',true);
  RAISE EXCEPTION 'Expired Charter Admin session changed role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd','order-intake','User',true);
  RAISE EXCEPTION 'Expired bootstrap session changed application role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.module_role_assignments)<>2
 THEN RAISE EXCEPTION 'Denied admin role writes mutated stored assignments'; END IF;
END $expired$;
ROLLBACK;
DO $verify$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.b3_admin_baseline;
 IF (SELECT count(*) FROM public.module_role_assignments)<>b.assignments
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.scoped_roles
 OR (SELECT count(*) FROM public.apsyntra_role_bootstrap_identities)<>b.bootstrap
 OR (SELECT not_after IS NOT NULL FROM auth.sessions
    WHERE id='aaaaaaaa-0000-4000-8000-000000000001')
 OR (SELECT platform_role FROM public.profiles
    WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')='admin_general_manager'
 THEN RAISE EXCEPTION 'Administrative role acceptance not rolled back'; END IF;
 RAISE NOTICE 'WS02D/B3 Charter and bootstrap application role changes PASS';
END $verify$;
DROP TABLE pg_temp.b3_admin_baseline;
