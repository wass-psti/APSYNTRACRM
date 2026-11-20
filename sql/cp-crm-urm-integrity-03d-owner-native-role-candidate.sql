-- NONPRODUCTION POLICY CANDIDATE ONLY. NEVER DEPLOY AS A GRANT OR RPC.
-- Evaluates the pre-existing personal Main Workspace owner identity and
-- proposes *four* native role mappings. It is deliberately NOT connected
-- to has_module_access, module_role_for, permissions, RLS or any UI feature.
-- There is no SECURITY DEFINER or GRANT EXECUTE in this candidate.
CREATE OR REPLACE FUNCTION private.cp_crm_urm_03d_owner_native_role_candidate(
 p_user_id uuid,p_workspace_id uuid,p_module_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $candidate$
 SELECT CASE p_module_id
   WHEN 'time-tracker' THEN 'System Admin'
   WHEN 'fund-released-tracker' THEN 'GENERAL_MANAGER'
   WHEN 'fueltrack-plus' THEN 'Admin'
   WHEN 'tradelink' THEN 'General Manager'
   ELSE NULL
 END
 WHERE p_user_id IS NOT NULL
   AND p_workspace_id IS NOT NULL
   AND p_workspace_id=public.current_workspace_id(p_user_id)
   AND public.apsyntra_crm_effective_role(p_user_id,p_workspace_id)='admin'
   AND EXISTS (
     SELECT 1 FROM private.ws02_personal_workspaces own
     JOIN private.ws01_member_roles rel
       ON rel.workspace_id=own.workspace_id AND rel.user_id=own.user_id
     JOIN public.workspace_members wm
       ON wm.workspace_id=own.workspace_id AND wm.user_id=own.user_id
     JOIN public.profiles profile ON profile.id=own.user_id
     WHERE own.user_id=p_user_id AND own.workspace_id=p_workspace_id
       AND lower(btrim(rel.relation))='owner'
       AND wm.active IS TRUE AND profile.status='active'
   )
   -- Existing explicit overrides require a separate policy decision.
   -- This candidate never bypasses an explicit workspace CRM ceiling.
   AND NOT EXISTS (
     SELECT 1 FROM public.apsyntra_crm_platform_roles ceiling
     WHERE ceiling.user_id=p_user_id AND ceiling.workspace_id=p_workspace_id
   );
$candidate$;
