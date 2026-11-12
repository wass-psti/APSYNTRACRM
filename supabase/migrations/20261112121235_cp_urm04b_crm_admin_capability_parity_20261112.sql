-- CP-URM-04B: CRM Admin capability parity without redefining bootstrap identity
-- Scope: central CRM role administration and its delegated role-assignment RPCs.
-- Unrelated application workflow guards remain unchanged.
BEGIN;

-- CRM Admin is an effective role in the signed caller's active workspace.
-- Bootstrap identity remains an independent, fixed two-account classification.
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1
  FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id=p.id
  WHERE p.id=auth.uid()
    AND p.status='active'
    AND wm.active IS TRUE
    AND wm.workspace_id=public.current_workspace_id(p.id)
    AND public.apsyntra_crm_effective_role(p.id,wm.workspace_id)='admin'
 );
$function$;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_admin() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_admin() TO authenticated;

-- Shared guard for CRM administration. No caller can choose another workspace.
CREATE OR REPLACE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL
   OR NOT public.apsyntra_role_is_admin()
   OR p_workspace_id IS NULL
   OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
   OR NOT EXISTS (
      SELECT 1 FROM public.workspace_members m
      JOIN public.profiles p ON p.id=m.user_id
      WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor
        AND m.active IS TRUE AND p.status='active'
   )
 THEN RAISE EXCEPTION 'CRM administrator access denied for current workspace'
   USING ERRCODE='42501'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.apsyntra_role_require_scope(uuid) FROM PUBLIC,anon,authenticated;

-- Separate internal guard preserves genuinely bootstrap-only consumers.
CREATE OR REPLACE FUNCTION public.apsyntra_role_require_bootstrap_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL
   OR NOT public.apsyntra_role_is_bootstrap()
   OR p_workspace_id IS NULL
   OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
   OR NOT EXISTS (
      SELECT 1 FROM public.workspace_members m
      JOIN public.profiles p ON p.id=m.user_id
      WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor
        AND m.active IS TRUE AND p.status='active'
   )
 THEN RAISE EXCEPTION 'Bootstrap identity access denied for current workspace'
   USING ERRCODE='42501'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.apsyntra_role_require_bootstrap_scope(uuid) FROM PUBLIC,anon,authenticated;

-- Preserve a minimal bootstrap-only TimeTracker Team Directory contract.
-- Do not expose the full CRM role catalog, proposals, boards or audit history here.
CREATE OR REPLACE FUNCTION public.timetracker_team_directory_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_data jsonb;
BEGIN
 PERFORM public.apsyntra_role_require_bootstrap_scope(p_workspace_id);
 SELECT jsonb_build_object(
  'workspaceId',p_workspace_id,'bootstrapVerified',true,'mode','staged_only',
  'users',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',p.id,'displayName',p.display_name,'email',p.email,'status',p.status,
    'bootstrapProtected',EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
                               WHERE b.user_id=p.id))
    ORDER BY p.display_name)
   FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
   WHERE wm.workspace_id=p_workspace_id AND wm.active IS TRUE AND p.status='active'),'[]'::jsonb),
  'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'userId',a.user_id,'moduleId',a.module_id,'role',a.role,'enabled',a.enabled,
    'updatedAt',a.updated_at) ORDER BY a.user_id)
   FROM public.module_role_assignments a JOIN public.workspace_members wm
     ON wm.user_id=a.user_id AND wm.workspace_id=p_workspace_id AND wm.active IS TRUE
   WHERE a.module_id='time-tracker'),'[]'::jsonb)
 ) INTO v_data;
 RETURN v_data;
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_team_directory_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_team_directory_snapshot(uuid) TO authenticated;

-- CRM administration snapshots identify the effective authorization tier.
-- bootstrapVerified remains the actual fixed-identity result for compatibility.
DO $snapshot_contracts$
DECLARE v_signature regprocedure; v_definition text;
        v_old text := $old$'workspaceId',p_workspace_id,'bootstrapVerified',true,$old$;
        v_new text := $new$'workspaceId',p_workspace_id,'adminVerified',true,'bootstrapVerified',public.apsyntra_role_is_bootstrap(),$new$;
BEGIN
 FOREACH v_signature IN ARRAY ARRAY[
  'public.apsyntra_role_configuration_snapshot(uuid)'::regprocedure,
  'public.apsyntra_role_user_management_snapshot(uuid)'::regprocedure,
  'public.apsyntra_crm_platform_role_snapshot(uuid)'::regprocedure
 ] LOOP
  v_definition:=pg_get_functiondef(v_signature);
  IF position(v_old IN v_definition)=0 THEN
   RAISE EXCEPTION 'Unexpected CRM administration snapshot contract: %',v_signature;
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
 END LOOP;
END;
$snapshot_contracts$;

