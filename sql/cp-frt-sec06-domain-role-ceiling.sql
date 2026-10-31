-- CP-FRT-SEC06: clamp the REAL FRT domain role resolver by the explicit
-- APSYNTRA CRM platform tier, not by UI visibility or user-edited JWT claims.
-- Apply after cp-frt-sec06-crm-platform-role-cap.sql; preserve original role flow.
BEGIN;
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
 WHERE public.apsyntra_crm_explicit_role(auth.uid(),p_workspace_id) IS NULL
    OR public.apsyntra_crm_module_role_rank(
         'fund-released-tracker',role_source.role)
       <= public.apsyntra_crm_role_rank(
         public.apsyntra_crm_effective_role(auth.uid(),p_workspace_id));
$$;
-- private.frt_has_role and private.frt_has_membership already delegate
-- to this exact resolver, so all original FRT request, approval,
-- liquidation, attachment and list RPCs inherit the effective role cap.
-- No FRT finance objects, user roles or requests are modified.
COMMIT;
