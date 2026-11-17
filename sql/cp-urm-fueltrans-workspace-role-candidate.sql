-- CP-URM-FUELTRANS — CANDIDATE ONLY. DO NOT APPLY TO PRODUCTION WITHOUT
-- SEPARATE ROLE/PERMISSION CHANGE APPROVAL AND DISPOSABLE DATABASE ACCEPTANCE.
-- FuelTrans source membership, not global module_role_assignments, is authority.
BEGIN;

CREATE OR REPLACE FUNCTION public.apsyntra_role_fueltrans_workspace_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $rpc$
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 RETURN jsonb_build_object(
  'workspaceId',p_workspace_id,'contract','cp-urm-fueltrans-workspace-v1',
  'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'userId',m.user_id,'moduleId','fueltrans','role',m.role,
   'enabled',(m.enabled AND m.status='active'),
   'status',m.status,'clientManaged',(m.client_code IS NOT NULL OR
    m.role IN ('unioil','aramco','rephil','petron')),
   'updatedAt',m.updated_at) ORDER BY m.user_id)
   FROM public.fueltrans_memberships m
   JOIN public.workspace_members w ON w.workspace_id=m.workspace_id AND
    w.user_id=m.user_id AND w.active
   JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
   WHERE m.workspace_id=p_workspace_id),'[]'::jsonb));
END $rpc$;
REVOKE ALL ON FUNCTION public.apsyntra_role_fueltrans_workspace_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_fueltrans_workspace_snapshot(uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.apsyntra_role_fueltrans_workspace_set(
 p_workspace_id uuid,p_target_user_id uuid,p_role text,p_enabled boolean,
 p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $rpc$
DECLARE
 v_actor uuid:=auth.uid();v_before jsonb;v_after jsonb;
 v_previous_at timestamptz;v_client_code text;v_existing_role text;
 v_change_id uuid;v_current_at timestamptz;
BEGIN
 PERFORM public.apsyntra_role_require_scope(p_workspace_id);
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor OR p_enabled IS NULL
    OR p_role NOT IN ('admin','fueltrans','watchdog_employee',
     'global_l1_support','local_l2_support','call_center_specialist','viewer')
    OR EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities
      WHERE user_id=p_target_user_id)
    OR public.is_platform_admin(p_target_user_id)
 THEN RAISE EXCEPTION 'Invalid or protected FuelTrans role target' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id=w.user_id
    WHERE w.workspace_id=p_workspace_id AND w.user_id=p_target_user_id
     AND w.active AND p.status='active')
 THEN RAISE EXCEPTION 'User not active in selected workspace' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   p_workspace_id::text||':fueltrans:'||p_target_user_id::text,0));
 SELECT m.updated_at,m.client_code,m.role,
  jsonb_build_object('role',m.role,'enabled',m.enabled,'status',m.status)
 INTO v_previous_at,v_client_code,v_existing_role,v_before
 FROM public.fueltrans_memberships m
 WHERE m.workspace_id=p_workspace_id AND m.user_id=p_target_user_id
 FOR UPDATE;
 IF v_previous_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Stale FuelTrans workspace role assignment' USING ERRCODE='PT409'; END IF;
 IF v_client_code IS NOT NULL OR
  v_existing_role IN ('unioil','aramco','rephil','petron') THEN
  RAISE EXCEPTION 'Client-scoped FuelTrans membership requires domain-specific management' USING ERRCODE='42501'; END IF;
 IF NOT p_enabled AND v_previous_at IS NULL THEN
  RAISE EXCEPTION 'No FuelTrans membership exists to revoke' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.fueltrans_memberships(
  workspace_id,user_id,role,enabled,status,assigned_by,created_at,updated_at)
 VALUES(p_workspace_id,p_target_user_id,p_role,p_enabled,
  CASE WHEN p_enabled THEN 'active' ELSE 'inactive' END,
  v_actor,clock_timestamp(),clock_timestamp())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET
  role=EXCLUDED.role,enabled=EXCLUDED.enabled,status=EXCLUDED.status,
  assigned_by=v_actor,updated_at=clock_timestamp();
 SELECT m.updated_at,jsonb_build_object(
   'role',m.role,'enabled',(m.enabled AND m.status='active'),
   'status',m.status,'updatedAt',m.updated_at)
 INTO v_current_at,v_after FROM public.fueltrans_memberships m
 WHERE m.workspace_id=p_workspace_id AND m.user_id=p_target_user_id;
 INSERT INTO public.apsyntra_role_change_requests(
  workspace_id,proposed_by,operation,payload,status)
 VALUES(p_workspace_id,v_actor,CASE WHEN p_enabled THEN 'assignment.assign' ELSE 'assignment.revoke' END,
  jsonb_build_object('targetUserId',p_target_user_id,'scope','module',
   'resourceId','fueltrans','source','fueltrans_memberships','previous',v_before,
   'result',v_after,'requestedRole',p_role),'applied')
 RETURNING id INTO v_change_id;
 INSERT INTO public.apsyntra_role_change_audit(
  change_id,workspace_id,actor_id,event,detail)
 VALUES(v_change_id,p_workspace_id,v_actor,'applied',jsonb_build_object(
  'targetUserId',p_target_user_id,'scope','module','resourceId','fueltrans',
  'source','fueltrans_memberships','before',v_before,'after',v_after,
  'applied',true));
 RETURN jsonb_build_object('workspaceId',p_workspace_id,
  'targetUserId',p_target_user_id,'scope','module','resourceId','fueltrans',
  'effective',true,'after',v_after,'currentRevision',v_current_at,
  'changeId',v_change_id);
END $rpc$;
REVOKE ALL ON FUNCTION public.apsyntra_role_fueltrans_workspace_set(
 uuid,uuid,text,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_fueltrans_workspace_set(
 uuid,uuid,text,boolean,timestamptz) TO authenticated;
COMMIT;
