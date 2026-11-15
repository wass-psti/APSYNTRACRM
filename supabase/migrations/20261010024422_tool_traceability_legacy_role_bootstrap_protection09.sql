
CREATE OR REPLACE FUNCTION public.tool_traceability_admin_set_role(
 p_workspace_id uuid,p_user_id uuid,p_role text,p_enabled boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,private,pg_temp AS $fn$
DECLARE v_role text:=upper(trim(p_role));v_email text;v_count integer;v_previous public.tool_traceability_memberships%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT private.tool_traceability_is_admin(p_workspace_id) THEN
  RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;
 IF p_workspace_id IS NULL OR p_user_id IS NULL OR p_role IS NULL
 OR v_role NOT IN ('ADMIN','LOGISTICS','USER','VIEWER') OR p_enabled IS NULL THEN
  RAISE EXCEPTION 'invalid role' USING ERRCODE='22023';END IF;
 SELECT lower(p.email) INTO v_email FROM public.workspace_members w JOIN public.profiles p
 ON p.id=w.user_id JOIN auth.users u ON u.id=p.id
 WHERE w.workspace_id=p_workspace_id AND w.user_id=p_user_id AND w.active AND p.status='active'
 AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now());
 IF NOT FOUND THEN RAISE EXCEPTION 'active confirmed Workspace membership required' USING ERRCODE='42501';END IF;
 IF v_email IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
 AND (v_role<>'ADMIN' OR NOT p_enabled) THEN
  RAISE EXCEPTION 'Bootstrap administrator cannot be disabled or demoted' USING ERRCODE='42501';END IF;
 SELECT * INTO v_previous FROM public.tool_traceability_memberships
 WHERE workspace_id=p_workspace_id AND user_id=p_user_id FOR UPDATE;
 IF v_previous.role='ADMIN' AND v_previous.enabled AND v_previous.status='active'
 AND (v_role<>'ADMIN' OR NOT p_enabled) THEN
  SELECT count(*) INTO v_count FROM public.tool_traceability_memberships m
  WHERE m.workspace_id=p_workspace_id AND m.role='ADMIN' AND m.enabled AND m.status='active';
  IF v_count<=1 THEN RAISE EXCEPTION 'Last Tool Traceability administrator cannot be removed' USING ERRCODE='42501';END IF;
 END IF;
 INSERT INTO public.tool_traceability_memberships(workspace_id,user_id,role,enabled,status,assigned_by)
 VALUES(p_workspace_id,p_user_id,v_role,p_enabled,CASE WHEN p_enabled THEN 'active' ELSE 'disabled' END,auth.uid())
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,enabled=excluded.enabled,
 status=excluded.status,assigned_by=auth.uid(),updated_at=clock_timestamp();
 RETURN jsonb_build_object('workspaceId',p_workspace_id,'userId',p_user_id,'role',v_role,'enabled',p_enabled);
END;$fn$;
REVOKE ALL ON FUNCTION public.tool_traceability_admin_set_role(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tool_traceability_admin_set_role(uuid,uuid,text,boolean) TO authenticated;
;
