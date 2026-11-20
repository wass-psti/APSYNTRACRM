-- CP-CRM-URM-INTEGRITY-03E: DISPOSABLE EVALUATION ONLY.
-- Do not install in production without a distinct permission-change approval.
-- Requires the 03D owner candidate and the 02B scoped module-role schema.
-- Existing explicit scoped disabled assignments take precedence over all fallbacks;
-- legacy enabled assignments take precedence over the personal owner proposal.
CREATE OR REPLACE FUNCTION public.apsyntra_scoped_module_role(
 p_module_id text,p_user_id uuid,p_workspace_id uuid
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $read$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM public.apsyntra_workspace_module_roles s
   WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id AND s.module_id=p_module_id)
  THEN (SELECT CASE WHEN s.enabled THEN s.role ELSE NULL END
        FROM public.apsyntra_workspace_module_roles s
        WHERE s.workspace_id=p_workspace_id AND s.user_id=p_user_id AND s.module_id=p_module_id)
  ELSE COALESCE(
   (SELECT m.role FROM public.module_role_assignments m
    WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled IS TRUE),
   private.cp_crm_urm_03d_owner_native_role_candidate(p_user_id,p_workspace_id,p_module_id))
 END
 WHERE p_user_id IS NOT NULL AND p_workspace_id IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.workspace_members wm
    JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
    WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_user_id AND wm.active IS TRUE);
$read$;
