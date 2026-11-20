-- CP-FRT-NATIVE-ROLE-01: resolve the existing Fund Released Tracker workspace
-- assignment from the same authoritative frt_memberships source used by URM.
-- No new role, grant, policy or application registry is introduced.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';

CREATE OR REPLACE FUNCTION public.apsyntra_scoped_module_role(
 p_module_id text,p_user_id uuid,p_workspace_id uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT CASE
  WHEN p_module_id='fund-released-tracker' AND EXISTS (
   SELECT 1 FROM public.frt_memberships f
   WHERE f.workspace_id=p_workspace_id AND f.user_id=p_user_id
  ) THEN (
   SELECT CASE WHEN f.enabled IS TRUE AND f.status='active'
     THEN f.role ELSE NULL END
   FROM public.frt_memberships f
   WHERE f.workspace_id=p_workspace_id AND f.user_id=p_user_id
  )
  WHEN EXISTS (
   SELECT 1 FROM public.apsyntra_workspace_module_roles s
   WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id
     AND s.module_id=p_module_id
  ) THEN (
   SELECT CASE WHEN s.enabled THEN s.role ELSE NULL END
   FROM public.apsyntra_workspace_module_roles s
   WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id
     AND s.module_id=p_module_id
  )
  ELSE (
   SELECT m.role FROM public.module_role_assignments m
   WHERE m.user_id=p_user_id AND m.module_id=p_module_id
     AND m.enabled IS TRUE
  )
 END
 WHERE p_user_id IS NOT NULL AND p_workspace_id IS NOT NULL
  AND EXISTS (
   SELECT 1 FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_user_id
     AND wm.active IS TRUE
  );
$function$;
-- CREATE OR REPLACE retains the pre-existing function owner and EXECUTE ACL.
COMMIT;
