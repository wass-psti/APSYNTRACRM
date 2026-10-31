-- CP-FRT-SEC10-CI07: narrowly scoped emergency rollback.
-- Restores the exact production CP06 role resolver baseline captured before activation.
-- This relaxes immediate session revocation: use only when needed to restore service.
-- Does not touch CRM roles, module assignments, users, tables, or financial data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
DO $preflight$
BEGIN
 IF to_regprocedure('private.frt_signed_session_active()') IS NULL OR
    position('private.frt_signed_session_active()' in
      pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure)) = 0
 THEN RAISE EXCEPTION 'CI07_ROLLBACK_GUARD_NOT_ACTIVE_OR_SOURCE_DRIFT'; END IF;
END;
$preflight$;
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
-- RESTRICT refuses to cascade into other live dependencies.
DROP FUNCTION private.frt_signed_session_active() RESTRICT;
DO $postflight$
BEGIN
 IF md5(pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure))
   <> '2b518f7be033ea25a6c103184c283a7d' THEN
   RAISE EXCEPTION 'CI07_ROLLBACK_NOT_EXACT_ORIGINAL';
 END IF;
END;
$postflight$;
NOTIFY pgrst, 'reload schema';
COMMIT;
