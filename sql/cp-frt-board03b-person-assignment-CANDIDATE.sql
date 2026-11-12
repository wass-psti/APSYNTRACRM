-- CP-FRT-BOARD-03B: additive optional FRT request assignee, existing role boundaries.
-- No changes to FRT roles, policies, workspace access, or unrelated data.
-- Enable only after disposable and live read-only schema preflight.
DO $preflight$
BEGIN
 IF to_regclass('public.frt_requests') IS NULL OR
    to_regclass('public.workspace_members') IS NULL OR
    to_regclass('public.profiles') IS NULL OR
    to_regprocedure('private.frt_current_role(uuid)') IS NULL OR
    to_regprocedure('private.frt_has_role(uuid,text[])') IS NULL
 THEN RAISE EXCEPTION 'FRT03B_ASSIGNMENT_DEPENDENCY_MISSING'; END IF;
 IF EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='frt_requests'
    AND column_name='assignee_id' AND udt_name<>'uuid')
 THEN RAISE EXCEPTION 'FRT03B_ASSIGNEE_COLUMN_TYPE_DRIFT'; END IF;
END $preflight$;
ALTER TABLE public.frt_requests
 ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id);

-- Return only active workspace members, not all auth.users or private email data.
CREATE OR REPLACE FUNCTION public.frt_assignable_people(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_role(p_workspace_id,
  'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER')
 THEN RAISE EXCEPTION 'FRT_ASSIGN_PERSON_DENIED' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',wm.user_id,
   'name',coalesce(nullif(trim(p.display_name),''),'Workspace member'))
   ORDER BY coalesce(nullif(trim(p.display_name),''),'Workspace member'),wm.user_id),'[]'::jsonb)
 INTO result
 FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.workspace_id=p_workspace_id AND wm.active IS TRUE AND p.status='active';
 RETURN result;
END $fn$;

-- Request-bound, workspace-bound projection; callers cannot enumerate foreign requests.
CREATE OR REPLACE FUNCTION public.frt_request_assignment(
 p_workspace_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE requestor uuid; assigned uuid; v_frt_role text;
BEGIN
 v_frt_role:=private.frt_current_role(p_workspace_id);
 IF auth.uid() IS NULL OR v_frt_role IS NULL
 THEN RAISE EXCEPTION 'FRT_ASSIGNMENT_READ_DENIED' USING ERRCODE='42501'; END IF;
 SELECT r.requestor_id,r.assignee_id INTO requestor,assigned
 FROM public.frt_requests r WHERE r.workspace_id=p_workspace_id
   AND r.id=p_request_id AND r.archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'FRT_ASSIGNMENT_REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_frt_role='REQUESTOR' AND requestor<>auth.uid()
 THEN RAISE EXCEPTION 'FRT_ASSIGNMENT_REQUEST_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('requestId',p_request_id,'assigneeId',assigned);
END $fn$;

-- Server-atomic expected-assignee CAS, signed role and active workspace target.
CREATE OR REPLACE FUNCTION public.frt_assign_request_person(
 p_workspace_id uuid,p_request_id uuid,p_expected_assignee_id uuid,p_assignee_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE current_assignee uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_role(p_workspace_id,
  'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER')
 THEN RAISE EXCEPTION 'FRT_ASSIGN_PERSON_DENIED' USING ERRCODE='42501'; END IF;
 IF p_assignee_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.workspace_members wm
  JOIN public.profiles p ON p.id=wm.user_id
  WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_assignee_id
   AND wm.active IS TRUE AND p.status='active')
 THEN RAISE EXCEPTION 'FRT_ASSIGNEE_NOT_ACTIVE_IN_WORKSPACE' USING ERRCODE='42501'; END IF;
 UPDATE public.frt_requests r SET assignee_id=p_assignee_id,updated_at=clock_timestamp()
 WHERE r.workspace_id=p_workspace_id AND r.id=p_request_id
  AND r.archived_at IS NULL
  AND r.assignee_id IS NOT DISTINCT FROM p_expected_assignee_id
 RETURNING r.assignee_id INTO current_assignee;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'FRT_ASSIGNMENT_STALE_OR_UNAVAILABLE' USING ERRCODE='40001';
 END IF;
 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details)
 VALUES (p_workspace_id,p_request_id,auth.uid(),'REQUEST_PERSON_ASSIGNED',
  jsonb_build_object('fromAssignee',p_expected_assignee_id,
   'toAssignee',p_assignee_id));
 RETURN jsonb_build_object('ok',true,'requestId',p_request_id,
  'assigneeId',current_assignee);
END $fn$;
REVOKE ALL ON FUNCTION public.frt_assignable_people(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_request_assignment(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_assign_request_person(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_assignable_people(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_request_assignment(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_assign_request_person(uuid,uuid,uuid,uuid) TO authenticated;
