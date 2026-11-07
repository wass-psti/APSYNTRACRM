-- CP-WS-01C/B3 read-only activated-phase authorization inventory.
-- This query never creates workspace rows, changes grants or flips flags.
-- It can be used after a reviewed production activation or in disposable PG17.
WITH f AS (
 SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_userbyid(p.proowner) AS owner_name,p.prosecdef,p.proconfig,
  md5(pg_get_functiondef(p.oid)) AS definition_md5,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS signed_exec,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_exec
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname='wm_ws01_create') OR
       (n.nspname='private' AND p.proname='ws01_signed_actor_session')
),
private_tables AS (
 SELECT count(*) AS present,
  count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
  count(*) FILTER (WHERE has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')) AS direct_exposed
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='private' AND c.relkind='r'
  AND c.relname IN ('ws01_workspace_policy','ws01_member_roles',
   'ws01_create_requests','ws01_session_choices',
   'ws01_lifecycle_flags','ws01_events')
),proof AS (
 SELECT
  (SELECT count(*)=2 AND bool_and(owner_name='postgres' AND prosecdef
   AND proconfig @> ARRAY['search_path=""']::text[])
   FROM f) AS source_boundary_locked,
  (SELECT count(*)=1 FROM f WHERE nspname='public' AND proname='wm_ws01_create'
    AND identity_args='p_name text, p_privacy text, p_request_id uuid'
    AND definition_md5='63395e8cb451560b16fd2ccb07a8d20c'
    AND signed_exec AND NOT anon_exec AND NOT public_exec) AS create_rpc_minimal_authenticated_grant,
  (SELECT count(*)=1 FROM f WHERE nspname='private' AND proname='ws01_signed_actor_session'
    AND definition_md5='25a49e8acb1429110456c4de2211691e'
    AND NOT signed_exec AND NOT anon_exec AND NOT public_exec) AS private_session_guard_not_directly_exposed,
  (SELECT count(*)=1 FROM private.ws01_lifecycle_flags
    WHERE id IS TRUE AND creation_enabled IS TRUE AND selection_enabled IS FALSE) AS creation_only_enabled,
  (SELECT present=6 AND rls_enabled=6 AND direct_exposed=0 FROM private_tables)
    AS private_workspace_tables_default_deny,
  has_function_privilege('authenticated','public.wm_ws01_list()','EXECUTE')
    AND NOT has_function_privilege('anon','public.wm_ws01_list()','EXECUTE')
    AS existing_signed_discovery_preserved,
  NOT has_table_privilege('authenticated','public.workspaces','INSERT')
    AND NOT has_table_privilege('authenticated','public.workspace_members','INSERT')
    AND NOT has_table_privilege('anon','public.workspaces','INSERT')
    AND NOT has_table_privilege('anon','public.workspace_members','INSERT')
    AS direct_workspace_insert_denied,
  to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL AS b4_switching_absent,
  (SELECT count(*) FROM private.ws01_create_requests) AS creation_requests,
  (SELECT count(*) FROM private.ws01_events WHERE action='workspace.created') AS created_audit_events,
  (SELECT count(*) FROM public.workspaces) AS workspace_count,
  (SELECT count(*) FROM public.workspace_members WHERE active) AS active_memberships
)
SELECT CASE WHEN source_boundary_locked AND create_rpc_minimal_authenticated_grant
 AND private_session_guard_not_directly_exposed AND creation_only_enabled
 AND private_workspace_tables_default_deny AND existing_signed_discovery_preserved
 AND direct_workspace_insert_denied AND b4_switching_absent
 THEN 'WS01C_B3_CREATION_ACTIVE_AUTHENTICATED_RPC_ONLY__NO_B4'
 ELSE 'WS01C_B3_ACTIVATION_SECURITY_BLOCKED' END AS acceptance,*
FROM proof;