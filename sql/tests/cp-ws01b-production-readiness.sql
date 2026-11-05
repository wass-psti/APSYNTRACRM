-- CP-WS-01B — LIVE SAFE PRECHECK ONLY. No mutation/DDL/permission changes.
-- Run against the EXISTING Supabase project before considering activation.
-- A PASS only verifies schema prerequisites, not production authorization.
WITH dependencies AS (
 SELECT
  to_regclass('public.workspaces') IS NOT NULL AS workspaces_present,
  to_regclass('public.workspace_members') IS NOT NULL AS memberships_present,
  to_regclass('public.profiles') IS NOT NULL AS profiles_present,
  to_regclass('auth.sessions') IS NOT NULL AS sessions_present,
  EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='auth.sessions'::regclass AND contype='p'
     AND pg_get_constraintdef(oid) LIKE '%(id)%') AS sessions_id_primary_key,
  to_regprocedure('private.wm_board_config_session_active()') IS NOT NULL
    AS session_guard_present,
  to_regprocedure('public.current_workspace_id(uuid)') IS NOT NULL
    AS current_workspace_present,
  to_regclass('private.ws01_workspace_policy') IS NULL
    AND to_regclass('private.ws01_member_roles') IS NULL
    AND to_regclass('private.ws01_create_requests') IS NULL
    AND to_regclass('private.ws01_session_choices') IS NULL
    AS staged_tables_absent,
  to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
    AND to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
    AND to_regprocedure('public.wm_ws01_list()') IS NULL
    AS staged_rpc_absent,
  NOT has_table_privilege('authenticated','public.workspaces','SELECT')
    AND NOT has_table_privilege('authenticated','public.workspaces','INSERT')
    AND NOT has_table_privilege('authenticated','public.workspace_members','INSERT')
    AS direct_workspace_grants_denied
), callers AS (
 SELECT count(*) AS definitions_referencing_current_workspace
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prokind='f'
   AND pg_get_functiondef(p.oid) LIKE '%current_workspace_id%'
) SELECT d.*,callers.definitions_referencing_current_workspace,
 (SELECT count(*) FROM public.workspaces) AS total_workspaces,
 (SELECT count(*) FROM public.workspace_members WHERE active)
   AS active_workspace_memberships,
 CASE WHEN d.workspaces_present AND d.memberships_present
  AND d.profiles_present AND d.sessions_present AND d.sessions_id_primary_key
  AND d.session_guard_present AND d.current_workspace_present
  AND d.staged_tables_absent AND d.staged_rpc_absent
  AND d.direct_workspace_grants_denied
 THEN 'SCHEMA_PRECHECK_PASS__SEPARATE_PRODUCTION_APPROVAL_REQUIRED'
 ELSE 'SCHEMA_PRECHECK_BLOCKED__REVIEW_DRIFT' END AS readiness
 FROM dependencies d CROSS JOIN callers;