-- Remove inherited platform-role classification as a target lock from CRM role
-- management. Only the two exact bootstrap identities remain protected here.
DO $target_protection$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.apsyntra_role_manage_user_access(uuid,uuid,text,text,text,boolean,timestamptz)'::regprocedure);
 IF position($old$    OR public.is_platform_admin(p_target_user_id)$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected central role mutation target guard'; END IF;
 EXECUTE replace(v_definition,$old$    OR public.is_platform_admin(p_target_user_id)$old$,'');
 v_definition:=pg_get_functiondef('public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)'::regprocedure);
 IF position($old$   OR public.is_platform_admin(p_target_user_id)$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected CRM platform role target guard'; END IF;
 EXECUTE replace(v_definition,$old$   OR public.is_platform_admin(p_target_user_id)$old$,'');
END;
$target_protection$;

-- Internal module-role dispatcher is part of CRM User Role Management.
-- Retain self-protection and exact bootstrap-target protection, but authorize
-- the signed CRM Admin in the active workspace rather than bootstrap identity.
DO $application_role_dispatch$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.wm_admin_set_application_role(uuid,text,text,boolean)'::regprocedure);
 IF position($old$if v_admin is null or not public.apsyntra_role_is_bootstrap() then$old$ IN v_definition)=0
 OR position($old$if p_user_id is null or p_user_id=v_admin or public.is_platform_admin(p_user_id) then$old$ IN v_definition)=0
 OR position($old$v_workspace:=public.current_workspace_id(v_admin);$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected application role dispatcher contract'; END IF;
 v_definition:=replace(v_definition,
  $old$if v_admin is null or not public.apsyntra_role_is_bootstrap() then$old$,
  $new$if v_admin is null then$new$);
 v_definition:=replace(v_definition,
  $old$if p_user_id is null or p_user_id=v_admin or public.is_platform_admin(p_user_id) then$old$,
  $new$if p_user_id is null or p_user_id=v_admin or exists(
   select 1 from public.apsyntra_role_bootstrap_identities b where b.user_id=p_user_id) then$new$);
 v_definition:=replace(v_definition,
  $old$v_workspace:=public.current_workspace_id(v_admin);$old$,
  $new$v_workspace:=public.current_workspace_id(v_admin);
 PERFORM public.apsyntra_role_require_scope(v_workspace);$new$);
 EXECUTE v_definition;
END;
$application_role_dispatch$;

-- FRT role assignment is a central user-role-management operation, not a
-- finance-workflow authorization. Preserve FRT role validation, workspace scope,
-- exact bootstrap target protection and the existing financial audit insert.
-- private.frt_has_role remains unchanged for actual FRT business operations.
DO $frt_role_assignment$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.frt_admin_set_role(uuid,uuid,text)'::regprocedure);
 IF position($old$DECLARE v_admin uuid:=(SELECT auth.uid()); v_email text;$old$ IN v_definition)=0
 OR position($old$OR public.is_platform_admin(p_user_id)$old$ IN v_definition)=0
 OR position($old$ SELECT lower(p.email) INTO v_email FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=p_workspace_id AND wm.active=true
 WHERE p.id=v_admin AND p.status='active' AND p.platform_role='admin_general_manager';
 IF v_email IS NULL OR v_email NOT IN ('asenagan@watchdogautomation.com.ph','lmsenagan@watchdogautomation.com.ph') THEN
   RAISE EXCEPTION 'Bootstrap administrator required' USING errcode='42501';
 END IF;$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected FRT central role assignment contract'; END IF;
 v_definition:=replace(v_definition,
  $old$DECLARE v_admin uuid:=(SELECT auth.uid()); v_email text;$old$,
  $new$DECLARE v_admin uuid:=(SELECT auth.uid());$new$);
 v_definition:=replace(v_definition,$old$OR public.is_platform_admin(p_user_id)$old$,'');
 v_definition:=replace(v_definition,
  $old$ SELECT lower(p.email) INTO v_email FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=p_workspace_id AND wm.active=true
 WHERE p.id=v_admin AND p.status='active' AND p.platform_role='admin_general_manager';
 IF v_email IS NULL OR v_email NOT IN ('asenagan@watchdogautomation.com.ph','lmsenagan@watchdogautomation.com.ph') THEN
   RAISE EXCEPTION 'Bootstrap administrator required' USING errcode='42501';
 END IF;$old$,'');
 EXECUTE v_definition;
END;
$frt_role_assignment$;

-- Tool Traceability role assignment is likewise a central role-management
-- operation. Keep its own protected module bootstrap accounts, active confirmed
-- target, role validation, last-admin protection and audit unchanged.
DO $tool_traceability_role_assignment$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.tool_traceability_admin_set_role(uuid,uuid,text,boolean)'::regprocedure);
 IF position($old$IF auth.uid() IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected Tool Traceability role assignment guard'; END IF;
 v_definition:=replace(v_definition,
  $old$IF auth.uid() IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;$old$,
  $new$IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;
 IF NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 END IF;$new$);
 EXECUTE v_definition;
END;
$tool_traceability_role_assignment$;

NOTIFY pgrst,'reload schema';
COMMIT;
