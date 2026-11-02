-- CP-FRT-SEC14 production cutover preflight. READ ONLY.
-- Safe to execute via the existing Supabase SQL inspector.
-- This intentionally cannot certify unknown external API consumers or
-- substitute for a genuinely signed Supabase Auth user acceptance result.
WITH f AS (
 SELECT p.proname AS name,p.prosecdef AS security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS signed_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  pg_get_functiondef(p.oid) AS definition
 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (
  'frt_restricted_request_detail','frt_board_list_safe',
  'frt_board_dashboard_safe','frt_get_request','frt_list_requests',
  'frt_dashboard','frt_request_action')
)
SELECT jsonb_build_object(
 'checkpoint','CP-FRT-SEC14-PRODUCTION-CUTOVER',
 'restrictedReads',(
  SELECT jsonb_agg(jsonb_build_object(
   'name',name,'securityDefiner',security_definer,
   'authenticatedExecute',signed_execute,'anonymousExecute',anon_execute,
   'sessionGuardResolver',definition LIKE '%private.frt_current_role%'
  ) ORDER BY name) FROM f WHERE name IN (
    'frt_restricted_request_detail','frt_board_list_safe','frt_board_dashboard_safe')
 ),
 'legacyReads',(
  SELECT jsonb_agg(jsonb_build_object(
   'name',name,'authenticatedExecute',signed_execute,
   'anonymousExecute',anon_execute) ORDER BY name)
  FROM f WHERE name IN ('frt_get_request','frt_list_requests','frt_dashboard')
 ),
 'financialAction',(
  SELECT jsonb_build_object('authenticatedExecute',signed_execute,
   'anonymousExecute',anon_execute)
  FROM f WHERE name='frt_request_action'
 ),
 'sessionGuardInstalled',to_regprocedure('private.frt_signed_session_active()') IS NOT NULL,
 'sessionGuardUsedByRoleResolver',
  pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure)
    LIKE '%private.frt_signed_session_active%',
 'rlsEnabledFRTTables',(
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'frt_%'
   AND c.relkind='r' AND c.relrowsecurity
 ),
 'directAuthenticatedTableReadGrants',(
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'frt_%'
   AND c.relkind='r' AND has_table_privilege('authenticated',c.oid,'SELECT')
 ),
 'directAuthenticatedTableWriteGrants',(
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'frt_%'
   AND c.relkind='r' AND (
    has_table_privilege('authenticated',c.oid,'INSERT') OR
    has_table_privilege('authenticated',c.oid,'UPDATE') OR
    has_table_privilege('authenticated',c.oid,'DELETE'))
 ),
 'frtRequestCount',(SELECT count(*) FROM public.frt_requests),
 'frtAuditCount',(SELECT count(*) FROM public.frt_audit_logs),
 'frtLiquidationCount',(SELECT count(*) FROM public.frt_liquidations),
 'consumerCompatibility','NOT_VERIFIED_BY_DATABASE_INVENTORY',
 'genuineSignedSession','NOT_VERIFIED_BY_DATABASE_INVENTORY',
 'productionPermissionChangesMade',false
) AS sec14_inventory;
