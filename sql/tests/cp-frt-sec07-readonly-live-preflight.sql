-- CP-FRT-SEC07 — explicitly READ-ONLY production migration gate.
-- Run against connected WatchdogWorkspace Supabase only for preflight.
-- No migrations, role mutations, account/session changes or data exports.
SELECT
 (to_regclass('public.apsyntra_crm_platform_roles') IS NOT NULL)
   AS crm_role_table_installed,
 (to_regprocedure('public.apsyntra_crm_platform_role_snapshot(uuid)') IS NOT NULL)
   AS crm_snapshot_installed,
 (to_regprocedure('public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)') IS NOT NULL)
   AS crm_setter_installed,
 (to_regprocedure('public.apsyntra_crm_explicit_role(uuid,uuid)') IS NOT NULL)
   AS crm_cap_installed,
 (to_regprocedure('public.apsyntra_crm_effective_role(uuid,uuid)') IS NOT NULL)
   AS crm_effective_role_installed,
 (to_regprocedure('private.frt_current_role(uuid)') IS NOT NULL)
   AS original_frt_resolver_present,
 (SELECT COUNT(*) FROM public.apsyntra_role_bootstrap_identities)
   AS bootstrap_identities,
 (SELECT COUNT(*) FROM public.module_role_assignments)
   AS module_assignments,
 (SELECT COUNT(*) FROM public.frt_memberships)
   AS frt_memberships,
 (SELECT COUNT(*) FROM public.work_boards)
   AS boards,
 (SELECT COUNT(*) FROM public.apsyntra_role_change_audit)
   AS role_change_audit_rows,
 (SELECT COUNT(DISTINCT workspace_id) FROM public.workspace_members
   WHERE active) AS workspaces_with_active_members;
SELECT n.nspname AS schema_name,p.proname AS function_name,
 p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS signed_role_execute,
 (position('apsyntra_role_require_scope' in pg_get_functiondef(p.oid))>0)
  AS original_bootstrap_guard_present
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN
 ('apsyntra_crm_platform_role_snapshot','apsyntra_crm_platform_role_set',
  'apsyntra_role_user_management_snapshot','apsyntra_role_manage_user_access'))
 OR (n.nspname='private' AND p.proname='frt_current_role')
ORDER BY n.nspname,p.proname;
