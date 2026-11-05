-- CP-WS-01C/B1: READ-ONLY additive-schema verification.
-- Can run against disposable PG17 after B1, or in production AFTER
-- separately authorized B1 activation. No account/data writes or grants.
DO $ws01_b1$
DECLARE
 v_total integer;
 v_rls integer;
 v_direct integer;
 v_policies integer;
 v_bad_flags integer;
BEGIN
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
 INTO v_total,v_rls,v_direct
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='private' AND c.relkind='r'
  AND c.relname IN(
   'ws01_workspace_policy','ws01_member_roles','ws01_create_requests',
   'ws01_session_choices','ws01_lifecycle_flags','ws01_events');
 SELECT count(*) INTO v_policies FROM pg_policies
 WHERE schemaname='private' AND tablename IN(
   'ws01_workspace_policy','ws01_member_roles','ws01_create_requests',
   'ws01_session_choices','ws01_lifecycle_flags','ws01_events');
 SELECT count(*) INTO v_bad_flags FROM private.ws01_lifecycle_flags
 WHERE id IS DISTINCT FROM true OR creation_enabled IS DISTINCT FROM false
  OR selection_enabled IS DISTINCT FROM false;
 IF v_total<>6 OR v_rls<>6 OR v_direct<>0 OR v_policies<>0
   OR v_bad_flags<>0
   OR (SELECT count(*) FROM private.ws01_lifecycle_flags)<>1
   OR (SELECT count(*) FROM private.ws01_events)<>0
   OR (SELECT count(*) FROM private.ws01_member_roles)<>0
   OR (SELECT count(*) FROM private.ws01_workspace_policy)<>0
   OR (SELECT count(*) FROM private.ws01_create_requests)<>0
   OR (SELECT count(*) FROM private.ws01_session_choices)<>0
   OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NOT NULL
   OR to_regprocedure('public.wm_ws01_list()') IS NOT NULL
   OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
   OR to_regprocedure('private.ws01_signed_actor_session()') IS NOT NULL
   OR NOT has_function_privilege('authenticated','public.current_workspace_id(uuid)','EXECUTE')
 THEN
  RAISE EXCEPTION 'CP-WS-01C/B1 additive schema isolation failed'
    USING ERRCODE='42501';
 END IF;
 RAISE NOTICE 'CP-WS-01C/B1 six private RLS tables, no direct grants, disabled flags, zero new RPCs PASS';
END $ws01_b1$;
