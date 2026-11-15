
CREATE OR REPLACE FUNCTION public.employee_evaluation_create_employee(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user uuid:=auth.uid(); v_workspace uuid; v_actor public.employee_evaluation_employees%ROWTYPE;
 v_supervisor public.employee_evaluation_employees%ROWTYPE; v_result public.employee_evaluation_employees%ROWTYPE;
 v_key text; v_code text; v_name text; v_email text; v_role text; v_supervisor_id uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 v_workspace:=public.current_workspace_id(v_user);
 IF v_workspace IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_workspace AND wm.user_id=v_user AND wm.active)
 OR NOT public.has_module_access('employee-eval',v_user) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.employee_evaluation_employees WHERE workspace_id=v_workspace AND auth_user_id=v_user AND active;
 IF NOT FOUND OR v_actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_input) LOOP
  IF v_key NOT IN ('employeeCode','name','email','jobTitle','department','supervisorId','role','active')
  THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_FIELD' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF jsonb_typeof(p_input->'employeeCode')<>'string' OR jsonb_typeof(p_input->'name')<>'string'
 OR jsonb_typeof(p_input->'email')<>'string' OR jsonb_typeof(p_input->'role')<>'string'
 OR (p_input ? 'active' AND jsonb_typeof(p_input->'active')<>'boolean')
 OR (p_input ? 'jobTitle' AND jsonb_typeof(p_input->'jobTitle') NOT IN ('string','null'))
 OR (p_input ? 'department' AND jsonb_typeof(p_input->'department') NOT IN ('string','null'))
 OR (p_input ? 'supervisorId' AND jsonb_typeof(p_input->'supervisorId') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TYPES' USING ERRCODE='22023'; END IF;
 v_code:=btrim(p_input->>'employeeCode'); v_name:=btrim(p_input->>'name');
 v_email:=lower(btrim(p_input->>'email')); v_role:=p_input->>'role';
 IF v_code IS NULL OR v_name IS NULL OR v_email IS NULL OR v_role IS NULL
 OR length(v_code) NOT BETWEEN 1 AND 80 OR length(v_name) NOT BETWEEN 1 AND 200
 OR length(v_email) NOT BETWEEN 3 AND 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR v_role NOT IN ('admin','supervisor','employee') THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_EMPLOYEE' USING ERRCODE='22023'; END IF;
 IF nullif(p_input->>'supervisorId','') IS NOT NULL THEN
  BEGIN v_supervisor_id:=(p_input->>'supervisorId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END;
  SELECT * INTO v_supervisor FROM public.employee_evaluation_employees
  WHERE id=v_supervisor_id AND workspace_id=v_workspace AND active AND role IN ('admin','supervisor');
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.employee_evaluation_employees
 (workspace_id,auth_user_id,employee_code,name,email,job_title,department,supervisor_id,role,active)
 VALUES(v_workspace,NULL,v_code,v_name,v_email,nullif(btrim(p_input->>'jobTitle'),''),
 nullif(btrim(p_input->>'department'),''),v_supervisor_id,v_role,coalesce((p_input->>'active')::boolean,true))
 RETURNING * INTO v_result;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(v_workspace,'CREATE','employee',v_result.id::text,'Employee record created',v_user,
 jsonb_build_object('employeeCode',v_code,'role',v_role,'revision',1));
 RETURN to_jsonb(v_result)-'auth_user_id';
END; $$;
REVOKE ALL ON FUNCTION public.employee_evaluation_create_employee(jsonb) FROM PUBLIC,anon,authenticated;;
