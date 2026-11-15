CREATE OR REPLACE FUNCTION public.employee_evaluation_update_employee(p_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid:=auth.uid();w uuid;actor public.employee_evaluation_employees%ROWTYPE;
 old_row public.employee_evaluation_employees%ROWTYPE;new_row public.employee_evaluation_employees%ROWTYPE;
 supervisor uuid;key_name text;revision_expected bigint;new_role text;new_active boolean;
 code_name text;employee_name text;email_address text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=w AND user_id=u AND active)
 OR NOT public.has_module_access('employee-eval',u) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.employee_evaluation_employees WHERE workspace_id=w AND auth_user_id=u AND active;
 IF NOT FOUND OR actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR jsonb_typeof(p_patch->'revision')<>'number'
 OR (p_patch->>'revision') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 FOR key_name IN SELECT jsonb_object_keys(p_patch) LOOP
 IF key_name NOT IN ('revision','employeeCode','name','email','jobTitle','department','supervisorId','role','active')
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_FORBIDDEN_FIELD' USING ERRCODE='22023'; END IF; END LOOP;
 revision_expected:=(p_patch->>'revision')::bigint;
 SELECT * INTO old_row FROM public.employee_evaluation_employees WHERE id=p_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EMPLOYEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_row.revision<>revision_expected THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF (p_patch ? 'employeeCode' AND jsonb_typeof(p_patch->'employeeCode')<>'string')
 OR (p_patch ? 'name' AND jsonb_typeof(p_patch->'name')<>'string')
 OR (p_patch ? 'email' AND jsonb_typeof(p_patch->'email')<>'string')
 OR (p_patch ? 'role' AND jsonb_typeof(p_patch->'role')<>'string')
 OR (p_patch ? 'active' AND jsonb_typeof(p_patch->'active')<>'boolean')
 OR (p_patch ? 'jobTitle' AND jsonb_typeof(p_patch->'jobTitle') NOT IN ('string','null'))
 OR (p_patch ? 'department' AND jsonb_typeof(p_patch->'department') NOT IN ('string','null'))
 OR (p_patch ? 'supervisorId' AND jsonb_typeof(p_patch->'supervisorId') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TYPES' USING ERRCODE='22023'; END IF;
 code_name:=CASE WHEN p_patch ? 'employeeCode' THEN btrim(p_patch->>'employeeCode') ELSE old_row.employee_code END;
 employee_name:=CASE WHEN p_patch ? 'name' THEN btrim(p_patch->>'name') ELSE old_row.name END;
 email_address:=CASE WHEN p_patch ? 'email' THEN lower(btrim(p_patch->>'email')) ELSE old_row.email END;
 new_role:=CASE WHEN p_patch ? 'role' THEN p_patch->>'role' ELSE old_row.role END;
 new_active:=CASE WHEN p_patch ? 'active' THEN (p_patch->>'active')::boolean ELSE old_row.active END;
 IF length(code_name) NOT BETWEEN 1 AND 80 OR length(employee_name) NOT BETWEEN 1 AND 200
 OR length(email_address) NOT BETWEEN 3 AND 254 OR email_address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR new_role NOT IN ('admin','supervisor','employee') THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_EMPLOYEE' USING ERRCODE='22023'; END IF;
 IF old_row.auth_user_id IS NOT NULL AND (code_name IS DISTINCT FROM old_row.employee_code OR
 email_address IS DISTINCT FROM old_row.email OR new_role IS DISTINCT FROM old_row.role OR
 new_active IS DISTINCT FROM old_row.active) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_LINKED_IDENTITY_PROTECTED' USING ERRCODE='42501'; END IF;
 IF old_row.id=actor.id AND (new_role<>'admin' OR NOT new_active) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_SELF_ADMIN_PROTECTED' USING ERRCODE='42501'; END IF;
 IF p_patch ? 'supervisorId' THEN
 BEGIN supervisor:=nullif(p_patch->>'supervisorId','')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END;
 ELSE supervisor:=old_row.supervisor_id; END IF;
 IF supervisor=p_id THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SELF_SUPERVISION' USING ERRCODE='22023'; END IF;
 IF supervisor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employee_evaluation_employees
 WHERE id=supervisor AND workspace_id=w AND active AND role IN ('admin','supervisor')) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END IF;
 IF supervisor IS NOT NULL AND EXISTS(
 WITH RECURSIVE reports AS (
 SELECT id,supervisor_id,ARRAY[id] visited FROM public.employee_evaluation_employees WHERE id=p_id AND workspace_id=w
 UNION ALL SELECT child.id,child.supervisor_id,reports.visited||child.id
 FROM public.employee_evaluation_employees child JOIN reports ON child.supervisor_id=reports.id
 WHERE child.workspace_id=w AND NOT child.id=ANY(reports.visited))
 SELECT 1 FROM reports WHERE id=supervisor)
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SUPERVISOR_CYCLE' USING ERRCODE='22023'; END IF;
 IF (new_role NOT IN ('admin','supervisor') OR NOT new_active) AND EXISTS(
 SELECT 1 FROM public.employee_evaluation_employees WHERE workspace_id=w AND supervisor_id=p_id AND active)
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_DIRECT_REPORTS_PRESENT' USING ERRCODE='22023'; END IF;
 UPDATE public.employee_evaluation_employees e SET employee_code=code_name,name=employee_name,email=email_address,
 job_title=CASE WHEN p_patch ? 'jobTitle' THEN nullif(btrim(p_patch->>'jobTitle'),'') ELSE old_row.job_title END,
 department=CASE WHEN p_patch ? 'department' THEN nullif(btrim(p_patch->>'department'),'') ELSE old_row.department END,
 supervisor_id=supervisor,role=new_role,active=new_active,revision=e.revision+1,updated_at=transaction_timestamp()
 WHERE e.id=p_id AND e.workspace_id=w AND e.revision=revision_expected RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(w,'UPDATE','employee',p_id::text,'Employee record updated',u,
 jsonb_build_object('previousRevision',old_row.revision,'revision',new_row.revision,
 'roleChanged',old_row.role IS DISTINCT FROM new_row.role,
 'supervisorChanged',old_row.supervisor_id IS DISTINCT FROM new_row.supervisor_id,
 'activeChanged',old_row.active IS DISTINCT FROM new_row.active));
 RETURN to_jsonb(new_row)-'auth_user_id';
END; $$;
REVOKE ALL ON FUNCTION public.employee_evaluation_update_employee(uuid,jsonb) FROM PUBLIC,anon,authenticated;;
