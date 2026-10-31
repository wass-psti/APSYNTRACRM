-- CP-FRT-SEC08 production postcheck: strictly SELECT, no state changes.
-- Backend activation requires real signed-session acceptance separately.
SELECT
 to_regclass('public.apsyntra_crm_platform_roles') IS NOT NULL AS role_table_installed,
 to_regprocedure('public.apsyntra_crm_platform_role_snapshot(uuid)') IS NOT NULL AS snapshot_installed,
 to_regprocedure('public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)') IS NOT NULL AS setter_installed,
 to_regprocedure('public.apsyntra_crm_explicit_role(uuid,uuid)') IS NOT NULL AS explicit_cap_installed,
 (SELECT COUNT(*) FROM public.apsyntra_crm_platform_roles) AS explicit_overrides,
 (SELECT COUNT(*) FROM public.module_role_assignments) AS module_assignments,
 (SELECT COUNT(*) FROM public.work_board_members) AS board_memberships,
 (SELECT COUNT(*) FROM public.frt_memberships) AS frt_memberships,
 (SELECT COUNT(*) FROM public.apsyntra_role_bootstrap_identities) AS bootstrap_accounts,
 (SELECT COUNT(*) FROM public.apsyntra_role_change_audit) AS audit_events,
 (SELECT COUNT(*) FROM public.work_boards) AS boards,
 (SELECT COUNT(*) FROM public.work_board_events) AS board_events;

SELECT relrowsecurity AS rls_enabled,
 relforcerowsecurity AS rls_forced,
 has_table_privilege('authenticated','public.apsyntra_crm_platform_roles','SELECT') AS client_table_select,
 has_table_privilege('authenticated','public.apsyntra_crm_platform_roles','UPDATE') AS client_table_update,
 has_table_privilege('anon','public.apsyntra_crm_platform_roles','SELECT') AS anonymous_table_select
FROM pg_class WHERE oid='public.apsyntra_crm_platform_roles'::regclass;

SELECT proname,
 has_function_privilege('authenticated',oid,'EXECUTE') AS signed_client_execute
FROM pg_proc WHERE oid IN (
 'public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)'::regprocedure,
 'public.apsyntra_crm_platform_role_snapshot(uuid)'::regprocedure,
 'public.apsyntra_crm_explicit_role(uuid,uuid)'::regprocedure,
 'public.apsyntra_crm_effective_role(uuid,uuid)'::regprocedure)
ORDER BY proname;

SELECT
 position('apsyntra_crm_explicit_role' IN pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure))>0 AS frt_cap_active,
 position('apsyntra_crm_module_role_rank' IN pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure))>0 AS frt_rank_active,
 position('apsyntra_crm_explicit_role' IN pg_get_functiondef('public.work_board_access(uuid,text)'::regprocedure))>0 AS board_cap_active,
 position('apsyntra_crm_explicit_role' IN pg_get_functiondef('public.has_module_access(text,uuid)'::regprocedure))>0 AS module_cap_active;

WITH active_assignments AS (
 SELECT a.user_id,a.module_id,a.role,a.enabled,
 public.module_role_for(a.module_id,a.user_id) AS effective_role,
 public.has_module_access(a.module_id,a.user_id) AS allowed,
 CASE WHEN public.is_platform_admin(a.user_id) THEN
  CASE a.module_id WHEN 'time-tracker' THEN 'System Admin'
   WHEN 'fueltrack-plus' THEN 'Admin'
   WHEN 'tradelink' THEN 'General Manager'
   ELSE 'Admin' END
  ELSE CASE WHEN a.enabled THEN a.role ELSE NULL END END AS prior_expected
 FROM public.module_role_assignments a
 JOIN public.profiles p ON p.id=a.user_id WHERE p.status='active'
)
SELECT COUNT(*) AS active_module_assignments_checked,
 COUNT(*) FILTER(WHERE effective_role IS DISTINCT FROM prior_expected) AS changed_effective_roles,
 COUNT(*) FILTER(WHERE enabled AND allowed IS NOT TRUE) AS unexpected_denied_assignments
FROM active_assignments;

SELECT version,name FROM supabase_migrations.schema_migrations
WHERE name IN ('cp_frt_sec08_crm_platform_role_activation','cp_frt_sec08_frt_domain_role_ceiling')
ORDER BY version;
