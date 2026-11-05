-- CP-WS-01C/B1 — PRODUCTION READ-ONLY SCHEMA PRECHECK.
-- Nonmutating. Never interprets a schema PASS as permission to apply DDL.
WITH baseline AS (
 SELECT
  to_regnamespace('private') IS NOT NULL AS private_schema,
  to_regclass('public.workspaces') IS NOT NULL AS workspaces,
  to_regclass('public.workspace_members') IS NOT NULL AS memberships,
  to_regclass('public.profiles') IS NOT NULL AS profiles,
  to_regclass('auth.sessions') IS NOT NULL AS sessions,
  to_regprocedure('private.wm_board_config_session_active()') IS NOT NULL AS signed_session_guard,
  to_regprocedure('public.current_workspace_id(uuid)') IS NOT NULL AS workspace_authority,
  (SELECT count(*)=6 FROM (
    VALUES ('ws01_workspace_policy'),('ws01_member_roles'),
    ('ws01_create_requests'),('ws01_session_choices'),
    ('ws01_lifecycle_flags'),('ws01_events')
   ) v(name) WHERE to_regclass('private.'||v.name) IS NULL)
   AS six_b1_tables_absent,
  (SELECT count(*)=5 FROM (
    VALUES ('private.ws01_signed_actor_session()'),
    ('private.ws01_prune_session_choices()'),
    ('public.wm_ws01_create(text,text,uuid)'),
    ('public.wm_ws01_list()'),('public.wm_ws01_select(uuid,uuid)')
   ) v(signature) WHERE to_regprocedure(v.signature) IS NULL)
   AS lifecycle_functions_absent,
  NOT EXISTS (
   SELECT 1 FROM pg_trigger t
   WHERE t.tgrelid='public.workspace_members'::regclass
    AND t.tgname='ws01_prune_session_choices'
    AND NOT t.tgisinternal
  ) AS switching_trigger_absent,
  (SELECT count(*)=3 FROM pg_constraint c
   WHERE c.contype='p' AND
   c.conrelid IN ('public.workspaces'::regclass,
                  'public.workspace_members'::regclass,
                  'public.profiles'::regclass)) AS three_primary_keys,
  EXISTS(SELECT 1 FROM pg_constraint c
   WHERE c.contype='p' AND c.conrelid='auth.sessions'::regclass
    AND pg_get_constraintdef(c.oid)='PRIMARY KEY (id)')
   AS sessions_id_primary_key,
  NOT has_table_privilege('authenticated','public.workspaces','INSERT')
   AND NOT has_table_privilege('authenticated','public.workspace_members','INSERT')
   AS direct_insert_denied,
  has_function_privilege('authenticated',
    'public.current_workspace_id(uuid)','EXECUTE')
   AS existing_workspace_authority_execute,
  (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
   WHERE p.oid=to_regprocedure('public.current_workspace_id(uuid)'))
   AS current_workspace_authority_fingerprint
), inventory AS (
 SELECT (SELECT count(*) FROM public.workspaces) existing_workspace_count,
  (SELECT count(*) FROM public.workspace_members WHERE active)
   existing_active_membership_count,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN('public','private') AND p.prokind='f'
     AND pg_get_functiondef(p.oid) LIKE '%current_workspace_id%')
   AS authority_referencing_function_definitions
) SELECT b.*,i.*,
 CASE WHEN
  b.private_schema AND b.workspaces AND b.memberships AND b.profiles
  AND b.sessions AND b.signed_session_guard AND b.workspace_authority
  AND b.six_b1_tables_absent AND b.lifecycle_functions_absent
  AND b.switching_trigger_absent AND b.three_primary_keys
  AND b.sessions_id_primary_key AND b.direct_insert_denied
  AND b.existing_workspace_authority_execute
 THEN 'B1_SCHEMA_READY__SEPARATE_PRODUCTION_APPROVAL_AND_BACKUP_EVIDENCE_REQUIRED'
 ELSE 'B1_SCHEMA_BLOCKED__REVIEW_DATABASE_DRIFT' END AS b1_preflight_status
 FROM baseline b CROSS JOIN inventory i;
