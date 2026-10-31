-- CP-FRT-SEC10-CI07: controlled production session-guard rollout.
-- Authorized scope: preserve CP06 CRM/platform ceiling and FRT finance semantics.
-- Exactly the previously CI05-isolated-tested functions are installed below.
-- One transaction; drift fences before DDL; no table data, user, or finance mutations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
DO $preflight$
DECLARE
 v_missing integer;
BEGIN
 IF md5(pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure))
    <> '2b518f7be033ea25a6c103184c283a7d' THEN
    RAISE EXCEPTION 'CI07_ROLLBACK_BASELINE_DRIFT';
 END IF;
 IF to_regprocedure('private.frt_signed_session_active()') IS NOT NULL THEN
    RAISE EXCEPTION 'CI07_SESSION_GUARD_ALREADY_INSTALLED';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname LIKE 'frt_%' AND c.relkind IN ('r','p')
       AND c.relrowsecurity) <> 10 THEN
    RAISE EXCEPTION 'CI07_FRT_RLS_DRIFT';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname LIKE 'frt_%' AND c.relkind IN ('r','p')
       AND (has_table_privilege('authenticated',c.oid,'SELECT')
        OR has_table_privilege('authenticated',c.oid,'INSERT')
        OR has_table_privilege('authenticated',c.oid,'UPDATE')
        OR has_table_privilege('authenticated',c.oid,'DELETE')
        OR has_table_privilege('anon',c.oid,'SELECT')
        OR has_table_privilege('anon',c.oid,'INSERT')
        OR has_table_privilege('anon',c.oid,'UPDATE')
        OR has_table_privilege('anon',c.oid,'DELETE'))) <> 0 THEN
    RAISE EXCEPTION 'CI07_DIRECT_FRT_TABLE_GRANT_DRIFT';
 END IF;
 IF has_function_privilege('authenticated',
    'public.frt_admin_set_role(uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'CI07_LEGACY_FRT_ROLE_MUTATION_EXPOSED';
 END IF;
 SELECT 2-count(*) INTO v_missing FROM information_schema.columns
  WHERE table_schema='auth' AND table_name='sessions' AND column_name IN ('id','user_id');
 IF v_missing <> 0 THEN RAISE EXCEPTION 'CI07_AUTH_SESSION_SCHEMA_DRIFT'; END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION private.frt_signed_session_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $signed$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_sid text := (SELECT auth.jwt()->>'session_id');
 v_exp text := (SELECT auth.jwt()->>'exp');
BEGIN
 IF v_actor IS NULL OR v_sid IS NULL OR v_exp IS NULL THEN RETURN false; END IF;
 IF v_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR v_exp !~ '^[0-9]{1,12}$' THEN
   RETURN false;
 END IF;
 IF to_timestamp(v_exp::bigint) <= now() THEN RETURN false; END IF;
 RETURN EXISTS (
   SELECT 1 FROM auth.sessions AS sess
   WHERE sess.id=v_sid::uuid AND sess.user_id=v_actor
 );
END;
$signed$;
REVOKE ALL ON FUNCTION private.frt_signed_session_active() FROM PUBLIC,anon,authenticated;
-- Never grant this auth.sessions-checking function directly to signed API roles.
-- It is invoked only by the existing SECURITY DEFINER FRT role resolver.

CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
 SELECT role_source.role
 FROM (
   SELECT CASE WHEN p.platform_role='admin_general_manager' THEN 'GENERAL_MANAGER'
               ELSE a.role END AS role
   FROM public.profiles p
   JOIN public.workspace_members wm ON wm.user_id=p.id
     AND wm.workspace_id=p_workspace_id AND wm.active=true
   LEFT JOIN public.module_role_assignments a ON a.user_id=p.id
     AND a.module_id='fund-released-tracker' AND a.enabled=true
   WHERE p.id=(SELECT auth.uid()) AND p.status='active'
     AND (SELECT private.frt_signed_session_active())
     AND (p.platform_role='admin_general_manager' OR
       a.role IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'))
   LIMIT 1
 ) role_source
 WHERE public.apsyntra_crm_explicit_role(auth.uid(),p_workspace_id) IS NULL
    OR public.apsyntra_crm_module_role_rank(
         'fund-released-tracker',role_source.role)
       <= public.apsyntra_crm_role_rank(
         public.apsyntra_crm_effective_role(auth.uid(),p_workspace_id));
$$;
-- Validate the private helper is never directly executable by API roles.
DO $postflight$
BEGIN
 IF has_function_privilege('anon','private.frt_signed_session_active()','EXECUTE')
  OR has_function_privilege('authenticated','private.frt_signed_session_active()','EXECUTE')
  OR has_function_privilege('PUBLIC','private.frt_signed_session_active()','EXECUTE')
 THEN RAISE EXCEPTION 'CI07_SESSION_GUARD_EXPOSED'; END IF;
 IF position('private.frt_signed_session_active()'
             in pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure))=0
 THEN RAISE EXCEPTION 'CI07_ROLE_RESOLVER_NOT_GUARDED'; END IF;
END;
$postflight$;
NOTIFY pgrst, 'reload schema';
COMMIT;
