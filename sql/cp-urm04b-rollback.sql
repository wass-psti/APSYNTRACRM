-- CP-URM-04B rollback. Apply only if the coordinated release must be reverted.
-- Restores bootstrap-only central administration guards and legacy target locks.
-- No profile, Auth, workspace, module-role or board data is changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_actor uuid := auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT public.apsyntra_role_is_bootstrap()
 OR p_workspace_id IS NULL
 OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
 OR NOT EXISTS(SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor AND m.active)
 THEN RAISE EXCEPTION 'Bootstrap role configuration access denied' USING ERRCODE='42501';
 END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.apsyntra_role_require_scope(uuid) FROM PUBLIC,anon,authenticated;

DO $restore_snapshots$
DECLARE v_signature regprocedure; v_definition text;
        v_old text := $old$'adminVerified',true,'bootstrapVerified',public.apsyntra_role_is_bootstrap(),$old$;
        v_new text := $new$'bootstrapVerified',true,$new$;
BEGIN
 FOREACH v_signature IN ARRAY ARRAY[
  'public.apsyntra_role_configuration_snapshot(uuid)'::regprocedure,
  'public.apsyntra_role_user_management_snapshot(uuid)'::regprocedure,
  'public.apsyntra_crm_platform_role_snapshot(uuid)'::regprocedure
 ] LOOP
  v_definition:=pg_get_functiondef(v_signature);
  IF position(v_old IN v_definition)=0 THEN
   RAISE EXCEPTION 'Unexpected snapshot during CP-URM-04B rollback: %',v_signature;
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
 END LOOP;
END;
$restore_snapshots$;

DO $restore_target_guards$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.apsyntra_role_manage_user_access(uuid,uuid,text,text,text,boolean,timestamptz)'::regprocedure);
 IF position($old$OR EXISTS (SELECT 1 FROM public.apsyntra_role_bootstrap_identities WHERE user_id=p_target_user_id)$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected central role target during rollback'; END IF;
 v_definition:=replace(v_definition,
  $old$OR EXISTS (SELECT 1 FROM public.apsyntra_role_bootstrap_identities WHERE user_id=p_target_user_id)$old$,
  $new$OR EXISTS (SELECT 1 FROM public.apsyntra_role_bootstrap_identities WHERE user_id=p_target_user_id)
    OR public.is_platform_admin(p_target_user_id)$new$);
 EXECUTE v_definition;

 v_definition:=pg_get_functiondef('public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)'::regprocedure);
 v_definition:=regexp_replace(v_definition,
  $pattern$(OR EXISTS \(SELECT 1 FROM public\.apsyntra_role_bootstrap_identities b\s+WHERE b\.user_id=p_target_user_id\))\s+THEN$pattern$,
  $replacement$\1 OR public.is_platform_admin(p_target_user_id) THEN$replacement$);
 IF position('OR public.is_platform_admin(p_target_user_id)' IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected CRM role target during rollback'; END IF;
 EXECUTE v_definition;
END;
$restore_target_guards$;

DO $restore_application_dispatch$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.wm_admin_set_application_role(uuid,text,text,boolean)'::regprocedure);
 IF position($old$if v_admin is null then$old$ IN v_definition)=0
 OR position($old$if p_user_id is null or p_user_id=v_admin or exists(
   select 1 from public.apsyntra_role_bootstrap_identities b where b.user_id=p_user_id) then$old$ IN v_definition)=0
 OR position($old$v_workspace:=public.current_workspace_id(v_admin);
 PERFORM public.apsyntra_role_require_scope(v_workspace);$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected application dispatcher during rollback'; END IF;
 v_definition:=replace(v_definition,$old$if v_admin is null then$old$,
  $new$if v_admin is null or not public.apsyntra_role_is_bootstrap() then$new$);
 v_definition:=replace(v_definition,
  $old$if p_user_id is null or p_user_id=v_admin or exists(
   select 1 from public.apsyntra_role_bootstrap_identities b where b.user_id=p_user_id) then$old$,
  $new$if p_user_id is null or p_user_id=v_admin or public.is_platform_admin(p_user_id) then$new$);
 v_definition:=replace(v_definition,
  $old$v_workspace:=public.current_workspace_id(v_admin);
 PERFORM public.apsyntra_role_require_scope(v_workspace);$old$,
  $new$v_workspace:=public.current_workspace_id(v_admin);$new$);
 EXECUTE v_definition;
END;
$restore_application_dispatch$;

DO $restore_frt_setter$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.frt_admin_set_role(uuid,uuid,text)'::regprocedure);
 IF position($old$DECLARE v_admin uuid:=(SELECT auth.uid());$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected FRT setter declaration during rollback'; END IF;
 v_definition:=replace(v_definition,
  $old$DECLARE v_admin uuid:=(SELECT auth.uid());$old$,
  $new$DECLARE v_admin uuid:=(SELECT auth.uid()); v_email text;$new$);
 v_definition:=regexp_replace(v_definition,
  $pattern$IF p_user_id IS NULL OR p_user_id=v_admin\s+OR EXISTS$pattern$,
  $replacement$IF p_user_id IS NULL OR p_user_id=v_admin OR public.is_platform_admin(p_user_id) OR EXISTS$replacement$);
 IF position('public.is_platform_admin(p_user_id)' IN v_definition)=0
 THEN RAISE EXCEPTION 'FRT inherited-admin target lock not restored'; END IF;
 v_definition:=replace(v_definition,
  $old$THEN RAISE EXCEPTION 'Protected or self target cannot be modified through FRT' USING errcode='42501'; END IF;$old$,
  $new$THEN RAISE EXCEPTION 'Protected or self target cannot be modified through FRT' USING errcode='42501'; END IF;
 SELECT lower(p.email) INTO v_email FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=p_workspace_id AND wm.active=true
 WHERE p.id=v_admin AND p.status='active' AND p.platform_role='admin_general_manager';
 IF v_email IS NULL OR v_email NOT IN ('asenagan@watchdogautomation.com.ph','lmsenagan@watchdogautomation.com.ph') THEN
   RAISE EXCEPTION 'Bootstrap administrator required' USING errcode='42501';
 END IF;$new$);
 EXECUTE v_definition;
END;
$restore_frt_setter$;

DO $restore_tool_traceability$
DECLARE v_definition text;
BEGIN
 v_definition:=pg_get_functiondef('public.tool_traceability_admin_set_role(uuid,uuid,text,boolean)'::regprocedure);
 IF position($old$IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;
 IF NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 END IF;$old$ IN v_definition)=0
 THEN RAISE EXCEPTION 'Unexpected Tool Traceability setter during rollback'; END IF;
 v_definition:=replace(v_definition,
  $old$IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;
 IF NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 END IF;$old$,
  $new$IF auth.uid() IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;$new$);
 EXECUTE v_definition;
END;
$restore_tool_traceability$;

DROP FUNCTION public.timetracker_team_directory_snapshot(uuid);
DROP FUNCTION public.apsyntra_role_require_bootstrap_scope(uuid);
DROP FUNCTION public.apsyntra_role_is_admin();

NOTIFY pgrst,'reload schema';
COMMIT;
