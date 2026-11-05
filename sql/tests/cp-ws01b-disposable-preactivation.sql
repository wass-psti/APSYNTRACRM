-- CP-WS-01B disposable preactivation: only member discovery is callable.
\set ON_ERROR_STOP on
DO $preflight$
BEGIN
 IF to_regclass('private.ws01_workspace_policy') IS NULL
 OR to_regclass('private.ws01_member_roles') IS NULL
 OR to_regclass('private.ws01_session_choices') IS NULL
 OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'Staged workspace lifecycle missing'; END IF;
 IF has_table_privilege('authenticated','private.ws01_workspace_policy','SELECT')
  OR has_table_privilege('authenticated','private.ws01_member_roles','SELECT')
  OR has_table_privilege('authenticated','private.ws01_session_choices','SELECT')
  OR has_table_privilege('authenticated','public.workspaces','SELECT')
  OR has_table_privilege('authenticated','public.workspaces','INSERT')
  OR has_table_privilege('authenticated','public.workspace_members','INSERT')
  OR has_function_privilege('authenticated','public.wm_ws01_create(text,text,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.wm_ws01_list()','EXECUTE')
  OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-WS-01B default deny grants failed'; END IF;
 IF NOT has_function_privilege('authenticated','public.wm_ws01_list()','EXECUTE')
  OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='private' AND c.relname LIKE 'ws01_%' AND c.relkind='r'
    AND c.relrowsecurity)<>6
 THEN RAISE EXCEPTION 'Read-only workspace admission or private RLS missing'; END IF;
 IF EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
   WHERE creation_enabled OR selection_enabled)
 THEN RAISE EXCEPTION 'Workspace write flags unexpectedly enabled'; END IF;
 RAISE NOTICE 'CP-WS-01B default grants/RLS/flags PASS';
END $preflight$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',false);
DO $fixture_identity$
DECLARE details jsonb := public.ws01_fixture_auth_diagnostics();
BEGIN
 RAISE NOTICE 'Synthetic signed fixture checks: %', details;
 IF details->>'actor_present'<>'true'
  OR details->>'session_claim_present'<>'true'
  OR details->>'signed_session_guard'<>'true'
  OR details->>'active_profile'<>'true'
  OR details->>'active_membership'<>'true'
 THEN RAISE EXCEPTION 'Disposable fixture signed-session prerequisite failed: %',
  details USING ERRCODE='42501';
 END IF;
END $fixture_identity$;
DO $signed$
DECLARE snap jsonb;
BEGIN
 snap:=public.wm_ws01_list();
 IF snap->>'userId'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 OR snap->>'activeWorkspaceId'<>'00000000-0000-4000-8000-000000000001'
 OR jsonb_array_length(snap->'rows')<>1
 OR snap#>>'{rows,0,relation}'<>'member'
 OR snap#>>'{rows,0,privacy}'<>'closed'
 THEN RAISE EXCEPTION 'Member-only discovery scope or conservative defaults failed';
 END IF;
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
 '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Default workspace changed before cutover'; END IF;
 BEGIN
  PERFORM public.wm_ws01_create('Unauthorised', 'open',
   '11111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Write unexpectedly granted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_select(
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Selection unexpectedly granted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'CP-WS-01B genuine claims fixture member-only discovery PASS';
END $signed$;
RESET ROLE;
