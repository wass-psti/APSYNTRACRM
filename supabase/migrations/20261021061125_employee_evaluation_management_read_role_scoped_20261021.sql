CREATE OR REPLACE FUNCTION public.employee_evaluation_management_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_workspace uuid;
  v_actor public.employee_evaluation_employees%ROWTYPE;
  v_employees jsonb;
  v_evaluations jsonb;
  v_activity jsonb;
  v_settings jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_workspace := public.current_workspace_id(v_user);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = v_workspace AND wm.user_id = v_user AND wm.active = true
  ) OR NOT public.has_module_access('employee-eval', v_user) THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.employee_evaluation_employees e
    WHERE e.workspace_id = v_workspace AND e.auth_user_id = v_user AND e.active = true;
  IF NOT FOUND OR v_actor.role NOT IN ('admin','supervisor') THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_MANAGEMENT_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(e) - 'auth_user_id' ORDER BY e.name, e.id), '[]'::jsonb)
    INTO v_employees FROM public.employee_evaluation_employees e
    WHERE e.workspace_id = v_workspace
      AND (v_actor.role = 'admin' OR e.id = v_actor.id
           OR (e.supervisor_id = v_actor.id AND e.active = true));
  SELECT COALESCE(jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at DESC, ev.id), '[]'::jsonb)
    INTO v_evaluations FROM public.employee_evaluation_evaluations ev
    WHERE ev.workspace_id = v_workspace
      AND (v_actor.role = 'admin' OR EXISTS (
        SELECT 1 FROM public.employee_evaluation_employees report
        WHERE report.id = ev.employee_id AND report.workspace_id = v_workspace
          AND report.supervisor_id = v_actor.id AND report.active = true
      ));
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC, a.id), '[]'::jsonb)
    INTO v_activity FROM public.employee_evaluation_activity a
    WHERE a.workspace_id = v_workspace AND v_actor.role = 'admin';
  SELECT to_jsonb(s) INTO v_settings FROM public.employee_evaluation_settings s WHERE s.workspace_id = v_workspace;
  RETURN jsonb_build_object('schemaVersion', 2,
    'actor', to_jsonb(v_actor) - 'auth_user_id',
    'employees', v_employees,
    'evaluations', v_evaluations,
    'activity', v_activity,
    'settings', COALESCE(v_settings, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.employee_evaluation_management_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_evaluation_management_snapshot() TO authenticated;;
