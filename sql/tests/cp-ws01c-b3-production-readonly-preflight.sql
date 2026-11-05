-- CP-WS-01C/B3 — READ-ONLY preactivation gate (works in production and disposable PG17).
-- No DDL, DML, GRANT/REVOKE, user impersonation, session writes, or production activation.
-- A READY result establishes schema prerequisites only. It NEVER approves B3 role policy
-- or authorizes the production B3 function / authenticated EXECUTE / lifecycle flag.
WITH private_tables AS (
 SELECT count(*) AS total,
  count(*) FILTER (WHERE c.relrowsecurity) AS with_rls,
  count(*) FILTER (WHERE
   has_table_privilege('authenticated',c.oid,'SELECT')
   OR has_table_privilege('authenticated',c.oid,'INSERT')
   OR has_table_privilege('authenticated',c.oid,'UPDATE')
   OR has_table_privilege('authenticated',c.oid,'DELETE')
   OR has_table_privilege('anon',c.oid,'SELECT')
   OR has_table_privilege('anon',c.oid,'INSERT')
   OR has_table_privilege('anon',c.oid,'UPDATE')
   OR has_table_privilege('anon',c.oid,'DELETE')) AS exposed
 FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='private' AND c.relkind='r'
  AND c.relname IN (
   'ws01_workspace_policy','ws01_member_roles','ws01_create_requests',
   'ws01_session_choices','ws01_lifecycle_flags','ws01_events')
), preflight AS (
 SELECT
  t.total=6 AND t.with_rls=6 AND t.exposed=0 AS six_private_tables_default_deny,
  NOT EXISTS (SELECT 1 FROM pg_policies
   WHERE schemaname='private' AND tablename IN (
    'ws01_workspace_policy','ws01_member_roles','ws01_create_requests',
    'ws01_session_choices','ws01_lifecycle_flags','ws01_events'))
    AS private_rls_policies_absent,
  to_regprocedure('private.wm_board_config_session_active()') IS NOT NULL
    AS existing_session_guard,
  to_regprocedure('public.current_workspace_id(uuid)') IS NOT NULL
    AS existing_workspace_resolver,
  to_regprocedure('public.wm_ws01_list()') IS NOT NULL
    AND has_function_privilege('authenticated','public.wm_ws01_list()','EXECUTE')
    AND NOT has_function_privilege('anon','public.wm_ws01_list()','EXECUTE')
    AS b2_signed_discovery_grant_unchanged,
  to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
    AND to_regprocedure('private.ws01_signed_actor_session()') IS NULL
    AS b3_functions_not_installed,
  to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
    AS b4_switching_not_installed,
  NOT has_table_privilege('authenticated','public.workspaces','INSERT')
    AND NOT has_table_privilege('authenticated','public.workspace_members','INSERT')
    AND NOT has_table_privilege('anon','public.workspaces','INSERT')
    AND NOT has_table_privilege('anon','public.workspace_members','INSERT')
    AS direct_workspace_creation_denied,
  (SELECT count(*)=1 FROM private.ws01_lifecycle_flags
   WHERE id IS TRUE AND creation_enabled IS FALSE
    AND selection_enabled IS FALSE) AS lifecycle_flags_disabled,
  (SELECT count(*) FROM private.ws01_create_requests) AS prior_create_requests,
  (SELECT count(*) FROM private.ws01_events) AS prior_workspace_events,
  (SELECT count(*) FROM public.workspaces) AS workspace_count,
  (SELECT count(*) FROM public.workspace_members WHERE active) AS active_membership_count
 FROM private_tables t
)
SELECT CASE WHEN
 six_private_tables_default_deny
 AND private_rls_policies_absent
 AND existing_session_guard
 AND existing_workspace_resolver
 AND b2_signed_discovery_grant_unchanged
 AND b3_functions_not_installed
 AND b4_switching_not_installed
 AND direct_workspace_creation_denied
 AND lifecycle_flags_disabled
 THEN 'B3_PREACTIVATION_SCHEMA_READY__ROLE_CEILING_AND_PRODUCTION_APPROVAL_PENDING'
 ELSE 'B3_PREACTIVATION_BLOCKED__REVIEW_SECURITY_OR_MIGRATION_STATE'
 END AS readiness,
 preflight.*
FROM preflight;
