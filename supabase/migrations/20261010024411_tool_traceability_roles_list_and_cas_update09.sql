
CREATE OR REPLACE FUNCTION public.tool_traceability_roles_page_v2(
 p_workspace_id uuid,p_search text DEFAULT '',p_offset integer DEFAULT 0,p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_total integer;v_rows jsonb;v_search text:=trim(coalesce(p_search,''));
BEGIN
 IF auth.uid() IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  RAISE EXCEPTION 'Tool Traceability administrator required' USING ERRCODE='42501';END IF;
 IF length(v_search)>80 OR p_offset IS NULL OR p_offset<0 OR p_offset>1000000
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'Invalid role configuration page' USING ERRCODE='22023';END IF;
 SELECT count(*) INTO v_total FROM public.workspace_members w
 JOIN public.profiles p ON p.id=w.user_id AND p.status='active'
 WHERE w.workspace_id=p_workspace_id AND w.active
 AND (v_search='' OR position(lower(v_search) IN lower(coalesce(p.display_name,'')))>0
 OR position(lower(v_search) IN lower(coalesce(p.email,'')))>0);
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.display_name,s.email,s.user_id),'[]'::jsonb)
 INTO v_rows FROM (
 SELECT p.id AS user_id,coalesce(nullif(p.display_name,''),p.email,'Member') AS display_name,
 coalesce(p.email,'') AS email,m.role,coalesce(m.enabled,false) AS enabled,
 coalesce(m.status,'unassigned') AS status,m.updated_at,
 lower(coalesce(p.email,'')) IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph') AS protected_bootstrap
 FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id AND p.status='active'
 LEFT JOIN public.tool_traceability_memberships m ON m.workspace_id=w.workspace_id AND m.user_id=w.user_id
 WHERE w.workspace_id=p_workspace_id AND w.active
 AND (v_search='' OR position(lower(v_search) IN lower(coalesce(p.display_name,'')))>0
 OR position(lower(v_search) IN lower(coalesce(p.email,'')))>0)
 ORDER BY lower(coalesce(p.display_name,'')),lower(coalesce(p.email,'')),p.id
 LIMIT p_limit OFFSET p_offset
 )s;
 RETURN jsonb_build_object('items',v_rows,'total',v_total,
 'cursor',CASE WHEN p_offset+p_limit<v_total THEN (p_offset+p_limit)::text ELSE NULL END,
 'capability_matrix',jsonb_build_object(
 'ADMIN',private.tool_traceability_capabilities('ADMIN'),
 'LOGISTICS',private.tool_traceability_capabilities('LOGISTICS'),
 'USER',private.tool_traceability_capabilities('USER'),
 'VIEWER',private.tool_traceability_capabilities('VIEWER')));
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_roles_page_v2(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_roles_page_v2(uuid,text,integer,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.tool_traceability_roles_update_v2(
 p_workspace_id uuid,p_user_id uuid,p_role text,p_enabled boolean,
 p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_current public.tool_traceability_memberships%rowtype;v_new public.tool_traceability_memberships%rowtype;
 v_email text;v_actor uuid:=auth.uid();v_admin_count integer;
BEGIN
 IF v_actor IS NULL OR p_workspace_id IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  RAISE EXCEPTION 'Tool Traceability administrator required' USING ERRCODE='42501';END IF;
 IF p_user_id IS NULL OR p_role IS NULL OR p_role NOT IN ('ADMIN','LOGISTICS','USER','VIEWER') OR p_enabled IS NULL THEN
  RAISE EXCEPTION 'Invalid module role assignment' USING ERRCODE='22023';END IF;
 SELECT lower(p.email) INTO v_email FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id
 JOIN auth.users a ON a.id=w.user_id
 WHERE w.workspace_id=p_workspace_id AND w.user_id=p_user_id AND w.active
 AND p.status='active' AND a.email_confirmed_at IS NOT NULL
 AND (a.banned_until IS NULL OR a.banned_until<=now());
 IF NOT FOUND THEN RAISE EXCEPTION 'Target is not an active confirmed Workspace member' USING ERRCODE='42501';END IF;
 IF v_email IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
 AND (p_role<>'ADMIN' OR NOT p_enabled) THEN
  RAISE EXCEPTION 'Bootstrap administrator cannot be disabled or demoted' USING ERRCODE='42501';END IF;
 SELECT * INTO v_current FROM public.tool_traceability_memberships
 WHERE workspace_id=p_workspace_id AND user_id=p_user_id FOR UPDATE;
 IF FOUND THEN
  IF p_expected_updated_at IS NULL OR v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'Membership changed; refresh and try again' USING ERRCODE='40001';END IF;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN
   RAISE EXCEPTION 'New membership requires an empty expected version' USING ERRCODE='40001';END IF;
 END IF;
 IF v_current.role='ADMIN' AND v_current.enabled AND v_current.status='active'
 AND (p_role<>'ADMIN' OR NOT p_enabled) THEN
  SELECT count(*) INTO v_admin_count FROM public.tool_traceability_memberships m
  JOIN public.workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id AND w.active
  WHERE m.workspace_id=p_workspace_id AND m.role='ADMIN' AND m.enabled AND m.status='active';
  IF v_admin_count<=1 THEN RAISE EXCEPTION 'Last active Tool Traceability administrator cannot be removed' USING ERRCODE='42501';END IF;
 END IF;
 IF v_current.user_id IS NULL THEN
  INSERT INTO public.tool_traceability_memberships(workspace_id,user_id,role,enabled,status,assigned_by)
  VALUES(p_workspace_id,p_user_id,p_role,p_enabled,CASE WHEN p_enabled THEN 'active' ELSE 'disabled' END,v_actor)
  ON CONFLICT(workspace_id,user_id) DO NOTHING RETURNING * INTO v_new;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership changed during assignment' USING ERRCODE='40001';END IF;
 ELSE
  UPDATE public.tool_traceability_memberships SET role=p_role,enabled=p_enabled,
  status=CASE WHEN p_enabled THEN 'active' ELSE 'disabled' END,
  assigned_by=v_actor,updated_at=clock_timestamp()
  WHERE workspace_id=p_workspace_id AND user_id=p_user_id
  RETURNING * INTO v_new;
 END IF;
 INSERT INTO public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 VALUES(p_workspace_id,'membership',p_user_id::text,v_actor,'role_configured',
 jsonb_build_object('role',v_new.role,'enabled',v_new.enabled,'previous_role',v_current.role,
 'previous_enabled',v_current.enabled));
 RETURN jsonb_build_object('user_id',v_new.user_id,'role',v_new.role,'enabled',v_new.enabled,
 'status',v_new.status,'updated_at',v_new.updated_at);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_roles_update_v2(uuid,uuid,text,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_roles_update_v2(uuid,uuid,text,boolean,timestamptz) TO authenticated;
;
