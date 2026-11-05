-- CP-WS-01C/B2 — READ-ONLY production discovery readiness, never activates an RPC.
-- Run after verified B1 only; zero grants, schema mutations or user records.
WITH scope AS (
 SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='private' AND c.relkind='r' AND c.relname IN(
    'ws01_workspace_policy','ws01_member_roles','ws01_create_requests',
    'ws01_session_choices','ws01_lifecycle_flags','ws01_events')
    AND c.relrowsecurity) AS b1_private_rls_table_count,
  to_regprocedure('private.wm_board_config_session_active()') IS NOT NULL AS signed_session_guard,
  to_regprocedure('public.current_workspace_id(uuid)') IS NOT NULL AS current_workspace_resolver,
  to_regprocedure('public.wm_ws01_list()') IS NULL AS discovery_rpc_absent,
  to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL AS creation_rpc_absent,
  to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL AS switching_rpc_absent,
  NOT has_table_privilege('authenticated','private.ws01_member_roles','SELECT')
    AND NOT has_table_privilege('authenticated','private.ws01_workspace_policy','SELECT')
    AS direct_member_privacy_select_denied,
  (SELECT count(*)=1 FROM private.ws01_lifecycle_flags
   WHERE id IS TRUE AND creation_enabled IS FALSE
    AND selection_enabled IS FALSE) AS lifecycle_flags_disabled,
  (SELECT count(*) FROM private.ws01_workspace_policy) AS explicit_workspace_policies,
  (SELECT count(*) FROM private.ws01_member_roles) AS explicit_workspace_roles,
  (SELECT count(*) FROM public.workspace_members WHERE active) AS active_memberships,
  (SELECT count(*) FROM public.workspaces) AS workspace_count
)
SELECT scope.*,
 CASE WHEN b1_private_rls_table_count=6 AND signed_session_guard
   AND current_workspace_resolver AND discovery_rpc_absent
   AND creation_rpc_absent AND switching_rpc_absent
   AND direct_member_privacy_select_denied AND lifecycle_flags_disabled
 THEN 'B2_DISCOVERY_SCHEMA_READY__NEW_AUTHENTICATED_EXECUTE_GRANT_NOT_APPLIED'
 ELSE 'B2_DISCOVERY_BLOCKED__REVIEW_SCHEMA_OR_GRANTS' END AS readiness
FROM scope;
