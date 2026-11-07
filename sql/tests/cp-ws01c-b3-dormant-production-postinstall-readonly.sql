-- CP-WS-01C/B3 — POST-INSTALL READ-ONLY security acceptance.
-- Executes safely against existing production and disposable PG17 AFTER installing
-- dormant B3 functions. It NEVER grants function access, enables a lifecycle flag,
-- creates workspaces, modifies sessions or writes application records.
WITH functions AS (
 SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,
  pg_get_userbyid(p.proowner) AS owner_name,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS signed_execute,
  EXISTS (
   SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
   WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) AS public_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND p.proname='ws01_signed_actor_session'
         AND pg_get_function_identity_arguments(p.oid)='')
    OR (n.nspname='public' AND p.proname='wm_ws01_create'
         AND pg_get_function_identity_arguments(p.oid)='p_name text, p_privacy text, p_request_id uuid')
),
private_tables AS (
 SELECT count(*) AS total,
  count(*) FILTER (WHERE c.relrowsecurity) AS with_rls,
  count(*) FILTER (WHERE
   has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  ) AS exposed
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='private' AND c.relkind='r' AND
  c.relname IN ('ws01_workspace_policy','ws01_member_roles',
   'ws01_create_requests','ws01_session_choices',
   'ws01_lifecycle_flags','ws01_events')
),
proof AS (
 SELECT
  (SELECT count(*)=2 AND
   bool_and(prosecdef AND owner_name='postgres' AND
    proconfig @> ARRAY['search_path=""']::text[] AND
    NOT anon_execute AND NOT signed_execute AND NOT public_execute)
   FROM functions) AS dormant_functions_secured,
  (SELECT total=6 AND with_rls=6 AND exposed=0 FROM private_tables)
   AS private_workspace_tables_default_deny,
  NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='private'
   AND tablename IN ('ws01_workspace_policy','ws01_member_roles',
    'ws01_create_requests','ws01_session_choices',
    'ws01_lifecycle_flags','ws01_events'))
   AS no_private_client_rls_policies,
  (SELECT count(*)=1 FROM private.ws01_lifecycle_flags
   WHERE id IS TRUE AND creation_enabled IS FALSE
     AND selection_enabled IS FALSE) AS creation_and_switch_off,
  to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL AS b4_absent,
  has_function_privilege('authenticated','public.wm_ws01_list()','EXECUTE')
   AND NOT has_function_privilege('anon','public.wm_ws01_list()','EXECUTE')
   AS existing_member_discovery_preserved,
  NOT has_table_privilege('authenticated','public.workspaces','INSERT')
   AND NOT has_table_privilege('authenticated','public.workspace_members','INSERT')
   AND NOT has_table_privilege('anon','public.workspaces','INSERT')
   AND NOT has_table_privilege('anon','public.workspace_members','INSERT')
   AS direct_workspace_writes_denied,
  (SELECT count(*) FROM private.ws01_create_requests) AS create_requests,
  (SELECT count(*) FROM private.ws01_events) AS lifecycle_events,
  (SELECT count(*) FROM public.workspaces) AS existing_workspaces,
  (SELECT count(*) FROM public.workspace_members WHERE active) AS active_memberships
)
SELECT CASE WHEN
 dormant_functions_secured AND private_workspace_tables_default_deny
 AND no_private_client_rls_policies AND creation_and_switch_off
 AND b4_absent AND existing_member_discovery_preserved
 AND direct_workspace_writes_denied
 AND create_requests=0 AND lifecycle_events=0
 THEN 'B3_DORMANT_SIGNED_CREATE_CONTRACT_INSTALLED__NO_CLIENT_EXECUTE_NO_CREATION'
 ELSE 'B3_DORMANT_POSTINSTALL_SECURITY_BLOCKED' END AS acceptance,
 proof.*
FROM proof;
