CREATE OR REPLACE FUNCTION public.employee_evaluation_review_transition(
  p_evaluation_id uuid, p_target_status text, p_review_comment text, p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_user uuid := auth.uid(); v_workspace uuid;
  v_actor public.employee_evaluation_employees%ROWTYPE;
  v_current public.employee_evaluation_evaluations%ROWTYPE;
  v_updated public.employee_evaluation_evaluations%ROWTYPE;
  v_comment text := coalesce(p_review_comment, '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  v_workspace := public.current_workspace_id(v_user);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_workspace AND wm.user_id=v_user AND wm.active=true
  ) OR NOT public.has_module_access('employee-eval',v_user) THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_actor FROM public.employee_evaluation_employees e
    WHERE e.workspace_id=v_workspace AND e.auth_user_id=v_user AND e.active=true;
  IF NOT FOUND OR v_actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVIEW_DENIED' USING ERRCODE='42501'; END IF;
  IF p_evaluation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
      OR p_target_status IS NULL OR p_target_status NOT IN ('Reviewed','Returned','Finalized') THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  IF length(v_comment)>10000 OR (p_target_status='Returned' AND length(btrim(v_comment))<5) THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_REVIEW_COMMENT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_current FROM public.employee_evaluation_evaluations ev
    WHERE ev.id=p_evaluation_id AND ev.workspace_id=v_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EVALUATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_current.revision<>p_expected_revision THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF NOT ((v_current.status='Submitted' AND p_target_status IN ('Reviewed','Returned')) OR
    (v_current.status='Reviewed' AND p_target_status IN ('Finalized','Returned'))) THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;
  UPDATE public.employee_evaluation_evaluations ev SET
    status=p_target_status, review_comment=v_comment, revision=ev.revision+1, updated_at=transaction_timestamp(),
    reviewed_by=CASE WHEN p_target_status='Reviewed' THEN v_actor.id ELSE ev.reviewed_by END,
    reviewed_at=CASE WHEN p_target_status='Reviewed' THEN transaction_timestamp() ELSE ev.reviewed_at END,
    finalized_by=CASE WHEN p_target_status='Finalized' THEN v_actor.id ELSE ev.finalized_by END,
    finalized_at=CASE WHEN p_target_status='Finalized' THEN transaction_timestamp() ELSE ev.finalized_at END,
    returned_by=CASE WHEN p_target_status='Returned' THEN v_actor.id ELSE ev.returned_by END,
    returned_at=CASE WHEN p_target_status='Returned' THEN transaction_timestamp() ELSE ev.returned_at END
  WHERE ev.id=v_current.id AND ev.workspace_id=v_workspace AND ev.revision=p_expected_revision
  RETURNING * INTO v_updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.employee_evaluation_activity
    (workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
  VALUES (v_workspace,'REVIEW','evaluation',v_updated.id::text,
    'Evaluation moved '||v_current.status||' → '||v_updated.status,v_user,
    jsonb_build_object('fromStatus',v_current.status,'toStatus',v_updated.status,'period',v_updated.period,'revision',v_updated.revision));
  RETURN to_jsonb(v_updated);
END;
$$;
REVOKE ALL ON FUNCTION public.employee_evaluation_review_transition(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;;
