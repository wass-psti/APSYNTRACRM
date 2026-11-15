CREATE OR REPLACE FUNCTION public.employee_evaluation_save(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid:=auth.uid(); w uuid; actor public.employee_evaluation_employees%ROWTYPE; target public.employee_evaluation_employees%ROWTYPE;
 cur public.employee_evaluation_evaluations%ROWTYPE; saved public.employee_evaluation_evaluations%ROWTYPE;
 s public.employee_evaluation_settings%ROWTYPE; eid uuid; tid uuid; evaluator uuid; rev bigint;
 st text; period_name text; ratings jsonb; k text; x numeric; score numeric:=0; total numeric:=0;
 weights integer[]:=ARRAY[10,10,10,10,5,5,5,5,5,5,5,5,5,8,7]; i integer;
 comments_text text; strengths_text text; improvements_text text; recommendation_text text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=w AND user_id=u AND active)
 OR NOT public.has_module_access('employee-eval',u) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.employee_evaluation_employees WHERE workspace_id=w AND auth_user_id=u AND active;
 IF NOT FOUND OR actor.role NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EVALUATOR_DENIED' USING ERRCODE='42501'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 BEGIN
 tid:=(p_input->>'employeeId')::uuid; evaluator:=(p_input->>'evaluatorId')::uuid;
 eid:=nullif(p_input->>'id','')::uuid; rev:=nullif(p_input->>'revision','')::bigint;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_IDENTIFIER' USING ERRCODE='22023'; END;
 IF tid IS NULL OR evaluator IS DISTINCT FROM actor.id OR tid=actor.id THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TARGET' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.employee_evaluation_employees WHERE id=tid AND workspace_id=w AND active;
 IF NOT FOUND OR (actor.role='supervisor' AND target.supervisor_id IS DISTINCT FROM actor.id) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_TARGET_DENIED' USING ERRCODE='42501'; END IF;
 st:=p_input->>'status'; period_name:=btrim(coalesce(p_input->>'period',''));ratings:=coalesce(p_input->'ratings','{}'::jsonb);
 comments_text:=coalesce(p_input->>'comments','');strengths_text:=coalesce(p_input->>'strengths','');
 improvements_text:=coalesce(p_input->>'improvements','');recommendation_text:=coalesce(p_input->>'recommendation','');
 IF st IS NULL OR st NOT IN ('Draft','Submitted') OR length(period_name) NOT BETWEEN 1 AND 100 OR jsonb_typeof(ratings)<>'object'
 OR length(comments_text)>10000 OR length(strengths_text)>10000 OR length(improvements_text)>10000
 OR length(recommendation_text)>100 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(ratings) LOOP
 IF k !~ '^c(1[0-5]|[1-9])$' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_RATING' USING ERRCODE='22023'; END IF; END LOOP;
 FOR i IN 1..15 LOOP
 k:='c'||i::text;
 IF ratings ? k THEN
 IF jsonb_typeof(ratings->k)<>'number' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_RATING' USING ERRCODE='22023'; END IF;
 x:=(ratings->>k)::numeric;
 IF x NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_RATING' USING ERRCODE='22023'; END IF;
 score:=score+x*weights[i];total:=total+weights[i];
 ELSIF st='Submitted' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_RATINGS_INCOMPLETE' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF st='Submitted' AND (length(btrim(comments_text))<20 OR length(btrim(strengths_text))<10 OR length(btrim(improvements_text))<10
 OR recommendation_text NOT IN ('Promote','Retain','Develop','Monitor','Action Required')) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_SUBMISSION_INCOMPLETE' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.employee_evaluation_settings WHERE workspace_id=w FOR SHARE;
 IF NOT FOUND OR s.active_period<>period_name THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_PERIOD_DENIED' USING ERRCODE='22023'; END IF;
 IF eid IS NULL THEN
 IF s.evaluation_window<>'Open' OR rev IS NOT NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_WINDOW_OR_REVISION_DENIED' USING ERRCODE='22023'; END IF;
 INSERT INTO public.employee_evaluation_evaluations(workspace_id,employee_id,evaluator_id,period,ratings,comments,strengths,improvements,recommendation,overall_score,status,submitted_at)
 VALUES(w,target.id,actor.id,period_name,ratings,comments_text,strengths_text,improvements_text,recommendation_text,
 CASE WHEN total>0 THEN round(score/total,2) ELSE 0 END,st,CASE WHEN st='Submitted' THEN transaction_timestamp() END)
 RETURNING * INTO saved;
 ELSE
 IF s.evaluation_window NOT IN ('Open','Grace Period') THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_WINDOW_CLOSED' USING ERRCODE='22023'; END IF;
 SELECT * INTO cur FROM public.employee_evaluation_evaluations WHERE id=eid AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF rev IS NULL OR rev<>cur.revision THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF cur.evaluator_id<>actor.id OR cur.employee_id<>target.id OR cur.period<>period_name OR cur.status NOT IN ('Draft','Returned')
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EDIT_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.employee_evaluation_evaluations SET ratings=ratings,comments=comments_text,strengths=strengths_text,
 improvements=improvements_text,recommendation=recommendation_text,
 overall_score=CASE WHEN total>0 THEN round(score/total,2) ELSE 0 END,status=st,revision=revision+1,
 updated_at=transaction_timestamp(),submitted_at=CASE WHEN st='Submitted' THEN transaction_timestamp() END
 WHERE id=eid AND workspace_id=w AND revision=rev RETURNING * INTO saved;
 END IF;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(w,CASE WHEN st='Submitted' THEN 'SUBMIT' WHEN eid IS NULL THEN 'CREATE' ELSE 'UPDATE' END,'evaluation',
 saved.id::text,'Evaluation saved ('||st||')',u,jsonb_build_object('period',period_name,'revision',saved.revision,'status',st));
 RETURN to_jsonb(saved);
END; $$;
REVOKE ALL ON FUNCTION public.employee_evaluation_save(jsonb) FROM PUBLIC,anon,authenticated;;
