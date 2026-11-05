-- CP-WS-02D/B2 — LIVE READ-ONLY CATALOG, no DDL/DML and no user data.
-- Run only as a privileged observer; DO NOT interpret text matches as
-- authorization proofs or activate a workspace ceiling based on this inventory.
-- Source functions and grants can drift; refresh before any staged cutover.
WITH definer_routines AS (
 SELECT p.oid,p.proname,
  pg_get_function_identity_arguments(p.oid) AS signature_arguments,
  pg_get_functiondef(p.oid) AS source_body
 FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
), candidates AS (
 SELECT *,
  CASE
   WHEN proname LIKE 'employee_evaluation_%' THEN 'employee-evaluation'
   WHEN proname LIKE 'order_intake_%' THEN 'order-intake'
   WHEN proname LIKE 'tradelink_%' THEN 'tradelink'
   WHEN proname LIKE 'wm_create_board%' THEN 'board-catalog'
   WHEN proname IN ('charter_admin_set_role','wm_admin_set_application_role')
     THEN 'role-administration'
   WHEN proname LIKE '%fueltrack%' OR proname LIKE 'import_fueltrack%'
     THEN 'fueltrack'
   WHEN proname LIKE '%module_state%' THEN 'module-state'
   WHEN proname LIKE '%module_operation_lock%' THEN 'module-lock'
   WHEN proname='append_module_activity' THEN 'module-activity'
   WHEN proname LIKE 'timetracker_%' THEN 'timetracker'
   ELSE 'unclassified'
  END AS domain_family
 FROM definer_routines
 WHERE source_body ILIKE '%current_workspace_id%'
  AND source_body NOT ILIKE '%work_board_access%'
  AND source_body ~* '(INSERT INTO|UPDATE public[.]|DELETE FROM|PERFORM public[.])'
)
SELECT domain_family,proname,signature_arguments,
 has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',oid,'EXECUTE') AS anonymous_execute,
 source_body ~* 'auth[.]uid' AS has_actor_reference,
 source_body ~* 'has_module_access|module_role_for|is_platform_admin'
   AS has_legacy_role_reference,
 source_body ~* 'auth[.]sessions|wm_board_config_session_active|ws01_signed_actor_session|session_id'
   AS has_explicit_signed_session_reference,
 source_body ~* 'ws02d_workspace_ceiling' AS has_ws02d_ceiling_reference
FROM candidates
ORDER BY domain_family,proname,signature_arguments;
