-- Disposable PostgreSQL ONLY. Source-aligned post-CI07 session guard
-- shape for testing a guarded production REVOKE script in isolation.
-- This is NOT a Supabase Auth-issued token/session, not a live migration.
-- The earlier isolated role-ceiling fixture has no auth.sessions catalog.
CREATE OR REPLACE FUNCTION private.frt_signed_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$ SELECT auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION private.frt_signed_session_active()
FROM PUBLIC,anon,authenticated;

-- Preserve the SEC06 module role ceiling and active workspace membership,
-- adding only the simulation-only session predicate for this late cutover test.
CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
 SELECT role_source.role
 FROM (
   SELECT CASE WHEN p.platform_role='admin_general_manager' THEN 'GENERAL_MANAGER'
               ELSE a.role END AS role
   FROM public.profiles p
   JOIN public.workspace_members wm ON wm.user_id=p.id
     AND wm.workspace_id=p_workspace_id AND wm.active=true
   LEFT JOIN public.module_role_assignments a ON a.user_id=p.id
     AND a.module_id='fund-released-tracker' AND a.enabled=true
   WHERE p.id=(SELECT auth.uid()) AND p.status='active'
     AND (p.platform_role='admin_general_manager' OR
       a.role IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'))
   LIMIT 1
 ) role_source
 WHERE private.frt_signed_session_active()
 AND (public.apsyntra_crm_explicit_role(auth.uid(),p_workspace_id) IS NULL
    OR public.apsyntra_crm_module_role_rank(
         'fund-released-tracker',role_source.role)
       <= public.apsyntra_crm_role_rank(
         public.apsyntra_crm_effective_role(auth.uid(),p_workspace_id)));
$$;
