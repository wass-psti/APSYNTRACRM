
CREATE OR REPLACE FUNCTION public.employee_evaluation_update_settings(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user uuid:=auth.uid(); v_workspace uuid; v_actor public.employee_evaluation_employees%ROWTYPE;
 v_current public.employee_evaluation_settings%ROWTYPE; v_updated public.employee_evaluation_settings%ROWTYPE; v_key text;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 v_workspace:=public.current_workspace_id(v_user);
 IF v_workspace IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_workspace AND wm.user_id=v_user AND wm.active)
   OR NOT public.has_module_access('employee-eval',v_user) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.employee_evaluation_employees e WHERE e.workspace_id=v_workspace AND e.auth_user_id=v_user AND e.active;
 IF NOT FOUND OR v_actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SETTINGS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR jsonb_typeof(p_patch->'revision')<>'number'
 OR (p_patch->>'revision') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SETTINGS' USING ERRCODE='22023'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
  IF v_key NOT IN ('activePeriod','evaluationWindow','windowOpenDate','windowCloseDate','gracePeriodDays','revision')
  THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SETTINGS_FIELD' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT * INTO v_current FROM public.employee_evaluation_settings s WHERE s.workspace_id=v_workspace FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SETTINGS_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_current.revision<>(p_patch->>'revision')::bigint THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF p_patch ? 'activePeriod' AND (jsonb_typeof(p_patch->'activePeriod')<>'string'
 OR length(btrim(p_patch->>'activePeriod')) NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_PERIOD' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'evaluationWindow' AND (jsonb_typeof(p_patch->'evaluationWindow')<>'string'
 OR p_patch->>'evaluationWindow' NOT IN ('Open','Grace Period','Closed')) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_WINDOW' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'gracePeriodDays' AND (jsonb_typeof(p_patch->'gracePeriodDays')<>'number'
 OR (p_patch->>'gracePeriodDays') !~ '^[0-9]+$' OR length(p_patch->>'gracePeriodDays')>5
 OR (p_patch->>'gracePeriodDays')::integer>3650) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_GRACE_DAYS' USING ERRCODE='22023'; END IF;
 IF (p_patch ? 'windowOpenDate' AND jsonb_typeof(p_patch->'windowOpenDate') NOT IN ('string','null'))
 OR (p_patch ? 'windowCloseDate' AND jsonb_typeof(p_patch->'windowCloseDate') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_DATES' USING ERRCODE='22023'; END IF;
 UPDATE public.employee_evaluation_settings s SET
 active_period=CASE WHEN p_patch ? 'activePeriod' THEN btrim(p_patch->>'activePeriod') ELSE s.active_period END,
 evaluation_window=CASE WHEN p_patch ? 'evaluationWindow' THEN p_patch->>'evaluationWindow' ELSE s.evaluation_window END,
 window_open_date=CASE WHEN p_patch ? 'windowOpenDate' THEN (p_patch->>'windowOpenDate')::timestamptz ELSE s.window_open_date END,
 window_close_date=CASE WHEN p_patch ? 'windowCloseDate' THEN (p_patch->>'windowCloseDate')::timestamptz ELSE s.window_close_date END,
 grace_period_days=CASE WHEN p_patch ? 'gracePeriodDays' THEN (p_patch->>'gracePeriodDays')::integer ELSE s.grace_period_days END,
 revision=s.revision+1,updated_at=transaction_timestamp()
 WHERE s.workspace_id=v_workspace AND s.revision=v_current.revision RETURNING * INTO v_updated;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF v_updated.window_open_date IS NOT NULL AND v_updated.window_close_date IS NOT NULL
 AND v_updated.window_close_date<v_updated.window_open_date THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_DATE_RANGE' USING ERRCODE='22023'; END IF;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(v_workspace,'SETTINGS','settings',v_workspace::text,'Evaluation settings updated',v_user,
 jsonb_build_object('revision',v_updated.revision,'evaluationWindow',v_updated.evaluation_window,'activePeriod',v_updated.active_period));
 RETURN to_jsonb(v_updated);
END; $$;
REVOKE ALL ON FUNCTION public.employee_evaluation_update_settings(jsonb) FROM PUBLIC,anon,authenticated;;
