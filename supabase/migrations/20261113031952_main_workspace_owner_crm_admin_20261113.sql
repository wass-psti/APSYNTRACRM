-- CP-MAIN-WS-OWNER-ADMIN-01
-- Derive CRM Admin only for the verified owner of that account's personal Main Workspace.
-- The personal-workspace mapping and owner relation are both required. This does not
-- grant CRM Admin in Work Management or any other workspace, and does not alter roles.
BEGIN;

CREATE OR REPLACE FUNCTION public.apsyntra_crm_effective_role(
 p_user uuid,
 p_workspace uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
 SELECT CASE
  WHEN EXISTS (
   SELECT 1
   FROM private.ws02_personal_workspaces personal
   JOIN private.ws01_member_roles owner_role
     ON owner_role.workspace_id=personal.workspace_id
    AND owner_role.user_id=personal.user_id
   WHERE personal.user_id=p_user
     AND personal.workspace_id=p_workspace
     AND lower(btrim(owner_role.relation))='owner'
  ) THEN 'admin'
  ELSE coalesce(
   (SELECT a.role
    FROM public.apsyntra_crm_platform_roles a
    WHERE a.user_id=p_user
      AND a.workspace_id=p_workspace),
   CASE p.platform_role
    WHEN 'admin_general_manager' THEN 'admin'
    WHEN 'hr' THEN 'supervisor'
    WHEN 'supervisor' THEN 'supervisor'
    ELSE 'employee'
   END
  )
 END
 FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id
 WHERE p.id=p_user
   AND p.status='active'
   AND wm.workspace_id=p_workspace
   AND wm.active
 LIMIT 1;
$function$;

-- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL. In particular,
-- this internal helper remains unavailable to anon/authenticated direct callers.
NOTIFY pgrst,'reload schema';
COMMIT;
