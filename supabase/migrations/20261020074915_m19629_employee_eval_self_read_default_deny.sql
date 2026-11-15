-- M196.15 STAGED ONLY. Apply after M196.13 and M196.14 have been reviewed and installed.
-- No EXECUTE grant, no UI activation, no data backfill.
BEGIN;
CREATE OR REPLACE FUNCTION public.employee_evaluation_my_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_workspace uuid;
  v_employee public.employee_evaluation_employees%ROWTYPE;
  v_evaluations jsonb;
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
  SELECT * INTO v_employee FROM public.employee_evaluation_employees e
  WHERE e.workspace_id = v_workspace AND e.auth_user_id = v_user AND e.active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_MAPPING_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at DESC), '[]'::jsonb)
  INTO v_evaluations
  FROM public.employee_evaluation_evaluations ev
  WHERE ev.workspace_id = v_workspace AND ev.employee_id = v_employee.id;
  RETURN jsonb_build_object(
    'schemaVersion', 2,
    'employee', to_jsonb(v_employee) - 'auth_user_id',
    'evaluations', v_evaluations
  );
END;
$$;
-- SECURITY DEFINER owner must be a vetted database role. Do not grant EXECUTE
-- until workspace/module checks and employee mapping have been tested in isolation.
REVOKE ALL ON FUNCTION public.employee_evaluation_my_snapshot() FROM PUBLIC, anon, authenticated;
COMMIT;
;
