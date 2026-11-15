
CREATE OR REPLACE FUNCTION public.charter_admin_roles()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_roles jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  v_workspace := public.current_workspace_id(v_actor);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = v_actor AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('user_id', m.user_id,
      'role', m.role, 'enabled', m.enabled, 'updated_at', m.updated_at)
    ORDER BY m.user_id), '[]'::jsonb)
  INTO v_roles
  FROM public.module_role_assignments m
  JOIN public.workspace_members w ON w.user_id = m.user_id
    AND w.workspace_id = v_workspace AND w.active
  WHERE m.module_id = 'charter-navigator';
  RETURN v_roles;
END;
$function$;

CREATE OR REPLACE FUNCTION public.charter_admin_set_role(
  p_user_id uuid, p_role text, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_assignment public.module_role_assignments%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_actor THEN
    RAISE EXCEPTION 'Cannot modify your own Charter Navigator role' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('admin','user') OR p_role IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid Charter Navigator role or enabled state' USING ERRCODE = '22023';
  END IF;
  v_workspace := public.current_workspace_id(v_actor);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = v_actor AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active administrator workspace membership required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = p_user_id AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Target must be an active member of the current workspace' USING ERRCODE = '42501';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.module_role_assignments
      (user_id, module_id, role, enabled, assigned_by)
    VALUES (p_user_id, 'charter-navigator', p_role, true, v_actor)
    ON CONFLICT (user_id, module_id)
    DO UPDATE SET role = EXCLUDED.role, enabled = true,
      assigned_by = EXCLUDED.assigned_by, updated_at = now();
  ELSE
    UPDATE public.module_role_assignments
    SET enabled = false, assigned_by = v_actor, updated_at = now()
    WHERE user_id = p_user_id AND module_id = 'charter-navigator';
  END IF;

  SELECT * INTO v_assignment FROM public.module_role_assignments
    WHERE user_id = p_user_id AND module_id = 'charter-navigator';
  RETURN pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'role', CASE WHEN v_assignment.user_id IS NULL THEN NULL ELSE v_assignment.role END,
    'enabled', COALESCE(v_assignment.enabled, false),
    'updated_at', v_assignment.updated_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.charter_admin_roles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charter_admin_set_role(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charter_admin_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.charter_admin_set_role(uuid,text,boolean) TO authenticated;
;
