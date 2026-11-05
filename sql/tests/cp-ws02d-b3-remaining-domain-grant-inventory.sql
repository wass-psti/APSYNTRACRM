-- CP-WS-02D/B3 remaining independent routine metadata, read only.
-- Source-text matches indicate review candidates, never proven vulnerabilities.
WITH routines AS (
 SELECT p.oid,p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
), classified AS (
 SELECT *,
  body ILIKE '%work_board_access%' AS uses_board_acl,
  body ILIKE '%current_workspace_id%' AS uses_workspace,
  body ~* '(INSERT INTO|UPDATE public[.]|DELETE FROM|PERFORM public[.])'
   AS possible_mutation,
  has_function_privilege('anon',oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated_execute,
  body ILIKE '%has_module_access%' AS has_module_access,
  body ILIKE '%is_platform_admin%' AS has_platform_admin,
  body ILIKE '%wm_board_config_session_active%' AS direct_session_predicate
 FROM routines
), remaining AS (
 SELECT * FROM classified WHERE uses_workspace AND possible_mutation
 AND NOT uses_board_acl
 AND proname NOT IN(
  'wm_create_board','wm_create_board_configured',
  'put_module_state','delete_module_state',
  'acquire_module_operation_lock','release_module_operation_lock',
  'import_fueltrack_activity_backup'
 )
)
SELECT count(*) AS remaining_review_candidates,
 count(*) FILTER(WHERE anon_execute) AS anon_executable_candidates,
 count(*) FILTER(WHERE authenticated_execute) AS authenticated_executable_candidates,
 count(*) FILTER(WHERE NOT authenticated_execute) AS nonclient_callable_candidates,
 count(*) FILTER(WHERE has_module_access) AS direct_module_acl_text_matches,
 count(*) FILTER(WHERE has_platform_admin) AS direct_platform_admin_text_matches,
 count(*) FILTER(WHERE direct_session_predicate) AS direct_session_text_matches,
 (SELECT jsonb_agg(proname ORDER BY proname) FROM remaining)
 AS remaining_function_names
FROM remaining;
