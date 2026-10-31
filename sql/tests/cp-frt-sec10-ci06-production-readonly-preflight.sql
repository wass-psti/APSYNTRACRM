-- CP-FRT-SEC10-CI06: read-only production safety/drift preflight.
-- Does not activate CI05's session guard, mutate any table, or grant permissions.
-- Expected source state: main 5b3e05a08cefee849c056a464e1e82b34959fda7.
-- If BLOCKED_SCHEMA_DRIFT, STOP: review production schema and rerun CI05 isolated tests.
WITH frt_tables AS (
 SELECT c.oid,c.relname,c.relrowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'frt_%'
), table_gate AS (
 SELECT count(*) AS table_count,
        count(*) FILTER (WHERE relrowsecurity) AS rls_count,
        count(*) FILTER (WHERE
          has_table_privilege('anon',oid,'SELECT') OR
          has_table_privilege('anon',oid,'INSERT') OR
          has_table_privilege('anon',oid,'UPDATE') OR
          has_table_privilege('anon',oid,'DELETE') OR
          has_table_privilege('authenticated',oid,'SELECT') OR
          has_table_privilege('authenticated',oid,'INSERT') OR
          has_table_privilege('authenticated',oid,'UPDATE') OR
          has_table_privilege('authenticated',oid,'DELETE')) AS direct_grant_count
 FROM frt_tables
), resolver_gate AS (
 SELECT md5(pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure)) AS source_hash,
        to_regprocedure('private.frt_signed_session_active()') IS NOT NULL AS guard_installed,
        has_function_privilege('authenticated',
          'public.frt_admin_set_role(uuid,uuid,text)','EXECUTE') AS legacy_admin_callable
), policy_gate AS (
 SELECT count(*) AS select_policy_count FROM pg_policies
 WHERE schemaname='public' AND tablename LIKE 'frt_%' AND cmd='SELECT'
), session_schema_gate AS (
 SELECT count(*) AS required_column_count
 FROM information_schema.columns
 WHERE table_schema='auth' AND table_name='sessions'
   AND column_name IN ('id','user_id')
)
SELECT jsonb_build_object(
 'checkpoint','CP-FRT-SEC10-CI06',
 'status', CASE WHEN t.table_count=10 AND t.rls_count=10 AND t.direct_grant_count=0
       AND p.select_policy_count=9 AND s.required_column_count=2
       AND r.source_hash='2b518f7be033ea25a6c103184c283a7d'
       AND NOT r.guard_installed AND NOT r.legacy_admin_callable
       THEN 'READY_FOR_AUTHORIZED_ROLLOUT_REVIEW' ELSE 'BLOCKED_SCHEMA_DRIFT' END,
 'frtTableCount',t.table_count,
 'frtRlsEnabled',t.rls_count,
 'frtDirectApiTableGrants',t.direct_grant_count,
 'frtSelectPolicies',p.select_policy_count,
 'authSessionRequiredColumns',s.required_column_count,
 'productionRoleResolverHash',r.source_hash,
 'sessionGuardInstalled',r.guard_installed,
 'legacyFrtRoleMutationCallable',r.legacy_admin_callable,
 'productionModified',false
) AS security_preflight
FROM table_gate t CROSS JOIN resolver_gate r CROSS JOIN policy_gate p
CROSS JOIN session_schema_gate s;
