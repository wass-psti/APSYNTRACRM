-- CP-WS-01C/B2 — READ-ONLY discovery RPC production postactivation acceptance.
-- Execute only after separately scoped production B2 installation.
-- No session impersonation, account changes, records, roles, DDL or grants.
DO $b2$
DECLARE
 v_proc oid:=to_regprocedure('public.wm_ws01_list()');
 v_source text;
 v_count integer;
 v_rls integer;
 v_exposed integer;
BEGIN
 IF v_proc IS NULL THEN
  RAISE EXCEPTION 'CP-WS-01C/B2 read RPC absent' USING ERRCODE='42501';
 END IF;
 SELECT pg_get_functiondef(v_proc),p.prosecdef,p.provolatile='s'
 INTO v_source
 FROM pg_proc p WHERE p.oid=v_proc;
 -- This is only an added read RPC: no writable RPC, no role/permission
 -- mutation, and no backend workspace switching.
 IF NOT EXISTS(
  SELECT 1 FROM pg_proc p
  WHERE p.oid=v_proc AND p.prosecdef IS TRUE AND p.provolatile='s'
    AND 'search_path='=ANY(p.proconfig)
 ) OR NOT has_function_privilege('authenticated',v_proc,'EXECUTE')
   OR has_function_privilege('anon',v_proc,'EXECUTE')
   OR has_function_privilege('PUBLIC',v_proc,'EXECUTE')
   OR v_source NOT LIKE '%private.wm_board_config_session_active()%'
   OR v_source NOT LIKE '%m.user_id=v_actor AND m.active IS TRUE%'
   OR v_source NOT LIKE '%p.status=''active''%'
   OR v_source NOT LIKE '%public.current_workspace_id(v_actor)%'
   OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NOT NULL
   OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
   OR to_regprocedure('private.ws01_signed_actor_session()') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-WS-01C/B2 RPC authorization boundary failed'
  USING ERRCODE='42501';
 END IF;
 SELECT count(*),count(*) FILTER(WHERE c.relrowsecurity),
  count(*) FILTER(WHERE
   has_table_privilege('anon',c.oid,'SELECT')
   OR has_table_privilege('authenticated',c.oid,'SELECT')
   OR has_table_privilege('anon',c.oid,'INSERT')
   OR has_table_privilege('authenticated',c.oid,'INSERT')
   OR has_table_privilege('anon',c.oid,'UPDATE')
   OR has_table_privilege('authenticated',c.oid,'UPDATE')
   OR has_table_privilege('anon',c.oid,'DELETE')
   OR has_table_privilege('authenticated',c.oid,'DELETE'))
 INTO v_count,v_rls,v_exposed
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='private' AND c.relkind='r' AND c.relname IN(
  'ws01_workspace_policy','ws01_member_roles','ws01_create_requests',
  'ws01_session_choices','ws01_lifecycle_flags','ws01_events');
 IF v_count<>6 OR v_rls<>6 OR v_exposed<>0
  OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='private'
   AND tablename LIKE 'ws01_%')
  OR (SELECT count(*) FROM private.ws01_lifecycle_flags WHERE
    id IS TRUE AND creation_enabled IS FALSE AND selection_enabled IS FALSE)<>1
 THEN RAISE EXCEPTION 'CP-WS-01C/B2 private RLS or write gates changed'
  USING ERRCODE='42501';
 END IF;
 RAISE NOTICE 'CP-WS-01C/B2 server read-only RPC authorized; anon and private-table access denied PASS';
END $b2$;

-- No JWT in this database-review connection. A caller without a valid
-- signed GoTrue session must receive an explicit server denial.
DO $unsigned$
BEGIN
 IF auth.uid() IS NOT NULL OR auth.jwt()->>'session_id' IS NOT NULL
 THEN RAISE NOTICE 'CP-WS-01C/B2 unsigned probe skipped: review context not anonymous';
 ELSE
  BEGIN
   PERFORM public.wm_ws01_list();
   RAISE EXCEPTION 'CP-WS-01C/B2 unsigned context was allowed'
    USING ERRCODE='P0001';
  EXCEPTION WHEN insufficient_privilege THEN
   RAISE NOTICE 'CP-WS-01C/B2 unsigned discovery denied PASS';
  END;
 END IF;
END $unsigned$;

SELECT
 has_function_privilege('authenticated','public.wm_ws01_list()','EXECUTE')
  AS signed_rpc_enabled,
 has_function_privilege('anon','public.wm_ws01_list()','EXECUTE')
  AS anon_rpc_enabled,
 to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
  AS creation_rpc_absent,
 to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
  AS switching_rpc_absent,
 (SELECT creation_enabled FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
  AS creation_enabled,
 (SELECT selection_enabled FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
  AS selection_enabled,
 md5(pg_get_functiondef(to_regprocedure('public.current_workspace_id(uuid)')))
  AS workspace_authority_fingerprint,
 (SELECT count(*) FROM public.workspaces) AS workspace_count,
 (SELECT count(*) FROM public.workspace_members WHERE active)
  AS active_workspace_memberships,
 'B2_SERVER_READ_GRANT_POSTCHECK_PASS__LIVE_SIGNED_USER_TESTS_STILL_REQUIRED'::text
  AS acceptance_scope;
