-- CP-FRT-SEC10-CI07: read-only production post-activation verification.
-- Does not make signed-session claims: current PostgreSQL session has no signed browser bearer.
WITH frt_tables AS (
 SELECT c.oid,c.relrowsecurity FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'frt_%'
), t AS (
 SELECT count(*) AS tables, count(*) FILTER (WHERE relrowsecurity) AS rls,
 count(*) FILTER (WHERE
  has_table_privilege('anon',oid,'SELECT') OR has_table_privilege('anon',oid,'INSERT')
  OR has_table_privilege('anon',oid,'UPDATE') OR has_table_privilege('anon',oid,'DELETE')
  OR has_table_privilege('authenticated',oid,'SELECT')
  OR has_table_privilege('authenticated',oid,'INSERT')
  OR has_table_privilege('authenticated',oid,'UPDATE')
  OR has_table_privilege('authenticated',oid,'DELETE')) AS api_table_grants
 FROM frt_tables
), g AS (
 SELECT p.prosecdef AS definer,
  (p.proconfig @> ARRAY['search_path=""']) AS blank_search_path,
  pg_get_userbyid(p.proowner) AS owner,
  pg_get_functiondef(p.oid) LIKE '%auth.sessions AS sess%' AS checks_server_session,
  pg_get_functiondef(p.oid) LIKE '%sess.user_id=v_actor%' AS checks_session_owner,
  pg_get_functiondef(p.oid) LIKE '%to_timestamp(v_exp::bigint) <= now()%' AS checks_expiry
 FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='frt_signed_session_active'
), r AS (
 SELECT pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure)
  LIKE '%private.frt_signed_session_active()%' AS resolver_guards_session,
  pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure)
  LIKE '%apsyntra_crm_effective_role%' AS preserves_crm_ceiling
), a AS (
 SELECT has_function_privilege('anon','private.frt_signed_session_active()','EXECUTE')
  AS anonymous_can_call,
  has_function_privilege('authenticated','private.frt_signed_session_active()','EXECUTE')
  AS authenticated_can_call,
  has_function_privilege('authenticated','public.frt_admin_set_role(uuid,uuid,text)','EXECUTE')
  AS legacy_admin_can_call
)
SELECT jsonb_build_object(
 'checkpoint','CP-FRT-SEC10-CI07',
 'status',CASE WHEN t.tables=10 AND t.rls=10 AND t.api_table_grants=0
   AND g.definer AND g.blank_search_path AND g.owner='postgres'
   AND g.checks_server_session AND g.checks_session_owner AND g.checks_expiry
   AND r.resolver_guards_session AND r.preserves_crm_ceiling
   AND NOT a.anonymous_can_call AND NOT a.authenticated_can_call
   AND NOT a.legacy_admin_can_call
   THEN 'PRODUCTION_SCHEMA_ACTIVATION_VERIFIED'
   ELSE 'BLOCKED_POST_DEPLOYMENT_VERIFICATION' END,
 'frtTables',t.tables,'rlsEnabled',t.rls,
 'apiTableGrants',t.api_table_grants,
 'sessionGuardOwner',g.owner,
 'sessionGuardIsDefiner',g.definer,
 'sessionGuardBlankSearchPath',g.blank_search_path,
 'sessionGuardChecksSessionRecord',g.checks_server_session,
 'sessionGuardChecksSessionOwner',g.checks_session_owner,
 'sessionGuardChecksExpiry',g.checks_expiry,
 'resolverDelegatesToSessionGuard',r.resolver_guards_session,
 'resolverPreservesCrmCeiling',r.preserves_crm_ceiling,
 'privateGuardPubliclyCallable',a.anonymous_can_call OR a.authenticated_can_call,
 'legacyFrtRoleMutationCallable',a.legacy_admin_can_call,
 'genuineSignedSessionAcceptance','PENDING'
) AS post_activation
FROM t CROSS JOIN g CROSS JOIN r CROSS JOIN a;
