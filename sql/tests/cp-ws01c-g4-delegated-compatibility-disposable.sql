-- CP-WS-01C/B3 G4 — delegated identity compatibility, disposable PG17 only.
-- Included INSIDE the G3 open transaction, after its guard preview and before
-- ROLLBACK. Not a deployable migration or a production entitlement grant.
\set ON_ERROR_STOP on

DO $g4_entry$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR current_setting('server_version_num')::integer<170000
 OR to_regprocedure('private.ws01_g3_internal_workspace_lookup(uuid)') IS NULL
 OR (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT platform_role FROM public.profiles
    WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'admin_general_manager'
 THEN RAISE EXCEPTION 'G4 only runs inside existing disposable G3 fixture'
   USING ERRCODE='42501'; END IF;
END $g4_entry$;

-- Representative policy-bound delegated reader: it can examine ONLY another
-- active member of the administrator's own authoritative workspace.
-- This previews an authorization boundary, not the 63 production functions.
CREATE FUNCTION private.ws01_g4_delegated_scope(p_target_user uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $delegated$
DECLARE actor uuid:=auth.uid();actor_scope uuid;target_scope uuid;
BEGIN
 IF actor IS NULL OR p_target_user IS NULL
 OR NOT private.wm_board_config_session_active()
 OR NOT EXISTS(SELECT 1 FROM auth.users u
     JOIN public.profiles p ON p.id=u.id
     WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
      AND u.is_anonymous IS FALSE AND p.status='active'
      AND p.platform_role='admin_general_manager')
 THEN RAISE EXCEPTION 'G4 delegated lookup denied' USING ERRCODE='42501';
 END IF;
 actor_scope:=private.ws01_g3_internal_workspace_lookup(actor);
 target_scope:=private.ws01_g3_internal_workspace_lookup(p_target_user);
 IF actor_scope IS NULL OR target_scope IS DISTINCT FROM actor_scope
 THEN RAISE EXCEPTION 'G4 foreign target denied' USING ERRCODE='42501';
 END IF;
 RETURN target_scope;
END $delegated$;
REVOKE ALL ON FUNCTION private.ws01_g4_delegated_scope(uuid)
 FROM PUBLIC,anon,authenticated;

-- The only demo public entrypoint returns a boolean (not a workspace ID) and
-- performs a checked privileged delegation. It must vanish at G3 ROLLBACK.
CREATE FUNCTION public.ws01_g4_disposable_manager_review(p_target_user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $manager$
BEGIN
 PERFORM private.ws01_g4_delegated_scope(p_target_user);
 RETURN true;
END $manager$;
REVOKE ALL ON FUNCTION public.ws01_g4_disposable_manager_review(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ws01_g4_disposable_manager_review(uuid)
 TO authenticated;

DO $g4_acl$
BEGIN
 IF has_function_privilege('authenticated',
       'private.ws01_g4_delegated_scope(uuid)','EXECUTE')
 OR has_function_privilege('anon',
       'private.ws01_g4_delegated_scope(uuid)','EXECUTE')
 OR has_function_privilege('anon',
       'public.ws01_g4_disposable_manager_review(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
       'public.ws01_g4_disposable_manager_review(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'G4 private delegation grant breached'; END IF;
END $g4_acl$;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $g4_manager_positive$
BEGIN
 -- Legitimate assigned administrator can evaluate a target member in the
 -- SAME workspace, including a separately authorized multi-member actor.
 IF public.ws01_g4_disposable_manager_review(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd') IS DISTINCT FROM true
 OR public.ws01_g4_disposable_manager_review(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc') IS DISTINCT FROM true
 OR public.current_workspace_id(auth.uid()) IS DISTINCT FROM
   '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'G4 authorized delegated manager path regressed'; END IF;
END $g4_manager_positive$;

DO $g4_manager_negative$
DECLARE denied boolean;
BEGIN
 denied:=false;
 BEGIN
  PERFORM public.ws01_g4_disposable_manager_review(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 manager crossed foreign workspace'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.ws01_g4_disposable_manager_review(
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 nonmember target was disclosed'; END IF;
 denied:=false;
 BEGIN
  PERFORM private.ws01_g4_delegated_scope(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 client invoked private delegation'; END IF;
END $g4_manager_negative$;

-- G3 expired the second manager session; that must also bar delegated reads.
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000002',false);
DO $g4_expired_manager$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.ws01_g4_disposable_manager_review(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 expired manager session accepted'; END IF;
END $g4_expired_manager$;

-- Valid non-manager in the same workspace cannot delegate across users.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',false);
DO $g4_nonmanager$
DECLARE denied boolean:=false;
BEGIN
 IF public.current_workspace_id() IS DISTINCT FROM
    '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'G4 non-manager lost own workspace'; END IF;
 BEGIN
  PERFORM public.ws01_g4_disposable_manager_review(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 non-manager delegated privilege'; END IF;
END $g4_nonmanager$;

-- Valid manager role but mismatched session is not sufficient.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',false);
DO $g4_session_swap$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.ws01_g4_disposable_manager_review(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 borrowed signed session allowed'; END IF;
END $g4_session_swap$;

-- The same signed actor loses delegated authority if their manager role is
-- withdrawn. This change is synthetic and will be rolled back with G3.
RESET ROLE;
UPDATE public.profiles SET platform_role='employee'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $g4_manager_disabled$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.ws01_g4_disposable_manager_review(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 withdrawn administrator privilege'; END IF;
END $g4_manager_disabled$;
RESET ROLE;
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Anonymous callers cannot invoke the synthetic wrapper, despite its owner.
SET ROLE anon;
DO $g4_anon$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.ws01_g4_disposable_manager_review(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'G4 anonymous delegated review'; END IF;
END $g4_anon$;
RESET ROLE;

DO $g4_integrity$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM public.work_boards)<>2
 OR (SELECT platform_role FROM public.profiles
    WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'admin_general_manager'
 THEN RAISE EXCEPTION 'G4 delegated acceptance changed fixture'; END IF;
 RAISE NOTICE 'CP_WS01C_B3_G4_DELEGATED_COMPAT_DISPOSABLE_PASS';
END $g4_integrity$;
