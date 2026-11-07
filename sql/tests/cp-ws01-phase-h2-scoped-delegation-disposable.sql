-- CP-WS-01 Lifecycle Phase H2: scoped delegated role boundary.
-- Included ONLY inside Phase H's rolled-back disposable PG17 transaction,
-- after the signed actor has selected workspace B and obtained owner status.
-- This is an executable authorization-contract preview. It is NOT source-
-- faithful installation of live has_module_access/module_role_for functions.
\set ON_ERROR_STOP on
DO $h2_preflight$
BEGIN
 IF current_database() <> 'workspace_disposable'
  OR current_setting('server_version_num')::int < 170000
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
  OR to_regprocedure('private.ws01_h2_scoped_role_actor(uuid)') IS NOT NULL
  OR to_regprocedure('public.ws01_h2_scoped_role_review(uuid)') IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM private.ws01_session_choices c
     WHERE c.session_id='cccccccc-0000-4000-8000-000000000003'
      AND c.workspace_id='00000000-0000-4000-8000-000000000002')
  OR NOT EXISTS (SELECT 1 FROM private.ws01_member_roles r
    WHERE r.workspace_id='00000000-0000-4000-8000-000000000002'
      AND r.user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      AND r.relation='owner')
 THEN RAISE EXCEPTION 'H2 requires the active signed Phase H disposable scope'
  USING ERRCODE='42501'; END IF;
END $h2_preflight$;

-- Preserve the authenticated caller's authoritative selected workspace.
-- Delegated role inspection is available only to an explicit owner of that
-- selected workspace, and only for a target's active membership in that same
-- workspace. This avoids the target's independent first-workspace fallback.
CREATE FUNCTION private.ws01_h2_scoped_role_actor(p_target uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $role_boundary$
DECLARE
 v_actor uuid := auth.uid();
 v_sid uuid;
 v_selected uuid;
BEGIN
 IF v_actor IS NULL OR p_target IS NULL
 THEN RAISE EXCEPTION 'Signed identity required' USING ERRCODE='42501'; END IF;
 v_sid:=private.ws01_signed_actor_session();
 v_selected:=public.current_workspace_id();
 IF v_selected IS NULL
 THEN RAISE EXCEPTION 'Active workspace required' USING ERRCODE='42501'; END IF;
 IF p_target IS DISTINCT FROM v_actor AND NOT EXISTS (
  SELECT 1 FROM private.ws01_member_roles r
  JOIN public.workspace_members m
    ON m.workspace_id=r.workspace_id AND m.user_id=r.user_id
  WHERE r.workspace_id=v_selected AND r.user_id=v_actor
   AND r.relation='owner' AND m.active IS TRUE)
 THEN RAISE EXCEPTION 'Delegated role inspection denied'
   USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.workspace_members m
  JOIN public.profiles p ON p.id=m.user_id
  WHERE m.workspace_id=v_selected AND m.user_id=p_target
   AND m.active IS TRUE AND p.status='active')
 THEN RAISE EXCEPTION 'Foreign or inactive target denied'
   USING ERRCODE='42501'; END IF;
 RETURN v_selected;
END $role_boundary$;
REVOKE ALL ON FUNCTION private.ws01_h2_scoped_role_actor(uuid)
 FROM PUBLIC,anon,authenticated;

-- Public test adapter reports only scoped role information, never a token,
-- full membership list, arbitrary target workspace or caller's credentials.
CREATE FUNCTION public.ws01_h2_scoped_role_review(p_target uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $review$
DECLARE v_scope uuid; v_relation text;
BEGIN
 v_scope:=private.ws01_h2_scoped_role_actor(p_target);
 SELECT r.relation INTO v_relation FROM private.ws01_member_roles r
 WHERE r.workspace_id=v_scope AND r.user_id=p_target;
 RETURN pg_catalog.jsonb_build_object(
  'workspaceId',v_scope,'relation',coalesce(v_relation,'member'),
  'scope','signed-selected-workspace');
END $review$;
REVOKE ALL ON FUNCTION public.ws01_h2_scoped_role_review(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ws01_h2_scoped_role_review(uuid)
 TO authenticated;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000003',true);
DO $h2_owner$
DECLARE receipt jsonb; denied boolean:=false;
BEGIN
 receipt:=public.ws01_h2_scoped_role_review(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 IF receipt->>'relation'<>'owner'
  OR receipt->>'workspaceId'<>'00000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'Owner self role resolution ignored selection'; END IF;
 receipt:=public.ws01_h2_scoped_role_review(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 IF receipt->>'workspaceId'<>'00000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'Delegated same-workspace role context lost'; END IF;
 BEGIN
  PERFORM public.ws01_h2_scoped_role_review(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN
  RAISE EXCEPTION 'Selected workspace owner saw foreign member role'; END IF;
 denied:=false;
 BEGIN
  PERFORM private.ws01_h2_scoped_role_actor(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN
  RAISE EXCEPTION 'Client reached private role authorization helper'; END IF;
END $h2_owner$;

-- A nonowner can resolve their own role but never another member's,
-- even when the other member belongs to the same workspace.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',true);
DO $h2_nonowner$
DECLARE denied boolean:=false; receipt jsonb;
BEGIN
 receipt:=public.ws01_h2_scoped_role_review(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 IF receipt->>'workspaceId'<>'00000000-0000-4000-8000-000000000001'
 THEN RAISE EXCEPTION 'Nonowner lost self-scope role resolution'; END IF;
 BEGIN
  PERFORM public.ws01_h2_scoped_role_review(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Nonowner inspected another user'; END IF;
END $h2_nonowner$;

-- Borrowing a different actor's real session cannot grant delegated access.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
DO $h2_borrowed$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.ws01_h2_scoped_role_review(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Borrowed signed session exposed role'; END IF;
END $h2_borrowed$;
RESET ROLE;

SET ROLE anon;
DO $h2_anonymous$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.ws01_h2_scoped_role_review(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous role inspection passed'; END IF;
END $h2_anonymous$;
RESET ROLE;
-- Restore the signed selected actor for Phase H's subsequent invitation step.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000003',true);

DO $h2_complete$
BEGIN
 IF has_function_privilege('authenticated',
  'private.ws01_h2_scoped_role_actor(uuid)','EXECUTE')
  OR has_function_privilege('anon',
  'public.ws01_h2_scoped_role_review(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'H2 delegated role grants regressed'; END IF;
 RAISE NOTICE 'CP_WS01_PHASE_H2_SCOPED_ROLE_DELEGATION_PREVIEW_PASS';
END $h2_complete$;
